const { generateDocx } = require('./docx-engine');
const { cleanGeneratedDocx } = require('./docx-cleanup');
const { applyLegalServiceContractLayoutToBuffer } = require('./legal-service-layout');

function buildLegalDocx({ template, replacements, templateCode }) {
  const result = generateDocx(template, replacements, { templateCode });
  let buffer = cleanGeneratedDocx(result.buffer, { templateCode });
  if (templateCode === 'MINUTA_PRESTACAO_SERVICOS') {
    buffer = applyLegalServiceContractLayoutToBuffer(buffer);
  }
  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error('DOCX gerado acima do limite permitido.');
  }
  return buffer;
}

module.exports = { buildLegalDocx };
