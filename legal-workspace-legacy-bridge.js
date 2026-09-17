(() => {
  const LEGACY_KEY = 'embrascaJuridicoStandaloneV1';
  let centralDocuments = [];
  let decorating = false;
  let observerTimer = null;

  function legacyState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      return parsed && Array.isArray(parsed.documents) ? parsed : { documents: [] };
    } catch (_) {
      return { documents: [] };
    }
  }

  function legacyDocument(id) {
    return legacyState().documents.find((doc) => String(doc.id) === String(id)) || null;
  }

  function centralIdFor(legacy) {
    return legacy && legacy.centralDocumentId ? String(legacy.centralDocumentId) : '';
  }

  function centralDocumentFor(legacy) {
    const centralId = centralIdFor(legacy);
    return centralId ? centralDocuments.find((doc) => String(doc.id) === centralId) || null : null;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'Falha ao registrar a ação jurídica.');
    return data;
  }

  async function workflow(action, documentId, comment) {
    const body = { action, documentId };
    if (action === 'request_correction') body.comment = String(comment || '');
    return request('/api/legal-workspace', { method: 'POST', body: JSON.stringify(body) });
  }

  async function refreshCentral() {
    const data = await request('/api/legal-workspace');
    centralDocuments = Array.isArray(data?.documents) ? data.documents : [];
    return centralDocuments;
  }

  function nameOf(value) {
    return value && String(value.name || '').trim() ? String(value.name).trim() : '—';
  }

  function addHeader(table, label, key) {
    const row = table.tHead?.rows?.[0];
    if (!row || row.querySelector(`[data-legal-responsibility="${key}"]`)) return;
    const th = document.createElement('th');
    th.dataset.legalResponsibility = key;
    th.textContent = label;
    row.appendChild(th);
  }

  function decorateTable(table) {
    addHeader(table, 'Gerado por', 'generated');
    addHeader(table, 'Revisado por', 'reviewed');
    addHeader(table, 'Aprovado por', 'approved');

    Array.from(table.tBodies?.[0]?.rows || []).forEach((row) => {
      if (row.querySelector('[data-legal-responsibility-cell]')) return;
      const button = row.querySelector('[data-down]');
      const legacy = button ? legacyDocument(button.dataset.down) : null;
      const central = centralDocumentFor(legacy);
      const values = [
        nameOf(central?.generatedBy),
        nameOf(central?.reviewedBy),
        nameOf(central?.approvedBy),
      ];
      values.forEach((value, index) => {
        const td = document.createElement('td');
        td.dataset.legalResponsibilityCell = ['generated', 'reviewed', 'approved'][index];
        td.textContent = value;
        row.appendChild(td);
      });
    });
  }

  function decorateReviewCards() {
    document.querySelectorAll('[data-rid]').forEach((card) => {
      let box = card.querySelector('[data-legal-responsibility-card]');
      const legacy = legacyDocument(card.dataset.rid);
      const central = centralDocumentFor(legacy);
      if (!box) {
        box = document.createElement('div');
        box.dataset.legalResponsibilityCard = 'true';
        box.style.margin = '10px 0';
        box.style.fontSize = '12px';
        card.appendChild(box);
      }
      box.textContent = `Gerado por: ${nameOf(central?.generatedBy)} · Revisado por: ${nameOf(central?.reviewedBy)} · Aprovado por: ${nameOf(central?.approvedBy)}`;
    });
  }

  function removeParallelLists() {
    document.getElementById('centralLegalDocuments')?.remove();
    document.getElementById('centralLegalReviews')?.remove();
  }

  function decorate() {
    if (decorating) return;
    decorating = true;
    try {
      removeParallelLists();
      document.querySelectorAll('#docs table, #documentos table, #recent table').forEach(decorateTable);
      decorateReviewCards();
    } finally {
      decorating = false;
    }
  }

  async function reconcileLegacyState() {
    const legacyDocs = legacyState().documents;
    for (const legacy of legacyDocs) {
      const central = centralDocumentFor(legacy);
      if (!central) continue;
      try {
        if (legacy.status === 'Aprovado' && central.status !== 'approved') {
          await workflow('approve', central.id);
        } else if (legacy.status === 'Em revisão' && !['under_review', 'approved'].includes(central.status)) {
          await workflow('submit_review', central.id);
        } else if (legacy.status === 'Correção solicitada' && central.status !== 'correction_requested') {
          await workflow('request_correction', central.id, legacy.reviewComment || legacy.values?.review_note || '');
        }
      } catch (error) {
        console.error('[LEGAL LEGACY RECONCILE]', legacy.id, error);
      }
    }
    await refreshCentral();
    decorate();
  }

  function installWorkflowBridge() {
    if (typeof window.sendForReview === 'function' && !window.sendForReview.__centralAuditBridge) {
      const originalSendForReview = window.sendForReview;
      window.sendForReview = async function(d) {
        try {
          const centralId = centralIdFor(d) || centralIdFor(legacyDocument(d?.id));
          if (centralId) await workflow('submit_review', centralId);
          const result = originalSendForReview.apply(this, arguments);
          await refreshCentral();
          setTimeout(decorate, 0);
          return result;
        } catch (error) {
          console.error('[LEGAL AUDIT]', error);
          if (typeof toast === 'function') toast('Não foi possível registrar o envio para revisão: ' + error.message);
        }
      };
      window.sendForReview.__centralAuditBridge = true;
    }

    if (typeof window.reviewAction === 'function' && !window.reviewAction.__centralAuditBridge) {
      const originalReviewAction = window.reviewAction;
      window.reviewAction = async function(d, status, comment) {
        try {
          const centralId = centralIdFor(d) || centralIdFor(legacyDocument(d?.id));
          if (centralId) {
            if (status === 'Aprovado') {
              await workflow('approve', centralId);
            } else if (status === 'Correção solicitada') {
              await workflow('request_correction', centralId, comment);
            }
          }
          const result = originalReviewAction.apply(this, arguments);
          await refreshCentral();
          setTimeout(decorate, 0);
          return result;
        } catch (error) {
          console.error('[LEGAL AUDIT]', error);
          if (typeof toast === 'function') toast('Não foi possível registrar a revisão: ' + error.message);
        }
      };
      window.reviewAction.__centralAuditBridge = true;
    }
  }

  function watchLegacyRenders() {
    const observer = new MutationObserver(() => {
      clearTimeout(observerTimer);
      observerTimer = setTimeout(decorate, 20);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function start() {
    installWorkflowBridge();
    watchLegacyRenders();
    try {
      await refreshCentral();
      await reconcileLegacyState();
    } catch (error) {
      console.error('[LEGAL AUDIT START]', error);
      decorate();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0), { once: true });
  } else {
    setTimeout(start, 0);
  }
})();
