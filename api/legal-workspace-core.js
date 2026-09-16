const ALLOWED_TEMPLATE_CODES = new Set([
  'MINUTA_AD_EXITUM',
  'MINUTA_PRESTACAO_SERVICOS',
  'MOU_BR',
  'NDA_BR',
  'NDA_EN',
  'NDA_US_FRANCO',
]);

const MAX_TEMPLATE_BASE64 = 4 * 1024 * 1024;
const MAX_REPLACEMENTS = 150;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function storagePath(ownerId, documentId, version) {
  return `${ownerId}/${documentId}/v${version}/documento.docx`;
}

function encodeStoragePath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function isLegalStaff(user) {
  return Boolean(user && ['admin', 'juridico'].includes(user.role));
}

function parseBody(body) {
  let value = body;
  if (Buffer.isBuffer(value)) value = JSON.parse(value.toString('utf8'));
  if (typeof value === 'string') value = JSON.parse(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Requisição inválida.');
  return value;
}

function validateGenerationPayload(body) {
  const templateCode = String(body.templateCode || '');
  const templateBase64 = String(body.templateBase64 || '');
  const replacements = body.replacements;
  if (!ALLOWED_TEMPLATE_CODES.has(templateCode)) throw new Error('Modelo jurídico inválido.');
  if (!templateBase64 || templateBase64.length > MAX_TEMPLATE_BASE64) throw new Error('Modelo DOCX ausente ou acima do limite permitido.');
  if (!replacements || typeof replacements !== 'object' || Array.isArray(replacements)) throw new Error('Dados do documento inválidos.');
  if (Object.keys(replacements).length > MAX_REPLACEMENTS) throw new Error('Quantidade de campos acima do limite permitido.');
  return { templateCode, templateBase64, replacements };
}

function safeText(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function sanitizeMetadata(body) {
  return {
    title: safeText(body.title, 300),
    counterparty: safeText(body.counterparty, 300),
    formData: body.formData && typeof body.formData === 'object' && !Array.isArray(body.formData) ? body.formData : {},
  };
}

function mapSupabaseStatus(result) {
  const message = String(result?.data?.message || result?.data?.error || '');
  if (result?.status === 401 || /UNAUTHORIZED/i.test(message)) return 401;
  if (result?.status === 403 || /FORBIDDEN/i.test(message)) return 403;
  if (result?.status === 404 || /NOT_FOUND/i.test(message)) return 404;
  if (/VERSION_CONFLICT/i.test(message)) return 409;
  return result?.status >= 400 && result.status < 600 ? result.status : 500;
}

module.exports = {
  ALLOWED_TEMPLATE_CODES,
  MAX_TEMPLATE_BASE64,
  MAX_REPLACEMENTS,
  isUuid,
  storagePath,
  encodeStoragePath,
  isLegalStaff,
  parseBody,
  validateGenerationPayload,
  sanitizeMetadata,
  mapSupabaseStatus,
};
