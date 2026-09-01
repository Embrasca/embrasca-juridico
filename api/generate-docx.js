const { generateDocx } = require('../lib/docx-engine');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_TEMPLATE_BASE64 = 4 * 1024 * 1024;
const MAX_REPLACEMENTS = 150;

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, { ok: true, service: 'embrasca-juridico-docx', engine: 'node-zlib' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  }

  try {
    let body = req.body;
    if (Buffer.isBuffer(body)) body = JSON.parse(body.toString('utf8'));
    if (typeof body === 'string') body = JSON.parse(body);
    if (!body || typeof body !== 'object') throw new Error('Requisição inválida.');

    const templateBase64 = String(body.templateBase64 || '');
    const replacements = body.replacements;

    if (!templateBase64 || templateBase64.length > MAX_TEMPLATE_BASE64) {
      return json(res, 400, { ok: false, error: 'Modelo DOCX ausente ou acima do limite permitido.' });
    }
    if (!replacements || typeof replacements !== 'object' || Array.isArray(replacements)) {
      return json(res, 400, { ok: false, error: 'Dados do documento inválidos.' });
    }
    if (Object.keys(replacements).length > MAX_REPLACEMENTS) {
      return json(res, 400, { ok: false, error: 'Quantidade de campos acima do limite permitido.' });
    }

    const template = Buffer.from(templateBase64, 'base64');
    if (template.length < 4 || template.readUInt32LE(0) !== 0x04034b50) {
      return json(res, 400, { ok: false, error: 'Modelo DOCX interno inválido.' });
    }

    const result = generateDocx(template, replacements);
    if (result.buffer.length > 10 * 1024 * 1024) {
      throw new Error('DOCX gerado acima do limite permitido.');
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', DOCX_MIME);
    res.setHeader('Content-Disposition', 'attachment; filename="documento.docx"');
    res.setHeader('Content-Length', String(result.buffer.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(result.buffer);
  } catch (error) {
    console.error('[DOCX]', error);
    return json(res, 500, { ok: false, error: error?.message || 'Falha ao gerar o documento.' });
  }
};
