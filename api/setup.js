const { config, json, listAuthUsers, supabaseFetch, publicUser, sessionCookies } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  if (!config().configured) return json(res, 503, { error: 'Autenticação central ainda não configurada.' });
  const existing = await listAuthUsers();
  if (existing.length) return json(res, 409, { error: 'O administrador inicial já foi criado.' });

  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!name || !email || password.length < 6) return json(res, 400, { error: 'Preencha os dados e use senha com pelo menos 6 caracteres.' });

  const created = await supabaseFetch('/auth/v1/admin/users', {
    admin: true,
    method: 'POST',
    body: { email, password, email_confirm: true, user_metadata: { name, role: 'admin', active: true } },
  });
  if (!created.ok) return json(res, 400, { error: created.data?.message || 'Não foi possível criar o administrador.' });

  const login = await supabaseFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  if (!login.ok) return json(res, 200, { user: publicUser(created.data), needsLogin: true });
  res.setHeader('Set-Cookie', sessionCookies(login.data.access_token, login.data.refresh_token, login.data.expires_in));
  return json(res, 200, { user: publicUser(login.data.user) });
};