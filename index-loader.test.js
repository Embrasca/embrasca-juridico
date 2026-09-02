const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

test('nao exibe tela intermediaria de carregamento ao abrir ou recarregar', () => {
  assert.doesNotMatch(html, /Carregando Embrasca Jurídico/);
  assert.doesNotMatch(html, /<div class="boot">\s*Carregando/i);
});
