const { config, json, currentUser, listAuthUsers } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' });
  if (!config().configured) return json(res, 200, { configured: false, hasUsers: false, user: null });
  try {
    const [user, users] = await Promise.all([currentUser(req), listAuthUsers()]);
    return json(res, 200, { configured: true, hasUsers: users.length > 0, user: user?.active ? user : null });
  } catch {
    return json(res, 503, { configured: false, hasUsers: false, user: null });
  }
};