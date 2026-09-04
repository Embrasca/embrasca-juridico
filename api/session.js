const { config, json, resolveSession } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
  if (!config().configured) return json(res, 503, { error: 'Autenticação central não configurada.' });

  try {
    const user = await resolveSession(req, res);
    if (!user) return json(res, 401, { user: null });
    return json(res, 200, { user });
  } catch (error) {
    console.error('[AUTH SESSION]', error);
    return json(res, 500, { error: 'Não foi possível validar a sessão.' });
  }
};
