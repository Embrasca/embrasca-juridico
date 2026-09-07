const assert = require('node:assert/strict');
const test = require('node:test');
const {
  STATE_KEY,
  createHistoryManager,
  mapHeadingToView,
} = require('./browser-history-ui.js');

test('registra Dashboard como estado inicial sem sair do site', () => {
  const calls = [];
  const history = {
    state: null,
    replaceState(state, _title, url) {
      this.state = state;
      calls.push(['replace', state, url]);
    },
    pushState(state, _title, url) {
      this.state = state;
      calls.push(['push', state, url]);
    },
  };

  const manager = createHistoryManager({
    history,
    location: { href: 'https://embrasca-juridico.vercel.app/' },
    restoreView() {},
  });

  manager.ensureInitialState();

  assert.equal(history.state[STATE_KEY], 'Dashboard');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'replace');
});

test('navegacao interna cria entrada e voltar restaura Dashboard', () => {
  const calls = [];
  const restored = [];
  const history = {
    state: { [STATE_KEY]: 'Dashboard' },
    replaceState() {},
    pushState(state, _title, url) {
      this.state = state;
      calls.push(['push', state, url]);
    },
  };

  const manager = createHistoryManager({
    history,
    location: { href: 'https://embrasca-juridico.vercel.app/' },
    restoreView(view) {
      restored.push(view);
    },
  });

  manager.recordView('Gerar documento');
  assert.equal(history.state[STATE_KEY], 'Gerar documento');
  assert.equal(calls.length, 1);

  manager.handlePopState({ state: { [STATE_KEY]: 'Dashboard' } });
  assert.deepEqual(restored, ['Dashboard']);
});

test('Preencher dados pertence ao fluxo Gerar documento', () => {
  assert.equal(mapHeadingToView('Preencher dados'), 'Gerar documento');
});

test('nao cria historico duplicado para a mesma pagina', () => {
  let pushes = 0;
  const history = {
    state: { [STATE_KEY]: 'Documentos' },
    replaceState() {},
    pushState() {
      pushes += 1;
    },
  };

  const manager = createHistoryManager({
    history,
    location: { href: 'https://embrasca-juridico.vercel.app/' },
    restoreView() {},
  });

  manager.recordView('Documentos');
  assert.equal(pushes, 0);
});
