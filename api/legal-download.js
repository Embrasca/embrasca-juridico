const { requireUser, json, supabaseFetch, supabaseRawFetch } = require('./_supabase');
const { isUuid, encodeStoragePath, mapSupabaseStatus } = require('./legal-workspace-core');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function fileName(title, version) {
  const base = String(title || 'documento')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 100) || 'documento';
  return `${base}_v${version}.docx`;
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    const user = await requireUser(req, res);
    if (!user) return json(res, 401, { ok: false, error: 'Sessão inválida ou expirada.' });
    const token = req.__embrascaAccessToken;
    const documentId = String(req.query?.documentId || '').trim();
    const version = Number(req.query?.version);

    if (!isUuid(documentId) || !Number.isInteger(version) || version < 1) {
      return json(res, 400, { ok: false, error: 'Documento ou versão inválidos.' });
    }

    const meta = await supabaseFetch('/rest/v1/rpc/legal_get_download_path', {
      token,
      method: 'POST',
      body: { p_document_id: documentId, p_version: version },
    });
    if (!meta.ok) return json(res, mapSupabaseStatus(meta), { ok: false, error: meta.data?.message || 'Falha ao validar o download.' });
    if (!meta.data?.storagePath) return json(res, 404, { ok: false, error: 'Arquivo não encontrado ou sem permissão.' });

    const download = await supabaseRawFetch(`/storage/v1/object/authenticated/legal-documents/${encodeStoragePath(meta.data.storagePath)}`, {
      token,
      method: 'GET',
    });
    if (!download.ok) return json(res, download.status || 500, { ok: false, error: 'Não foi possível baixar o arquivo.' });

    const bytes = Buffer.from(await download.response.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', DOCX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName(meta.data.title, meta.data.version)}"`);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(bytes);
  } catch (error) {
    console.error('[LEGAL DOWNLOAD]', error);
    return json(res, 500, { ok: false, error: error?.message || 'Falha ao baixar o documento.' });
  }
};
