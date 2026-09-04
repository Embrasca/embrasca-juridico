const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(__dirname, file));

test('central auth client exists and is loaded before Task 2 UI', () => {
  assert.equal(exists('auth-client.js'), true, 'auth-client.js must exist');
  const index = read('index.html');
  const authPos = index.indexOf('/auth-client.js');
  const taskPos = index.indexOf('/task2-ui.js');
  assert.ok(authPos >= 0, 'auth-client.js must be loaded');
  assert.ok(taskPos >= 0 && authPos < taskPos, 'central auth must load before task2-ui.js');
});

test('client login uses only the central API for session, login and logout', () => {
  assert.equal(exists('auth-client.js'), true, 'auth-client.js must exist');
  const client = read('auth-client.js');
  assert.match(client, /\/api\/session/);
  assert.match(client, /\/api\/login/);
  assert.match(client, /\/api\/logout/);
  assert.doesNotMatch(client, /passwordHash/);
  assert.doesNotMatch(client, /localStorage[^\n]*password/i);
});

test('server exposes session and logout endpoints', () => {
  assert.equal(exists('api/session.js'), true, 'api/session.js must exist');
  assert.equal(exists('api/logout.js'), true, 'api/logout.js must exist');
  const session = read('api/session.js');
  const logout = read('api/logout.js');
  assert.match(session, /currentUser|resolveSession/);
  assert.match(logout, /clearCookies/);
});

test('server login uses Supabase password grant and HttpOnly cookies', () => {
  const login = read('api/login.js');
  const supabase = read('api/_supabase.js');
  assert.match(login, /grant_type=password/);
  assert.match(supabase, /HttpOnly/);
  assert.match(supabase, /SUPABASE_URL/);
  assert.match(supabase, /SUPABASE_PUBLISHABLE_KEY/);
});

test('authorization comes from postgres profile', () => {
  const login = read('api/login.js');
  const supabase = read('api/_supabase.js');
  assert.match(supabase, /\/rest\/v1\/profiles/);
  assert.match(supabase, /fetchOwnProfile/);
  assert.match(supabase, /adminConfigured/);
  assert.match(login, /fetchOwnProfile/);
  const publicUserBody = supabase.slice(supabase.indexOf('function publicUser'), supabase.indexOf('async function validateAccessToken'));
  assert.doesNotMatch(publicUserBody, /user_metadata|app_metadata/);
});

test('app fica visualmente bloqueado ate a sessao central ser validada', () => {
  const index = read('index.html');
  const client = read('auth-client.js');
  assert.match(index, /central-auth-gate/);
  assert.match(index, /#app,#setup/);
  assert.match(client, /central-auth-gate/);
  assert.match(client, /releaseAuthGate/);
});

test('document generation requires an authenticated user', () => {
  const source = read('api/generate-docx.js');
  assert.match(source, /requireUser/);
  assert.match(source, /401/);
});
