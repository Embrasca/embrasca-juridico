const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const profiles = JSON.parse(fs.readFileSync(require.resolve('./app.html'), 'utf8').match(/const PROFILES=(.*?);/)[1]);

function fixture(code) {
  const nodes = new Map();
  function element(tag) {
    const el = { tag, children: [], dataset: {}, style: {}, checked: false, textContent: '',
      append(...items) { this.children.push(...items); },
      appendChild(child) { this.append(child); },
      prepend(...items) { this.children.unshift(...items); },
      setAttribute() {}, querySelectorAll() { return []; },
    };
    Object.defineProperty(el, 'id', { get() { return this._id; }, set(value) { this._id = value; nodes.set(value, this); } });
    return el;
  }
  ['fields', 'review', 'reviewBox'].forEach(id => { element('div').id = id; });
  const profile = structuredClone(profiles.find(p => p.code === code));
  const context = {
    T: code, V: {}, prof: () => profile,
    document: { getElementById: id => nodes.get(id), createElement: element, createTextNode: text => ({ textContent: text }), querySelector: () => null },
    fields(pref) { nodes.get('fields').children = []; context.rendered = profile.fields.map(f => f.placeholder); context.pref = pref; },
    collect() { context.collected = profile.fields.map(f => f.placeholder); return { ...context.pref, testValue: 'preserved' }; },
    reviewNow() { context.V = context.collect(); },
    valuesForDoc: (p, values) => ({ testValue: values.testValue }),
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('./entity-selection-ui.js'), 'utf8'), context);
  return { context, nodes, profile };
}
for (const code of profiles.map(p => p.code)) {
  test(`${code}: explicit selection, review, persistence and reopening`, () => {
    const { context, nodes, profile } = fixture(code);
    const originalFields = profile.fields;
    context.fields({});
    assert.throws(() => context.collect(), /pelo menos uma/);
    assert.equal(profile.fields, originalFields);
    for (const choice of ['brasil', 'inc', 'ambas']) {
      context.fields({ __embrasca_entities: choice, testValue: 'preserved' });
      assert.equal(nodes.get('embrasca-entity-brasil').checked, choice !== 'inc');
      assert.equal(nodes.get('embrasca-entity-inc').checked, choice !== 'brasil');
      nodes.get('review').onclick();
      assert.equal(context.V.__embrasca_entities, choice);
      const restored = JSON.parse(JSON.stringify(context.V));
      context.fields(restored);
      assert.equal(context.collect().__embrasca_entities, choice);
      assert.equal(context.valuesForDoc(profile, restored).__embrasca_entities, choice);
      assert.equal(context.valuesForDoc(profile, restored).testValue, 'preserved');
      assert.equal(profile.fields, originalFields);
      if (code === 'MINUTA_AD_EXITUM') {
        assert.ok(!context.collected.some(key => key.startsWith('contratado_')));
        assert.ok(context.collected.includes('gestor_contratado'));
      }
    }
    assert.ok(!('__embrasca_entities' in context.valuesForDoc(profile, {})), 'legacy download remains unchanged');
  });
}
