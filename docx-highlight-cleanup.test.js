const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const cleanupPath = path.join(root, 'lib', 'docx-cleanup.js');

test('remove marca-texto e sombreado de texto sem remover fundo de celula', () => {
  assert.equal(fs.existsSync(cleanupPath), true, 'lib/docx-cleanup.js must exist');
  if (!fs.existsSync(cleanupPath)) return;

  const { stripTextMarkingFromXml } = require('./lib/docx-cleanup');
  const xml = [
    '<w:document><w:body>',
    '<w:p><w:r><w:rPr><w:highlight w:val="yellow"/><w:shd w:val="clear" w:color="auto" w:fill="FFFF00"/><w:b/></w:rPr><w:t>Marcado</w:t></w:r></w:p>',
    '<w:tbl><w:tr><w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9EAD3"/></w:tcPr><w:p><w:r><w:t>Celula</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    '</w:body></w:document>'
  ].join('');

  const cleaned = stripTextMarkingFromXml(xml);
  assert.doesNotMatch(cleaned, /<w:highlight\b/);
  for (const rPr of cleaned.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/g) || []) {
    assert.doesNotMatch(rPr, /<w:shd\b/);
  }
  assert.match(cleaned, /<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9EAD3"\/><\/w:tcPr>/);
  assert.match(cleaned, /<w:b\/>/);
});

test('endpoint de geracao aplica a limpeza antes de enviar o DOCX', () => {
  const source = fs.readFileSync(path.join(root, 'api', 'generate-docx.js'), 'utf8');
  assert.match(source, /cleanGeneratedDocx/);
  assert.match(source, /cleanGeneratedDocx\(result\.buffer\)/);
});
