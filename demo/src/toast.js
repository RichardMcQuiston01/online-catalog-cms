/**
 * Simple accessible toast notification.
 * The toast is visually rendered AND announced in the #status-region aria-live
 * region that all pages include.
 */

/** @param {string} message @param {'success'|'error'} [type] */
export function showToast(message, type = 'success') {
  const statusRegion = document.getElementById('status-region');
  if (statusRegion) {
    statusRegion.textContent = message;
    // Clear after a tick so repeat identical messages still trigger SR announcement
    setTimeout(() => {
      statusRegion.textContent = '';
    }, 100);
  }

  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast--hidden');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
