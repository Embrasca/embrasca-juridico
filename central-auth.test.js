const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

test('central auth is loaded before Task 2 UI', () => {
  const index = read('index.html');
  const authPos = index.indexOf('/auth-client.js');
  const taskPos = index.indexOf('/task2-ui.js');
  assert.ok(authPos >= 0, 'auth-client.js must be loaded');
  assert.ok(taskPos >= 0 && authPos < taskPos, 'central auth must load before task2-ui.js');
});

test('client login uses the central API and not browser password hashes', () => {
  const client = read('auth-client.js');
  assert.match(client, /\/api\/session/);
  assert.match(client, /\/api\/login/);
  assert.doesNotMatch(client, /passwordHash/);
});

test('server login uses Supabase password grant and HttpOnly session cookies', () => {
  const login = read('api/login.js');
  const supabase = read('api/_supabase.js');
  assert.match(login, /grant_type=password/);
  assert.match(supabase, /HttpOnly/);
  assert.match(supabase, /SUPABASE_URL/);
  assert.match(supabase, /SUPABASE_SERVICE_ROLE_KEY/);
});
