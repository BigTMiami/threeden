// @ts-check
/**
 * security-section.js — Account settings → Security (Nov 18).
 *
 *   Passkeys            your passkeys (this phone, a password manager, a
 *                       security key, your phone for a computer) · Add a passkey
 *   Signing in on a new device
 *                       ○ A passkey (recommended)  ○ Codes from an authenticator app
 *                       ○ Just my password          (never texts: SIM swaps)
 *   Encryption          what's end-to-end encrypted · ☑ a passkey unlocks it
 *                       · ☑ tell people when I add a device
 *   Recovery key        twelve words, shown once, kept only by you
 *   Messages            disappearing messages for new chats · ☐ message words in notifications
 *   This device         ☐ Leave no trace (a shared computer)
 *   Password            (moved here from Profile)
 *
 * Settings live in member.security (js/state/security.js). The prototype
 * stands in for the browser's own passkey prompt with a short form.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { formatShortDate, toDateKey } from '../utils/dates.js';
import {
  mySecurity, setMySecurity, addPasskey, removePasskey, makeRecoveryKey,
  PASSKEY_KINDS, DISAPPEAR_LABELS,
} from '../state/security.js';
import { encryptionInfo } from '../state/e2ee.js';

// Shown once and kept only in memory: saving re-draws the page, so they
// live here until you're done with them (never saved).
let shownWords = null;   // the recovery key's twelve words, just made
let shownSecret = null;  // the authenticator key, just picked

const KIND_ICON = { device: 'phone', manager: 'lock', key: 'shield', phone: 'phone' };

function section(title, description, ...children) {
  return h('section', { class: 'settings-section security-section' },
    h('h2', { class: 'settings-section__title' }, title),
    description ? h('p', { class: 'settings-section__description' }, description) : null,
    ...children);
}

const check = (label, checked, onChange, hint) => h('label', { class: 'settings-choice security-check' },
  h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked) }),
  h('span', {}, h('strong', {}, label), hint ? h('span', { class: 'settings-field__hint' }, hint) : null));

const radios = (name, label, options, value, onChange) => h('fieldset', { class: 'settings-field settings-fieldset' },
  h('legend', { class: 'settings-field__label visually-hidden' }, label),
  h('div', { class: 'settings-choices', role: 'radiogroup', 'aria-label': label },
    options.map((o) => h('label', { class: 'settings-choice' },
      h('input', { type: 'radio', name, value: o.id, checked: value === o.id, onChange: () => onChange(o.id) }),
      h('span', {}, h('strong', {}, o.label), o.hint ? h('span', { class: 'settings-field__hint' }, o.hint) : null)))));

/** A made-up authenticator secret, shown once when you pick app codes. */
function authenticatorSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % 32]).join('').replace(/(.{4})/g, '$1 ').trim();
}

/**
 * @param {any} user
 * @param {() => void} redraw
 * @param {HTMLElement | null} [passwordSection]  the Password section, shown last
 */
