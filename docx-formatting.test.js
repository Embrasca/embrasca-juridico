const test = require('node:test');
const assert = require('node:assert/strict');
const { buildZip, readZip, generateDocx } = require('./lib/docx-engine');

test('padroniza Times New Roman e espacamento 1,5 sem alterar tamanhos do modelo', () => {
  const documentXml = [
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
    '<w:p><w:pPr><w:spacing w:before="80" w:after="120" w:line="240" w:lineRule="auto"/></w:pPr>',
    '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t>Título</w:t></w:r></w:p>',
    '<w:p><w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t>Corpo</w:t></w:r></w:p>',
    '</w:body></w:document>'
  ].join('');
  const stylesXml = [
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:pPr><w:spacing w:after="160" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>',
    '</w:styles>'
  ].join('');
  const template = buildZip([
    { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
    { name: 'word/document.xml', data: Buffer.from(documentXml) },
    { name: 'word/styles.xml', data: Buffer.from(stylesXml) }
  ]);

  const result = generateDocx(template, {});
  const entries = readZip(result.buffer);
  const doc = entries.find(e => e.name === 'word/document.xml').data.toString('utf8');
  const styles = entries.find(e => e.name === 'word/styles.xml').data.toString('utf8');

  assert.doesNotMatch(doc + styles, /w:ascii="(?:Arial|Calibri)"/);
  assert.match(doc, /w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/);
  assert.match(styles, /w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/);
  assert.match(doc, /w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="auto"/);
  assert.match(styles, /w:spacing w:before="0" w:after="0" w:line="360" w:lineRule="auto"/);
  assert.match(doc, /w:sz w:val="28"/);
  assert.match(doc, /w:sz w:val="22"/);
  assert.match(styles, /w:sz w:val="24"/);
});
