const zlib = require('node:zlib');

function u16(b,o){return b.readUInt16LE(o)}
function u32(b,o){return b.readUInt32LE(o)}

function findEocd(buf){
  const min=Math.max(0,buf.length-0xffff-22);
  for(let i=buf.length-22;i>=min;i--){if(buf.readUInt32LE(i)===0x06054b50)return i}
  throw new Error('ZIP inválido: EOCD não encontrado.');
}

function readZip(buf){
  const eocd=findEocd(buf);
  const count=u16(buf,eocd+10), cdOffset=u32(buf,eocd+16);
  let p=cdOffset; const out=[];
  for(let i=0;i<count;i++){
    if(u32(buf,p)!==0x02014b50)throw new Error('ZIP inválido: diretório central corrompido.');
    const flags=u16(buf,p+8), method=u16(buf,p+10), crc=u32(buf,p+16), csize=u32(buf,p+20), usize=u32(buf,p+24);
    const nl=u16(buf,p+28), el=u16(buf,p+30), cl=u16(buf,p+32), local=u32(buf,p+42);
    const name=buf.subarray(p+46,p+46+nl).toString('utf8');
    if(u32(buf,local)!==0x04034b50)throw new Error(`ZIP inválido: cabeçalho local ausente em ${name}.`);
    const lnl=u16(buf,local+26), lel=u16(buf,local+28), start=local+30+lnl+lel;
    const compressed=buf.subarray(start,start+csize);
    let data;
    if(method===0)data=Buffer.from(compressed);
    else if(method===8)data=zlib.inflateRawSync(compressed);
    else throw new Error(`ZIP não suportado: método ${method} em ${name}.`);
    if(data.length!==usize)throw new Error(`ZIP inválido: tamanho divergente em ${name}.`);
    out.push({name,data,crc,isDir:name.endsWith('/')});
    p+=46+nl+el+cl;
  }
  return out;
}

let CRC_TABLE;
function crc32(buf){
  if(!CRC_TABLE){CRC_TABLE=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0})}
  let c=0xffffffff; for(const byte of buf)c=CRC_TABLE[(c^byte)&255]^(c>>>8); return (c^0xffffffff)>>>0;
}
function dosDateTime(d=new Date()){
  const year=Math.max(1980,d.getFullYear());
  const date=((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
  const time=(d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2);
  return {date,time};
}
function writeLocal(name,data,offset,stamp){
  const nb=Buffer.from(name,'utf8'), isDir=name.endsWith('/');
  const compressed=isDir?Buffer.alloc(0):zlib.deflateRawSync(data,{level:6});
  const method=isDir?0:8, crc=isDir?0:crc32(data), flags=0x0800;
  const h=Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(flags,6);h.writeUInt16LE(method,8);h.writeUInt16LE(stamp.time,10);h.writeUInt16LE(stamp.date,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(compressed.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(nb.length,26);h.writeUInt16LE(0,28);
  const local=Buffer.concat([h,nb,compressed]);
  return {local,centralMeta:{name,nb,method,crc,csize:compressed.length,usize:data.length,offset,isDir}};
}
function buildZip(entries){
  const stamp=dosDateTime(); let offset=0; const locals=[], metas=[];
  for(const e of entries){const r=writeLocal(e.name,e.data,offset,stamp);locals.push(r.local);metas.push(r.centralMeta);offset+=r.local.length}
  const cdStart=offset, centrals=[];
  for(const m of metas){
    const h=Buffer.alloc(46);
    h.writeUInt32LE(0x02014b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(20,6);h.writeUInt16LE(0x0800,8);h.writeUInt16LE(m.method,10);h.writeUInt16LE(stamp.time,12);h.writeUInt16LE(stamp.date,14);h.writeUInt32LE(m.crc,16);h.writeUInt32LE(m.csize,20);h.writeUInt32LE(m.usize,24);h.writeUInt16LE(m.nb.length,28);h.writeUInt16LE(0,30);h.writeUInt16LE(0,32);h.writeUInt16LE(0,34);h.writeUInt16LE(0,36);h.writeUInt32LE(m.isDir?0x10:0,38);h.writeUInt32LE(m.offset,42);
    const c=Buffer.concat([h,m.nb]);centrals.push(c);offset+=c.length;
  }
  const cdSize=offset-cdStart, e=Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(0,4);e.writeUInt16LE(0,6);e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);e.writeUInt32LE(cdSize,12);e.writeUInt32LE(cdStart,16);e.writeUInt16LE(0,20);
  return Buffer.concat([...locals,...centrals,e]);
}
function escapeXml(v){return String(v??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function generateDocx(template,replacements){
  const entries=readZip(template);
  let replaced=0;
  for(const e of entries){
    if(e.isDir||!e.name.toLowerCase().endsWith('.xml'))continue;
    let s=e.data.toString('utf8');
    for(const [k,v] of Object.entries(replacements||{})){const token=`{{${k}}}`;if(s.includes(token)){s=s.split(token).join(escapeXml(v));replaced++}}
    e.data=Buffer.from(s,'utf8');
  }
  const out=buildZip(entries);
  const verify=readZip(out);
  const names=new Set(verify.map(e=>e.name));
  if(!names.has('[Content_Types].xml')||!names.has('word/document.xml'))throw new Error('DOCX gerado sem partes essenciais.');
  return {buffer:out,replaced,entries:verify.length};
}
module.exports={readZip,buildZip,generateDocx,escapeXml,crc32};
