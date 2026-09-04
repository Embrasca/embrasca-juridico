const {
  config,
  json,
  sessionCookies,
  supabaseFetch,
  fetchOwnProfile,
  publicUser,
} = require('./_supabase');

function bodyOf(req) {
  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function rpcRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data && typeof data === 'object' ? data : null;
}

async function publicBootstrapStatus() {
  const r = await supabaseFetch('/rest/v1/rpc/bootstrap_public_status', {
    method: 'POST',
    body: {},
  });
  if (!r.ok) return { available: false, email: '' };
  const row = rpcRow(r.data);
  return {
    available: row?.available === true,
    email: String(row?.expected_email || '').trim().toLowerCase(),
  };
}

async function bootstrapStatus(activationCode) {
  if (!activationCode) return { available: false, email: '' };
  const r = await supabaseFetch('/rest/v1/rpc/bootstrap_available', {
    method: 'POST',
    body: { p_token: activationCode },
  });
  if (!r.ok) return { available: false, email: '' };
  const row = rpcRow(r.data);
  return {
    available: row?.available === true,
    email: String(row?.expected_email || '').trim().toLowerCase(),
  };
}

async function passwordGrant(email, password) {
  const r = await supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  return r.ok && r.data?.user?.id ? r.data : null;
}

module.exports = async (req, res) => {
  if (!config().configured) {
    return json(res, 503, { error: 'Autenticação central não configurada.' });
  }

  if (req.method === 'GET') {
    return json(res, 200, await publicBootstrapStatus());
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  const body = bodyOf(req);
  const activationCode = String(body.activationCode || '').trim();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (name.length < 2 || !email || password.length < 8 || activationCode.length < 32) {
    return json(res, 400, { error: 'Informe nome, e-mail, senha com pelo menos 8 caracteres e o código de ativação.' });
  }

  const status = await bootstrapStatus(activationCode);
  if (!status.available || !status.email || status.email !== email) {
    return json(res, 403, { error: 'Código de ativação inválido, já utilizado ou não autorizado para este e-mail.' });
  }

  let authData = null;
  let signupUser = null;

  const signup = await supabaseFetch('/auth/v1/signup', {
    method: 'POST',
    body: { email, password, data: { name } },
  });

  if (signup.ok && signup.data?.user?.id) {
    signupUser = signup.data.user;
    if (signup.data.access_token) authData = signup.data;
  } else {
    authData = await passwordGrant(email, password);
    if (!authData?.user?.id) {
      return json(res, 409, {
        error: 'Não foi possível concluir o primeiro acesso. Se este e-mail já foi iniciado antes, use a mesma senha.',
      });
    }
  }

  const userId = authData?.user?.id || signupUser?.id;
  const claim = await supabaseFetch('/rest/v1/rpc/claim_first_admin', {
    method: 'POST',
    body: {
      p_token: activationCode,
      p_user_id: userId,
      p_email: email,
      p_name: name,
    },
  });

  const claimed = claim.ok && (claim.data === true || claim.data === 'true');
  if (!claimed) {
    return json(res, 409, { error: 'O primeiro administrador já foi definido ou o código de ativação expirou.' });
  }

  if (!authData?.access_token) {
    authData = await passwordGrant(email, password);
  }

  if (!authData?.access_token || !authData?.user?.id) {
    return json(res, 201, {
      created: true,
      requiresConfirmation: true,
      email,
    });
  }

  const profile = await fetchOwnProfile(authData.access_token, authData.user.id);
  const user = publicUser(authData.user, profile);
  if (!user?.active || user.role !== 'admin') {
    return json(res, 500, { error: 'Administrador criado, mas o perfil ainda não pôde ser validado.' });
  }

  res.setHeader('Set-Cookie', sessionCookies(
    authData.access_token,
    authData.refresh_token,
    authData.expires_in,
  ));
  return json(res, 200, { user });
};

module.exports.bootstrap_available = bootstrapStatus;
module.exports.bootstrap_public_status = publicBootstrapStatus;
module.exports.claim_first_admin = true;
