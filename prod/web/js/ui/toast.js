/**
 * toast.js — small, temporary messages at the bottom of the screen.
 *
 * The page runs in a sandbox where alert() and confirm() are blocked, so
 * we use toasts instead. A toast can carry one action button, which is how
 * "Undo" works after removing a module.
 *
 *   showToast('Module removed', { actionLabel: 'Undo', onAction: restore });
 */

import { h } from './dom.js';

const TOAST_DURATION_MS = 5000;

let toastRegion = null;

/** Create the (single) live region that holds toasts, on first use. */
function getToastRegion() {
  if (!toastRegion) {
    toastRegion = h('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  return toastRegion;
}

/**
 * @param {string} message
 * @param {{ actionLabel?: string, onAction?: () => void, duration?: number }} [options]
 */
export function showToast(message, { actionLabel, onAction, duration = TOAST_DURATION_MS } = {}) {
  const region = getToastRegion();

  const toast = h('div', { class: 'toast' }, h('span', {}, message));

  const dismiss = () => toast.remove();

  if (actionLabel && onAction) {
    toast.append(
      h('button', {
        type: 'button',
        class: 'toast__action',
        onClick: () => {
          onAction();
          dismiss();
        },
      }, actionLabel),
    );
  }

  region.append(toast);
  setTimeout(dismiss, duration);
}
