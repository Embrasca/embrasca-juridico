const COOKIE_NAME = 'embrasca_juridico_session';
const REFRESH_COOKIE_NAME = 'embrasca_juridico_refresh';

function config() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return {
    url,
    anon,
    service,
    configured: Boolean(url && anon),
    adminConfigured: Boolean(url && service),
  };
}

function json(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(JSON.stringify(body));
}

function cookies(req) {
  return String(req.headers?.cookie || '').split(';').map(v => v.trim()).filter(Boolean).reduce((out, item) => {
    const i = item.indexOf('=');
    if (i > 0) out[item.slice(0, i)] = decodeURIComponent(item.slice(i + 1));
    return out;
  }, {});
}

function sessionCookies(accessToken, refreshToken, expiresIn = 3600) {
  const secure = 'Path=/; HttpOnly; Secure; SameSite=Strict';
  return [
    `${COOKIE_NAME}=${encodeURIComponent(accessToken)}; ${secure}; Max-Age=${Math.max(60, Number(expiresIn) || 3600)}`,
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken || '')}; ${secure}; Max-Age=2592000`,
  ];
}

function clearCookies() {
  const secure = 'Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
  return [`${COOKIE_NAME}=; ${secure}`, `${REFRESH_COOKIE_NAME}=; ${secure}`];
}

async function supabaseFetch(path, { admin = false, token, method = 'GET', body } = {}) {
  const c = config();
  if (!c.configured || (admin && !c.adminConfigured)) {
    const err = new Error(admin ? 'AUTH_ADMIN_NOT_CONFIGURED' : 'AUTH_NOT_CONFIGURED');
    err.code = admin ? 'AUTH_ADMIN_NOT_CONFIGURED' : 'AUTH_NOT_CONFIGURED';
    throw err;
  }

  const key = admin ? c.service : c.anon;
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (admin) headers.Authorization = `Bearer ${c.service}`;
  else if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${c.url}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { ok: response.ok, status: response.status, data };
}

async function fetchOwnProfile(token, userId) {
  if (!token || !userId) return null;
  const id = encodeURIComponent(userId);
  const r = await supabaseFetch(
    `/rest/v1/profiles?id=eq.${id}&select=id,email,name,role,active`,
    { token },
  );
  if (!r.ok || !Array.isArray(r.data) || r.data.length !== 1) return null;
  return r.data[0];
}

function publicUser(authUser, profile) {
  if (!authUser || !profile || authUser.id !== profile.id) return null;
  return {
    id: authUser.id,
    email: String(profile.email || authUser.email || '').toLowerCase(),
    name: profile.name || profile.email || authUser.email || 'Usuário',
    role: ['admin', 'juridico', 'usuario'].includes(profile.role) ? profile.role : 'usuario',
    active: profile.active === true,
  };
}

async function validateAccessToken(token) {
  if (!token) return null;
  const authResponse = await supabaseFetch('/auth/v1/user', { token });
  if (!authResponse.ok || !authResponse.data?.id) return null;

  const profile = await fetchOwnProfile(token, authResponse.data.id);
  const user = publicUser(authResponse.data, profile);
  return user?.active ? user : null;
}

async function refreshSession(refreshToken) {
  if (!refreshToken) return null;
  const r = await supabaseFetch('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
  if (!r.ok || !r.data?.access_token || !r.data?.user) return null;
  return r.data;
}

async function resolveSession(req, res) {
  const jar = cookies(req);
  let user = await validateAccessToken(jar[COOKIE_NAME]);
  if (user) return user;

  const refreshed = await refreshSession(jar[REFRESH_COOKIE_NAME]);
  if (!refreshed) {
    if (res) res.setHeader('Set-Cookie', clearCookies());
    return null;
  }

  const profile = await fetchOwnProfile(refreshed.access_token, refreshed.user.id);
  user = publicUser(refreshed.user, profile);
  if (!user?.active) {
    if (res) res.setHeader('Set-Cookie', clearCookies());
    return null;
  }

  if (res) {
    res.setHeader('Set-Cookie', sessionCookies(
      refreshed.access_token,
      refreshed.refresh_token || jar[REFRESH_COOKIE_NAME],
      refreshed.expires_in,
    ));
  }
  return user;
}

async function currentUser(req, res) {
  return resolveSession(req, res);
}

async function requireUser(req, res) {
  const user = await resolveSession(req, res);
  if (!user || !user.active) return null;
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user || user.role !== 'admin') return null;
  return user;
}

module.exports = {
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  config,
  json,
  cookies,
  sessionCookies,
  clearCookies,
  supabaseFetch,
  fetchOwnProfile,
  publicUser,
  validateAccessToken,
  currentUser,
  resolveSession,
  requireUser,
  requireAdmin,
};
