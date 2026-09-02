(() => {
  const core = window.EmbrascaTask2Core;
  if (!core) throw new Error('Nucleo da Tarefa 2 nao carregado.');

  const hide = (selector) => document.querySelectorAll(selector).forEach((el) => el.classList.add('hidden'));

  hide('#nav [data-s="dashboard"], #nav [data-s="documentos"], #nav [data-s="revisoes"], #nav [data-s="modelos"], #nav [data-s="config"]');
  hide('#sendReview');

  const navNew = document.querySelector('#nav [data-s="novo"]');
  if (navNew) navNew.textContent = 'Gerar documento';

  const sideFoot = document.querySelector('.sidefoot');
  if (sideFoot) sideFoot.innerHTML = 'Embrasca Solucoes Sustentaveis<br>MINUTAS, NDAs e MoUs automaticos';

  const title = document.querySelector('#novo [data-step="1"] h1');
  if (title) title.textContent = 'Gerar MINUTA, NDA ou MoU';
  const subtitle = document.querySelector('#novo [data-step="1"] .sub');
  if (subtitle) subtitle.textContent = 'Escolha um dos modelos juridicos oficiais aprovados pela empresa.';

  const reviewNotice = document.querySelector('#novo [data-step="3"] .msg.ok');
  if (reviewNotice) reviewNotice.innerHTML = '<b>Conferencia antes da geracao</b><br>Revise os dados abaixo. O texto juridico fixo do modelo nao sera alterado.';

  const anotherButton = document.querySelector('#novo [data-go="documentos"]');
  if (anotherButton) {
    anotherButton.classList.remove('hidden');
    anotherButton.dataset.go = 'novo';
    anotherButton.textContent = 'Gerar outro documento';
  }

  const originalFields = fields;
  fields = function (pref = {}) {
    originalFields(pref);
    const profile = prof(T);
    profile.fields.filter((field) => !field.hidden).forEach((field) => {
      const input = document.getElementById('f_' + field.placeholder);
      if (!input) return;
      input.required = Boolean(field.required);
      if (field.field_type === 'cnpj' || field.field_type === 'cpf') input.inputMode = 'numeric';
      if (field.placeholder === 'percentual_remuneracao') {
        input.min = '0';
        input.max = '100';
        input.step = '1';
      }
    });
  };

  collect = function () {
    const profile = prof(T);
    const values = {};
    for (const field of profile.fields.filter((item) => !item.hidden)) {
      const input = document.getElementById('f_' + field.placeholder);
      const value = String(input?.value ?? '').trim();
      const error = core.validateField(field, value);
      if (error) throw new Error(error);
      values[field.placeholder] = value;
    }
    if (values.percentual_remuneracao) values.percentual_remuneracao_extenso = words(Number(values.percentual_remuneracao));
    return values;
  };

  const originalCreateDoc = createDoc;
  createDoc = function () {
    originalCreateDoc();
    const summary = document.getElementById('genSummary');
    if (summary) summary.insertAdjacentHTML('beforeend', '<br><br><b>Revisao obrigatoria:</b> encaminhe o DOCX gerado ao setor juridico para conferencia antes do envio ou assinatura.');
  };

  PROFILES.forEach((profile) => {
    if (!['MINUTA', 'NDA', 'MOU'].includes(core.documentType(profile.code))) {
      throw new Error('Modelo fora do escopo da Tarefa 2: ' + profile.code);
    }
    if (S.models[profile.code]) S.models[profile.code].active = true;
  });
  save();

  window.__EMBRASCA_TASK2__ = true;
})();
