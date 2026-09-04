(() => {
  const API = '/api/admin-users';
  const IDS = {
    nav: 'adminUsersNav',
    overlay: 'adminUsersOverlay',
    list: 'adminUsersList',
    message: 'adminUsersMessage',
  };
  let lastRole = null;

  function authUser() {
    return window.EmbrascaCentralAuth?.user || null;
  }

  function escapeText(value) {
    return String(value == null ? '' : value);
  }

  function request(method = 'GET', body) {
    return fetch(API, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (response) => {
      let data = null;
      try { data = await response.json(); } catch (_) {}
      return { response, data };
    });
  }

  function showMessage(message, error = false) {
    const el = document.getElementById(IDS.message);
    if (!el) return;
    el.textContent = message || '';
    el.style.display = message ? 'block' : 'none';
    el.style.background = error ? '#3b1212' : '#12351f';
    el.style.borderColor = error ? '#8c2e2e' : '#2d6b43';
  }

  function removeAdminUi() {
    document.getElementById(IDS.nav)?.remove();
    document.getElementById(IDS.overlay)?.remove();
  }

  function restoreAdminNavigation() {
    document.querySelectorAll('#nav [data-s="dashboard"], #nav [data-s="documentos"], #nav [data-s="revisoes"], #nav [data-s="modelos"], #nav [data-s="config"]')
      .forEach((el) => el.classList.remove('hidden'));
  }

  function injectStyles() {
    if (document.getElementById('adminUsersStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminUsersStyles';
    style.textContent = `
      #${IDS.overlay}{position:fixed;inset:0;z-index:99999;background:rgba(5,12,8,.82);display:none;align-items:flex-start;justify-content:center;padding:40px 18px;overflow:auto;font-family:Arial,sans-serif}
      #${IDS.overlay}.open{display:flex}
      .adm-panel{width:min(1120px,100%);background:#f7f9f7;color:#142018;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.42);overflow:hidden}
      .adm-head{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;background:#163e28;color:#fff}
      .adm-head h2{margin:0;font-size:22px}.adm-close{border:0;background:transparent;color:#fff;font-size:28px;cursor:pointer}
      .adm-body{padding:22px}.adm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end}
      .adm-field label{display:block;font-size:12px;font-weight:700;margin:0 0 5px}.adm-field input,.adm-field select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #bcc9c0;border-radius:8px;background:#fff;color:#142018}
      .adm-btn{border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer;background:#1c633a;color:#fff}.adm-btn.secondary{background:#dde6df;color:#142018}.adm-btn.danger{background:#8a2525}.adm-btn:disabled{opacity:.55;cursor:not-allowed}
      .adm-msg{display:none;margin:0 0 16px;padding:11px 13px;border:1px solid;border-radius:8px;color:#fff}
      .adm-temp{margin:14px 0;padding:12px;border:1px dashed #6f8a77;border-radius:8px;background:#eef4ef;word-break:break-all}
      .adm-table-wrap{overflow:auto;margin-top:22px}.adm-table{width:100%;border-collapse:collapse;min-width:900px}.adm-table th,.adm-table td{padding:10px;border-bottom:1px solid #dce4de;text-align:left;vertical-align:middle}.adm-table th{font-size:12px;color:#526158}.adm-table input,.adm-table select{padding:7px;border:1px solid #bdc8c0;border-radius:7px;background:#fff;color:#142018}.adm-actions{display:flex;gap:6px;flex-wrap:wrap}.adm-status{font-size:12px;font-weight:700}.adm-status.on{color:#17723f}.adm-status.off{color:#8a2525}
      @media(max-width:800px){.adm-grid{grid-template-columns:1fr}.adm-body{padding:14px}}
    `;
    document.head.appendChild(style);
  }

  function createOverlay() {
    if (document.getElementById(IDS.overlay)) return document.getElementById(IDS.overlay);
    injectStyles();
    const overlay = document.createElement('div');
    overlay.id = IDS.overlay;
    overlay.innerHTML = `
      <div class="adm-panel" role="dialog" aria-modal="true" aria-label="Administração de usuários">
        <div class="adm-head"><h2>Administração de usuários</h2><button type="button" class="adm-close" aria-label="Fechar">×</button></div>
        <div class="adm-body">
          <div id="${IDS.message}" class="adm-msg"></div>
          <div class="adm-grid">
            <div class="adm-field"><label for="admCreateName">Nome</label><input id="admCreateName" autocomplete="off"></div>
            <div class="adm-field"><label for="admCreateEmail">E-mail</label><input id="admCreateEmail" type="email" autocomplete="off"></div>
            <div class="adm-field"><label for="admCreateRole">Perfil</label><select id="admCreateRole"><option value="usuario">Usuário</option><option value="juridico">Jurídico</option><option value="admin">Administrador</option></select></div>
            <button type="button" class="adm-btn" id="admCreateBtn">Criar usuário</button>
          </div>
          <div id="admTempPassword" class="adm-temp" style="display:none"></div>
          <div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody id="${IDS.list}"></tbody></table></div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.adm-close').addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.classList.remove('open'); });
    overlay.querySelector('#admCreateBtn').addEventListener('click', createUser);
    return overlay;
  }

  function ensureAdminEntry(user) {
    if (!user || user.role !== 'admin') {
      removeAdminUi();
      return;
    }

    restoreAdminNavigation();
    createOverlay();
    if (document.getElementById(IDS.nav)) return;

    const button = document.createElement('button');
    button.id = IDS.nav;
    button.type = 'button';
    button.textContent = 'Administração';
    button.style.cssText = 'width:calc(100% - 20px);margin:8px 10px;padding:10px 12px;border:1px solid rgba(255,255,255,.18);border-radius:8px;background:#16452a;color:white;font-weight:700;text-align:left;cursor:pointer';
    button.addEventListener('click', async () => {
      const overlay = createOverlay();
      overlay.classList.add('open');
      await loadUsers();
    });

    const nav = document.getElementById('nav');
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

  function roleLabel(role) {
    if (role === 'admin') return 'Administrador';
    if (role === 'juridico') return 'Jurídico';
    return 'Usuário';
  }

  function dateLabel(value) {
    if (!value) return 'Nunca';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Nunca' : date.toLocaleString('pt-BR');
  }

  function renderUsers(users) {
    const tbody = document.getElementById(IDS.list);
    if (!tbody) return;
    tbody.innerHTML = '';

    users.forEach((user) => {
      const tr = document.createElement('tr');

      const nameTd = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.value = escapeText(user.name);
      nameInput.dataset.field = 'name';
      nameTd.appendChild(nameInput);

      const emailTd = document.createElement('td');
      emailTd.textContent = escapeText(user.email);

      const roleTd = document.createElement('td');
      const select = document.createElement('select');
      [['usuario','Usuário'],['juridico','Jurídico'],['admin','Administrador']].forEach(([value,label]) => {
        const option = document.createElement('option'); option.value = value; option.textContent = label; if (user.role === value) option.selected = true; select.appendChild(option);
      });
      select.dataset.field = 'role';
      roleTd.appendChild(select);

      const statusTd = document.createElement('td');
      const status = document.createElement('span');
      status.className = `adm-status ${user.active ? 'on' : 'off'}`;
      status.textContent = user.active ? 'Ativo' : 'Inativo';
      statusTd.appendChild(status);

      const lastTd = document.createElement('td');
      lastTd.textContent = dateLabel(user.lastSignInAt);

      const actionsTd = document.createElement('td');
      const actions = document.createElement('div'); actions.className = 'adm-actions';
      const save = document.createElement('button'); save.type='button'; save.className='adm-btn'; save.textContent='Salvar';
      const toggle = document.createElement('button'); toggle.type='button'; toggle.className='adm-btn secondary'; toggle.textContent = user.active ? 'Desativar' : 'Ativar';
      const reset = document.createElement('button'); reset.type='button'; reset.className='adm-btn secondary'; reset.textContent='Redefinir acesso';
      const del = document.createElement('button'); del.type='button'; del.className='adm-btn danger'; del.textContent='Excluir';

      save.addEventListener('click', () => updateUser(user.id, { name: nameInput.value.trim(), role: select.value }));
      toggle.addEventListener('click', () => updateUser(user.id, { active: !user.active }));
      reset.addEventListener('click', () => resetUser(user.id, user.email));
      del.addEventListener('click', () => deleteUser(user.id, user.email));
      actions.append(save, toggle, reset, del); actionsTd.appendChild(actions);

      tr.append(nameTd, emailTd, roleTd, statusTd, lastTd, actionsTd);
      tbody.appendChild(tr);
    });
  }

  async function loadUsers() {
    showMessage('Carregando usuários...');
    const { response, data } = await request('GET');
    if (!response.ok) {
      showMessage(data?.error || 'Não foi possível carregar os usuários.', true);
      return;
    }
    renderUsers(Array.isArray(data?.users) ? data.users : []);
    showMessage('');
  }

  async function createUser() {
    const name = document.getElementById('admCreateName')?.value.trim() || '';
    const email = document.getElementById('admCreateEmail')?.value.trim().toLowerCase() || '';
    const role = document.getElementById('admCreateRole')?.value || 'usuario';
    if (name.length < 2 || !email) { showMessage('Informe nome e e-mail.', true); return; }

    showMessage('Criando usuário...');
    const { response, data } = await request('POST', { action: 'create', name, email, role });
    if (!response.ok) { showMessage(data?.error || 'Não foi possível criar o usuário.', true); return; }

    const temp = document.getElementById('admTempPassword');
    if (temp && data?.temporaryPassword) {
      temp.style.display = 'block';
      temp.textContent = `Senha temporária de ${email}: ${data.temporaryPassword} — copie agora; ela não será mostrada novamente.`;
    }
    document.getElementById('admCreateName').value = '';
    document.getElementById('admCreateEmail').value = '';
    showMessage('Usuário criado.');
    await loadUsers();
  }

  async function updateUser(id, patch) {
    showMessage('Salvando alterações...');
    const { response, data } = await request('POST', { action: 'update', id, ...patch });
    if (!response.ok) { showMessage(data?.error || 'Não foi possível alterar o usuário.', true); return; }
    showMessage('Usuário atualizado.');
    await loadUsers();
  }

  async function resetUser(id, email) {
    if (!window.confirm(`Enviar redefinição de acesso para ${email}?`)) return;
    showMessage('Enviando redefinição...');
    const { response, data } = await request('POST', { action: 'reset', id });
    if (!response.ok) { showMessage(data?.error || 'Não foi possível redefinir o acesso.', true); return; }
    showMessage('Solicitação de redefinição enviada.');
  }

  async function deleteUser(id, email) {
    if (!window.confirm(`Excluir definitivamente ${email}? Esta ação remove o acesso do usuário.`)) return;
    showMessage('Excluindo usuário...');
    const { response, data } = await request('POST', { action: 'delete', id });
    if (!response.ok) { showMessage(data?.error || 'Não foi possível excluir o usuário.', true); return; }
    showMessage('Usuário excluído.');
    await loadUsers();
  }

  function sync() {
    const user = authUser();
    const role = user?.role || null;
    if (role === lastRole && (role !== 'admin' || document.getElementById(IDS.nav))) return;
    lastRole = role;
    ensureAdminEntry(user);
  }

  sync();
  setInterval(sync, 500);
})();
