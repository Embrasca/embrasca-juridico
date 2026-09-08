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
    const method=u16(buf,p+10), crc=u32(buf,p+16), csize=u32(buf,p+20), usize=u32(buf,p+24);
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

function decodeEscapedWordTags(value){
  return value.replace(/&lt;(\/?w:[^<>]*?)&gt;/g,'<$1>');
}
function repairWordXml(xml){
  let s=String(xml??'');
  s=s.replace(/<w:([A-Za-z0-9]+)([^<>]*?)\/ xml:space="preserve">((?:&lt;\/?w:[^<>]*?&gt;)+)/g,(_,tag,attrs,escaped)=>`<w:${tag}${attrs}/>${decodeEscapedWordTags(escaped)}`);
  s=s.replace(/<w:([A-Za-z0-9]+)([^<>]*?) xml:space="preserve">((?:&lt;\/?w:[^<>]*?&gt;)+)/g,(_,tag,attrs,escaped)=>`<w:${tag}${attrs}>${decodeEscapedWordTags(escaped)}`);
  return s;
}

const CORPORATE_FONT = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>';
const DEFAULT_MARGIN = '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>';

function removeCorporateCover(xml){
  if(!xml.includes('Documento jurídico corporativo') || !xml.includes('rIdEmbrascaCoverLogo')) return xml;
  const bodyStart=xml.indexOf('<w:body');
  const bodyOpenEnd=bodyStart>=0?xml.indexOf('>',bodyStart):-1;
  const marker=xml.indexOf('Documento jurídico corporativo');
  const breakTag='<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>';
  const breakStart=xml.indexOf(breakTag,marker);
  if(bodyOpenEnd<0 || marker<bodyOpenEnd || breakStart<0) return xml;
  return xml.slice(0,bodyOpenEnd+1)+xml.slice(breakStart+breakTag.length);
}

function restoreCorporateMargin(xml){
  const corporateRe=/<w:pgMar\b(?=[^>]*w:top="1134")(?=[^>]*w:right="1134")(?=[^>]*w:bottom="1134")(?=[^>]*w:left="1134")(?=[^>]*w:header="567")(?=[^>]*w:footer="567")[^>]*\/>/;
  if(!corporateRe.test(xml)) return xml;
  const margins=[...xml.matchAll(/<w:pgMar\b[^>]*\/>/g)].map(m=>m[0]);
  const sourceMargin=margins.find(m=>!corporateRe.test(m));
  return xml.replace(corporateRe,sourceMargin||DEFAULT_MARGIN);
}

function stripCorporateRunFormatting(xml){
  return xml
    .split(CORPORATE_FONT).join('')
    .replace(/<w:color\s+w:val="(?:1B5E20|FFFFFF)"\s*\/>/gi,'')
    .replace(/<w:sz\s+w:val="(?:24|28)"\s*\/>/g,'')
    .replace(/<w:szCs\s+w:val="(?:24|28)"\s*\/>/g,'')
    .replace(/<w:shd\b(?=[^>]*w:fill="1B5E20")[^>]*\/>/gi,'');
}

function debrandDocumentXml(xml){
  let s=repairWordXml(xml);
  const branded=s.includes('rIdEmbrasca') || s.includes('Documento jurídico corporativo') || s.includes('EmbrascaLegalHeading1');
  if(!branded) return s;
  s=removeCorporateCover(s);
  s=restoreCorporateMargin(s);
  s=s
    .replace(/<w:(?:headerReference|footerReference)\b(?=[^>]*r:id="rIdEmbrasca[^\"]*")[^>]*\/>/g,'')
    .replace(/<w:titlePg\s*\/>/g,'')
    .replace(/<w:pStyle\s+w:val="EmbrascaLegalHeading1"\s*\/>/g,'');
  return stripCorporateRunFormatting(s);
}

