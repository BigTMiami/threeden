/**
 * safety-number.js — check that a direct conversation is really private.
 *
 *   🔒 End-to-end encrypted
 *   Only you and Maya can read these messages. Not 3den, not anyone else.
 *
 *   Safety number with Maya
 *     12345 67890 12345 67890
 *     12345 67890 12345 67890
 *     12345 67890 12345 67890
 *   Compare it with Maya in person or on a call. If it matches, nobody is in between.
 *   [Mark as verified]                                  [Close]
 *
 * openSafetyNumber(conversation, otherMember)
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getCurrentUser } from '../state/store.js';
import { safetyNumber, verificationOf, setVerified, encryptionInfo } from '../state/e2ee.js';

export async function openSafetyNumber(conversation, other) {
  const me = getCurrentUser();
  const first = other.name.split(' ')[0];
  const previousFocus = document.activeElement;
  const number = await safetyNumber(me.id, other.id);
  const state = verificationOf(conversation, other);
  const info = encryptionInfo();

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); previousFocus?.focus?.(); };
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }

  const groups = number ? number.split(' ') : [];
  const overlay = h('div', { class: 'sub-viewer safety', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'End-to-end encryption' },
    h('div', { class: 'sub-viewer__panel safety__panel' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, icon('lock', 18), ' End-to-end encrypted'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: close }, icon('close', 18))),
      h('p', {}, `Only you and ${first} can read these messages, photos, and attachments. They’re locked on your device before they’re sent, and 3den only ever stores the locked version.`),
      state === 'changed' ? h('p', { class: 'safety__warning', role: 'alert' }, `${first}’s safety number has changed since you verified it. That usually means a new phone, but check with them before sharing anything sensitive.`) : null,
      h('h3', { class: 'safety__heading' }, `Safety number with ${first}`),
      number
        ? h('div', { class: 'safety__number', 'aria-label': `Safety number: ${number}` }, groups.map((g) => h('span', {}, g)))
        : h('p', {}, 'Keys are still being set up. Try again in a moment.'),
      h('p', { class: 'safety__hint' }, `Compare it with ${first} in person or on a call. If both of you see the same numbers, nobody is listening in between.`),
      h('p', { class: 'safety__tech' }, `${info.algorithm} key agreement, ${info.cipher}. Your private key never leaves this device.`),
      h('div', { class: 'form-row safety__actions' },
        state === 'verified'
          ? h('button', { type: 'button', class: 'button', onClick: () => { setVerified(conversation.id, other.id, false); close(); } }, 'Clear verification')
          : h('button', { type: 'button', class: 'button button--primary', disabled: !number, onClick: () => { setVerified(conversation.id, other.id, true); close(); } }, icon('check', 14), ' Mark as verified'),
        h('button', { type: 'button', class: 'button button--quiet', onClick: close }, 'Close'))));
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  overlay.querySelector('.button--primary, .button')?.focus();
}
