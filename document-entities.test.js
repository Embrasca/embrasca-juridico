const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildLegalDocx } = require('./lib/legal-docx-service');
const { readZip } = require('./lib/docx-engine');
const { applyEntitySelection } = require('./lib/document-entities');
const html = fs.readFileSync(require.resolve('./app.html'), 'utf8');
const templates = JSON.parse(html.match(/const BUILTIN_TEMPLATES=(.*?);/)[1]);
const profiles = JSON.parse(html.match(/const PROFILES=(.*?);/)[1]);
function documentText(buffer) {
  const xml = readZip(buffer).find(entry => entry.name === 'word/document.xml').data.toString();
  return [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map(p => [...p[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('')).join('\n');
}
for (const [code, base64] of Object.entries(templates)) {
  for (const selection of ['brasil', 'inc', 'ambas']) {
    test(`${code}: ${selection} in identity and signatures, preserving counterparty`, () => {
      const replacements = { __embrasca_entities: selection };
      for (const field of profiles.find(p => p.code === code).fields) replacements[field.placeholder] = 'EXTERNAL_' + field.placeholder;
      const result = buildLegalDocx({ template: Buffer.from(base64, 'base64'), templateCode: code, replacements });
      const text = documentText(result);
      if (selection !== 'inc') {
        assert.ok((text.match(/05\.877\.415/g) || []).length >= 2, 'Brasil must occur in both identity and signature');
        assert.match(text, /Ricardo Cesar Fernandes/);
      } else {
        assert.doesNotMatch(text, /05\.877\.415|Ricardo|RICARDO/);
      }
      if (selection !== 'brasil') {
        assert.ok((text.match(/Embrasca Inc|EMBRASCA INC/g) || []).length >= 2, 'Inc must occur in both identity and signature');
        assert.match(text, /Franco Grassi/);
        assert.match(text, /90-0914430/);
      } else {
        assert.doesNotMatch(text, /Embrasca Inc|EMBRASCA INC|90-091|Franco|FRANCO|franco\.grassi/);
      }
      const partyKey = profiles.find(p => p.code === code).partyFieldKey;
      assert.ok((text.match(new RegExp('EXTERNAL_' + partyKey, 'g')) || []).length >= 2, 'counterparty retained in body and signatures');
      assert.doesNotMatch(text, /EXTERNAL_contratado_|{{/);
      if (code === 'NDA_EN') assert.match(text, /Witness 1:[\s\S]*Witness 2:/);
      if (code === 'MINUTA_PRESTACAO_SERVICOS') assert.match(text, /Testemunhas:/);
    });
  }
}
test('legacy documents are unchanged and invalid explicit selections are rejected', () => {
  const xml = '<w:document>legacy</w:document>';
  assert.equal(applyEntitySelection(xml, 'NDA_BR', undefined), xml);
  for (const invalid of ['', 'other', [], {}]) assert.throws(() => applyEntitySelection(xml, 'NDA_BR', invalid), /Selecione/);
  assert.throws(() => applyEntitySelection(xml, 'NDA_BR', 'brasil'), /segurança/);
});
