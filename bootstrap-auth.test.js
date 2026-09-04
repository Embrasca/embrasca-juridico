const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(__dirname, file));

test('primeiro administrador usa endpoint central de bootstrap', () => {
  assert.equal(exists('api/bootstrap.js'), true, 'api/bootstrap.js must exist');
  const source = read('api/bootstrap.js');
  assert.match(source, /bootstrap_available/);
  assert.match(source, /claim_first_admin/);
  assert.match(source, /\/auth\/v1\/signup/);
  assert.match(source, /sessionCookies/);
});

test('setup antigo e interceptado pelo cliente central', () => {
  const client = read('auth-client.js');
  assert.match(client, /\/api\/bootstrap/);
  assert.match(client, /setupFirstAdmin/);
  assert.match(client, /forceSetup/);
  assert.match(client, /URLSearchParams/);
  assert.match(client, /stopImmediatePropagation/);
});

test('bootstrap no Postgres e de uso unico e promove somente o primeiro admin', () => {
  assert.equal(exists('supabase/migrations/20260904_first_admin_bootstrap.sql'), true, 'bootstrap migration must exist');
  const sql = read('supabase/migrations/20260904_first_admin_bootstrap.sql');
  assert.match(sql, /bootstrap_state/);
  assert.match(sql, /bootstrap_available/);
  assert.match(sql, /claim_first_admin/);
  assert.match(sql, /claimed_at/);
  assert.match(sql, /expected_email/);
  assert.match(sql, /role\s*=\s*'admin'/i);
  assert.match(sql, /active\s*=\s*true/i);
  assert.match(sql, /'usuario'\s*,\s*false/i);
});
