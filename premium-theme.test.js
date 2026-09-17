const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');

test('premium stylesheet defines complete light and dark themes', () => {
  const css = read('premium-theme.css');
  assert.match(css, /html\[data-theme="light"\]/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /--bg:/);
  assert.match(css, /--surface:/);
  assert.match(css, /--text:/);
  assert.match(css, /--accent:/);
});

test('premium stylesheet covers the main legal UI components', () => {
  const css = read('premium-theme.css');
  for (const selector of ['#nav', '.tablewrap', '.table', '.btn', '.field', '.reviewcard', '.badge']) {
    assert.ok(css.includes(selector), `missing selector ${selector}`);
  }
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
  assert.match(css, /@media\s*\(max-width:/);
});

test('theme controller persists preference without touching business logic', () => {
  const js = read('premium-theme.js');
  assert.match(js, /embrascaJuridicoTheme/);
  assert.match(js, /localStorage/);
  assert.match(js, /matchMedia/);
  assert.match(js, /dataset\.theme/);
  assert.match(js, /embrasca-theme-toggle/);
  assert.doesNotMatch(js, /MutationObserver/);
  assert.doesNotMatch(js, /legal-workspace|supabase|DOCX|reviewAction|sendForReview/i);
});

test('index loads premium theme CSS and controller', () => {
  const html = read('index.html');
  assert.match(html, /premium-theme\.css\?v=/);
  assert.match(html, /premium-theme\.js\?v=/);
});
