(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EmbrascaLegalWorkspaceCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function nameOf(value) {
    const name = String(value?.name || '').trim();
    return name || '—';
  }

  function responsibleDisplay(document) {
    return {
      generated: nameOf(document?.generatedBy),
      reviewed: nameOf(document?.reviewedBy),
      approved: nameOf(document?.approvedBy),
    };
  }

  function canReview(user) {
    return Boolean(user && (user.role === 'juridico' || user.role === 'admin'));
  }

  function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  }

  function statusLabel(status) {
    return ({
      draft: 'Rascunho',
      under_review: 'Em revisão',
      correction_requested: 'Correção solicitada',
      approved: 'Aprovado',
    })[status] || String(status || '—');
  }

  return { responsibleDisplay, canReview, formatDateTime, statusLabel };
});
