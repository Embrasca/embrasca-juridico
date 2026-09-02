const { config, json, sessionCookies, supabaseFetch, publicUser } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  if (!config().configured) return json(res, 503, { error: 'Autenticação central não configurada.' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return json(res, 400, { error: 'Informe e-mail e senha.' });

  const r = await supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });

  if (!r.ok || !r.data?.access_token || !r.data?.user) {
    return json(res, 401, { error: 'E-mail ou senha inválidos.' });
  }

  const user = publicUser(r.data.user);
  if (!user.active) return json(res, 403, { error: 'Usuário desativado.' });

  res.setHeader('Set-Cookie', sessionCookies(r.data.access_token, r.data.refresh_token, r.data.expires_in));
  return json(res, 200, { user });
};
