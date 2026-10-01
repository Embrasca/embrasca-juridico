(() => {
  'use strict';
  const KEY = '__embrasca_entities';
  const LABELS = { brasil: 'Embrasca Brasil', inc: 'Embrasca Inc', ambas: 'Embrasca Brasil e Embrasca Inc' };
  const manualContractor = new Set(['contratado_razao_social', 'contratado_cnpj', 'contratado_endereco', 'contratado_cep', 'contratado_email', 'contratado_representante', 'contratado_representante_cpf']);

  function withSelectedCompanyFields(action) {
    const profile = prof(T);
    const original = profile.fields;
    if (T === 'MINUTA_AD_EXITUM') profile.fields = original.filter(field => !manualContractor.has(field.placeholder));
    try { return action(); } finally { profile.fields = original; }
  }
  function selection() {
    const brasil = document.getElementById('embrasca-entity-brasil')?.checked;
    const inc = document.getElementById('embrasca-entity-inc')?.checked;
    return brasil && inc ? 'ambas' : brasil ? 'brasil' : inc ? 'inc' : '';
  }
  const previousFields = fields;
  fields = function (pref = {}) {
    withSelectedCompanyFields(() => previousFields(pref));
    const box = document.getElementById('fields');
    const group = document.createElement('fieldset');
    group.className = 'span2';
    group.style.cssText = 'margin:0 0 8px;padding:14px 16px;border:1px solid var(--border,#d7dfd9);border-radius:10px;min-width:0';
    const legend = document.createElement('legend');
    legend.textContent = 'Qual Embrasca participa do documento? *';
    legend.style.cssText = 'font-weight:600;padding:0 5px;font-size:14px';
    group.appendChild(legend);
    for (const [key, labelText] of [['brasil', LABELS.brasil], ['inc', LABELS.inc]]) {
      const label = document.createElement('label');
      label.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin:4px 24px 6px 0;cursor:pointer';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = 'embrasca-entity-' + key;
      input.style.cssText = 'width:17px;height:17px;margin:0;accent-color:#315b40';
      input.checked = pref[KEY] === key || pref[KEY] === 'ambas';
      input.setAttribute('aria-describedby', 'embrasca-entity-hint');
      label.append(input, document.createTextNode(labelText));
      group.appendChild(label);
    }
    const hint = document.createElement('div');
    hint.id = 'embrasca-entity-hint';
    hint.className = 'hint';
    hint.textContent = 'Marque uma ou as duas. Ex.: marque apenas Embrasca Inc para incluir somente ela na identificação e nas assinaturas.';
    group.appendChild(hint);
    box.prepend(group);
  };
  const previousCollect = collect;
  collect = function () {
    const selected = selection();
    if (!selected) throw new Error('Marque pelo menos uma Embrasca responsável pelo documento.');
    return { ...withSelectedCompanyFields(() => previousCollect()), [KEY]: selected };
  };
  const previousReview = reviewNow;
  reviewNow = function () {
    withSelectedCompanyFields(() => previousReview());
    const selected = selection();
    const box = document.getElementById('reviewBox');
    if (!selected || !box) return;
    box.querySelectorAll('[data-entity-review]').forEach(node => node.remove());
    const label = document.createElement('div');
    label.className = 'k';
    label.dataset.entityReview = 'true';
    label.textContent = 'Embrasca responsável';
    const value = document.createElement('div');
    value.dataset.entityReview = 'true';
    value.textContent = LABELS[selected];
    box.prepend(label, value);
  };
  // The original application binds this handler before extension scripts load.
  document.getElementById('review').onclick = reviewNow;
  const previousValues = valuesForDoc;
  valuesForDoc = function (profile, values, version, status) {
    const replacements = previousValues(profile, values, version, status);
    if (Object.prototype.hasOwnProperty.call(values, KEY)) replacements[KEY] = values[KEY];
    return replacements;
  };
  const notice = document.querySelector('#novo [data-step="3"] .msg.ok');
  if (notice) notice.textContent = 'Confira os dados e as empresas selecionadas. A identificação e as assinaturas serão ajustadas à sua escolha.';
})();
