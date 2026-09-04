import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ROLES = ['admin', 'juridico', 'usuario'];

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

const validRole = (role: unknown) => ROLES.includes(String(role || '').toLowerCase());
const normalizeRole = (role: unknown) => validRole(role) ? String(role).toLowerCase() : 'usuario';

function temporaryPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const raw = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${raw}A9!`;
}

async function call(path: string, init: RequestInit = {}, service = false) {
  const key = service ? SERVICE_ROLE_KEY : ANON_KEY;
  const headers = new Headers(init.headers || {});
  headers.set('apikey', key);
  headers.set('Content-Type', 'application/json');
  if (service) headers.set('Authorization', `Bearer ${SERVICE_ROLE_KEY}`);
  const response = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { response, data };
}

async function actorFrom(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userResp.ok) return null;
  const user = await userResp.json();
  if (!user?.id) return null;
  const profileResp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,name,role,active`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!profileResp.ok) return null;
  const profiles = await profileResp.json();
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile || profile.role !== 'admin' || profile.active !== true) return null;
  return { user, profile };
}

async function listProfiles() {
  const { response, data } = await call('/rest/v1/profiles?select=id,email,name,role,active,created_at,updated_at&order=created_at.asc', {}, true);
  if (!response.ok || !Array.isArray(data)) throw new Error('PROFILES_LIST_FAILED');
  return data;
}

async function listAuthUsers() {
  const { response, data } = await call('/auth/v1/admin/users?page=1&per_page=200', {}, true);
  if (!response.ok) throw new Error('AUTH_USERS_LIST_FAILED');
  return Array.isArray(data?.users) ? data.users : [];
}

async function getProfile(id: string) {
  const { response, data } = await call(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,email,name,role,active,created_at,updated_at`, {}, true);
  if (!response.ok || !Array.isArray(data) || data.length !== 1) return null;
  return data[0];
}

async function updateProfile(id: string, patch: Record<string, unknown>) {
  const { response } = await call(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    headers: { Prefer: 'return=minimal' },
  }, true);
  if (!response.ok) throw new Error('PROFILE_UPDATE_FAILED');
}

async function activeAdminCount() {
  const profiles = await listProfiles();
  return profiles.filter((p: any) => p.role === 'admin' && p.active === true).length;
}

function publicRecord(authUser: any, profile: any) {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    active: profile.active === true,
    createdAt: profile.created_at || authUser?.created_at || null,
    updatedAt: profile.updated_at || null,
    lastSignInAt: authUser?.last_sign_in_at || null,
    emailConfirmedAt: authUser?.email_confirmed_at || null,
  };
}

async function listUsers() {
  const [profiles, authUsers] = await Promise.all([listProfiles(), listAuthUsers()]);
  const authById = new Map(authUsers.map((u: any) => [u.id, u]));
  return profiles.map((p: any) => publicRecord(authById.get(p.id), p));
}

async function createUser(body: any) {
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const role = normalizeRole(body.role);
  if (!email || name.length < 2 || !validRole(body.role)) return json(400, { error: 'Informe nome, e-mail e um perfil válido.' });
  const password = temporaryPassword();
  const { response, data } = await call('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
  }, true);
  if (!response.ok || !data?.id) return json(409, { error: data?.message || 'Não foi possível criar o usuário.' });
  try {
    await updateProfile(data.id, { email, name, role, active: true, updated_at: new Date().toISOString() });
  } catch (error) {
    await call(`/auth/v1/admin/users/${encodeURIComponent(data.id)}`, { method: 'DELETE' }, true);
    throw error;
  }
  return json(201, {
    user: publicRecord(data, { id: data.id, email, name, role, active: true, created_at: data.created_at || null }),
    temporaryPassword: password,
  });
}

async function updateUser(body: any) {
  const id = String(body.id || '').trim();
  const target = await getProfile(id);
  if (!target) return json(404, { error: 'Usuário não encontrado.' });
  const patch: Record<string, any> = {};
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (name.length < 2) return json(400, { error: 'Nome inválido.' });
    patch.name = name;
  }
  if (body.role !== undefined) {
    if (!validRole(body.role)) return json(400, { error: 'Perfil inválido.' });
    patch.role = normalizeRole(body.role);
  }
  if (body.active !== undefined) patch.active = body.active === true;
  const nextRole = patch.role === undefined ? target.role : patch.role;
  const nextActive = patch.active === undefined ? target.active : patch.active;
  if (target.role === 'admin' && target.active === true && (nextRole !== 'admin' || nextActive !== true) && await activeAdminCount() <= 1) {
    return json(409, { error: 'O sistema precisa manter pelo menos um administrador ativo.' });
  }
  patch.updated_at = new Date().toISOString();
  await updateProfile(id, patch);
  return json(200, { user: publicRecord(null, { ...target, ...patch }) });
}

async function deleteUser(body: any) {
  const id = String(body.id || '').trim();
  const target = await getProfile(id);
  if (!target) return json(404, { error: 'Usuário não encontrado.' });
  if (target.role === 'admin' && target.active === true && await activeAdminCount() <= 1) {
    return json(409, { error: 'O último administrador ativo não pode ser excluído.' });
  }
  const { response } = await call(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
  if (!response.ok) return json(500, { error: 'Não foi possível excluir o usuário.' });
  return json(200, { ok: true });
}

async function resetUser(body: any) {
  const id = String(body.id || '').trim();
  const target = await getProfile(id);
  if (!target) return json(404, { error: 'Usuário não encontrado.' });
  const password = temporaryPassword();
  const { response } = await call(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  }, true);
  if (!response.ok) return json(502, { error: 'Não foi possível redefinir o acesso.' });
  return json(200, { ok: true, temporaryPassword: password, email: target.email });
}

Deno.serve(async (req: Request) => {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return json(500, { error: 'Função administrativa não configurada.' });
  if (!await actorFrom(req)) return json(403, { error: 'Acesso restrito a administradores.' });
  try {
    if (req.method === 'GET') return json(200, { users: await listUsers(), roles: ROLES });
    if (req.method !== 'POST') return json(405, { error: 'Método não permitido.' });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').toLowerCase();
    if (action === 'create') return await createUser(body);
    if (action === 'update') return await updateUser(body);
    if (action === 'delete') return await deleteUser(body);
    if (action === 'reset') return await resetUser(body);
    return json(400, { error: 'Ação administrativa inválida.' });
  } catch (error) {
    console.error('[ADMIN USERS EDGE]', error);
    return json(500, { error: 'Falha ao administrar usuários.' });
  }
});
