const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'task2-ui.js'), 'utf8');

test('Task 2 nao ignora o fluxo de autenticacao da aplicacao', () => {
  assert.doesNotMatch(source, /U\s*=\s*\{\s*id:\s*['"]task2-internal['"]/);
  assert.doesNotMatch(source, /login\.classList\.add\(['"]hidden['"]\)/);
  assert.doesNotMatch(source, /app\.classList\.remove\(['"]hidden['"]\)/);
});

test('Task 2 nao esconde a acao de logout', () => {
  assert.doesNotMatch(source, /hide\(['"]#logout['"]\)/);
});

test('Task 2 nao persiste o estado global durante a inicializacao', () => {
  assert.doesNotMatch(source, /\bsave\s*\(\s*\)\s*;/);
});
