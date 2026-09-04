const ROLES = ['admin', 'juridico', 'usuario'];

function validRole(role) {
  return ROLES.includes(String(role || '').toLowerCase());
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase();
  return validRole(value) ? value : 'usuario';
}

function canRemoveAdmin({ targetRole, targetActive, activeAdminCount }) {
  const removesActiveAdmin = targetRole === 'admin' && targetActive === true;
  if (!removesActiveAdmin) return true;
  return Number(activeAdminCount) > 1;
}

function wouldRemoveActiveAdmin(target, next = {}) {
  if (!target || target.role !== 'admin' || target.active !== true) return false;
  const nextRole = next.role === undefined ? target.role : normalizeRole(next.role);
  const nextActive = next.active === undefined ? target.active : next.active === true;
  return nextRole !== 'admin' || nextActive !== true;
}

module.exports = {
  ROLES,
  validRole,
  normalizeRole,
  canRemoveAdmin,
  wouldRemoveActiveAdmin,
};
