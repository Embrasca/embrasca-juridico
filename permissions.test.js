const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const permissionsPath = path.join(__dirname, 'permissions.js');
const indexPath = path.join(__dirname, 'index.html');

function fakeNavItem(screen) {
  const classes = new Set();
  const style = {
    display: '',
    priority: '',
    setProperty(name, value, priority) {
      if (name === 'display') {
        this.display = value;
        this.priority = priority || '';
      }
    },
    removeProperty(name) {
      if (name === 'display') {
        this.display = '';
        this.priority = '';
      }
    },
  };

  return {
    dataset: { s: screen },
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute() {},
    style,
  };
}

test('permission matrix matches the three approved profiles', () => {
  const { canAccess } = require(permissionsPath);

  assert.equal(canAccess('usuario', 'dashboard'), true);
  assert.equal(canAccess('usuario', 'novo'), true);
  assert.equal(canAccess('usuario', 'documentos'), true);
  assert.equal(canAccess('usuario', 'revisoes'), false);
  assert.equal(canAccess('usuario', 'modelos'), false);
  assert.equal(canAccess('usuario', 'config'), false);

  assert.equal(canAccess('juridico', 'dashboard'), true);
  assert.equal(canAccess('juridico', 'novo'), false);
  assert.equal(canAccess('juridico', 'documentos'), true);
  assert.equal(canAccess('juridico', 'revisoes'), true);
  assert.equal(canAccess('juridico', 'modelos'), false);
  assert.equal(canAccess('juridico', 'config'), false);

  for (const screen of ['dashboard', 'novo', 'documentos', 'revisoes', 'modelos', 'config']) {
    assert.equal(canAccess('admin', screen), true);
  }
});

test('unauthorized navigation falls back to dashboard', () => {
  const { resolveTarget } = require(permissionsPath);
  assert.equal(resolveTarget('juridico', 'novo'), 'dashboard');
  assert.equal(resolveTarget('usuario', 'revisoes'), 'dashboard');
  assert.equal(resolveTarget('admin', 'config'), 'config');
});

test('unauthorized navigation items are actually invisible', () => {
  const dashboard = fakeNavItem('dashboard');
  const revisoes = fakeNavItem('revisoes');
  const modelos = fakeNavItem('modelos');

  const previousDocument = global.document;
  global.document = {
    querySelectorAll(selector) {
      if (selector === '#nav [data-s]') return [dashboard, revisoes, modelos];
      if (selector === '[data-go]') return [];
      return [];
    },
    getElementById() {
      return null;
    },
  };

  delete require.cache[require.resolve(permissionsPath)];
  const { applyNavigation } = require(permissionsPath);
  applyNavigation('usuario');

  assert.equal(dashboard.style.display, '');
  assert.equal(revisoes.style.display, 'none');
  assert.equal(revisoes.style.priority, 'important');
  assert.equal(modelos.style.display, 'none');
  assert.equal(modelos.style.priority, 'important');

  applyNavigation('admin');
  assert.equal(revisoes.style.display, '');
  assert.equal(revisoes.style.priority, '');
  assert.equal(modelos.style.display, '');
  assert.equal(modelos.style.priority, '');

  global.document = previousDocument;
  delete require.cache[require.resolve(permissionsPath)];
});

test('permissions layer loads before central authentication', () => {
  const index = fs.readFileSync(indexPath, 'utf8');
  const permissionsPosition = index.indexOf('/permissions.js');
  const authPosition = index.indexOf('/auth-client.js');
  assert.ok(permissionsPosition >= 0, 'permissions.js must be loaded');
  assert.ok(authPosition >= 0, 'auth-client.js must be loaded');
  assert.ok(permissionsPosition < authPosition, 'permissions must load before authentication');
});
