(function (root, factory) {
  const api = factory(root || {});

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const ACCESS = Object.freeze({
    usuario: Object.freeze(['dashboard', 'novo', 'documentos']),
    juridico: Object.freeze(['dashboard', 'documentos', 'revisoes']),
    admin: Object.freeze(['dashboard', 'novo', 'documentos', 'revisoes', 'modelos', 'config']),
  });

  function normalizeRole(role) {
    const value = String(role || '').trim().toLowerCase();
    if (value === 'jurídico') return 'juridico';
    if (value === 'administrador') return 'admin';
    if (value === 'usuário') return 'usuario';
    return value;
  }

  function canAccess(role, screen) {
    const normalizedRole = normalizeRole(role);
    return Boolean(ACCESS[normalizedRole]?.includes(String(screen || '')));
  }

  function resolveTarget(role, requestedScreen) {
    return canAccess(role, requestedScreen) ? requestedScreen : 'dashboard';
  }

  function currentRole() {
    const centralRole = root.EmbrascaCentralAuth?.user?.role;
    if (centralRole) return normalizeRole(centralRole);

    try {
      if (typeof U !== 'undefined' && U?.role) {
        return normalizeRole(U.role);
      }
    } catch (_) {}

    return '';
  }

  function setHidden(element, hidden) {
    if (!element) return;
    element.classList.toggle('hidden', hidden);
    element.setAttribute('aria-hidden', hidden ? 'true' : 'false');

    if (hidden) {
      element.style?.setProperty('display', 'none', 'important');
    } else {
      element.style?.removeProperty('display');
    }
  }

  function applyNavigation(role = currentRole()) {
    const normalizedRole = normalizeRole(role);
    if (!ACCESS[normalizedRole] || !root.document) return;

    root.document.querySelectorAll('#nav [data-s]').forEach((item) => {
      setHidden(item, !canAccess(normalizedRole, item.dataset.s));
    });

    root.document.querySelectorAll('[data-go]').forEach((item) => {
      setHidden(item, !canAccess(normalizedRole, item.dataset.go));
    });

    const adminEntry = root.document.getElementById('adminUsersNav');
    if (adminEntry) setHidden(adminEntry, normalizedRole !== 'admin');
  }

  function installNavigationGuard() {
    if (!root.document || typeof root.go !== 'function') return false;
    if (root.go.__embrascaPermissionsGuard) return true;

    const originalGo = root.go;

    function guardedGo(requestedScreen) {
      const role = currentRole();
      applyNavigation(role);

      if (!ACCESS[role]) {
        return originalGo(requestedScreen);
      }

      const target = resolveTarget(role, requestedScreen);
      return originalGo(target);
    }

    Object.defineProperty(guardedGo, '__embrascaPermissionsGuard', {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    root.go = guardedGo;
    try { go = guardedGo; } catch (_) {}
    return true;
  }

  function install() {
    if (!root.document) return;
    installNavigationGuard();
    applyNavigation();
  }

  const api = Object.freeze({
    ACCESS,
    normalizeRole,
    canAccess,
    resolveTarget,
    currentRole,
    applyNavigation,
    installNavigationGuard,
  });

  root.EmbrascaPermissions = api;
  install();

  return api;
});
