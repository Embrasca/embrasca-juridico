const test = require('node:test');
const assert = require('node:assert/strict');

const modulePath = require.resolve('./api/_supabase');

function loadFresh() {
  delete require.cache[modulePath];
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test-key';
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  return require('./api/_supabase');
}

test('login comum nao depende de service role', () => {
  const auth = loadFresh();
  assert.equal(auth.config().configured, true);
  assert.equal(auth.config().adminConfigured, false);
});

test('role e active vem do profile do Postgres e nao de user metadata', () => {
  const auth = loadFresh();
  const user = auth.publicUser(
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'gabriel@example.com',
      user_metadata: { role: 'admin', active: true, name: 'Metadata' },
    },
    {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'gabriel@example.com',
      name: 'Gabriel',
      role: 'juridico',
      active: false,
    },
  );

  assert.equal(user.name, 'Gabriel');
  assert.equal(user.role, 'juridico');
  assert.equal(user.active, false);
});
