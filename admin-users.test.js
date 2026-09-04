const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(__dirname, file));

test('admin user API proxies authenticated admin requests to Supabase Edge Function', () => {
  assert.equal(exists('api/admin-users.js'), true, 'api/admin-users.js must exist');
  const source = read('api/admin-users.js');
  assert.match(source, /requireAdmin/);
  assert.match(source, /functions\/v1\/admin-users/);
  assert.match(source, /Authorization/);
  assert.match(source, /Bearer/);
  assert.doesNotMatch(source, /adminConfigured/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('Edge Function creates Auth users with the official admin SDK', () => {
  assert.equal(exists('supabase/functions/admin-users/index.ts'), true, 'edge function must exist');
  const source = read('supabase/functions/admin-users/index.ts');
  assert.match(source, /createClient/);
  assert.match(source, /auth\.admin\.createUser/);
  assert.match(source, /auth\.admin\.updateUserById/);
  assert.match(source, /auth\.admin\.deleteUser/);
  assert.match(source, /data\.user/);
});

test('Edge Function validates administrator profile', () => {
  const source = read('supabase/functions/admin-users/index.ts');
  assert.match(source, /role.*admin|admin.*role/s);
  assert.match(source, /active/);
});

test('last active admin cannot be removed or demoted', () => {
  assert.equal(exists('api/admin-users-core.js'), true, 'api/admin-users-core.js must exist');
  const core = require('./api/admin-users-core.js');
  assert.equal(core.canRemoveAdmin({ targetRole: 'admin', targetActive: true, activeAdminCount: 1 }), false);
  assert.equal(core.canRemoveAdmin({ targetRole: 'admin', targetActive: true, activeAdminCount: 2 }), true);
});

test('admin interface is only shown to admin and exposes profile management', () => {
  assert.equal(exists('admin-users-ui.js'), true, 'admin-users-ui.js must exist');
  const ui = read('admin-users-ui.js');
  assert.match(ui, /role\s*!==\s*['"]admin['"]/);
  assert.match(ui, /\/api\/admin-users/);
  assert.match(ui, /Administrador/);
  assert.match(ui, /Jur[ií]dico/);
  assert.match(ui, /Usu[aá]rio/);
  assert.match(ui, /Ativar|Desativar/);
  assert.match(ui, /Excluir/);
  assert.match(ui, /Redefinir acesso/);
});
