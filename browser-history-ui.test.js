const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const {
  STATE_KEY,
  GUARD_KEY,
  GUARD_ROOT,
  GUARD_ACTIVE,
  createHistoryManager,
  mapHeadingToView,
} = require('./browser-history-ui.js');

function makeHistory(initialState = null) {
  const calls = [];
  return {
    calls,
    state: initialState,
    replaceState(state, _title, url) {
      this.state = state;
      calls.push(['replace', state, url]);
    },
    pushState(state, _title, url) {
      this.state = state;
      calls.push(['push', state, url]);
    },
  };
}

test('primeiro carregamento cria barreira interna antes do estado ativo', () => {
  const history = makeHistory();
  const manager = createHistoryManager({
    history,
    location: { href: 'https://embrasca-juridico.vercel.app/' },
    restoreView() {},
  });

  manager.ensureInitialState();

  assert.equal(history.calls.length, 2);
  assert.equal(history.calls[0][0], 'replace');
  assert.equal(history.calls[0][1][GUARD_KEY], GUARD_ROOT);
  assert.equal(history.calls[1][0], 'push');
  assert.equal(history.calls[1][1][GUARD_KEY], GUARD_ACTIVE);
  assert.equal(history.state[STATE_KEY], 'Dashboard');
});

test('voltar no Dashboard encontra a barreira e permanece no Juridico', () => {
  const restored = [];
  const history = makeHistory({
    [STATE_KEY]: 'Dashboard',
    [GUARD_KEY]: GUARD_ACTIVE,
  });
  const manager = createHistoryManager({
    history,
    location: { href: 'https://embrasca-juridico.vercel.app/' },
    restoreView(view) {
      restored.push(view);
    },
  });

  manager.handlePopState({
    state: {
      [STATE_KEY]: 'Dashboard',
      [GUARD_KEY]: GUARD_ROOT,
    },
  });

  assert.deepEqual(restored, ['Dashboard']);
  assert.equal(history.calls.length, 1);
  assert.equal(history.calls[0][0], 'push');
  assert.equal(history.state[GUARD_KEY], GUARD_ACTIVE);
  assert.equal(history.state[STATE_KEY], 'Dashboard');
});

test('navegacao interna cria entrada e voltar restaura Dashboard', () => {
  const restored = [];
  const history = makeHistory({
    [STATE_KEY]: 'Dashboard',
    [GUARD_KEY]: GUARD_ACTIVE,
  });
  const manager = createHistoryManager({
    history,
    location: { href: 'https://embrasca-juridico.vercel.app/' },
    restoreView(view) {
      restored.push(view);
    },
  });

  manager.recordView('Gerar documento');
  assert.equal(history.state[STATE_KEY], 'Gerar documento');
  assert.equal(history.state[GUARD_KEY], GUARD_ACTIVE);

  manager.handlePopState({
    state: {
      [STATE_KEY]: 'Dashboard',
      [GUARD_KEY]: GUARD_ACTIVE,
    },
  });
  assert.deepEqual(restored, ['Dashboard']);
});

test('Preencher dados pertence ao fluxo Gerar documento', () => {
  assert.equal(mapHeadingToView('Preencher dados'), 'Gerar documento');
});

test('nao cria historico duplicado para a mesma pagina ativa', () => {
  const history = makeHistory({
    [STATE_KEY]: 'Documentos',
    [GUARD_KEY]: GUARD_ACTIVE,
  });
  const manager = createHistoryManager({
    history,
    location: { href: 'https://embrasca-juridico.vercel.app/' },
    restoreView() {},
  });

  manager.recordView('Documentos');
  assert.equal(history.calls.length, 0);
});

test('estado antigo sem barreira tambem e mantido dentro do sistema', () => {
  const restored = [];
  const history = makeHistory({ [STATE_KEY]: 'Dashboard' });
  const manager = createHistoryManager({
    history,
    location: { href: 'https://embrasca-juridico.vercel.app/' },
    restoreView(view) {
      restored.push(view);
    },
  });

  manager.handlePopState({ state: null });

  assert.deepEqual(restored, ['Dashboard']);
  assert.equal(history.calls[0][0], 'push');
  assert.equal(history.state[GUARD_KEY], GUARD_ACTIVE);
});

test('carregador injeta a versao protegida do historico do navegador', () => {
  const source = fs.readFileSync(__dirname + '/index.html', 'utf8');
  assert.match(source, /browser-history-ui\.js\?v=20260907-history-guard/);
});
