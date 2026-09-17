(() => {
  const LEGACY_KEY = 'embrascaJuridicoStandaloneV1';
  const unified = window.EmbrascaLegalUnified;
  if (!unified?.mergeDocuments) return;

  let central = [];
  let rendering = false;
  let timer = null;

  function localDocs() {
    try {
      const state = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      return Array.isArray(state?.documents) ? state.documents : [];
    } catch (_) {
      return [];
    }
  }

  async function fetchCentral() {
    const response = await fetch('/api/legal-workspace', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || 'Falha ao carregar documentos.');
    central = Array.isArray(data?.documents) ? data.documents : [];
  }

  function label(item) {
    try {
      const p = typeof prof === 'function' ? prof(item.templateCode) : null;
      if (p?.displayName) return p.displayName;
    } catch (_) {}
    return item.title || item.templateCode || 'Documento';
  }

  function safe(value) {
    const text = String(value ?? '').trim();
    return text || '—';
  }

  function button(text, click) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = text;
    btn.onclick = async () => {
      try { await click(); }
      catch (error) {
        console.error('[LEGAL CROSS DEVICE]', error);
        if (typeof toast === 'function') toast(error?.message || 'Falha ao executar a ação.');
      }
    };
    return btn;
  }

  function addCell(row, value) {
    const td = document.createElement('td');
    td.textContent = safe(value);
    row.appendChild(td);
    return td;
  }

  function filtered(items) {
    const q = String(document.getElementById('searchDoc')?.value || '').trim().toLowerCase();
    const status = String(document.getElementById('statusDoc')?.value || '').trim();
    return items.filter((item) => {
      const haystack = [label(item), item.title, item.party, item.generatedByName, item.reviewedByName, item.approvedByName]
        .map((v) => String(v || '').toLowerCase()).join(' ');
      return (!q || haystack.includes(q)) && (!status || item.statusLabel === status);
    });
  }

  function render() {
    const mount = document.getElementById('docs');
    if (!mount || rendering) return;
    rendering = true;
    try {
      const items = filtered(unified.mergeDocuments(localDocs(), central));
      mount.innerHTML = '';

      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'Nenhum documento encontrado.';
        mount.appendChild(empty);
        return;
      }

      const wrap = document.createElement('div');
      wrap.className = 'tablewrap';
      const table = document.createElement('table');
      table.className = 'table';
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      ['ID','Documento','Parte','Versão','Status','Gerado por','Revisado por','Aprovado por','Ações'].forEach((name) => {
        const th = document.createElement('th');
        th.textContent = name;
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (const item of items) {
        const row = document.createElement('tr');
        addCell(row, item.local?.number ? `#${String(item.local.number).padStart(4, '0')}` : item.centralId ? `#${item.centralId.slice(0, 8).toUpperCase()}` : '—');
        addCell(row, label(item));
        addCell(row, item.party);
        addCell(row, `v${item.version}`);

        const statusCell = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `badge ${item.statusLabel === 'Correção solicitada' ? 'red' : item.statusLabel === 'Em revisão' ? 'warn' : item.statusLabel === 'Gerado' ? 'gray' : ''}`.trim();
        badge.textContent = item.statusLabel;
        statusCell.appendChild(badge);
        row.appendChild(statusCell);

        addCell(row, item.generatedByName);
        addCell(row, item.reviewedByName);
        addCell(row, item.approvedByName);

        const actions = document.createElement('td');
        const actionWrap = document.createElement('div');
        actionWrap.className = 'actions';
        if (item.centralId && window.EmbrascaLegalWorkspace?.downloadVersion) {
          actionWrap.appendChild(button('Baixar', () => window.EmbrascaLegalWorkspace.downloadVersion(item.centralId, item.version)));
          if (window.EmbrascaLegalWorkspace?.open) {
            actionWrap.appendChild(button('Detalhes', () => window.EmbrascaLegalWorkspace.open(item.centralId)));
          }
        } else if (item.local && typeof downloadDoc === 'function') {
          actionWrap.appendChild(button('Baixar', () => downloadDoc(item.local)));
        }
        actions.appendChild(actionWrap);
        row.appendChild(actions);
        tbody.appendChild(row);
      }

      table.appendChild(tbody);
      wrap.appendChild(table);
      mount.appendChild(wrap);
    } finally {
      rendering = false;
    }
  }

  function bindFilters() {
    const search = document.getElementById('searchDoc');
    const status = document.getElementById('statusDoc');
    if (search && !search.dataset.centralSyncBound) {
      search.dataset.centralSyncBound = '1';
      search.addEventListener('input', render);
    }
    if (status && !status.dataset.centralSyncBound) {
      status.dataset.centralSyncBound = '1';
      status.addEventListener('change', render);
    }
  }

  function watch() {
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        bindFilters();
        render();
      }, 30);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function start() {
    bindFilters();
    watch();
    try {
      await fetchCentral();
      render();
    } catch (error) {
      console.error('[LEGAL CROSS DEVICE]', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
