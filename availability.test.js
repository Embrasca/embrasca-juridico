const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

test('classifica apenas credencial realmente invalida como 401', () => {
  const { classifyLoginFailure } = require('./api/login-error');
  assert.deepEqual(classifyLoginFailure({ status: 400, data: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } }), {
    status: 401,
    error: 'E-mail ou senha inválidos.',
  });
  assert.deepEqual(classifyLoginFailure({ status: 503, data: { message: 'Project is paused' } }), {
    status: 503,
    error: 'Serviço de autenticação temporariamente indisponível. Tente novamente em alguns minutos.',
  });
  assert.deepEqual(classifyLoginFailure({ status: 400, data: { message: 'Project not active' } }), {
    status: 503,
    error: 'Serviço de autenticação temporariamente indisponível. Tente novamente em alguns minutos.',
  });
});

test('login trata falha de rede do Supabase como indisponibilidade', () => {
  const login = read('api/login.js');
  assert.match(login, /classifyLoginFailure/);
  assert.match(login, /catch/);
  assert.match(login, /AUTH_UNAVAILABLE_MESSAGE/);
});

test('Vercel executa heartbeat diario que consulta de verdade o Supabase', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.ok(Array.isArray(config.crons));
  const heartbeat = config.crons.find((cron) => cron.path === '/api/heartbeat');
  assert.ok(heartbeat, 'cron diario deve chamar /api/heartbeat');
  assert.equal(heartbeat.schedule, '17 12 * * *');
  const endpoint = read('api/heartbeat.js');
  assert.match(endpoint, /bootstrap_public_status/);
  assert.match(endpoint, /supabaseFetch/);
});
