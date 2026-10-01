(function () {
  'use strict';

  // Illustrative guidance only: examples never become field values.
  const EXAMPLES = {
    contratante_razao_social: 'Empresa Exemplo Ltda.',
    contratado_razao_social: 'Consultoria Ambiental Exemplo Ltda.',
    parceiro_razao_social: 'Empresa Parceira Exemplo Ltda.',
    contratante_cnpj: '00.000.000/0001-00 (formato)',
    contratado_cnpj: '00.000.000/0001-00 (formato)',
    parceiro_cnpj: '00.000.000/0001-00 (formato)',
    contratante_endereco: 'Rua das Flores, 123, Centro, Goiânia-GO',
    contratado_endereco: 'Av. Central, 456, sala 10, Centro, Goiânia-GO',
    parceiro_endereco: 'Rua das Flores, 123, Centro, Goiânia-GO, CEP 74000-000',
    contratante_cep: '74000-000',
    contratado_cep: '74000-000',
    contratante_representante: 'Maria Oliveira',
    contratado_representante: 'João Silva',
    contratante_representante_cpf: '000.000.000-00 (formato)',
    contratado_representante_cpf: '000.000.000-00 (formato)',
    contratado_email: 'contato@exemplo.com.br',
    parceiro_email: 'parcerias@exemplo.com.br',
    objeto_atividade_propriedade: 'Desenvolvimento de projeto de créditos de carbono na Fazenda Boa Vista.',
    inicio_contrato: '01/10/2026',
    percentual_remuneracao: '10 (corresponde a 10%)',
    gestor_contratante: 'Maria Oliveira',
    gestor_contratado: 'João Silva',
    local_assinatura: 'Goiânia-GO',
    data_assinatura: '01/10/2026',
    contratante_municipio: 'Goiânia (selecione primeiro o estado)',
    prazo_vigencia_resumo: '12 meses a partir da data de assinatura.',
    prorrogacao: 'Mediante acordo entre as partes, formalizado por termo aditivo.',
    mou_numero: '001/2026',
    nda_numero: '001/2026',
    projeto_nome: 'Projeto de Reflorestamento Boa Vista',
    primeira_parte_nome: 'Empresa Exemplo Ltda. ou Maria Oliveira',
    primeira_parte_identificacao: '00.000.000/0001-00 (CNPJ) ou 000.000.000-00 (CPF)',
    primeira_parte_endereco: 'Rua das Flores, 123, Centro, Goiânia-GO, CEP 74000-000',
    primeira_parte_representante: 'Maria Oliveira',
    nda_number: '001/2026',
    first_party_legal_name: 'Example Environmental Consulting LLC',
    first_party_address: '123 Main Street, Suite 10, Miami, FL 33101, USA',
    first_party_identifier: '00-0000000 (EIN format)',
    first_party_representative: 'Jane Smith',
    governing_jurisdiction: 'State of Florida, USA',
    arbitration_seat: 'Paris, France',
    first_party_name: 'Example Environmental Consulting LLC',
    effective_date: 'October 1, 2026 (select in the calendar)',
    first_party_officer_name: 'Jane Smith',
  };

  function addExample(doc, control, example, english) {
    if (!control || !example) return;
    const id = control.id + '_example';
    if (!doc.getElementById(id)) {
      const text = (english ? 'E.g.: ' : 'Ex.: ') + example;
      const existing = Array.from(control.parentElement.querySelectorAll('.hint')).find(node => node.textContent === text);
      const hint = existing || doc.createElement('div');
      hint.id = id;
      hint.className = 'hint document-field-example';
      hint.textContent = text;
      hint.style.cssText = 'font-size:12px;line-height:1.45;margin-top:5px;font-weight:400;overflow-wrap:anywhere';
      if (!existing) control.insertAdjacentElement('afterend', hint);
    }
    const descriptions = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    descriptions.add(id);
    control.setAttribute('aria-describedby', Array.from(descriptions).join(' '));
  }

  function enhance(doc, profile) {
    if (!profile) return;
    const english = /^en\b/i.test(profile.language || '');
    profile.fields.filter(field => !field.hidden).forEach(field => {
      addExample(doc, doc.getElementById('f_' + field.placeholder), EXAMPLES[field.placeholder], english);
      addExample(doc, doc.getElementById('uf_' + field.placeholder), 'Goiás (GO)', false);
    });
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { EXAMPLES, enhance };
  if (typeof window === 'undefined' || typeof fields !== 'function') return;
  if (window.__EMBRASCA_FIELD_EXAMPLES__) return;
  const previousFields = fields;
  fields = function (pref = {}) {
    const result = previousFields(pref);
    enhance(document, prof(T));
    return result;
  };
  window.__EMBRASCA_FIELD_EXAMPLES__ = true;
  if (typeof T !== 'undefined' && T) enhance(document, prof(T));
})();
