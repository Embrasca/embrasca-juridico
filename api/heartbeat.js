const { config, json, supabaseFetch } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { ok: false });
  if (!config().configured) return json(res, 503, { ok: false });

  try {
    const r = await supabaseFetch('/rest/v1/rpc/bootstrap_public_status', {
      method: 'POST',
      body: {},
    });
    if (!r.ok) return json(res, 503, { ok: false });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error('[HEARTBEAT SUPABASE]', error);
    return json(res, 503, { ok: false });
  }
};