export function renderSecuritySections(user, redraw, passwordSection = null) {
  const mine = mySecurity(user.id);
  const save = (patch, message) => { setMySecurity(patch, user.id); if (message) showToast(message); redraw(); };

  // ─── Passkeys ───
  const addSlot = h('div', { class: 'security-add' });
  const openAdd = () => {
    let kind = 'device';
    const name = h('input', { class: 'input', placeholder: 'A name, like “Work laptop”', 'aria-label': 'Passkey name', maxlength: 40 });
    replaceChildren(addSlot,
      h('form', {
        class: 'security-add__form',
        onSubmit: (e) => {
          e.preventDefault();
          const key = addPasskey(kind, name.value.trim());
          showToast(`Added “${key.name}”. Next time, sign in with it.`);
          redraw();
        },
      },
        radios('passkey-kind', 'Where to keep it', Object.entries(PASSKEY_KINDS).map(([id, k]) => ({ id, label: k.label, hint: k.hint })), kind, (v) => { kind = v; }),
        name,
        h('p', { class: 'settings-field__hint' }, 'Your browser asks you to confirm with your face, fingerprint, screen lock, or by touching the key. 3den never sees any of those: only a public key.'),
        h('div', { class: 'form-row' },
          h('button', { type: 'submit', class: 'button button--primary' }, 'Add passkey'),
          h('button', { type: 'button', class: 'button', onClick: () => replaceChildren(addSlot) }, 'Cancel'))));
    addSlot.querySelector('input')?.focus();
  };

  const passkeys = section('Passkeys',
    'Sign in with your face, fingerprint, screen lock, or a security key instead of a password. A fake site can’t steal a passkey.',
    mine.passkeys.length ? h('ul', { class: 'security-list' }, mine.passkeys.map((p) => h('li', { class: 'security-list__item' },
      icon(KIND_ICON[p.kind] ?? 'shield', 18),
      h('span', { class: 'security-list__text' }, h('strong', {}, p.name), h('span', { class: 'settings-field__hint' }, `${PASSKEY_KINDS[p.kind]?.label ?? 'Passkey'} · added ${formatShortDate(toDateKey(new Date(p.addedAt)))}`)),
      h('button', {
        type: 'button', class: 'link-button link-button--danger', 'aria-label': `Remove ${p.name}`,
        onClick: () => { removePasskey(p.id); showToast(`Removed “${p.name}”.`); redraw(); },
      }, 'Remove')))) : h('p', { class: 'security-empty' }, 'You don’t have a passkey yet.'),
    mine.passkeys.length === 1 ? h('p', { class: 'security-nudge' }, icon('info', 14), ' Add a second one (a security key, or a password manager), so losing this one doesn’t lock you out.') : null,
    h('div', { class: 'form-row' }, h('button', { type: 'button', class: 'button', onClick: openAdd }, icon('plus', 14), mine.passkeys.length ? ' Add another passkey' : ' Add a passkey')),
    addSlot);

  // ─── Two-step sign-in ───
  const secretSlot = h('div');
  const drawSecret = () => replaceChildren(secretSlot, shownSecret && mine.twoStep === 'app' ? h('div', { class: 'security-secret' },
    h('p', {}, 'Add 3den to your authenticator app with this key (or scan it on a real 3den), then type the 6-digit code it shows when you sign in.'),
    h('code', { class: 'security-secret__key' }, shownSecret)) : null);
  const twoStep = section('Signing in on a new device',
    'What 3den asks for when you sign in somewhere new.',
    radios('two-step', 'Signing in on a new device', [
      { id: 'passkey', label: 'A passkey (recommended)', hint: mine.passkeys.length ? 'One of the passkeys above.' : 'Picking this asks you to add one.' },
      { id: 'app', label: 'A code from an authenticator app', hint: 'Aegis, Ente Auth, Google Authenticator, or your password manager. Good; a passkey is better.' },
      { id: 'off', label: 'Just my password', hint: 'Anyone with your password can get in.' },
    ], mine.twoStep, (v) => {
      if (v === 'passkey' && !mine.passkeys.length) { openAdd(); return; }
      shownSecret = v === 'app' ? authenticatorSecret() : null;
      showToast({ app: 'Sign-ins on new devices will ask for a code.', passkey: 'Sign-ins on new devices will ask for a passkey.', off: 'Sign-ins on new devices need only your password.' }[v]);
      save({ twoStep: v });
    }),
    (drawSecret(), secretSlot),
    h('p', { class: 'settings-field__hint security-why' }, '3den never sends sign-in codes by text message: someone who takes over your phone number could use them.'));

  // ─── Encryption ───
  const info = encryptionInfo();
  const encryption = section('Encryption',
    'End-to-end encrypted means it’s locked on your device and unlocked only on the devices of the people it’s for. 3den’s servers keep only the locked copy.',
    h('ul', { class: 'security-facts' },
      h('li', {}, icon('lock', 14), ' Direct messages: always encrypted', h('span', { class: 'settings-field__hint' }, ` (${info.algorithm}, ${info.cipher})`)),
      h('li', {}, icon('lock', 14), ' Private groups: their posts, chat, calendar, and files, unless the group turns it off (its Security settings)'),
      h('li', {}, icon('globe', 14), ' Public pages, blogs, and public tabs: not encrypted, since anyone can read them')),
    check('Unlock encrypted messages and files with a passkey', mine.passkeyUnlock, (v) => save({ passkeyUnlock: v }, v ? 'Your passkey will unlock your messages on new devices.' : 'New devices will ask for your recovery key to open old messages.'),
      'Signing in and opening your history in one step.'),
    check('Tell me, and the people I talk to, when a device is added to my account', mine.newDeviceAlerts, (v) => save({ newDeviceAlerts: v }),
      'So nobody can quietly read along from a new device. To check a conversation, open it and press the lock to compare safety numbers.'));

  // ─── Recovery key ───
  const wordsBox = shownWords ? h('div', { class: 'security-words', role: 'group', 'aria-label': 'Your recovery key' },
    h('ol', { class: 'security-words__list' }, shownWords.map((w) => h('li', {}, w))),
    h('p', { class: 'settings-field__hint' }, 'Write these down and keep them somewhere safe, away from your phone. This is the only time they’re shown.'),
    h('div', { class: 'form-row' },
      h('button', { type: 'button', class: 'button', onClick: () => { navigator.clipboard?.writeText(shownWords.join(' ')).catch(() => {}); showToast('Copied. Paste them somewhere safe, then clear your clipboard.'); } }, 'Copy'),
      h('button', { type: 'button', class: 'button button--primary', onClick: () => { shownWords = null; redraw(); } }, 'I’ve written them down'))) : null;
  const recovery = section('Recovery key',
    'Twelve words that get you back into your account and your encrypted history if every device and passkey is lost. 3den can’t reset this for you: it never has a copy.',
    mine.recoveryKeyAt && !shownWords ? h('p', { class: 'security-status' }, icon('check', 14), ` Made ${formatShortDate(toDateKey(new Date(mine.recoveryKeyAt)))}. Making a new one replaces it.`) : null,
    !mine.recoveryKeyAt ? h('p', { class: 'security-empty' }, 'You haven’t made one yet.') : null,
    shownWords ? wordsBox : h('div', { class: 'form-row' }, h('button', {
      type: 'button', class: 'button',
      onClick: () => { shownWords = makeRecoveryKey(); redraw(); },
    }, mine.recoveryKeyAt ? 'Make a new recovery key' : 'Make a recovery key')));

  // ─── Messages ───
  const messages = section('Messages', null,
    h('label', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Disappearing messages in new direct conversations'),
      h('select', {
        class: 'input input--compact', 'aria-label': 'Disappearing messages in new direct conversations',
        onChange: (e) => save({ disappearing: e.target.value }, e.target.value === 'off' ? 'New conversations keep their messages.' : `Messages in new conversations will disappear ${DISAPPEAR_LABELS[e.target.value].toLowerCase()}.`),
      }, Object.entries(DISAPPEAR_LABELS).map(([id, label]) => h('option', { value: id, selected: mine.disappearing === id }, label))),
      h('span', { class: 'settings-field__hint' }, 'Either person can change it for a conversation.')),
    check('Show what messages say in notifications', mine.previews, (v) => save({ previews: v }),
      'Off: notifications just say “New message from Maya”, so the words never pass through Apple’s or Google’s notification servers or show on a locked screen.'));

  // ─── This device ───
  const device = section('This device', null,
    check('Leave no trace on this device', mine.leaveNoTrace, (v) => save({ leaveNoTrace: v }, v ? 'This device will keep nothing once you close 3den.' : 'This device will remember you again.'),
      'For a shared or borrowed computer: your messages, files, and keys stay in memory only, and everything is wiped when you close 3den or sign out. You sign in each time.'));

  return [passkeys, twoStep, encryption, recovery, messages, device, passwordSection].filter(Boolean);
}
