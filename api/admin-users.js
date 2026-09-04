const { config, json, requireAdmin } = require('./_supabase');

function bodyOf(req) {
  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

module.exports = async (req, res) => {
  const c = config();
  if (!c.configured) return json(res, 503, { error: 'Autenticação central não configurada.' });

  const actor = await requireAdmin(req, res);
  if (!actor) return json(res, 403, { error: 'Acesso restrito a administradores.' });

  const accessToken = req.__embrascaAccessToken;
  if (!accessToken) return json(res, 401, { error: 'Sessão administrativa inválida.' });
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Método não permitido.' });

  try {
    const response = await fetch(`${c.url}/functions/v1/admin-users`, {
      method: req.method,
      headers: {
        apikey: c.anon,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: req.method === 'POST' ? JSON.stringify(bodyOf(req)) : undefined,
    });

    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { error: text || 'Resposta administrativa inválida.' }; }
    return json(res, response.status, data || {});
  } catch (error) {
    console.error('[ADMIN USERS PROXY]', error);
    return json(res, 502, { error: 'Não foi possível acessar a administração de usuários.' });
  }
};
