const FOOTER_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const FOOTER_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer';

function pageCounterParagraph() {
  const rPr = '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>';
  const field = (instruction, cached = '1') => [
    `<w:r>${rPr}<w:fldChar w:fldCharType="begin"/></w:r>`,
    `<w:r>${rPr}<w:instrText xml:space="preserve"> ${instruction} </w:instrText></w:r>`,
    `<w:r>${rPr}<w:fldChar w:fldCharType="separate"/></w:r>`,
    `<w:r>${rPr}<w:t>${cached}</w:t></w:r>`,
    `<w:r>${rPr}<w:fldChar w:fldCharType="end"/></w:r>`,
  ].join('');
  return `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:before="0" w:after="0"/></w:pPr><w:r>${rPr}<w:t xml:space="preserve">Página </w:t></w:r>${field('PAGE')}<w:r>${rPr}<w:t xml:space="preserve"> de </w:t></w:r>${field('NUMPAGES')}</w:p>`;
}

function borderedCell(width, text) {
  const run = '<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:b/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t>' + text + '</w:t></w:r>';
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/><w:tcMar><w:top w:w="110" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="110" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar><w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>${run}</w:p></w:tc>`;
}

function spacerCell() {
  return '<w:tc><w:tcPr><w:tcW w:w="960" w:type="dxa"/><w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders></w:tcPr><w:p/></w:tc>';
}

function buildDefaultVistoFooterXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:tbl><w:tblPr><w:tblW w:w="9728" w:type="dxa"/><w:jc w:val="left"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="960"/><w:gridCol w:w="4268"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="560" w:hRule="atLeast"/></w:trPr>${borderedCell(4500, 'Visto Contratada:')}${spacerCell()}${borderedCell(4268, 'Visto Contratante:')}</w:tr></w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>${pageCounterParagraph()}</w:ftr>`;
}

function buildFirstPageFooterXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${pageCounterParagraph()}</w:ftr>`;
}

function removeCorporateCover(xml) {
  let s = String(xml || '');
  if (!s.includes('Documento jurídico corporativo') || !s.includes('rIdEmbrascaCoverLogo')) return s;
  const bodyStart = s.indexOf('<w:body');
  const bodyOpenEnd = bodyStart >= 0 ? s.indexOf('>', bodyStart) : -1;
  const marker = s.indexOf('Documento jurídico corporativo');
  const breakTag = '<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>';
  const breakStart = s.indexOf(breakTag, marker);
  if (bodyOpenEnd < 0 || marker < bodyOpenEnd || breakStart < 0) return s;
  return s.slice(0, bodyOpenEnd + 1) + s.slice(breakStart + breakTag.length);
}

function stripGreenLegalFormatting(xml) {
  return String(xml || '')
    .replace(/<w:pStyle\s+w:val="EmbrascaLegalHeading1"\s*\/>/gi, '')
    .replace(/<w:color\b(?=[^>]*w:val="1B5E20")[^>]*\/>/gi, '')
    .replace(/<w:shd\b(?=[^>]*w:fill="1B5E20")[^>]*\/>/gi, '')
    .replace(/<w:highlight\b(?=[^>]*w:val="(?:green|darkGreen)")[^>]*\/>/gi, '')
    .replace(/<w:style\b[^>]*w:styleId="EmbrascaLegalHeading1"[^>]*>[\s\S]*?<\/w:style>/gi, '');
}

function sectionWithLegalFooters(sectionXml, firstSection) {
  const openEnd = sectionXml.indexOf('>');
  if (openEnd < 0) return sectionXml;
  const opening = sectionXml.slice(0, openEnd + 1);
  let inner = sectionXml.slice(openEnd + 1, -'</w:sectPr>'.length);
  inner = inner
    .replace(/<w:headerReference\b[^>]*\/>/gi, '')
    .replace(/<w:footerReference\b[^>]*\/>/gi, '')
    .replace(/<w:titlePg\s*\/>/gi, '');
  const refs = firstSection
    ? '<w:footerReference w:type="default" r:id="rIdLegalVistoDefault"/><w:footerReference w:type="first" r:id="rIdLegalVistoFirst"/><w:titlePg/>'
    : '<w:footerReference w:type="default" r:id="rIdLegalVistoDefault"/>';
  return opening + refs + inner + '</w:sectPr>';
}

function normalizeServiceContractDocumentXml(xml) {
  let s = stripGreenLegalFormatting(removeCorporateCover(xml));
  let index = 0;
  s = s.replace(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/gi, (section) => sectionWithLegalFooters(section, index++ === 0));
  if (index === 0 && /<\/w:body>/i.test(s)) {
    s = s.replace(/<\/w:body>/i, '<w:sectPr><w:footerReference w:type="default" r:id="rIdLegalVistoDefault"/><w:footerReference w:type="first" r:id="rIdLegalVistoFirst"/><w:titlePg/></w:sectPr></w:body>');
  }
  return s;
}

function normalizeRelationshipsXml(xml) {
  let s = String(xml || `<Relationships xmlns="${REL_NS}"></Relationships>`);
  s = s.replace(/<Relationship\b(?=[^>]*Type="[^"]*\/footer")[^>]*\/>/gi, '');
  s = s.replace(/<Relationship\b(?=[^>]*Type="[^"]*\/header")[^>]*\/>/gi, '');
  s = s.replace(/<Relationship\b(?=[^>]*Target="[^"]*embrasca-logo\.png")[^>]*\/>/gi, '');
  const additions = `<Relationship Id="rIdLegalVistoDefault" Type="${FOOTER_REL_TYPE}" Target="footerLegalDefault.xml"/><Relationship Id="rIdLegalVistoFirst" Type="${FOOTER_REL_TYPE}" Target="footerLegalFirst.xml"/>`;
  if (/<\/Relationships>/i.test(s)) return s.replace(/<\/Relationships>/i, additions + '</Relationships>');
  return `<Relationships xmlns="${REL_NS}">${additions}</Relationships>`;
}

function normalizeContentTypesXml(xml) {
  let s = String(xml || '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  s = s.replace(/<Override\b(?=[^>]*PartName="\/word\/(?:footer|header)[^"]*\.xml")[^>]*\/>/gi, '');
  const additions = `<Override PartName="/word/footerLegalDefault.xml" ContentType="${FOOTER_CONTENT_TYPE}"/><Override PartName="/word/footerLegalFirst.xml" ContentType="${FOOTER_CONTENT_TYPE}"/>`;
  if (/<\/Types>/i.test(s)) return s.replace(/<\/Types>/i, additions + '</Types>');
  return `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${additions}</Types>`;
}

function applyLegalServiceContractLayout(entries) {
  const result = [];
  let hasRels = false;
  let hasTypes = false;

  for (const entry of entries || []) {
    const name = String(entry.name || '');
    if (/^word\/footer[^/]*\.xml$/i.test(name)) continue;
    if (/^word\/_rels\/footer[^/]*\.xml\.rels$/i.test(name)) continue;
    if (/^word\/header[^/]*\.xml$/i.test(name)) continue;
    if (/^word\/_rels\/header[^/]*\.xml\.rels$/i.test(name)) continue;
    if (name === 'word/media/embrasca-logo.png') continue;

    const copy = { ...entry, data: Buffer.from(entry.data || Buffer.alloc(0)) };
    if (name === 'word/document.xml') {
      copy.data = Buffer.from(normalizeServiceContractDocumentXml(copy.data.toString('utf8')), 'utf8');
    } else if (name === 'word/_rels/document.xml.rels') {
      hasRels = true;
      copy.data = Buffer.from(normalizeRelationshipsXml(copy.data.toString('utf8')), 'utf8');
    } else if (name === '[Content_Types].xml') {
      hasTypes = true;
      copy.data = Buffer.from(normalizeContentTypesXml(copy.data.toString('utf8')), 'utf8');
    } else if (/\.xml$/i.test(name)) {
      copy.data = Buffer.from(stripGreenLegalFormatting(copy.data.toString('utf8')), 'utf8');
    }
    result.push(copy);
  }

  if (!hasRels) result.push({ name: 'word/_rels/document.xml.rels', data: Buffer.from(normalizeRelationshipsXml(''), 'utf8') });
  if (!hasTypes) result.push({ name: '[Content_Types].xml', data: Buffer.from(normalizeContentTypesXml(''), 'utf8') });
  result.push({ name: 'word/footerLegalDefault.xml', data: Buffer.from(buildDefaultVistoFooterXml(), 'utf8') });
  result.push({ name: 'word/footerLegalFirst.xml', data: Buffer.from(buildFirstPageFooterXml(), 'utf8') });
  return result;
}

function applyLegalServiceContractLayoutToBuffer(buffer) {
  const { readZip, buildZip } = require('./docx-engine');
  return buildZip(applyLegalServiceContractLayout(readZip(buffer)));
}

module.exports = {
  buildDefaultVistoFooterXml,
  buildFirstPageFooterXml,
  normalizeServiceContractDocumentXml,
  applyLegalServiceContractLayout,
  applyLegalServiceContractLayoutToBuffer,
  stripGreenLegalFormatting,
};
