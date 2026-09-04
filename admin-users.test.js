const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(__dirname, file));

test('admin user API exists and requires admin session plus service role', () => {
  assert.equal(exists('api/admin-users.js'), true, 'api/admin-users.js must exist');
  const source = read('api/admin-users.js');
  assert.match(source, /requireAdmin/);
  assert.match(source, /adminConfigured/);
  assert.match(source, /\/auth\/v1\/admin\/users/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY|config\(\)\.service/);
});

test('admin API supports list create update delete and reset', () => {
  const source = read('api/admin-users.js');
  assert.match(source, /action\s*===\s*['"]create['"]/);
  assert.match(source, /action\s*===\s*['"]update['"]/);
  assert.match(source, /action\s*===\s*['"]delete['"]/);
  assert.match(source, /action\s*===\s*['"]reset['"]/);
  assert.match(source, /admin|juridico|usuario/);
});

test('last active admin cannot be removed or demoted', () => {
  assert.equal(exists('api/admin-users-core.js'), true, 'api/admin-users-core.js must exist');
  const core = require('./api/admin-users-core.js');

  assert.equal(core.canRemoveAdmin({ targetRole: 'admin', targetActive: true, activeAdminCount: 1 }), false);
  assert.equal(core.canRemoveAdmin({ targetRole: 'admin', targetActive: true, activeAdminCount: 2 }), true);
  assert.equal(core.canRemoveAdmin({ targetRole: 'juridico', targetActive: true, activeAdminCount: 1 }), true);
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

test('index loads admin user interface after central auth', () => {
  const index = read('index.html');
  assert.match(index, /admin-users-ui\.js/);
});
