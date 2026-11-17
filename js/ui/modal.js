// @ts-check
/**
 * modal.js — a pop-up over the page: it dims what's behind it and takes the
 * focus until it's closed (a native <dialog>, so Tab stays inside and the
 * page behind can't be clicked).
 *
 *   const m = openModal(content, { label: 'New post', onDismiss })
 *   m.close()
 *
 * Esc or a click on the dimmed area calls `onDismiss` (the content decides
 * what closing means: the post composer keeps a draft). Without onDismiss,
 * those just close it. The content brings its own ×.
 */

import { h } from './dom.js';

export function openModal(content, { label = '', onDismiss = null, className = '' } = {}) {
  const dialog = h('dialog', { class: `modal ${className}`, 'aria-label': label });
  const box = h('div', { class: 'modal__box' }, content);
  dialog.append(box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    document.documentElement.classList.remove('has-modal');
  };
  const dismiss = () => (onDismiss ? onDismiss() : close());
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); dismiss(); });
  // A click on the dimmed area (the dialog itself, outside the box) dismisses it.
  dialog.addEventListener('mousedown', (event) => { if (event.target === dialog) dismiss(); });
  document.body.append(dialog);
  document.documentElement.classList.add('has-modal');
  try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
  return { element: dialog, close };
}
