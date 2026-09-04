const { json, clearCookies } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  res.setHeader('Set-Cookie', clearCookies());
  return json(res, 200, { ok: true });
};
