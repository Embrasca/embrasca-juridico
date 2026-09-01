(() => {
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Falha na autenticação.');
    return data;
  };

  let centralConfigured = false;
  let centralUsers = [];

  const syncPublicUser = (user) => {
    if (!user) return;
    const i = S.users.findIndex(z => z.id === user.id || z.email === user.email);
    const clean = { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active };
    if (i >= 0) S.users[i] = { ...S.users[i], ...clean };
    else S.users.push(clean);
    U = clean;
  };

  const showAuth = (hasUsers) => {
    setup.classList.toggle('hidden', hasUsers);
    login.classList.toggle('hidden', !hasUsers);
    app.classList.add('hidden');
  };

  const loadCentralUsers = async () => {
    if (!U || U.role !== 'admin') return [];
    const data = await api('/api/users');
    centralUsers = data.users || [];
    return centralUsers;
  };

  authView = function () {
    if (!centralConfigured) return showAuth(S.users.length > 0);
    showAuth(true);
  };

  doSetup = async function () {
    const n = sName.value.trim(), e = sEmail.value.trim().toLowerCase(), p = sPass.value;
    setupMsg.innerHTML = '';
    try {
      const data = await api('/api/setup', { method: 'POST', body: JSON.stringify({ name: n, email: e, password: p }) });
      syncPublicUser(data.user);
      save();
      appView();
    } catch (error) {
      setupMsg.innerHTML = `<div class="msg err">${h(error.message)}</div>`;
    }
  };

  doLogin = async function () {
    const e = lEmail.value.trim().toLowerCase(), p = lPass.value;
    loginMsg.innerHTML = '';
    try {
      if (!centralConfigured) {
        const hp = await hash(p), u = S.users.find(z => z.email === e && z.passwordHash === hp && z.active);
        if (!u) throw new Error('E-mail ou senha inválidos.');
        U = u; appView(); return;
      }
      const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: e, password: p }) });
      syncPublicUser(data.user);
      save();
      appView();
    } catch (error) {
      loginMsg.innerHTML = `<div class="msg err">${h(error.message)}</div>`;
    }
  };

  users = async function () {
    newUserPanel.classList.toggle('hidden', !admin());
    let list = centralConfigured && admin() ? await loadCentralUsers().catch(() => []) : S.users;
    userList.innerHTML = list.map(z => `<div class="userrow"><b>${h(z.name)}</b><span>${h(z.email)}</span><span>${role(z.role)}</span><span>${z.active?'Ativo':'Inativo'}${admin()&&z.id!==U.id?` <button class="btn" data-usr="${z.id}">${z.active?'Desativar':'Ativar'}</button>`:''}</span></div>`).join('');
    userList.querySelectorAll('[data-usr]').forEach(b => b.onclick = async () => {
      const z = list.find(x => x.id === b.dataset.usr);
      if (!z) return;
      if (!centralConfigured) { z.active = !z.active; save(); users(); return; }
      try {
        await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: z.id, active: !z.active }) });
        await users();
      } catch (error) { toast(error.message); }
    });
  };

  createUser = async function () {
    const n = uName.value.trim(), e = uEmail.value.trim().toLowerCase(), p = uPass.value, r = uRole.value;
    if (!admin()) return;
    try {
      if (!centralConfigured) {
        if (!n || !e || p.length < 6) return toast('Preencha os dados e use senha com 6+ caracteres');
        if (S.users.some(z => z.email === e)) return toast('E-mail já cadastrado');
        S.users.push({ id: id(), name: n, email: e, passwordHash: await hash(p), role: r, active: true });
        save();
      } else {
        await api('/api/users', { method: 'POST', body: JSON.stringify({ name: n, email: e, password: p, role: r }) });
      }
      uName.value = uEmail.value = uPass.value = '';
      await users();
      toast('Usuário criado');
    } catch (error) { toast(error.message); }
  };

  sBtn.onclick = () => doSetup();
  lBtn.onclick = () => doLogin();
  uCreate.onclick = () => createUser();
  logout.onclick = async () => {
    if (centralConfigured) await api('/api/logout', { method: 'POST', body: '{}' }).catch(() => {});
    U = null;
    showAuth(true);
  };

  (async () => {
    try {
      const state = await api('/api/session');
      centralConfigured = Boolean(state.configured);
      if (!centralConfigured) return;
      if (state.user) {
        syncPublicUser(state.user);
        save();
        appView();
      } else {
        showAuth(Boolean(state.hasUsers));
      }
    } catch {
      centralConfigured = false;
    }
  })();
})();