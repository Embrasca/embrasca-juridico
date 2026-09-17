(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document) api.install(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LEGACY_KEY = 'embrascaJuridicoStandaloneV1';

  function matchesStatus(doc, filter) {
    const wanted = String(filter || '').trim();
    return !wanted || String(doc?.statusLabel || '') === wanted;
  }

  function install(win) {
    if (win.__EMBRASCA_STABLE_LEGAL_WORKSPACE__) return;
    win.__EMBRASCA_STABLE_LEGAL_WORKSPACE__ = true;

    const helper = win.EmbrascaLegalStableUI;
    if (!helper) throw new Error('Núcleo estável do workspace jurídico não carregado.');

    let centralDocuments = [];
    let mergedDocuments = [];
    let refreshPromise = null;

    function legacyState() {
      try {
        const parsed = JSON.parse(win.localStorage.getItem(LEGACY_KEY) || 'null');
        return parsed && Array.isArray(parsed.documents) ? parsed : { documents: [] };
      } catch (_) {
        return { documents: [] };
      }
    }

    function saveLocalLink(legacyId, centralId, version) {
      try {
        const state = legacyState();
        const doc = state.documents.find((item) => String(item.id) === String(legacyId));
        if (doc) {
          doc.centralDocumentId = centralId;
          if (version) doc.version = version;
          win.localStorage.setItem(LEGACY_KEY, JSON.stringify(state));
        }
      } catch (_) {}
      try {
        if (typeof S !== 'undefined' && Array.isArray(S.documents)) {
          const live = S.documents.find((item) => String(item.id) === String(legacyId));
          if (live) {
            live.centralDocumentId = centralId;
            if (version) live.version = version;
          }
          if (typeof save === 'function') save();
        }
      } catch (_) {}
    }

    async function request(url, options = {}) {
      const response = await win.fetch(url, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Falha no módulo jurídico.');
      return data;
    }

    async function workflow(action, documentId, comment = '') {
      const body = { action, documentId };
      if (action === 'request_correction') body.comment = String(comment || '').trim();
      const data = await request('/api/legal-workspace', { method: 'POST', body: JSON.stringify(body) });
      await refresh();
      return data.document;
    }

    function canReview() {
      const role = win.EmbrascaCentralAuth?.user?.role;
      return role === 'admin' || role === 'juridico';
    }

    function displayName(view) {
      try {
        if (typeof prof === 'function' && view.templateCode) return prof(view.templateCode).displayName || view.title || view.templateCode;
      } catch (_) {}
      return view.title || view.templateCode || 'Documento';
    }

    function shortId(view) {
      if (view.local?.number != null) return `#${String(view.local.number).padStart(4, '0')}`;
      return view.centralId ? `#${view.centralId.slice(0, 8).toUpperCase()}` : '—';
    }

    function makeButton(label, onClick, className = 'btn') {
      const button = win.document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.textContent = label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await onClick(); }
        catch (error) {
          console.error('[LEGAL WORKSPACE]', error);
          if (typeof toast === 'function') toast(error?.message || 'Falha no módulo jurídico.');
        } finally { button.disabled = false; }
      });
      return button;
    }

    function statusBadgeNode(label) {
      const span = win.document.createElement('span');
      span.className = `badge ${label === 'Correção solicitada' ? 'red' : label === 'Em revisão' ? 'warn' : label === 'Aprovado' ? '' : 'gray'}`;
      span.textContent = label;
      return span;
    }

    async function downloadVersion(documentId, version) {
      const response = await win.fetch(`/api/legal-download?documentId=${encodeURIComponent(documentId)}&version=${encodeURIComponent(version)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Falha ao baixar o documento.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const href = URL.createObjectURL(blob);
      const anchor = win.document.createElement('a');
      anchor.href = href;
      anchor.download = match?.[1] || `documento_v${version}.docx`;
      anchor.style.display = 'none';
      win.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    }

    function editLegacy(local) {
      if (!local) return;
      try {
        T = local.templateCode;
        editId = local.id;
        V = { ...(local.values || {}) };
        go('novo');
        renderCards();
        cont.disabled = false;
        fields(V);
        step(2);
      } catch (error) {
        console.error('[LEGAL EDIT]', error);
        if (typeof toast === 'function') toast('Não foi possível abrir esta versão para edição.');
      }
    }

    async function sendReview(view) {
      if (view.centralId) {
        await workflow('submit_review', view.centralId);
        if (view.local) {
          view.local.status = 'Em revisão';
          try { if (typeof save === 'function') save(); } catch (_) {}
        }
      } else if (view.local && typeof sendForReview === 'function') {
        await Promise.resolve(sendForReview(view.local));
      }
      renderDocuments();
      renderReviews();
    }

    function addCell(row, value) {
      const td = win.document.createElement('td');
      if (value instanceof win.Node) td.appendChild(value);
      else td.textContent = String(value ?? '');
      row.appendChild(td);
      return td;
    }

    function renderDocuments() {
      const container = win.document.getElementById('docs');
      if (!container) return;

      const query = String(win.document.getElementById('searchDoc')?.value || '').trim().toLowerCase();
      const status = String(win.document.getElementById('statusDoc')?.value || '').trim();
      const rows = mergedDocuments.filter((view) => {
        const haystack = `${displayName(view)} ${view.party} ${view.generatedByName} ${view.reviewedByName} ${view.approvedByName}`.toLowerCase();
        return (!query || haystack.includes(query)) && matchesStatus(view, status);
      });

      container.replaceChildren();
      if (!rows.length) {
        const empty = win.document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Nenhum documento encontrado.';
        container.appendChild(empty);
        return;
      }

      const wrap = win.document.createElement('div');
      wrap.className = 'tablewrap';
      const table = win.document.createElement('table');
      table.className = 'table';
      const thead = win.document.createElement('thead');
      const head = win.document.createElement('tr');
      ['ID', 'Documento', 'Parte', 'Versão', 'Status', 'Gerado por', 'Revisado por', 'Aprovado por', 'Ações'].forEach((label) => {
        const th = win.document.createElement('th');
        th.textContent = label;
        head.appendChild(th);
      });
      thead.appendChild(head);
      table.appendChild(thead);
      const tbody = win.document.createElement('tbody');

      rows.forEach((view) => {
        const tr = win.document.createElement('tr');
        addCell(tr, shortId(view));
        addCell(tr, displayName(view));
        addCell(tr, view.party || '—');
        addCell(tr, `v${view.version}`);
        addCell(tr, statusBadgeNode(view.statusLabel));
        addCell(tr, view.generatedByName || '—');
        addCell(tr, view.reviewedByName || '—');
        addCell(tr, view.approvedByName || '—');

        const actions = win.document.createElement('div');
        actions.className = 'actions';
        actions.appendChild(makeButton('Baixar', async () => {
          if (view.centralId) await downloadVersion(view.centralId, view.version);
          else if (view.local && typeof downloadDoc === 'function') await Promise.resolve(downloadDoc(view.local));
        }));

        if (['Gerado', 'Correção solicitada'].includes(view.statusLabel)) {
          if (view.local) actions.appendChild(makeButton('Corrigir/Nova versão', () => editLegacy(view.local)));
          actions.appendChild(makeButton('Enviar revisão', () => sendReview(view)));
        }
        const actionCell = win.document.createElement('td');
        actionCell.appendChild(actions);
        tr.appendChild(actionCell);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      wrap.appendChild(table);
      container.appendChild(wrap);
    }

    function renderReviews() {
      const container = win.document.getElementById('revList');
      if (!container) return;
      container.replaceChildren();

      if (!canReview()) {
        const msg = win.document.createElement('div');
        msg.className = 'msg err';
        msg.textContent = 'Sem permissão.';
        container.appendChild(msg);
        return;
      }

      const queue = mergedDocuments.filter((view) => view.statusLabel === 'Em revisão');
      if (!queue.length) {
        const empty = win.document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Nenhum documento aguardando revisão.';
        container.appendChild(empty);
        return;
      }

      queue.forEach((view) => {
        const card = win.document.createElement('div');
        card.className = 'reviewcard';
        const title = win.document.createElement('b');
        title.textContent = `${displayName(view)} · ${view.party || '—'} · v${view.version}`;
        card.appendChild(title);

        const responsibles = win.document.createElement('div');
        responsibles.className = 'sub';
        responsibles.style.margin = '8px 0';
        responsibles.textContent = `Gerado por: ${view.generatedByName} · Revisado por: ${view.reviewedByName} · Aprovado por: ${view.approvedByName}`;
        card.appendChild(responsibles);

        const field = win.document.createElement('div');
        field.className = 'field';
        const label = win.document.createElement('label');
        label.textContent = 'Comentário jurídico';
        const textarea = win.document.createElement('textarea');
        field.append(label, textarea);
        card.appendChild(field);

        const actions = win.document.createElement('div');
        actions.className = 'actions';
        actions.appendChild(makeButton('Baixar', () => view.centralId ? downloadVersion(view.centralId, view.version) : Promise.resolve(downloadDoc(view.local))));
        actions.appendChild(makeButton('Aprovar', async () => {
          if (view.centralId) await workflow('approve', view.centralId);
          else if (view.local && typeof reviewAction === 'function') await Promise.resolve(reviewAction(view.local, 'Aprovado', textarea.value));
          renderDocuments(); renderReviews();
        }, 'btn primary'));
        actions.appendChild(makeButton('Solicitar correção', async () => {
          if (view.centralId) await workflow('request_correction', view.centralId, textarea.value);
          else if (view.local && typeof reviewAction === 'function') await Promise.resolve(reviewAction(view.local, 'Correção solicitada', textarea.value));
          renderDocuments(); renderReviews();
        }, 'btn danger'));
        card.appendChild(actions);
        container.appendChild(card);
      });
    }

    async function refresh() {
      if (refreshPromise) return refreshPromise;
      refreshPromise = (async () => {
        const data = await request('/api/legal-workspace');
        centralDocuments = Array.isArray(data?.documents) ? data.documents : [];
        mergedDocuments = helper.mergeDocuments(legacyState().documents, centralDocuments);
        renderDocuments();
        renderReviews();
        return mergedDocuments;
      })();
      try { return await refreshPromise; }
      finally { refreshPromise = null; }
    }

    async function getCentralDocument(documentId) {
      const data = await request(`/api/legal-workspace?documentId=${encodeURIComponent(documentId)}`);
      return data.document;
    }

    function counterpartyFromValues(values) {
      const candidates = ['razao_social', 'nome_contratante', 'nome_contratada', 'nome_parte', 'empresa', 'contraparte', 'nome'];
      for (const key of candidates) {
        if (String(values?.[key] || '').trim()) return String(values[key]).trim();
      }
      return '';
    }

    async function persistGeneratedDocument({ legacyDocument, templateBase64, replacements }) {
      const localDocs = legacyState().documents;
      const decision = helper.persistenceDecision(legacyDocument, localDocs);

      if (decision.action === 'reuse') {
        const current = await getCentralDocument(decision.documentId);
        await refresh();
        return current;
      }

      const d = legacyDocument || {};
      let suggested = '';
      try { if (typeof fileName === 'function') suggested = fileName(d) || ''; } catch (_) {}
      const title = String(d.title || suggested || d.templateCode || 'Documento').replace(/\.docx$/i, '');
      const payload = {
        action: decision.action,
        documentId: decision.documentId || undefined,
        templateCode: d.templateCode,
        templateBase64,
        replacements,
        title,
        counterparty: counterpartyFromValues(d.values),
        formData: d.values || {},
      };
      const data = await request('/api/legal-workspace', { method: 'POST', body: JSON.stringify(payload) });
      d.centralDocumentId = data.document.id;
      d.version = data.document.currentVersion;
      saveLocalLink(d.id, data.document.id, data.document.currentVersion);
      await refresh();
      return data.document;
    }

    async function reconcileOnce() {
      const locals = legacyState().documents;
      for (const local of locals) {
        const id = String(local.centralDocumentId || '').trim();
        if (!id) continue;
        const central = centralDocuments.find((item) => String(item.id) === id);
        if (!central) continue;
        try {
          if (local.status === 'Aprovado' && central.status !== 'approved') await workflow('approve', id);
          else if (local.status === 'Em revisão' && central.status === 'draft') await workflow('submit_review', id);
          else if (local.status === 'Correção solicitada' && central.status !== 'correction_requested') await workflow('request_correction', id, local.reviewComment || '');
        } catch (error) {
          console.error('[LEGAL RECONCILE]', error);
        }
      }
    }

    const originalSendForReview = typeof win.sendForReview === 'function' ? win.sendForReview : null;
    if (originalSendForReview) {
      win.sendForReview = async function (d) {
        const id = String(d?.centralDocumentId || '').trim();
        if (id) {
          await workflow('submit_review', id);
          d.status = 'Em revisão';
          try { if (typeof save === 'function') save(); } catch (_) {}
          renderDocuments(); renderReviews();
          if (typeof toast === 'function') toast('Enviado para revisão jurídica');
          return;
        }
        return originalSendForReview.apply(this, arguments);
      };
    }

    const originalReviewAction = typeof win.reviewAction === 'function' ? win.reviewAction : null;
    if (originalReviewAction) {
      win.reviewAction = async function (d, status, comment) {
        const id = String(d?.centralDocumentId || '').trim();
        if (id) {
          await workflow(status === 'Aprovado' ? 'approve' : 'request_correction', id, comment);
          d.status = status;
          d.reviewComment = String(comment || '').trim();
          try { if (typeof save === 'function') save(); } catch (_) {}
          renderDocuments(); renderReviews();
          if (typeof toast === 'function') toast(status);
          return;
        }
        return originalReviewAction.apply(this, arguments);
      };
    }

    win.docs = function () {
      renderDocuments();
      refresh().catch((error) => console.error('[LEGAL DOCUMENTS]', error));
    };
    win.revs = function () {
      renderReviews();
      refresh().catch((error) => console.error('[LEGAL REVIEWS]', error));
    };

    const search = win.document.getElementById('searchDoc');
    const status = win.document.getElementById('statusDoc');
    if (search) search.addEventListener('input', renderDocuments);
    if (status) status.addEventListener('change', renderDocuments);

    win.EmbrascaLegalWorkspace = {
      refresh,
      persistGeneratedDocument,
      downloadVersion,
      workflow,
    };

    refresh()
      .then(reconcileOnce)
      .then(refresh)
      .catch((error) => console.error('[LEGAL WORKSPACE START]', error));
  }

  return {
    install,
    matchesStatus,
    usesMutationObserver: false,
  };
});
