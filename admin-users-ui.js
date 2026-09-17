(() => {
  const API = '/api/admin-users';
  const NAV_ID = 'adminUsersNav';
  const OVERLAY_ID = 'adminUsersOverlay';
  let lastRole = null;

  const currentUser = () => window.EmbrascaCentralAuth?.user || null;
  const byId = (id) => document.getElementById(id);

  async function request(method = 'GET', body) {
    const response = await fetch(API, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    return { response, data };
  }

  function showMessage(message, error = false) {
    const el = byId('adminUsersMessage');
    if (!el) return;
    el.textContent = message || '';
    el.style.display = message ? 'flex' : 'none';
    el.classList.toggle('error', Boolean(error));
  }

  function showTemporaryPassword(email, password) {
    const box = byId('admTempPassword');
    if (!box || !password) return;
    box.style.display = 'block';
    box.textContent = `Senha temporária de ${email}: ${password} — copie agora; ela não será mostrada novamente.`;
  }

  function restoreAdminNavigation() {
    document.querySelectorAll('#nav [data-s="dashboard"], #nav [data-s="documentos"], #nav [data-s="revisoes"], #nav [data-s="modelos"], #nav [data-s="config"]')
      .forEach((el) => el.classList.remove('hidden'));
  }

  function removeAdminUi() {
    byId(NAV_ID)?.remove();
    byId(OVERLAY_ID)?.remove();
  }

  function ensureStyles() {
    if (byId('adminUsersStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminUsersStyles';
    style.textContent = `
      #${OVERLAY_ID}{position:fixed;inset:0;z-index:99999;background:var(--overlay);display:none;align-items:center;justify-content:center;padding:24px;overflow:auto;font-family:inherit;backdrop-filter:blur(8px)}
      #${OVERLAY_ID}.open{display:flex}
      .adm-panel{width:min(1180px,calc(100vw - 48px));max-height:min(820px,calc(100vh - 48px));display:flex;flex-direction:column;background:var(--modal);color:var(--text);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow-lg);overflow:hidden}
      .adm-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 24px;background:var(--surface-subtle);color:var(--text);border-bottom:1px solid var(--border)}
      .adm-head h2{margin:0;color:var(--text)!important;font-size:20px;font-weight:760;letter-spacing:-.02em}
      .adm-close{display:grid;place-items:center;width:36px;height:36px;padding:0;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--soft);font-size:24px;line-height:1;cursor:pointer;transition:.16s ease}
      .adm-close:hover{background:var(--surface-raised);border-color:var(--border-strong);color:var(--text)}
      .adm-body{padding:24px;overflow:auto;background:var(--modal)}
      .adm-msg{display:none;align-items:center;min-height:42px;margin:0 0 20px;padding:10px 13px;border:1px solid color-mix(in srgb,var(--success) 28%,var(--border));border-radius:10px;background:var(--success-soft);color:var(--success);font-size:13px;font-weight:650}
      .adm-msg.error{border-color:color-mix(in srgb,var(--danger) 30%,var(--border));background:var(--danger-soft);color:var(--danger)}
      .adm-grid{display:grid;grid-template-columns:minmax(150px,1.1fr) minmax(210px,1.45fr) minmax(150px,1fr) minmax(150px,.9fr) auto;gap:12px;align-items:end;padding:18px;border:1px solid var(--border);border-radius:14px;background:var(--surface-subtle)}
      .adm-field{min-width:0}.adm-field label{display:block;margin:0 0 6px;color:var(--soft)!important;font-size:11px;font-weight:750;letter-spacing:.035em;text-transform:uppercase}
      .adm-field input,.adm-field select,.adm-table input,.adm-table select{width:100%;min-width:0;box-sizing:border-box;min-height:42px;padding:9px 11px;border:1px solid var(--border-strong)!important;border-radius:9px!important;background:var(--control)!important;color:var(--text)!important;font:inherit;box-shadow:none!important}
      .adm-field input:focus,.adm-field select:focus,.adm-table input:focus,.adm-table select:focus{border-color:var(--accent)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)!important}
      .adm-btn{min-height:40px;border:1px solid var(--accent);border-radius:9px;padding:9px 13px;font:inherit;font-size:13px;font-weight:720;line-height:1.2;white-space:nowrap;cursor:pointer;background:var(--accent);color:#fff;transition:background .15s ease,border-color .15s ease,color .15s ease}
      .adm-btn:hover{background:var(--accent-hover);border-color:var(--accent-hover)}
      .adm-btn.secondary{background:var(--surface);border-color:var(--border-strong);color:var(--soft)}
      .adm-btn.secondary:hover{background:var(--surface-raised);border-color:var(--accent);color:var(--text)}
      .adm-btn.danger{background:var(--danger-soft);border-color:color-mix(in srgb,var(--danger) 28%,var(--border));color:var(--danger)}
      .adm-btn.danger:hover{background:color-mix(in srgb,var(--danger-soft) 75%,var(--danger));border-color:var(--danger);color:var(--danger)}
      #admCreateBtn{min-width:132px}
      .adm-temp{margin:16px 0 0;padding:12px 14px;border:1px dashed var(--border-strong);border-radius:10px;background:var(--surface-subtle);color:var(--soft);font-size:13px;word-break:break-word}
      .adm-table-wrap{overflow:auto;margin-top:22px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}
      .adm-table{width:100%;border-collapse:separate;border-spacing:0;min-width:1040px;background:transparent;color:var(--text)}
      .adm-table th,.adm-table td{padding:13px 12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle}
      .adm-table tbody tr:last-child td{border-bottom:0}.adm-table tbody tr:hover{background:var(--surface-subtle)}
      .adm-table th{position:sticky;top:0;z-index:1;background:var(--surface-subtle);color:var(--muted);font-size:10px;font-weight:780;letter-spacing:.055em;text-transform:uppercase;white-space:nowrap}
      .adm-table td{color:var(--soft);font-size:13px}.adm-table td:nth-child(1){width:170px}.adm-table td:nth-child(2){min-width:225px;color:var(--text)}.adm-table td:nth-child(3){width:155px}.adm-table td:nth-child(4){width:90px}.adm-table td:nth-child(5){width:145px}.adm-table td:nth-child(6){width:284px}
      .adm-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;min-width:260px}
      .adm-actions .adm-btn{width:100%;min-width:0;padding-left:10px;padding-right:10px}
      .adm-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:740;white-space:nowrap}.adm-status::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}.adm-status.on{color:var(--success)}.adm-status.off{color:var(--danger)}
      #${NAV_ID}{font-family:inherit!important}
      @media(max-width:980px){.adm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.adm-grid #admCreateBtn{width:100%}.adm-panel{width:calc(100vw - 28px);max-height:calc(100vh - 28px)}#${OVERLAY_ID}{padding:14px}}
      @media(max-width:760px){.adm-body{padding:16px}.adm-head{padding:16px 18px}.adm-grid{grid-template-columns:1fr;padding:14px}.adm-actions{grid-template-columns:1fr}.adm-table{min-width:920px}}
    `;
    document.head.appendChild(style);
  }

  function ensureOverlay() {
    if (byId(OVERLAY_ID)) return byId(OVERLAY_ID);
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `
      <div class="adm-panel" role="dialog" aria-modal="true" aria-label="Administração de usuários">
        <div class="adm-head"><h2>Administração de usuários</h2><button type="button" class="adm-close" aria-label="Fechar">×</button></div>
        <div class="adm-body">
          <div id="adminUsersMessage" class="adm-msg"></div>
          <div class="adm-grid">
            <div class="adm-field"><label for="admCreateName">Nome</label><input id="admCreateName" autocomplete="off"></div>
            <div class="adm-field"><label for="admCreateEmail">E-mail</label><input id="admCreateEmail" type="email" autocomplete="off"></div>
            <div class="adm-field"><label for="admCreatePassword">Senha inicial</label><input id="admCreatePassword" type="password" autocomplete="new-password" minlength="8"></div>
            <div class="adm-field"><label for="admCreateRole">Perfil</label><select id="admCreateRole"><option value="usuario">Usuário</option><option value="juridico">Jurídico</option><option value="admin">Administrador</option></select></div>
            <button type="button" class="adm-btn" id="admCreateBtn">Criar usuário</button>
          </div>
          <div id="admTempPassword" class="adm-temp" style="display:none"></div>
          <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody id="adminUsersList"></tbody></table></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.adm-close').addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.classList.remove('open'); });
    byId('admCreateBtn').addEventListener('click', createUser);
    return overlay;
  }

  function ensureAdminEntry(user) {
    if (!user || user.role !== 'admin') {
      removeAdminUi();
      return;
    }
    restoreAdminNavigation();
    ensureOverlay();
    if (byId(NAV_ID)) return;

    const button = document.createElement('button');
    button.id = NAV_ID;
    button.type = 'button';
    button.textContent = 'Administração';
    button.addEventListener('click', async () => {
      ensureOverlay().classList.add('open');
      await loadUsers();
    });

    const nav = byId('nav');
    if (nav) nav.appendChild(button);
    else {
      button.style.position = 'fixed';
      button.style.right = '18px';
      button.style.bottom = '18px';
      button.style.width = 'auto';
      button.style.zIndex = '9999';
      document.body.appendChild(button);
    }
  }

  function dateLabel(value) {
    if (!value) return 'Nunca';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Nunca' : date.toLocaleString('pt-BR');
  }

  function renderUsers(users) {
    const tbody = byId('adminUsersList');
    if (!tbody) return;
    tbody.innerHTML = '';

    users.forEach((user) => {
      const tr = document.createElement('tr');
      const nameTd = document.createElement('td');
      const name = document.createElement('input'); name.value = String(user.name || ''); nameTd.appendChild(name);
      const emailTd = document.createElement('td'); emailTd.textContent = String(user.email || '');
      const roleTd = document.createElement('td');
      const role = document.createElement('select');
      [['usuario','Usuário'],['juridico','Jurídico'],['admin','Administrador']].forEach(([value,label]) => {
        const option = document.createElement('option'); option.value = value; option.textContent = label; option.selected = user.role === value; role.appendChild(option);
      });
      roleTd.appendChild(role);
      const statusTd = document.createElement('td'); const status = document.createElement('span'); status.className = `adm-status ${user.active ? 'on' : 'off'}`; status.textContent = user.active ? 'Ativo' : 'Inativo'; statusTd.appendChild(status);
      const lastTd = document.createElement('td'); lastTd.textContent = dateLabel(user.lastSignInAt);
      const actionsTd = document.createElement('td'); const actions = document.createElement('div'); actions.className = 'adm-actions';
      const save = actionButton('Salvar', 'adm-btn', () => updateUser(user.id, { name: name.value.trim(), role: role.value }));
      const toggle = actionButton(user.active ? 'Desativar' : 'Ativar', 'adm-btn secondary', () => updateUser(user.id, { active: !user.active }));
      const reset = actionButton('Redefinir acesso', 'adm-btn secondary', () => resetUser(user.id, user.email));
      const del = actionButton('Excluir', 'adm-btn danger', () => deleteUser(user.id, user.email));
      actions.append(save, toggle, reset, del); actionsTd.appendChild(actions);
      tr.append(nameTd, emailTd, roleTd, statusTd, lastTd, actionsTd); tbody.appendChild(tr);
    });
  }

  function actionButton(text, className, fn) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = className; button.textContent = text; button.addEventListener('click', fn);
    return button;
  }

  async function loadUsers() {
    showMessage('Carregando usuários...');
    const { response, data } = await request('GET');
    if (!response.ok) return showMessage(data?.error || 'Não foi possível carregar os usuários.', true);
    renderUsers(Array.isArray(data?.users) ? data.users : []);
    showMessage('');
  }

  async function createUser() {
    const name = byId('admCreateName')?.value.trim() || '';
    const email = byId('admCreateEmail')?.value.trim().toLowerCase() || '';
    const password = byId('admCreatePassword')?.value || '';
    const role = byId('admCreateRole')?.value || 'usuario';
    if (name.length < 2 || !email || password.length < 8) return showMessage('Informe nome, e-mail e uma senha com pelo menos 8 caracteres.', true);
    showMessage('Criando usuário...');
    const { response, data } = await request('POST', { action: 'create', name, email, password, role });
    if (!response.ok) return showMessage(data?.error || 'Não foi possível criar o usuário.', true);
    byId('admCreateName').value = ''; byId('admCreateEmail').value = ''; byId('admCreatePassword').value = '';
    showMessage('Usuário criado. Ele já pode entrar com o e-mail e a senha definidos.');
    await loadUsers();
  }

  async function updateUser(id, patch) {
    showMessage('Salvando alterações...');
    const { response, data } = await request('POST', { action: 'update', id, ...patch });
    if (!response.ok) return showMessage(data?.error || 'Não foi possível alterar o usuário.', true);
    showMessage('Usuário atualizado.');
    await loadUsers();
  }

  async function resetUser(id, email) {
    if (!window.confirm(`Redefinir a senha de ${email}?`)) return;
    showMessage('Redefinindo acesso...');
    const { response, data } = await request('POST', { action: 'reset', id });
    if (!response.ok) return showMessage(data?.error || 'Não foi possível redefinir o acesso.', true);
    showTemporaryPassword(data?.email || email, data?.temporaryPassword);
    showMessage('A senha foi redefinida. Copie a senha temporária exibida abaixo.');
  }

  async function deleteUser(id, email) {
    if (!window.confirm(`Excluir definitivamente ${email}? Esta ação remove o acesso do usuário.`)) return;
    showMessage('Excluindo usuário...');
    const { response, data } = await request('POST', { action: 'delete', id });
    if (!response.ok) return showMessage(data?.error || 'Não foi possível excluir o usuário.', true);
    showMessage('Usuário excluído.');
    await loadUsers();
  }

  function sync() {
    const user = currentUser();
    const role = user?.role || null;
    if (role === lastRole && (role !== 'admin' || byId(NAV_ID))) return;
    lastRole = role;
    ensureAdminEntry(user);
  }

  sync();
  setInterval(sync, 500);
})();
