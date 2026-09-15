function stripTextMarkingFromXml(xml) {
  return String(xml ?? '').replace(/<w:rPr\b([^>]*)>([\s\S]*?)<\/w:rPr>/g, (whole, attrs, inner) => {
    const cleaned = inner
      .replace(/<w:highlight\b[^>]*\/>/gi, '')
      .replace(/<w:shd\b[^>]*\/>/gi, '');
    return `<w:rPr${attrs}>${cleaned}</w:rPr>`;
  });
}

function cleanGeneratedDocx(buffer) {
  const { readZip, buildZip } = require('./docx-engine');
  const entries = readZip(buffer).map((entry) => {
    if (entry.isDir || !/^word\/.*\.xml$/i.test(entry.name)) return entry;
    return {
      ...entry,
      data: Buffer.from(stripTextMarkingFromXml(entry.data.toString('utf8')), 'utf8'),
    };
  });
  return buildZip(entries);
}

module.exports = { stripTextMarkingFromXml, cleanGeneratedDocx };
