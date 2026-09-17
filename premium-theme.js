(() => {
  const STORAGE_KEY = 'embrascaJuridicoTheme';
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function storedTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : '';
    } catch (_) {
      return '';
    }
  }

  function preferredTheme() {
    return storedTheme() || (media?.matches ? 'dark' : 'light');
  }

  function persist(theme) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
  }

  function updateToggle(theme) {
    const button = document.getElementById('embrasca-theme-toggle');
    if (!button) return;
    const icon = button.querySelector('.theme-icon');
    const label = button.querySelector('.theme-label');
    const next = theme === 'dark' ? 'light' : 'dark';
    if (icon) icon.textContent = theme === 'dark' ? '☾' : '☀';
    if (label) label.textContent = theme === 'dark' ? 'Tema escuro' : 'Tema claro';
    button.setAttribute('aria-label', `Ativar tema ${next === 'dark' ? 'escuro' : 'claro'}`);
    button.setAttribute('title', `Ativar tema ${next === 'dark' ? 'escuro' : 'claro'}`);
    button.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }

  function applyTheme(theme, shouldPersist = false) {
    const next = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = next;
    root.style.colorScheme = next;
    if (shouldPersist) persist(next);
    updateToggle(next);
    return next;
  }

  function createToggle() {
    if (document.getElementById('embrasca-theme-toggle')) return;

    const shell = document.createElement('div');
    shell.className = 'premium-sidebar-shell';

    const button = document.createElement('button');
    button.id = 'embrasca-theme-toggle';
    button.type = 'button';
    button.innerHTML = '<span class="theme-icon" aria-hidden="true"></span><span class="theme-label"></span>';
    button.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
    });

    shell.appendChild(button);
    const nav = document.getElementById('nav');
    if (nav) {
      nav.classList.add('premium-nav');
      nav.appendChild(shell);
    } else {
      shell.classList.add('is-floating');
      document.body.appendChild(shell);
    }
    updateToggle(root.dataset.theme || preferredTheme());
  }

  const initial = applyTheme(preferredTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createToggle, { once: true });
  } else {
    createToggle();
  }

  if (media?.addEventListener) {
    media.addEventListener('change', (event) => {
      if (!storedTheme()) applyTheme(event.matches ? 'dark' : 'light');
    });
  }

  window.EmbrascaTheme = {
    get current() { return root.dataset.theme || initial; },
    set(theme) { return applyTheme(theme, true); },
  };
})();
