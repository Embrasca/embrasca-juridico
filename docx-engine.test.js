const test = require('node:test');
const assert = require('node:assert/strict');
const { buildZip, readZip, generateDocx, repairWordXml } = require('./lib/docx-engine');

function minimalTemplate(documentXml) {
  return buildZip([
    { name: '[Content_Types].xml', data: Buffer.from('<Types/>', 'utf8') },
    { name: 'word/document.xml', data: Buffer.from(documentXml, 'utf8') }
  ]);
}

test('repairs escaped WordML artifacts without decoding legitimate document text', () => {
  const broken = [
    '<w:document>',
    '<w:top w:val="single"/ xml:space="preserve">&lt;w:left w:val="single"/&gt;&lt;w:t xml:space="preserve"&gt;Border text</w:t>',
    '<w:tabs xml:space="preserve">&lt;w:tab w:val="left"/&gt;&lt;/w:tabs&gt;&lt;w:t&gt;Tab text</w:t>',
    '<w:tab/ xml:space="preserve">&lt;w:t xml:space="preserve"&gt;Signature</w:t>',
    '<w:t>&lt;w:example&gt;</w:t>',
    '</w:document>'
  ].join('');

  const expected = [
    '<w:document>',
    '<w:top w:val="single"/><w:left w:val="single"/><w:t xml:space="preserve">Border text</w:t>',
    '<w:tabs><w:tab w:val="left"/></w:tabs><w:t>Tab text</w:t>',
    '<w:tab/><w:t xml:space="preserve">Signature</w:t>',
    '<w:t>&lt;w:example&gt;</w:t>',
    '</w:document>'
  ].join('');

  const actual = repairWordXml?.(broken);
  assert.equal(actual, expected);
});

test('generateDocx repairs the embedded template before replacing placeholders', () => {
  const broken = '<w:document><w:tab/ xml:space="preserve">&lt;w:t xml:space="preserve"&gt;{{name}}</w:t></w:document>';
  const template = minimalTemplate(broken);

  const result = generateDocx(template, { name: 'A & B' });
  const outputXml = readZip(result.buffer).find((entry) => entry.name === 'word/document.xml').data.toString('utf8');

  assert.equal(outputXml, '<w:document><w:tab/><w:t xml:space="preserve">A &amp; B</w:t></w:document>');
});

test('generateDocx removes Embrasca corporate branding while preserving legal content', () => {
  const documentXml = [
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>',
    '<w:p><w:r><w:t>Documento jurídico corporativo</w:t></w:r></w:p>',
    '<w:p><w:r><w:drawing><a:blip xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:embed="rIdEmbrascaCoverLogo"/></w:drawing></w:r></w:p>',
    '<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>',
    '<w:p><w:pPr><w:pStyle w:val="EmbrascaLegalHeading1"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:b/><w:bCs/><w:color w:val="1B5E20"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>CLÁUSULA PRIMEIRA</w:t></w:r></w:p>',
    '<w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>{{name}}</w:t></w:r></w:p>',
    '<w:sectPr><w:headerReference w:type="default" r:id="rIdEmbrascaHeader"/><w:footerReference w:type="default" r:id="rIdEmbrascaFooter"/><w:titlePg/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>',
    '</w:body></w:document>'
  ].join('');
  const stylesXml = '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="both"/><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="EmbrascaLegalHeading1"><w:name w:val="Embrasca Legal Heading 1"/></w:style></w:styles>';
  const relsXml = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdEmbrascaCoverLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/embrasca-logo.png"/><Relationship Id="rIdEmbrascaHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdEmbrascaFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>';
  const template = buildZip([
    { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
    { name: 'word/document.xml', data: Buffer.from(documentXml) },
    { name: 'word/styles.xml', data: Buffer.from(stylesXml) },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from(relsXml) },
    { name: 'word/header1.xml', data: Buffer.from('<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Embrasca Soluções Sustentáveis</w:t></w:r></w:p></w:hdr>') },
    { name: 'word/footer1.xml', data: Buffer.from('<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Documento Corporativo</w:t></w:r></w:p></w:ftr>') },
    { name: 'word/_rels/header1.xml.rels', data: Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdEmbrascaHeaderLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/embrasca-logo.png"/></Relationships>') },
    { name: 'word/media/embrasca-logo.png', data: Buffer.from([1, 2, 3]) }
  ]);

  const result = generateDocx(template, { name: 'Cliente Teste' });
  const entries = readZip(result.buffer);
  const names = new Set(entries.map((entry) => entry.name));
  const combined = entries
    .filter((entry) => entry.name.endsWith('.xml') || entry.name.endsWith('.rels'))
    .map((entry) => entry.data.toString('utf8'))
    .join('\n');

  assert.equal(combined.includes('Documento jurídico corporativo'), false);
  assert.equal(combined.includes('Documento Corporativo'), false);
  assert.equal(combined.includes('Embrasca Soluções Sustentáveis'), false);
  assert.equal(combined.includes('rIdEmbrasca'), false);
  assert.equal(combined.includes('EmbrascaLegalHeading1'), false);
  assert.equal(combined.includes('1B5E20'), false);
  assert.equal(names.has('word/media/embrasca-logo.png'), false);
  assert.match(combined, /Cliente Teste/);
  assert.match(combined, /w:sz w:val="22"/);
});
