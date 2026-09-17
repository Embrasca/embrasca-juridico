(() => {
  const root = document.documentElement;

  // O sistema Jurídico utiliza exclusivamente o tema claro.
  root.dataset.theme = 'light';
  root.style.colorScheme = 'light';

  // Remove qualquer preferência antiga de tema salva no navegador.
  try {
    localStorage.removeItem('embrascaJuridicoTheme');
  } catch (_) {}

  // Mantém somente a correção estrutural da navegação lateral.
  function initializeNavigation() {
    const nav = document.getElementById('nav');

    if (nav) {
      nav.classList.add('premium-nav');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNavigation, {
      once: true,
    });
  } else {
    initializeNavigation();
  }
})();