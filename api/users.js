const { json, listAuthUsers, requireAdmin, supabaseFetch } = require('./_supabase');

module.exports = async (req, res) => {
  const admin = await requireAdmin(req);
  if (!admin) return json(res, 403, { error: 'Sem permissão.' });

  if (req.method === 'GET') return json(res, 200, { users: await listAuthUsers() });

  if (req.method === 'POST') {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const role = ['admin', 'juridico', 'usuario'].includes(req.body?.role) ? req.body.role : 'usuario';
    if (!name || !email || password.length < 6) return json(res, 400, { error: 'Preencha os dados e use senha com 6+ caracteres.' });
    const r = await supabaseFetch('/auth/v1/admin/users', {
      admin: true,
      method: 'POST',
      body: { email, password, email_confirm: true, user_metadata: { name, role, active: true } },
    });
    if (!r.ok) return json(res, 400, { error: r.data?.message || 'Não foi possível criar o usuário.' });
    return json(res, 201, { ok: true });
  }

  if (req.method === 'PATCH') {
    const id = String(req.body?.id || '');
    const active = Boolean(req.body?.active);
    if (!id || id === admin.id) return json(res, 400, { error: 'Operação inválida.' });
    const existing = (await listAuthUsers()).find((user) => user.id === id);
    if (!existing) return json(res, 404, { error: 'Usuário não encontrado.' });
    const r = await supabaseFetch(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      admin: true,
      method: 'PUT',
      body: { user_metadata: { name: existing.name, role: existing.role, active } },
    });
    if (!r.ok) return json(res, 400, { error: r.data?.message || 'Não foi possível atualizar o usuário.' });
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: 'Método não permitido.' });
};