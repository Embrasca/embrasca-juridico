const crypto = require('node:crypto');
const {
  config,
  json,
  requireAdmin,
  supabaseFetch,
} = require('./_supabase');
const {
  ROLES,
  validRole,
  normalizeRole,
  canRemoveAdmin,
  wouldRemoveActiveAdmin,
} = require('./admin-users-core');

function bodyOf(req) {
  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function temporaryPassword() {
  return `${crypto.randomBytes(9).toString('base64url')}A9!`;
}

async function listProfiles() {
  const r = await supabaseFetch(
    '/rest/v1/profiles?select=id,email,name,role,active,created_at,updated_at&order=created_at.asc',
    { admin: true },
  );
  if (!r.ok || !Array.isArray(r.data)) throw new Error('PROFILES_LIST_FAILED');
  return r.data;
}

async function listAuthUsers() {
  const r = await supabaseFetch('/auth/v1/admin/users?page=1&per_page=200', { admin: true });
  if (!r.ok) throw new Error('AUTH_USERS_LIST_FAILED');
  return Array.isArray(r.data?.users) ? r.data.users : [];
}

async function getProfile(id) {
  const safe = encodeURIComponent(String(id || ''));
  const r = await supabaseFetch(
    `/rest/v1/profiles?id=eq.${safe}&select=id,email,name,role,active,created_at,updated_at`,
    { admin: true },
  );
  if (!r.ok || !Array.isArray(r.data) || r.data.length !== 1) return null;
  return r.data[0];
}

async function updateProfile(id, patch) {
  const safe = encodeURIComponent(String(id || ''));
  const r = await supabaseFetch(`/rest/v1/profiles?id=eq.${safe}`, {
    admin: true,
    method: 'PATCH',
    body: patch,
  });
  if (!r.ok) throw new Error('PROFILE_UPDATE_FAILED');
}

async function activeAdminCount() {
  const profiles = await listProfiles();
  return profiles.filter((profile) => profile.role === 'admin' && profile.active === true).length;
}

function publicRecord(authUser, profile) {
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
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  return profiles.map((profile) => publicRecord(authById.get(profile.id), profile));
}

async function createUser(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim();
  const role = normalizeRole(body.role);
  if (!email || name.length < 2 || !validRole(role)) {
    return { status: 400, body: { error: 'Informe nome, e-mail e um perfil válido.' } };
  }

  const password = temporaryPassword();
  const created = await supabaseFetch('/auth/v1/admin/users', {
    admin: true,
    method: 'POST',
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    },
  });

  if (!created.ok || !created.data?.id) {
    return { status: 409, body: { error: created.data?.message || 'Não foi possível criar o usuário.' } };
  }

  try {
    await updateProfile(created.data.id, {
      email,
      name,
      role,
      active: true,
      updated_at: new Date().toISOString(),
    });
  } catch (error) {
    await supabaseFetch(`/auth/v1/admin/users/${encodeURIComponent(created.data.id)}`, {
      admin: true,
      method: 'DELETE',
    });
    throw error;
  }

  return {
    status: 201,
    body: {
      user: publicRecord(created.data, {
        id: created.data.id,
        email,
        name,
        role,
        active: true,
        created_at: created.data.created_at || null,
      }),
      temporaryPassword: password,
    },
  };
}

async function updateUser(body) {
  const id = String(body.id || '').trim();
  const target = await getProfile(id);
  if (!target) return { status: 404, body: { error: 'Usuário não encontrado.' } };

  const patch = {};
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (name.length < 2) return { status: 400, body: { error: 'Nome inválido.' } };
    patch.name = name;
  }
  if (body.role !== undefined) {
    if (!validRole(body.role)) return { status: 400, body: { error: 'Perfil inválido.' } };
    patch.role = normalizeRole(body.role);
  }
  if (body.active !== undefined) patch.active = body.active === true;

  if (wouldRemoveActiveAdmin(target, patch)) {
    const count = await activeAdminCount();
    if (!canRemoveAdmin({ targetRole: target.role, targetActive: target.active, activeAdminCount: count })) {
      return { status: 409, body: { error: 'O sistema precisa manter pelo menos um administrador ativo.' } };
    }
  }

  patch.updated_at = new Date().toISOString();
  await updateProfile(id, patch);
  const updated = { ...target, ...patch };
  return { status: 200, body: { user: publicRecord(null, updated) } };
}

async function deleteUser(body) {
  const id = String(body.id || '').trim();
  const target = await getProfile(id);
  if (!target) return { status: 404, body: { error: 'Usuário não encontrado.' } };

  if (target.role === 'admin' && target.active === true) {
    const count = await activeAdminCount();
    if (!canRemoveAdmin({ targetRole: target.role, targetActive: target.active, activeAdminCount: count })) {
      return { status: 409, body: { error: 'O último administrador ativo não pode ser excluído.' } };
    }
  }

  const r = await supabaseFetch(`/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    admin: true,
    method: 'DELETE',
  });
  if (!r.ok) return { status: 500, body: { error: 'Não foi possível excluir o usuário.' } };
  return { status: 200, body: { ok: true } };
}

async function resetUser(body) {
  const id = String(body.id || '').trim();
  const target = await getProfile(id);
  if (!target) return { status: 404, body: { error: 'Usuário não encontrado.' } };

  const r = await supabaseFetch('/auth/v1/recover', {
    method: 'POST',
    body: { email: target.email },
  });
  if (!r.ok) return { status: 502, body: { error: 'Não foi possível enviar a redefinição de acesso.' } };
  return { status: 200, body: { ok: true } };
}

module.exports = async (req, res) => {
  if (!config().configured) return json(res, 503, { error: 'Autenticação central não configurada.' });
  if (!config().adminConfigured) {
    return json(res, 503, { error: 'Administração não configurada. Adicione SUPABASE_SERVICE_ROLE_KEY na Vercel.' });
  }

  const actor = await requireAdmin(req, res);
  if (!actor) return json(res, 403, { error: 'Acesso restrito a administradores.' });

  try {
    if (req.method === 'GET') {
      const users = await listUsers();
      return json(res, 200, { users, roles: ROLES });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });

    const body = bodyOf(req);
    const action = String(body.action || '').toLowerCase();
    let result;
    if (action === 'create') result = await createUser(body);
    else if (action === 'update') result = await updateUser(body);
    else if (action === 'delete') result = await deleteUser(body);
    else if (action === 'reset') result = await resetUser(body);
    else result = { status: 400, body: { error: 'Ação administrativa inválida.' } };

    return json(res, result.status, result.body);
  } catch (error) {
    console.error('[ADMIN USERS]', error);
    return json(res, 500, { error: 'Falha ao administrar usuários.' });
  }
};
