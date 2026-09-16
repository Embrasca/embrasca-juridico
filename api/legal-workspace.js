const crypto = require('node:crypto');
const { requireUser, json, supabaseFetch, supabaseRawFetch } = require('./_supabase');
const { buildLegalDocx } = require('../lib/legal-docx-service');
const {
  isUuid,
  storagePath,
  encodeStoragePath,
  parseBody,
  validateGenerationPayload,
  sanitizeMetadata,
  mapSupabaseStatus,
} = require('./legal-workspace-core');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function rpc(token, name, body = {}) {
  return supabaseFetch(`/rest/v1/rpc/${name}`, { token, method: 'POST', body });
}

async function uploadDocx(token, path, buffer) {
  return supabaseRawFetch(`/storage/v1/object/legal-documents/${encodeStoragePath(path)}`, {
    token,
    method: 'POST',
    body: buffer,
    headers: {
      'Content-Type': DOCX_MIME,
      'x-upsert': 'false',
    },
  });
}

async function deleteObject(token, path) {
  try {
    await supabaseRawFetch(`/storage/v1/object/legal-documents/${encodeStoragePath(path)}`, {
      token,
      method: 'DELETE',
    });
  } catch (_) {}
}

async function detail(token, documentId) {
  const result = await rpc(token, 'legal_get_document', { p_document_id: documentId });
  return result;
}

function templateFromBody(body) {
  const { templateCode, templateBase64, replacements } = validateGenerationPayload(body);
  const template = Buffer.from(templateBase64, 'base64');
  if (template.length < 4 || template.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('Modelo DOCX interno inválido.');
  }
  return { templateCode, replacements, template };
}

module.exports = async function handler(req, res) {
  try {
    const user = await requireUser(req, res);
    if (!user) return json(res, 401, { ok: false, error: 'Sessão inválida ou expirada.' });
    const token = req.__embrascaAccessToken;

    if (req.method === 'GET') {
      const documentId = String(req.query?.documentId || '').trim();
      if (documentId) {
        if (!isUuid(documentId)) return json(res, 400, { ok: false, error: 'Documento inválido.' });
        const result = await detail(token, documentId);
        if (!result.ok) return json(res, mapSupabaseStatus(result), { ok: false, error: result.data?.message || 'Falha ao carregar documento.' });
        if (!result.data) return json(res, 404, { ok: false, error: 'Documento não encontrado.' });
        return json(res, 200, { ok: true, document: result.data });
      }
      const result = await rpc(token, 'legal_list_documents');
      if (!result.ok) return json(res, mapSupabaseStatus(result), { ok: false, error: result.data?.message || 'Falha ao listar documentos.' });
      return json(res, 200, { ok: true, documents: Array.isArray(result.data) ? result.data : [] });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return json(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    const body = parseBody(req.body);
    const action = String(body.action || '').trim();

    if (action === 'create_document') {
      const { templateCode, replacements, template } = templateFromBody(body);
      const metadata = sanitizeMetadata(body);
      const documentId = crypto.randomUUID();
      const path = storagePath(user.id, documentId, 1);
      const buffer = buildLegalDocx({ template, replacements, templateCode });
      const uploaded = await uploadDocx(token, path, buffer);
      if (!uploaded.ok) return json(res, uploaded.status || 500, { ok: false, error: 'Falha ao armazenar o DOCX.' });

      const created = await rpc(token, 'legal_create_document', {
        p_document_id: documentId,
        p_template_code: templateCode,
        p_title: metadata.title,
        p_counterparty: metadata.counterparty,
        p_form_data: metadata.formData,
        p_storage_path: path,
      });
      if (!created.ok) {
        await deleteObject(token, path);
        return json(res, mapSupabaseStatus(created), { ok: false, error: created.data?.message || 'Falha ao registrar o documento.' });
      }
      const fresh = await detail(token, documentId);
      if (!fresh.ok || !fresh.data) return json(res, 500, { ok: false, error: 'Documento criado, mas não foi possível recarregar os detalhes.' });
      return json(res, 201, { ok: true, document: fresh.data });
    }

    if (action === 'create_version') {
      const documentId = String(body.documentId || '').trim();
      if (!isUuid(documentId)) return json(res, 400, { ok: false, error: 'Documento inválido.' });
      const current = await detail(token, documentId);
      if (!current.ok) return json(res, mapSupabaseStatus(current), { ok: false, error: current.data?.message || 'Falha ao carregar documento.' });
      if (!current.data) return json(res, 404, { ok: false, error: 'Documento não encontrado.' });

      const { templateCode, replacements, template } = templateFromBody(body);
      if (templateCode !== current.data.templateCode) return json(res, 400, { ok: false, error: 'O modelo da nova versão deve ser o mesmo do documento.' });
      const expected = Number(current.data.currentVersion);
      const nextVersion = expected + 1;
      const path = storagePath(current.data.ownerId, documentId, nextVersion);
      const buffer = buildLegalDocx({ template, replacements, templateCode });
      const uploaded = await uploadDocx(token, path, buffer);
      if (!uploaded.ok) return json(res, uploaded.status || 500, { ok: false, error: 'Falha ao armazenar a nova versão.' });

      const added = await rpc(token, 'legal_add_version', {
        p_document_id: documentId,
        p_expected_current_version: expected,
        p_form_data: sanitizeMetadata(body).formData,
        p_storage_path: path,
      });
      if (!added.ok) {
        await deleteObject(token, path);
        return json(res, mapSupabaseStatus(added), { ok: false, error: added.data?.message || 'Falha ao registrar a nova versão.' });
      }
      const fresh = await detail(token, documentId);
      if (!fresh.ok || !fresh.data) return json(res, 500, { ok: false, error: 'Versão criada, mas não foi possível recarregar os detalhes.' });
      return json(res, 200, { ok: true, document: fresh.data });
    }

    const documentId = String(body.documentId || '').trim();
    if (!isUuid(documentId)) return json(res, 400, { ok: false, error: 'Documento inválido.' });

    const rpcByAction = {
      submit_review: ['legal_submit_review', { p_document_id: documentId }],
      request_correction: ['legal_request_correction', { p_document_id: documentId, p_comment: String(body.comment || '').trim().slice(0, 4000) || null }],
      approve: ['legal_approve_document', { p_document_id: documentId }],
    };
    const selected = rpcByAction[action];
    if (!selected) return json(res, 400, { ok: false, error: 'Ação inválida.' });

    const changed = await rpc(token, selected[0], selected[1]);
    if (!changed.ok) return json(res, mapSupabaseStatus(changed), { ok: false, error: changed.data?.message || 'Não foi possível concluir a ação.' });
    const fresh = await detail(token, documentId);
    if (!fresh.ok || !fresh.data) return json(res, 500, { ok: false, error: 'Ação concluída, mas não foi possível recarregar os detalhes.' });
    return json(res, 200, { ok: true, document: fresh.data });
  } catch (error) {
    console.error('[LEGAL WORKSPACE]', error);
    const status = /Modelo|Dados|Quantidade|Requisição|DOCX interno/i.test(String(error?.message || '')) ? 400 : 500;
    return json(res, status, { ok: false, error: error?.message || 'Falha no módulo jurídico.' });
  }
};
