const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, 'premium-theme.css'), 'utf8');
const themeJs = fs.readFileSync(path.join(__dirname, 'premium-theme.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(__dirname, 'admin-users-ui.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

test('theme toggle never competes with the application header', () => {
  const toggleRule = css.match(/#embrasca-theme-toggle\{[^}]+\}/)?.[0] || '';
  assert.match(toggleRule, /bottom:/);
  assert.doesNotMatch(toggleRule, /top:/);
  assert.match(themeJs, /premium-sidebar-shell/);
  assert.doesNotMatch(themeJs, /MutationObserver/);
});

test('light and dark themes use one complete surface token system', () => {
  assert.match(css, /--sidebar:/);
  assert.match(css, /--topbar:/);
  assert.match(css, /--modal:/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /\.premium-sidebar-shell/);
});

test('admin modal uses theme tokens instead of a hard-coded light panel', () => {
  assert.match(adminJs, /var\(--modal\)/);
  assert.match(adminJs, /var\(--control\)/);
  assert.doesNotMatch(adminJs, /background:#f7f9f7/);
  assert.doesNotMatch(adminJs, /font-family:Arial/);
});

test('admin actions are laid out predictably and never overlap', () => {
  assert.match(adminJs, /\.adm-actions\{[^}]*display:grid/);
  assert.match(adminJs, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(adminJs, /white-space:nowrap/);
  assert.match(adminJs, /@media\(max-width:760px\)/);
});

test('premium assets are cache-busted to the professional revision', () => {
  assert.match(index, /premium-theme\.css\?v=20260916-professional/);
  assert.match(index, /premium-theme\.js\?v=20260916-professional/);
});
