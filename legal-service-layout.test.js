const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDefaultVistoFooterXml,
  buildFirstPageFooterXml,
  normalizeServiceContractDocumentXml,
  applyLegalServiceContractLayout,
} = require('./lib/legal-service-layout');

test('default footer reproduces the two neutral legal visto boxes and page counter', () => {
  const xml = buildDefaultVistoFooterXml();
  assert.match(xml, /Visto Contratada:/);
  assert.match(xml, /Visto Contratante:/);
  assert.match(xml, /Página /);
  assert.match(xml, /NUMPAGES/);
  assert.match(xml, /w:tcW w:w="4500"/);
  assert.match(xml, /w:tcW w:w="960"/);
  assert.match(xml, /w:tcW w:w="4268"/);
  assert.doesNotMatch(xml, /1B5E20|Documento Corporativo|Documento jurídico corporativo|EmbrascaLegalHeading1/);
});

test('first page footer contains page numbering but no visto boxes', () => {
  const xml = buildFirstPageFooterXml();
  assert.doesNotMatch(xml, /Visto Contratada:|Visto Contratante:/);
  assert.match(xml, /Página /);
  assert.match(xml, /NUMPAGES/);
  assert.doesNotMatch(xml, /1B5E20/);
});

test('document uses first-page footer only in the first section and strips green corporate styling', () => {
  const input = [
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>',
    '<w:p><w:pPr><w:pStyle w:val="EmbrascaLegalHeading1"/></w:pPr><w:r><w:rPr><w:color w:val="1B5E20"/><w:shd w:val="clear" w:fill="1B5E20"/></w:rPr><w:t>Cláusula</w:t></w:r></w:p>',
    '<w:p><w:pPr><w:sectPr><w:footerReference w:type="default" r:id="rIdEmbrascaFooter"/><w:titlePg/></w:sectPr></w:pPr></w:p>',
    '<w:sectPr><w:footerReference w:type="default" r:id="rIdOldFooter"/><w:titlePg/></w:sectPr>',
    '</w:body></w:document>'
  ].join('');

  const out = normalizeServiceContractDocumentXml(input);
  const sections = [...out.matchAll(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g)].map((m) => m[0]);
  assert.equal(sections.length, 2);
  assert.match(sections[0], /w:type="default" r:id="rIdLegalVistoDefault"/);
  assert.match(sections[0], /w:type="first" r:id="rIdLegalVistoFirst"/);
  assert.match(sections[0], /<w:titlePg\s*\/>/);
  assert.match(sections[1], /w:type="default" r:id="rIdLegalVistoDefault"/);
  assert.doesNotMatch(sections[1], /w:type="first"/);
  assert.doesNotMatch(sections[1], /<w:titlePg\s*\/>/);
  assert.doesNotMatch(out, /rIdEmbrascaFooter|rIdOldFooter|1B5E20|EmbrascaLegalHeading1/);
});

test('entry postprocessor removes legacy footer/green assets and installs legal footer parts', () => {
  const entries = [
    { name: '[Content_Types].xml', data: Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>') },
    { name: 'word/document.xml', data: Buffer.from('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:rPr><w:color w:val="1B5E20"/></w:rPr><w:t>Texto</w:t></w:r></w:p><w:sectPr><w:footerReference w:type="default" r:id="rIdEmbrascaFooter"/></w:sectPr></w:body></w:document>') },
    { name: 'word/_rels/document.xml.rels', data: Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdEmbrascaFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdKeep" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
    { name: 'word/styles.xml', data: Buffer.from('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="EmbrascaLegalHeading1"><w:rPr><w:color w:val="1B5E20"/></w:rPr></w:style></w:styles>') },
    { name: 'word/footer1.xml', data: Buffer.from('<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Documento Corporativo</w:t></w:r></w:p></w:ftr>') },
    { name: 'word/_rels/footer1.xml.rels', data: Buffer.from('<Relationships/>') },
    { name: 'word/header1.xml', data: Buffer.from('<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:rPr><w:color w:val="1B5E20"/></w:rPr><w:t>Embrasca Soluções Sustentáveis</w:t></w:r></w:p></w:hdr>') },
    { name: 'word/media/embrasca-logo.png', data: Buffer.from([1, 2, 3]) },
  ];

  const out = applyLegalServiceContractLayout(entries);
  const names = new Set(out.map((entry) => entry.name));
  assert.ok(names.has('word/footerLegalDefault.xml'));
  assert.ok(names.has('word/footerLegalFirst.xml'));
  assert.equal(names.has('word/footer1.xml'), false);
  assert.equal(names.has('word/_rels/footer1.xml.rels'), false);
  assert.equal(names.has('word/media/embrasca-logo.png'), false);

  const combined = out.filter((e) => !e.isDir).map((e) => e.data.toString('utf8')).join('\n');
  assert.match(combined, /Visto Contratada:/);
  assert.match(combined, /Visto Contratante:/);
  assert.match(combined, /rIdLegalVistoDefault/);
  assert.match(combined, /rIdLegalVistoFirst/);
  assert.doesNotMatch(combined, /1B5E20|Documento Corporativo|Documento jurídico corporativo|EmbrascaLegalHeading1/);
});
