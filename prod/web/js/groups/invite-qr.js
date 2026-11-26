// @ts-check
/**
 * invite-qr.js — "QR code" next to a group's invite link: a big code to
 * show on a phone or print for a meeting, so people in the room can join
 * by pointing their camera at it.
 *
 *   ┌───────────────────────────────┐
 *   │  Join Juniper Tenants Union   │
 *   │        ▓▓ ▓▓▓  ▓ ▓▓           │
 *   │        ▓  ▓ ▓▓▓  ▓            │  ← js/ui/qr-code.js
 *   │  Point a phone's camera here. │
 *   │  [Download] [Print]  [Close]  │
 *   └───────────────────────────────┘
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { qrSvg, qrMatrix } from '../ui/qr-code.js';

let open = null;

export function openInviteQr(space, link) {
  open?.remove();
  const previous = /** @type {HTMLElement | null} */ (document.activeElement);
  const close = () => { open?.remove(); open = null; previous?.focus?.(); };
  const code = qrSvg(link, { size: 260, label: `QR code to join ${space.name}` });

  const download = () => {
    // A PNG at 12 px per module, with the quiet zone.
    const { size, modules } = qrMatrix(link);
    const scale = 12, total = (size + 8) * scale;
    const canvas = document.createElement('canvas');
    canvas.width = total; canvas.height = total;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, total, total);
    ctx.fillStyle = '#000';
    modules.forEach((row, y) => row.forEach((dark, x) => { if (dark) ctx.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale); }));
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${space.name.replace(/[^\w -]/g, '').trim() || 'group'} invite QR.png`;
    a.click();
  };

  const print = () => {
    const win = window.open('', '_blank', 'width=600,height=700');
    if (!win) return;
    win.document.title = `Join ${space.name}`;
    const body = win.document.body;
    body.style.cssText = 'font-family: system-ui, sans-serif; text-align: center; padding: 40px;';
    const heading = win.document.createElement('h1');
    heading.textContent = `Join ${space.name}`;
    const note = win.document.createElement('p');
    note.textContent = 'Point your phone’s camera at the code.';
    body.append(heading, qrSvg(link, { size: 420 }), note);
    win.focus();
    win.print();
  };

  const dialog = h('div', { class: 'qr-backdrop', onClick: (e) => { if (e.target === dialog) close(); } },
    h('div', { class: 'qr-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'qr-title', onKeydown: (e) => { if (e.key === 'Escape') close(); } },
      h('h2', { class: 'qr-dialog__title', id: 'qr-title' }, `Join ${space.name}`),
      h('div', { class: 'qr-dialog__code' }, code),
      h('p', { class: 'qr-dialog__note' }, 'Point a phone’s camera here. Anyone who scans it can join.'),
      h('div', { class: 'form-row qr-dialog__actions' },
        h('button', { type: 'button', class: 'button button--small', onClick: download }, icon('download', 13), ' Download'),
        h('button', { type: 'button', class: 'button button--small', onClick: print }, 'Print'),
        h('button', { type: 'button', class: 'button button--small button--primary qr-dialog__close', onClick: close }, 'Close'))));
  document.body.append(dialog);
  open = dialog;
  /** @type {HTMLElement | null} */ (dialog.querySelector('.qr-dialog__close'))?.focus();
}
