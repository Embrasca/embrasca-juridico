(() => {
  const api = {
    user: null,
    busy: false,
  };

  const byId = (id) => document.getElementById(id);
  const loginScreen = () => byId('login');
  const appScreen = () => byId('app');
  const setupScreen = () => byId('setup');
  const logoutButton = () => byId('logout');

  function loginInputs() {
    const root = loginScreen() || document;
    const email = root.querySelector('input[type="email"], input[name="email"], input[id*="email" i]');
    const password = root.querySelector('input[type="password"], input[name="password"], input[id*="senha" i]');
    return { email, password };
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
      forceLoggedOut();
      return null;
    } catch (error) {
      console.error('[AUTH SESSION]', error);
      forceLoggedOut('Não foi possível validar sua sessão. Tente novamente.');
      return null;
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

  document.addEventListener('submit', (event) => {
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
    if (!isLoginSubmit(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    loginWithPassword();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
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
    logout,
    refresh: loadSession,
  };

  loadSession();
})();
