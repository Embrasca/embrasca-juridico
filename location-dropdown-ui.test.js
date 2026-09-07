const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const {
  STATES,
  deriveStateLabel,
  isLocationField,
  loadMunicipalities,
} = require('./location-dropdown-ui.js');

test('reconhece campos de cidade e municipio em qualquer modelo', () => {
  assert.equal(isLocationField({ name: 'Município da contratante', placeholder: 'municipio_contratante' }), true);
  assert.equal(isLocationField({ name: 'Cidade de assinatura', placeholder: 'cidade_assinatura' }), true);
  assert.equal(isLocationField({ name: 'CNPJ da contratante', placeholder: 'cnpj_contratante' }), false);
});

test('oferece as 27 UFs e identifica Minas Gerais pelo codigo oficial', () => {
  assert.equal(STATES.length, 27);
  assert.deepEqual(STATES.find((state) => state.uf === 'MG'), {
    id: 31,
    uf: 'MG',
    name: 'Minas Gerais',
  });
});

test('gera rotulo de estado correspondente ao campo de municipio', () => {
  assert.equal(deriveStateLabel('Município da contratante'), 'Estado da contratante');
  assert.equal(deriveStateLabel('Cidade de assinatura'), 'Estado de assinatura');
});

test('carrega apenas os municipios do estado escolhido e preserva so o nome da cidade', async () => {
  const calls = [];
  const cache = new Map();
  const storage = {
    getItem(key) { return cache.has(key) ? cache.get(key) : null; },
    setItem(key, value) { cache.set(key, value); },
  };
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      async json() {
        return [{ id: 3169604, nome: 'Tupaciguara' }, { id: 3170206, nome: 'Uberlândia' }];
      },
    };
  };

  const cities = await loadMunicipalities('MG', fetchImpl, storage);

  assert.deepEqual(cities, ['Tupaciguara', 'Uberlândia']);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/estados\/31\/municipios\?orderBy=nome$/);
  assert.equal(JSON.parse(cache.values().next().value)[0], 'Tupaciguara');
});

test('reutiliza a lista em cache sem chamar novamente o IBGE', async () => {
  const cacheKey = 'embrasca-juridico:municipios:MG:ibge';
  const storage = {
    getItem(key) { return key === cacheKey ? JSON.stringify(['Tupaciguara']) : null; },
    setItem() {},
  };
  let calls = 0;
  const cities = await loadMunicipalities('MG', async () => {
    calls += 1;
    throw new Error('nao deveria chamar a rede');
  }, storage);

  assert.deepEqual(cities, ['Tupaciguara']);
  assert.equal(calls, 0);
});

test('carregador principal inclui os dropdowns de estado e cidade', () => {
  const source = fs.readFileSync(__dirname + '/index.html', 'utf8');
  assert.match(source, /location-dropdown-ui\.js/);
});
