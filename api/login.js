const {
  config,
  json,
  sessionCookies,
  supabaseFetch,
  fetchOwnProfile,
  publicUser,
} = require('./_supabase');
const { AUTH_UNAVAILABLE_MESSAGE, classifyLoginFailure } = require('./login-error');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  if (!config().configured) return json(res, 503, { error: 'Autenticação central não configurada.' });

  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return json(res, 400, { error: 'Informe e-mail e senha.' });

  let r;
  try {
    r = await supabaseFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password },
    });
  } catch (error) {
    console.error('[LOGIN SUPABASE]', error);
    return json(res, 503, { error: AUTH_UNAVAILABLE_MESSAGE });
  }

  if (!r.ok || !r.data?.access_token || !r.data?.user) {
    const failure = classifyLoginFailure(r);
    return json(res, failure.status, { error: failure.error });
  }

  const profile = await fetchOwnProfile(r.data.access_token, r.data.user.id);
  const user = publicUser(r.data.user, profile);
  if (!user || !user.active) {
    return json(res, 403, { error: 'Usuário desativado ou sem perfil de acesso.' });
  }

  res.setHeader('Set-Cookie', sessionCookies(r.data.access_token, r.data.refresh_token, r.data.expires_in));
  return json(res, 200, { user });
};
