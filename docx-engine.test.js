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