function debrandStylesXml(xml){
  let s=repairWordXml(xml);
  if(!s.includes('EmbrascaLegalHeading1') && !s.includes(CORPORATE_FONT)) return s;
  s=s.replace(/<w:style\b[^>]*w:styleId="EmbrascaLegalHeading1"[^>]*>[\s\S]*?<\/w:style>/g,'');
  const normal=s.match(/<w:style\b[^>]*w:styleId="Normal"[^>]*>[\s\S]*?<\/w:style>/);
  if(normal && normal[0].includes(CORPORATE_FONT) && /<w:spacing\b(?=[^>]*w:line="360")[^>]*\/>/.test(normal[0])){
    const cleaned=normal[0]
      .replace(/<w:pPr>[\s\S]*?<\/w:pPr>/,'')
      .replace(/<w:rPr>[\s\S]*?<\/w:rPr>/,'');
    s=s.replace(normal[0],cleaned);
  }
  return s;
}

function emptyHeader(){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:hdr>';
}
function emptyFooter(){
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:ftr>';
}

function stripEmbrascaBranding(entries){
  const hasBranding=entries.some(e=>{
    if(e.name==='word/media/embrasca-logo.png') return true;
    if(e.isDir || (!e.name.endsWith('.xml') && !e.name.endsWith('.rels'))) return false;
    const s=e.data.toString('utf8');
    return s.includes('rIdEmbrasca') || s.includes('Documento jurídico corporativo') || s.includes('Documento Corporativo') || s.includes('EmbrascaLegalHeading1');
  });
  if(!hasBranding) return entries;

  const out=[];
  for(const entry of entries){
    if(entry.name==='word/media/embrasca-logo.png') continue;
    if(entry.name==='word/_rels/header1.xml.rels'){
      const text=entry.data.toString('utf8');
      if(text.includes('rIdEmbrascaHeaderLogo') || text.includes('embrasca-logo.png')) continue;
    }
    const e={...entry,data:Buffer.from(entry.data)};
    if(e.name==='word/document.xml') e.data=Buffer.from(debrandDocumentXml(e.data.toString('utf8')),'utf8');
    else if(e.name==='word/styles.xml') e.data=Buffer.from(debrandStylesXml(e.data.toString('utf8')),'utf8');
    else if(e.name==='word/_rels/document.xml.rels'){
      let s=e.data.toString('utf8');
      s=s.replace(/<Relationship\b(?=[^>]*Id="rIdEmbrasca[^\"]*")[^>]*\/>/g,'');
      e.data=Buffer.from(s,'utf8');
    } else if(e.name==='word/header1.xml'){
      const s=e.data.toString('utf8');
      if(s.includes('rIdEmbrascaHeaderLogo') || s.includes('Logo Embrasca') || s.includes('Embrasca Soluções Sustentáveis')) e.data=Buffer.from(emptyHeader(),'utf8');
    } else if(e.name==='word/footer1.xml'){
      const s=e.data.toString('utf8');
      if(s.includes('Documento Corporativo') || s.includes('Embrasca Soluções Sustentáveis')) e.data=Buffer.from(emptyFooter(),'utf8');
    }
    out.push(e);
  }
  return out;
}

function escapeXml(v){return String(v??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function generateDocx(template,replacements){
  let entries=readZip(template);
  entries=stripEmbrascaBranding(entries);
  let replaced=0;
  for(const e of entries){
    if(e.isDir||!e.name.toLowerCase().endsWith('.xml'))continue;
    let s=repairWordXml(e.data.toString('utf8'));
    for(const [k,v] of Object.entries(replacements||{})){const token=`{{${k}}}`;if(s.includes(token)){s=s.split(token).join(escapeXml(v));replaced++}}
    e.data=Buffer.from(s,'utf8');
  }
  const out=buildZip(entries);
  const verify=readZip(out);
  const names=new Set(verify.map(e=>e.name));
  if(!names.has('[Content_Types].xml')||!names.has('word/document.xml'))throw new Error('DOCX gerado sem partes essenciais.');
  return {buffer:out,replaced,entries:verify.length};
}
module.exports={readZip,buildZip,generateDocx,escapeXml,crc32,repairWordXml,stripEmbrascaBranding,debrandDocumentXml,debrandStylesXml};
