'use strict';

const ENTITIES = {
  brasil: {
    name: 'EMBRASCA – EMPRESA BRASILEIRA DE SERVIÇOS E CONSULTORIA AMBIENTAL LTDA',
    short: 'EMBRASCA LTDA', id: 'CNPJ: 05.877.415/0001-61', representative: 'Ricardo Cesar Fernandes',
    pt: 'EMBRASCA – Empresa Brasileira de Serviços e Consultoria Ambiental Ltda, pessoa jurídica de direito privado, inscrita no CNPJ sob nº 05.877.415/0001-61, com sede na Avenida T-11, nº 451, sala 306, Edifício Fábrica Office, Goiânia, Estado de Goiás, CEP 74.223-070, neste ato representada na forma de seus atos constitutivos',
    en: 'Embrasca – Empresa Brasileira de Serviços e Consultoria Ambiental Ltda, a company organized and existing under the laws of Brazil, enrolled with the CNPJ under No. 05.877.415/0001-61, with headquarters at Avenida T-11, No. 451, Room 306, Edifício Fábrica Office, Goiânia, State of Goiás, Brazil, represented herein by its managing director',
  },
  inc: {
    name: 'EMBRASCA INC', short: 'EMBRASCA INC', id: 'EIN: 90-0914430', representative: 'Franco Grassi',
    pt: 'Embrasca Inc., pessoa jurídica constituída sob as leis dos Estados Unidos da América, inscrita no EIN nº 90-0914430, com sede em 433 California St. #1000, San Francisco, CA, 94014-2014, EUA, neste ato representada na forma de seus atos constitutivos',
    en: 'Embrasca Inc., a company organized under the laws of the United States of America, registered under EIN No. 90-0914430, with address at 433 California St. #1000, San Francisco, CA, 94014-2014, USA, represented herein by its managing director',
  },
};
function selectedEntities(selection) {
  if (!['brasil', 'inc', 'ambas'].includes(selection)) throw new Error('Selecione Embrasca Brasil, Embrasca Inc ou ambas.');
  return selection === 'ambas' ? [ENTITIES.brasil, ENTITIES.inc] : [ENTITIES[selection]];
}
function escape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function text(xml) {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map(m => m[1]).join('')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function paragraph(value) {
  return '<w:p><w:pPr><w:keepNext/><w:spacing w:after="80"/></w:pPr><w:r><w:t xml:space="preserve">' + escape(value) + '</w:t></w:r></w:p>';
}
function signature(entity) {
  return ['________________________________', entity.name, entity.id, entity.representative].map(paragraph).join('');
}
function signatureTable(entities, other) {
  const columns = [...entities, other];
  const width = Math.floor(9000 / columns.length);
  return '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => `<w:${side} w:val="nil"/>`).join('') +
    '</w:tblBorders></w:tblPr><w:tblGrid>' + columns.map(() => `<w:gridCol w:w="${width}"/>`).join('') +
    '</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>' + columns.map(entity => `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${signature(entity)}</w:tc>`).join('') + '</w:tr></w:tbl>';
}

// Run against the original template, BEFORE substituting any user-supplied text.
// Old saved versions without a selection retain their original template behavior.
function applyEntitySelection(xml, code, selection) {
  if (selection === undefined || selection === null) return xml;
  const entities = selectedEntities(selection);
  const english = code === 'NDA_EN' || code === 'NDA_US_FRANCO';
  const join = english ? ' and ' : ' e ';
  const qualification = entities.map(entity => entity[english ? 'en' : 'pt']).join(join);
  const companyNames = entities.map(entity => entity.name).join(join);
  const matches = [...xml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)];
  const rows = matches.map(match => ({ xml: match[0], text: text(match[0]), offset: match.index }));
  const updates = new Map();
  function find(predicate) {
    const found = rows.map((row, i) => predicate(row.text) ? i : -1).filter(i => i >= 0);
    if (found.length !== 1) throw new Error('Não foi possível identificar com segurança as empresas no modelo ' + code + '.');
    return found[0];
  }
  function set(i, value) {
    // Preserve paragraph/section formatting, replace only its text.
    const props = rows[i].xml.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/)?.[0] || '';
    updates.set(i, '<w:p>' + props + '<w:r><w:t xml:space="preserve">' + escape(value) + '</w:t></w:r></w:p>');
  }
  function tableAt(first, count, other) {
    updates.set(first, signatureTable(entities, other));
    for (let i = first + 1; i < first + count; i++) updates.set(i, '');
  }
  if (code === 'NDA_BR' || code === 'NDA_EN') {
    const intro = find(t => t.startsWith(code === 'NDA_BR' ? 'Pelo presente instrumento particular' : 'This Mutual Non-Disclosure'));
    let value = rows[intro].text;
    if (code === 'NDA_BR') {
      const start = value.indexOf('EMBRASCA – Empresa');
      const end = value.indexOf('sendo a Primeira Parte');
      if (start < 0 || end < start) throw new Error('Qualificação do NDA inválida.');
      value = value.slice(0, start) + qualification + (entities.length === 2 ? ', doravante denominadas em conjunto como “Embrasca”, ' : ', doravante denominada “Embrasca”, ') + value.slice(end);
    } else {
      const start = value.indexOf('Embrasca – Empresa');
      const end = value.indexOf('The First Party and Embrasca');
      if (start < 0 || end < start) throw new Error('Qualificação do NDA inválida.');
      value = value.slice(0, start) + qualification + (entities.length === 2 ? ', jointly referred to as “Embrasca”. ' : ', referred to as “Embrasca”. ') + value.slice(end);
    }
    set(intro, value);
    const sign = find(t => t.includes('EMBRASCA LTDA') && t.includes('EMBRASCA INC'));
    if (!/^[_\s]+$/.test(rows[sign - 1].text)) throw new Error('Bloco de assinaturas inválido.');
    tableAt(sign - 1, 4, {
      name: code === 'NDA_BR' ? '{{primeira_parte_nome}}' : '{{first_party_legal_name}}',
      id: code === 'NDA_BR' ? 'CNPJ/CPF: {{primeira_parte_identificacao}}' : 'CNPJ/EIN: {{first_party_identifier}}',
      representative: code === 'NDA_BR' ? '{{primeira_parte_representante}}' : '{{first_party_representative}}',
    });
  } else if (code === 'NDA_US_FRANCO') {
    set(find(t => t.startsWith('THIS AGREEMENT is made between')), 'THIS AGREEMENT is made between {{first_party_name}} and ' + qualification + ', hereinafter referred to as the “2nd party”.');
    const start = find(t => t.startsWith('Officer Name (Print): Ricardo'));
    const finish = find(t => t.startsWith('Officer Name (Print): Franco')) + 2;
    updates.set(start, entities.map(entity => [entity.name, entity.id, 'Officer Name (Print): ' + entity.representative, 'Signature: __________________________________', 'Date: ________________'].map(paragraph).join('')).join(''));
    for (let i = start + 1; i <= finish; i++) updates.set(i, '');
  } else if (code === 'MOU_BR') {
    const intro = find(t => t.includes('De​ um lado, EMBRASCA'));
    const originalBrasil = rows[intro].text.slice(rows[intro].text.indexOf('EMBRASCA'), rows[intro].text.indexOf(', doravante'));
    const parties = entities.map(e => e === ENTITIES.brasil ? originalBrasil : e.pt).join(' e ');
    set(intro, 'De um lado, ' + parties + (entities.length === 2 ? ', doravante denominadas em conjunto simplesmente "EMBRASCA"; e' : ', doravante denominada simplesmente "EMBRASCA"; e'));
    if (selection === 'inc') {
      const forum = find(t => t.includes('sede da proponente EMBRASCA e local de gestão'));
      set(forum, rows[forum].text.replace('sede da proponente EMBRASCA e ', ''));
    }
    const sign = find(t => t.includes('EMBRASCA – LTDA') && t.includes('{{parceiro_razao_social}}'));
    tableAt(sign - 1, 3, { name: '{{parceiro_razao_social}}', id: 'CNPJ: {{parceiro_cnpj}}', representative: '' });
  } else if (code === 'MINUTA_PRESTACAO_SERVICOS') {
    const brasil = find(t => t.startsWith('II – CONTRATADA:'));
    const inc = find(t => t.startsWith('EMBRASCA INC com sede'));
    const originalBrasil = rows[brasil].text.replace(/^II – CONTRATADA:\s*/, '').replace(/ e\s*$/, '');
    const originalInc = rows[inc].text.replace('EMBRASCA INC com sede', 'EMBRASCA INC, inscrita no EIN nº 90-0914430, com sede').replace(/\.$/, '');
    set(brasil, 'II – CONTRATADA: ' + entities.map(e => e === ENTITIES.brasil ? originalBrasil : originalInc).join(' e ') + '.');
    updates.set(inc, '');
    const manager = find(t => t.startsWith('Pela CONTRATADA: RICARDO'));
    set(manager, 'Pela CONTRATADA: ' + entities.map(e => e === ENTITIES.brasil ? 'RICARDO CÉSAR FERNANDES, (62)9.9998-6839, ricardo@embrasca.com.br' : 'FRANCO GRASSI, franco.grassi@embrasca.com').join('; ') + '.');
    const sign = find(t => t.startsWith('EMBRASCA – EMPRESA') && t.includes('CNPJ:'));
    updates.set(sign, entities.map(signature).join(''));
    set(find(t => t === 'xxxxxxxxx'), '{{contratante_razao_social}}');
  } else if (code === 'MINUTA_AD_EXITUM') {
    const intro = find(t => t.startsWith('II – PARCEIRO CONTRATADO:'));
    set(intro, 'II – PARCEIRO CONTRATADO: ' + qualification + '.');
    // Remove the former manual contractor identity; selection now supplies it.
    for (let i = intro + 1; i <= intro + 5; i++) {
      if (!rows[i].text.includes('{{contratado_')) throw new Error('Qualificação da contratada inválida.');
      updates.set(i, '');
    }
    const title = find(t => t.startsWith('Instrumento Contratual que entre si fazem'));
    set(title, rows[title].text.replace('{{contratado_razao_social}}', companyNames));
    const sign = find(t => t.includes('(Assinado Digitalmente) PARCEIRO CONTRATADO'));
    updates.set(sign, entities.map(signature).join(''));
  } else {
    throw new Error('Modelo não preparado para a seleção de empresas.');
  }
  for (const [i, value] of [...updates.entries()].sort((a, b) => b[0] - a[0])) {
    const row = rows[i];
    xml = xml.slice(0, row.offset) + value + xml.slice(row.offset + row.xml.length);
  }
  return xml;
}
module.exports = { ENTITIES, selectedEntities, applyEntitySelection };
