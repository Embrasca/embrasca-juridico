const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./task2-core.js');

test('classifica somente MINUTA, NDA e MOU', () => {
  assert.equal(core.documentType('MINUTA_AD_EXITUM'), 'MINUTA');
  assert.equal(core.documentType('NDA_BR'), 'NDA');
  assert.equal(core.documentType('MOU_BR'), 'MOU');
  assert.equal(core.documentType('OUTRO'), null);
});

test('valida CPF corretamente', () => {
  assert.equal(core.isValidCPF('529.982.247-25'), true);
  assert.equal(core.isValidCPF('111.111.111-11'), false);
  assert.equal(core.isValidCPF('123'), false);
});

test('valida CNPJ corretamente', () => {
  assert.equal(core.isValidCNPJ('04.252.011/0001-10'), true);
  assert.equal(core.isValidCNPJ('11.111.111/1111-11'), false);
  assert.equal(core.isValidCNPJ('123'), false);
});

test('valida email e percentual', () => {
  assert.equal(core.isValidEmail('juridico@embrasca.com.br'), true);
  assert.equal(core.isValidEmail('juridico@'), false);
  assert.equal(core.isValidPercentage('0'), true);
  assert.equal(core.isValidPercentage('100'), true);
  assert.equal(core.isValidPercentage('101'), false);
  assert.equal(core.isValidPercentage('-1'), false);
});

test('valida campo conforme tipo do perfil', () => {
  assert.equal(core.validateField({ name: 'CNPJ', field_type: 'cnpj', required: true }, '04.252.011/0001-10'), null);
  assert.match(core.validateField({ name: 'CNPJ', field_type: 'cnpj', required: true }, '123'), /CNPJ/);
  assert.match(core.validateField({ name: 'E-mail', field_type: 'email', required: true }, ''), /obrigatório/);
  assert.match(core.validateField({ name: 'Percentual', placeholder: 'percentual_remuneracao', field_type: 'number', required: true }, '120'), /0 e 100/);
});

test('rejeita datas inexistentes', () => {
  assert.equal(core.isValidDate('2026-02-28'), true);
  assert.equal(core.isValidDate('2026-02-31'), false);
  assert.equal(core.isValidDate('31/02/2026'), false);
});
