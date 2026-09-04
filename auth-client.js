(() => {
  const api = {
    user: null,
    busy: false,
  };

  const setupToken = new URLSearchParams(window.location.search).get('setup') || '';
  const byId = (id) => document.getElementById(id);
  const loginScreen = () => byId('login');
  const appScreen = () => byId('app');
  const setupScreen = () => byId('setup');
  const logoutButton = () => byId('logout');
  const setupButton = () => byId('sBtn');

  function loginInputs() {
    const root = loginScreen() || document;
    const email = root.querySelector('input[type="email"], input[name="email"], input[id*="email" i]');
    const password = root.querySelector('input[type="password"], input[name="password"], input[id*="senha" i]');
    return { email, password };
  }

  function setupInputs() {
    return {
      name: byId('sName'),
      email: byId('sEmail'),
      password: byId('sPass'),
    };
  }

  function errorBox() {
    const root = loginScreen();
    if (!root) return null;
    return root.querySelector('[role="alert"], .msg.err, .msg.error, .alert-danger, .error');
  }

  function showError(message) {
    const box = errorBox();
    if (box) {
      box.textContent = message || '';
      box.classList.toggle('hidden', !message);
      box.style.display = message ? '' : 'none';
      return;
    }
    if (!message) return;
    const root = loginScreen();
    if (!root) return;
    const div = document.createElement('div');
    div.setAttribute('role', 'alert');
    div.className = 'msg err';
    div.textContent = message;
    const form = root.querySelector('form');
    (form || root).prepend(div);
  }

  function showSetupMessage(message, isError = true) {
    const box = byId('setupMsg');
    if (!box) return;
    box.innerHTML = '';
    if (!message) return;
    const div = document.createElement('div');
    div.className = isError ? 'msg err' : 'msg ok';
    div.textContent = message;
    box.appendChild(div);
  }

  function setGlobalUser(user) {
    api.user = user || null;
    try {
      if (typeof U !== 'undefined') U = user || null;
    } catch (_) {}
  }

  function releaseAuthGate() {
    document.getElementById('central-auth-gate')?.remove();
  }

  function forceLoggedOut(message = '') {
    setGlobalUser(null);
    const setup = setupScreen();
    const login = loginScreen();
    const app = appScreen();
    if (setup) setup.classList.add('hidden');
    if (app) app.classList.add('hidden');
    if (login) login.classList.remove('hidden');
    showError(message);
  }

  function forceSetup(emailValue) {
    setGlobalUser(null);
    releaseAuthGate();
    const setup = setupScreen();
    const login = loginScreen();
    const app = appScreen();
    if (login) login.classList.add('hidden');
    if (app) app.classList.add('hidden');
    if (setup) setup.classList.remove('hidden');

    const { email } = setupInputs();
    if (email) {
      email.value = emailValue || '';
      email.readOnly = true;
    }
    showSetupMessage('');
  }

  function forceLoggedIn(user) {
    setGlobalUser(user);
    releaseAuthGate();
    const setup = setupScreen();
    const login = loginScreen();
    const app = appScreen();
    if (setup) setup.classList.add('hidden');
    if (login) login.classList.add('hidden');
    if (app) app.classList.remove('hidden');

    try {
      if (typeof topUser !== 'undefined' && topUser) {
        topUser.textContent = user.name || user.email || 'Usuário';
      }
    } catch (_) {}

    try { if (typeof renderAll === 'function') renderAll(); } catch (_) {}
    try { if (typeof go === 'function') go('novo'); } catch (_) {}
    showError('');
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    let data = null;
    try { data = await response.json(); } catch (_) {}
    return { response, data };
  }

  async function loadSession() {
    forceLoggedOut();
    try {
      const { response, data } = await request('/api/session', { method: 'GET' });
      if (response.ok && data?.user?.active !== false) {
        forceLoggedIn(data.user);
        return data.user;
      }

      if (setupToken) {
        const bootstrap = await request(`/api/bootstrap?token=${encodeURIComponent(setupToken)}`, { method: 'GET' });
        if (bootstrap.response.ok && bootstrap.data?.available && bootstrap.data?.email) {
          forceSetup(bootstrap.data.email);
          return null;
        }
      }

      forceLoggedOut();
      return null;
    } catch (error) {
      console.error('[AUTH SESSION]', error);
      forceLoggedOut('Não foi possível validar sua sessão. Tente novamente.');
      return null;
    }
  }

  async function setupFirstAdmin() {
    if (api.busy) return;
    const { name, email, password } = setupInputs();
    const nameValue = String(name?.value || '').trim();
    const emailValue = String(email?.value || '').trim().toLowerCase();
    const passwordValue = String(password?.value || '');

    if (nameValue.length < 2 || !emailValue || passwordValue.length < 8) {
      showSetupMessage('Preencha seu nome e use uma senha com pelo menos 8 caracteres.');
      return;
    }

    api.busy = true;
    showSetupMessage('');
    try {
      const { response, data } = await request('/api/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          token: setupToken,
          name: nameValue,
          email: emailValue,
          password: passwordValue,
        }),
      });

      if (!response.ok) {
        showSetupMessage(data?.error || 'Não foi possível criar o primeiro administrador.');
        return;
      }

      if (password) password.value = '';
      window.history.replaceState(null, '', window.location.pathname);

      if (data?.user) {
        forceLoggedIn(data.user);
        return;
      }

      if (data?.requiresConfirmation) {
        forceLoggedOut('Conta administrativa criada. Confirme seu e-mail e depois entre com a senha escolhida.');
        return;
      }

      forceLoggedOut('Conta administrativa criada. Entre com a senha escolhida.');
    } catch (error) {
      console.error('[AUTH BOOTSTRAP]', error);
      showSetupMessage('Não foi possível concluir o primeiro acesso. Tente novamente.');
    } finally {
      api.busy = false;
    }
  }

  async function loginWithPassword() {
    if (api.busy) return;
    const { email, password } = loginInputs();
    const emailValue = String(email?.value || '').trim().toLowerCase();
    const passwordValue = String(password?.value || '');
    if (!emailValue || !passwordValue) {
      showError('Informe e-mail e senha.');
      return;
    }

    api.busy = true;
    showError('');
    try {
      const { response, data } = await request('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email: emailValue, password: passwordValue }),
      });
      if (!response.ok || !data?.user) {
        forceLoggedOut(data?.error || 'E-mail ou senha inválidos.');
        return;
      }
      if (password) password.value = '';
      forceLoggedIn(data.user);
    } catch (error) {
      console.error('[AUTH LOGIN]', error);
      forceLoggedOut('Não foi possível entrar. Tente novamente.');
    } finally {
      api.busy = false;
    }
  }

  async function logout() {
    if (api.busy) return;
    api.busy = true;
    try {
      await request('/api/logout', { method: 'POST', body: '{}' });
    } catch (error) {
      console.error('[AUTH LOGOUT]', error);
    } finally {
      api.busy = false;
      forceLoggedOut();
      const { password } = loginInputs();
      if (password) password.value = '';
      window.location.reload();
    }
  }

  function isLoginSubmit(target) {
    const root = loginScreen();
    if (!root || !target || !root.contains(target)) return false;
    if (target.tagName === 'FORM') return true;
    const button = target.closest?.('button, input[type="submit"]');
    if (!button || !root.contains(button)) return false;
    const text = String(button.textContent || button.value || '').trim().toLowerCase();
    return button.type === 'submit' || text === 'entrar' || text.includes('entrar');
  }

  function isSetupSubmit(target) {
    const root = setupScreen();
    if (!root || !target || !root.contains(target)) return false;
    if (target.tagName === 'FORM') return true;
    const button = target.closest?.('button, input[type="submit"]');
    return Boolean(button && root.contains(button) && (button === setupButton() || button.type === 'submit'));
  }

  document.addEventListener('submit', (event) => {
    if (isSetupSubmit(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setupFirstAdmin();
      return;
    }
    if (!isLoginSubmit(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    loginWithPassword();
  }, true);

  document.addEventListener('click', (event) => {
    const logoutEl = logoutButton();
    if (logoutEl && (event.target === logoutEl || logoutEl.contains(event.target))) {
      event.preventDefault();
      event.stopImmediatePropagation();
      logout();
      return;
    }
    if (isSetupSubmit(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setupFirstAdmin();
      return;
    }
    if (!isLoginSubmit(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    loginWithPassword();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const setup = setupScreen();
    if (setup && setup.contains(event.target) && event.target.matches('input')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setupFirstAdmin();
      return;
    }
    const root = loginScreen();
    if (!root || !root.contains(event.target)) return;
    if (!event.target.matches('input[type="email"], input[type="password"], input[name="email"], input[name="password"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    loginWithPassword();
  }, true);

  window.EmbrascaCentralAuth = {
    get user() { return api.user; },
    login: loginWithPassword,
    setupFirstAdmin,
    logout,
    refresh: loadSession,
  };

  loadSession();
})();
