(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EmbrascaLegalStableUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STATUS = {
    draft: 'Gerado',
    under_review: 'Em revisão',
    correction_requested: 'Correção solicitada',
    approved: 'Aprovado',
  };

  function safeName(value, fallback = '—') {
    const name = String(value?.name || value || '').trim();
    return name || fallback;
  }

  function centralView(doc, legacy) {
    return {
      source: 'central',
      centralId: String(doc?.id || ''),
      legacyId: String(legacy?.id || ''),
      templateCode: String(doc?.templateCode || legacy?.templateCode || ''),
      title: String(doc?.title || '').trim(),
      party: String(doc?.counterparty || legacy?.party || '').trim(),
      version: Number(doc?.currentVersion || legacy?.version || 1),
      statusCode: String(doc?.status || 'draft'),
      statusLabel: STATUS[doc?.status] || String(doc?.status || 'Gerado'),
      generatedByName: safeName(doc?.generatedBy, safeName(legacy?.createdByName)),
      reviewedByName: safeName(doc?.reviewedBy),
      approvedByName: safeName(doc?.approvedBy),
      createdAt: String(doc?.createdAt || doc?.generatedAt || legacy?.createdAt || ''),
      local: legacy || null,
      central: doc || null,
    };
  }

  function legacyView(doc) {
    return {
      source: 'legacy',
      centralId: String(doc?.centralDocumentId || ''),
      legacyId: String(doc?.id || ''),
      templateCode: String(doc?.templateCode || ''),
      title: String(doc?.title || '').trim(),
      party: String(doc?.party || '').trim(),
      version: Number(doc?.version || 1),
      statusCode: '',
      statusLabel: String(doc?.status || 'Gerado'),
      generatedByName: safeName(doc?.createdByName),
      reviewedByName: '—',
      approvedByName: '—',
      createdAt: String(doc?.createdAt || ''),
      local: doc || null,
      central: null,
    };
  }

  function mergeDocuments(localDocuments, centralDocuments) {
    const local = Array.isArray(localDocuments) ? localDocuments : [];
    const central = Array.isArray(centralDocuments) ? centralDocuments : [];
    const localByCentralId = new Map();
    const usedLocalIds = new Set();

    for (const doc of local) {
      const centralId = String(doc?.centralDocumentId || '').trim();
      if (centralId) localByCentralId.set(centralId, doc);
    }

    const merged = central.map((doc) => {
      const legacy = localByCentralId.get(String(doc?.id || '')) || null;
      if (legacy?.id) usedLocalIds.add(String(legacy.id));
      return centralView(doc, legacy);
    });

    for (const doc of local) {
      if (!usedLocalIds.has(String(doc?.id || ''))) merged.push(legacyView(doc));
    }

    return merged.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  function persistenceDecision(legacyDocument, localDocuments) {
    const current = legacyDocument || {};
    const directId = String(current.centralDocumentId || '').trim();
    if (directId) return { action: 'reuse', documentId: directId };

    const rootId = String(current.rootId || '').trim();
    if (rootId) {
      const related = (Array.isArray(localDocuments) ? localDocuments : []).find((doc) =>
        String(doc?.rootId || '').trim() === rootId && String(doc?.centralDocumentId || '').trim()
      );
      if (related) return { action: 'create_version', documentId: String(related.centralDocumentId).trim() };
    }

    return { action: 'create_document', documentId: '' };
  }

  return {
    mergeDocuments,
    centralView,
    legacyView,
    persistenceDecision,
    usesMutationObserver: false,
  };
});
