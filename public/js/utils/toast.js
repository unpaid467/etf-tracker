let _timeout = null;
const DURATION_MS = 3500;

/**
 * Display a temporary toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'} [type='info']
 */
export function showToast(message, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;

  clearTimeout(_timeout);
  el.textContent = message;
  el.className = `toast ${type}`;

  _timeout = setTimeout(() => {
    el.classList.add('hidden');
  }, DURATION_MS);
}
