(() => {
  const core = window.EmbrascaLegalWorkspaceCore;
  if (!core) throw new Error('Núcleo do workspace jurídico não carregado.');

  const state = { documents: [], selectedId: null };

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'Falha no módulo jurídico.');
    return data;
  }

  function user() {
    return window.EmbrascaCentralAuth?.user || null;
  }

  function element(id) {
    return document.getElementById(id);
  }

  function addText(parent, tag, text, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    el.textContent = text;
    parent.appendChild(el);
    return el;
  }

  function stylePanel(panel) {
    panel.style.padding = '24px';
    panel.style.maxWidth = '1180px';
    panel.style.margin = '0 auto';
  }

  function centralMount(panel, id) {
    let mount = panel.querySelector(`#${id}`);
    if (!mount) {
      mount = document.createElement('div');
      mount.id = id;
      mount.dataset.centralLegalWorkspace = 'true';
      panel.appendChild(mount);
    }
    mount.innerHTML = '';
    mount.hidden = false;
    return mount;
  }

  function clearCentralDetail(panel) {
    const detail = panel?.querySelector?.('#centralLegalDetail');
    if (detail) detail.remove();
  }

  function button(text, onClick, kind = 'secondary') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.className = kind === 'primary' ? 'btn primary' : 'btn';
    btn.addEventListener('click', async () => {
      try { await onClick(); }
      catch (error) {
        console.error('[LEGAL WORKSPACE UI]', error);
        if (typeof toast === 'function') toast(error?.message || 'Falha no módulo jurídico.');
      }
    });
    return btn;
  }

  function responsibilityRows(container, doc) {
    const responsible = core.responsibleDisplay(doc);
    const wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = 'repeat(auto-fit,minmax(180px,1fr))';
    wrap.style.gap = '10px';
    wrap.style.marginTop = '12px';
    [
      ['Gerado por', responsible.generated],
      ['Revisado por', responsible.reviewed],
      ['Aprovado por', responsible.approved],
    ].forEach(([label, value]) => {
      const item = document.createElement('div');
      item.style.border = '1px solid rgba(127,127,127,.25)';
      item.style.borderRadius = '8px';
      item.style.padding = '10px';
      addText(item, 'div', label, 'muted');
      const strong = addText(item, 'strong', value);
      strong.style.display = 'block';
      strong.style.marginTop = '4px';
      wrap.appendChild(item);
    });
    container.appendChild(wrap);
  }

  async function refresh() {
    const data = await api('/api/legal-workspace');
    state.documents = Array.isArray(data.documents) ? data.documents : [];
    renderDocuments();
    renderReviews();
    return state.documents;
  }

  function renderDocuments() {
    const panel = element('documentos');
    if (!panel) return;

    clearCentralDetail(panel);
    const mount = centralMount(panel, 'centralLegalDocuments');
    if (!state.documents.length) {
      mount.remove();
      return;
    }

    mount.style.marginTop = '20px';
    addText(mount, 'h2', 'Documentos centralizados');
    addText(mount, 'p', 'Responsáveis da versão atual dos documentos gerados a partir da centralização.', 'sub');

    state.documents.forEach((doc) => {
      const card = document.createElement('div');
      card.style.border = '1px solid rgba(127,127,127,.25)';
      card.style.borderRadius = '12px';
      card.style.padding = '16px';
      card.style.margin = '12px 0';
      card.style.background = 'rgba(127,127,127,.05)';
      addText(card, 'h3', doc.title || doc.templateCode || 'Documento');
      addText(card, 'div', `${doc.counterparty || 'Sem contraparte'} • v${doc.currentVersion} • ${core.statusLabel(doc.status)}`);
      responsibilityRows(card, doc);
      const actions = document.createElement('div');
      actions.style.marginTop = '12px';
      actions.style.display = 'flex';
      actions.style.gap = '8px';
      actions.appendChild(button('Ver detalhes', () => open(doc.id), 'primary'));
      actions.appendChild(button('Baixar', () => downloadVersion(doc.id, doc.currentVersion)));
      card.appendChild(actions);
      mount.appendChild(card);
    });
  }

  function renderReviews() {
    const panel = element('revisoes');
    if (!panel) return;

    clearCentralDetail(panel);
    const mount = centralMount(panel, 'centralLegalReviews');
    const docs = core.canReview(user())
      ? state.documents.filter((d) => ['under_review', 'correction_requested', 'approved'].includes(d.status))
      : state.documents;

    if (!docs.length) {
      mount.remove();
      return;
    }

    mount.style.marginTop = '20px';
    addText(mount, 'h2', 'Revisões centralizadas');
    addText(mount, 'p', core.canReview(user()) ? 'Fila jurídica de revisão e aprovação.' : 'Acompanhe o andamento das revisões dos documentos centralizados.', 'sub');

    docs.forEach((doc) => {
      const card = document.createElement('div');
      card.style.border = '1px solid rgba(127,127,127,.25)';
      card.style.borderRadius = '12px';
      card.style.padding = '16px';
      card.style.margin = '12px 0';
      addText(card, 'h3', doc.title || doc.templateCode || 'Documento');
      addText(card, 'div', `v${doc.currentVersion} • ${core.statusLabel(doc.status)}`);
      responsibilityRows(card, doc);
      card.appendChild(button('Abrir revisão', () => open(doc.id), 'primary'));
      mount.appendChild(card);
    });
  }

  async function open(documentId) {
    const data = await api(`/api/legal-workspace?documentId=${encodeURIComponent(documentId)}`);
    const doc = data.document;
    state.selectedId = documentId;
    renderDetail(doc);
    return doc;
  }

  function activeDetailTarget() {
    const reviews = element('revisoes');
    const documents = element('documentos');
    if (reviews && !reviews.classList.contains('hidden')) return reviews;
    if (documents && !documents.classList.contains('hidden')) return documents;
    return documents || reviews;
  }

  function renderDetail(doc) {
    const target = activeDetailTarget();
    if (!target) return;

    const listMount = target.querySelector(target.id === 'documentos' ? '#centralLegalDocuments' : '#centralLegalReviews');
    if (listMount) listMount.hidden = true;

    const mount = centralMount(target, 'centralLegalDetail');
    mount.style.marginTop = '20px';
    mount.style.padding = '18px';
    mount.style.border = '1px solid rgba(127,127,127,.25)';
    mount.style.borderRadius = '12px';

    const back = button('Voltar', async () => {
      mount.remove();
      if (listMount) listMount.hidden = false;
      await refresh();
    });
    mount.appendChild(back);

    addText(mount, 'h2', doc.title || doc.templateCode || 'Documento');
    addText(mount, 'p', `${doc.counterparty || 'Sem contraparte'} • v${doc.currentVersion} • ${core.statusLabel(doc.status)}`, 'sub');
    responsibilityRows(mount, doc);

    const times = document.createElement('div');
    times.style.margin = '14px 0';
    addText(times, 'div', `Gerado em: ${core.formatDateTime(doc.generatedAt)}`);
    addText(times, 'div', `Revisado em: ${core.formatDateTime(doc.reviewedAt)}`);
    addText(times, 'div', `Aprovado em: ${core.formatDateTime(doc.approvedAt)}`);
    mount.appendChild(times);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.flexWrap = 'wrap';
    actions.style.gap = '8px';
    actions.appendChild(button('Baixar versão atual', () => downloadVersion(doc.id, doc.currentVersion)));

    if (doc.status === 'draft' || doc.status === 'correction_requested') {
      actions.appendChild(button('Enviar para revisão', async () => {
        await api('/api/legal-workspace', { method: 'POST', body: JSON.stringify({ action: 'submit_review', documentId: doc.id }) });
        await refresh();
        await open(doc.id);
      }, 'primary'));
    }

    if (core.canReview(user()) && doc.status === 'under_review') {
      actions.appendChild(button('Solicitar correção', async () => {
        const comment = window.prompt('Descreva a correção solicitada:') || '';
        await api('/api/legal-workspace', { method: 'POST', body: JSON.stringify({ action: 'request_correction', documentId: doc.id, comment }) });
        await refresh();
        await open(doc.id);
      }));
      actions.appendChild(button('Aprovar', async () => {
        await api('/api/legal-workspace', { method: 'POST', body: JSON.stringify({ action: 'approve', documentId: doc.id }) });
        await refresh();
        await open(doc.id);
      }, 'primary'));
    }
    mount.appendChild(actions);

    addText(mount, 'h3', 'Histórico de versões');
    (doc.versions || []).forEach((version) => {
      const row = document.createElement('div');
      row.style.padding = '8px 0';
      row.style.borderBottom = '1px solid rgba(127,127,127,.15)';
      addText(row, 'div', `v${version.version} • Gerado por ${version.generatedBy?.name || '—'} • ${core.formatDateTime(version.generatedAt)}`);
      row.appendChild(button('Baixar', () => downloadVersion(doc.id, version.version)));
      mount.appendChild(row);
    });

    addText(mount, 'h3', 'Histórico de revisão');
    if (!(doc.reviews || []).length) addText(mount, 'p', 'Sem ações de revisão nesta versão/documento.');
    (doc.reviews || []).forEach((review) => {
      const actionLabel = review.action === 'approved' ? 'Aprovado' : 'Correção solicitada';
      const row = document.createElement('div');
      row.style.padding = '8px 0';
      row.style.borderBottom = '1px solid rgba(127,127,127,.15)';
      addText(row, 'div', `${actionLabel} • v${review.version} • ${review.reviewedBy?.name || '—'} • ${core.formatDateTime(review.createdAt)}`);
      if (review.comment) addText(row, 'div', review.comment);
      mount.appendChild(row);
    });
  }

  async function downloadVersion(documentId, version) {
    const response = await fetch(`/api/legal-download?documentId=${encodeURIComponent(documentId)}&version=${encodeURIComponent(version)}`, {
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
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = match?.[1] || `documento_v${version}.docx`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  function counterpartyFromValues(values) {
    const candidates = ['razao_social', 'nome_contratante', 'nome_contratada', 'nome_parte', 'empresa', 'contraparte', 'nome'];
    for (const key of candidates) {
      if (String(values?.[key] || '').trim()) return String(values[key]).trim();
    }
    return '';
  }

  async function persistGeneratedDocument({ legacyDocument, templateBase64, replacements }) {
    const d = legacyDocument || {};
    let suggested = '';
    try { if (typeof fileName === 'function') suggested = fileName(d) || ''; } catch (_) {}
    const title = String(d.title || suggested || d.templateCode || 'Documento').replace(/\.docx$/i, '');
    const payload = {
      action: d.centralDocumentId ? 'create_version' : 'create_document',
      documentId: d.centralDocumentId || undefined,
      templateCode: d.templateCode,
      templateBase64,
      replacements,
      title,
      counterparty: counterpartyFromValues(d.values),
      formData: d.values || {},
    };
    const data = await api('/api/legal-workspace', { method: 'POST', body: JSON.stringify(payload) });
    d.centralDocumentId = data.document.id;
    d.version = data.document.currentVersion;
    await refresh();
    return data.document;
  }

  document.addEventListener('click', (event) => {
    const nav = event.target.closest?.('#nav [data-s]');
    if (!nav) return;
    const section = nav.dataset.s;
    if (section === 'documentos' || section === 'revisoes') {
      setTimeout(() => refresh().catch((error) => console.error('[LEGAL WORKSPACE UI]', error)), 0);
    }
  });

  window.EmbrascaLegalWorkspace = {
    refresh,
    open,
    persistGeneratedDocument,
    downloadVersion,
  };
})();
