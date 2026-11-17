// @ts-check
/**
 * guest.js — signing up without losing your place.
 *
 * Someone who isn't signed in can look at public things (a public event, a
 * group's public tabs, a blog, an invite link). When they press something
 * that needs an account (RSVP, Join, Add friend, Like…), the button calls:
 *
 *   if (requireAccount({
 *     reason: 'to RSVP to “Street fair”',          ← shown under the sheet's title
 *     action: 'RSVP',                              ← the button says "Create account and RSVP"
 *     arrival: { source: 'event', itemId, spaceId },  ← how they found 3den (onboarding)
 *     then: (memberId) => { … do it as memberId … },
 *     quick: true,                                 ← (optional) name and phone only, as for an event
 *   })) return;
 *
 * For a guest it opens a short sheet, makes the account, runs `then`, and
 * redraws the page they were on. For anyone signed in it returns false and
 * does nothing, so the button carries on as usual.
 *
 * Two kinds of sheet:
 *   - Answering an event (arrival.source 'event'): just two boxes, a name
 *     and "Phone number or email" (it tells which you typed). A phone
 *     number can opt in to text notifications. That makes a quick account
 *     (createQuickAccount); groups and blogs ask them to finish it later.
 *   - Joining from an invite link (quick: true) uses the same short sheet;
 *     the group opens right away, and finishing the account can wait.
 *   - Everything else (Add friend, Like…): a full account with name,
 *     username, email and password.
 * Both have "Already on 3den? Sign in".
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { isGuestBrowsing } from '../state/store.js';
import {
  getAccounts, findAccountByLogin, usernameProblem, emailProblem, suggestUsername, createAccount, signIn,
  contactKind, createQuickAccount,
} from '../state/accounts.js';
import { hashPassword, checkPassword, passwordProblem, MIN_PASSWORD_LENGTH } from '../account/password.js';

let openSheet = null; // the sheet showing now, if any

export function requireAccount({ reason, action = 'continue', arrival, then, quick = false }) {
  if (!isGuestBrowsing()) return false;
  showSignUpSheet({ reason, action, arrival, then, quick });
  return true;
}

/** After signing up or in: do what they asked for, then redraw the page they're on. */
function finish(memberId, then, message) {
  closeSheet();
  then?.(memberId);
  // Redraw the current page as the new account.
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  if (message) showToast(message);
}

function closeSheet() {
  openSheet?.remove();
  openSheet = null;
}

function showSignUpSheet(intent) {
  closeSheet();
  // Answering an event or following an invite link: just a name and a phone
  // number (or email). The rest of the account can wait.
  const quick = intent.arrival?.source === 'event' || Boolean(intent.quick);
  const body = h('div', { class: 'signup-sheet__body' });
  const sheet = h('div', { class: 'signup-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'signup-sheet-title' },
    h('div', { class: 'signup-sheet__panel' },
      h('button', { type: 'button', class: 'icon-button signup-sheet__close', 'aria-label': 'Close', onClick: closeSheet }, icon('close', 18)),
      body));
  sheet.addEventListener('pointerdown', (event) => { if (event.target === sheet) closeSheet(); });
  sheet.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });

  function showSignUp() {
    replaceChildren(body, h('h2', { id: 'signup-sheet-title', class: 'signup-sheet__title' }, 'Create your free 3den account'),
      h('p', { class: 'signup-sheet__reason' }, intent.reason),
      signUpForm(intent),
      h('p', { class: 'signup-sheet__switch' }, 'Already on 3den? ',
        h('button', { type: 'button', class: 'link-button', onClick: showSignIn }, 'Sign in')));
  }

  function showSignIn(prefill = '') {
    replaceChildren(body, h('h2', { id: 'signup-sheet-title', class: 'signup-sheet__title' }, 'Sign in to 3den'),
      h('p', { class: 'signup-sheet__reason' }, intent.reason),
      signInForm(intent, typeof prefill === 'string' ? prefill : ''),
      h('p', { class: 'signup-sheet__switch' }, 'New here? ',
        h('button', { type: 'button', class: 'link-button', onClick: quick ? showQuick : showSignUp }, quick ? (intent.action === 'RSVP' ? 'Answer with your name' : 'Just use my name') : 'Create an account')));
  }

  function showQuick() {
    replaceChildren(body, h('h2', { id: 'signup-sheet-title', class: 'signup-sheet__title' }, intent.action === 'join' ? 'Who’s joining?' : 'Who’s answering?'),
      h('p', { class: 'signup-sheet__reason' }, intent.reason),
      quickForm(intent, showSignIn),
      h('p', { class: 'signup-sheet__switch' }, 'Already on 3den? ',
        h('button', { type: 'button', class: 'link-button', onClick: showSignIn }, 'Sign in')));
  }

  if (quick) showQuick();
  else showSignUp();
  document.body.append(sheet);
  openSheet = sheet;
  requestAnimationFrame(() => sheet.querySelector('input')?.focus());
}

function field(label, input, hint = null) {
  return h('label', { class: 'signup-sheet__field' }, h('span', { class: 'signup-sheet__label' }, label), input, hint);
}

/** Answering an event, or joining from a link: a name and a phone number or email, nothing more. */
function quickForm(intent, showSignIn) {
  const forEvent = intent.arrival?.source === 'event';
  const why = forEvent ? 'So you can get back in, and hear about changes to the event.' : 'So you can get back in, and hear from the group.';
  const name = h('input', { type: 'text', class: 'input', autocomplete: 'name', 'aria-label': 'Your name' });
  const contact = h('input', { type: 'text', class: 'input', autocomplete: 'email', inputmode: 'email', 'aria-label': 'Phone number or email' });
  const contactHint = h('span', { class: 'signup-sheet__hint' }, why);
  const textOptIn = h('input', { type: 'checkbox' });
  const textRow = h('label', { class: 'signup-sheet__check', hidden: true }, textOptIn, h('span', {}, forEvent ? 'Text me updates (changes to this event, and invitations)' : 'Text me the group’s announcements and events'));
  const error = h('p', { class: 'form-error', role: 'alert' });

  // Tell them what we think they typed, and offer texts for a phone number.
  contact.addEventListener('input', () => {
    const kind = contactKind(contact.value);
    contactHint.textContent = {
      phone: '📱 Looks like a phone number.',
      email: '✉️ Looks like an email address.',
    }[kind] ?? why;
    textRow.hidden = kind !== 'phone';
  });

  return h('form', {
    class: 'signup-sheet__form',
    onSubmit: (event) => {
      event.preventDefault();
      if (!name.value.trim()) { error.textContent = 'Add your name.'; name.focus(); return; }
      const kind = contactKind(contact.value);
      if (!kind) { error.textContent = 'Type a phone number or an email address.'; contact.focus(); return; }
      const existing = findAccountByLogin(contact.value);
      if (existing?.quick) {
        // Their quick account from before: a real 3den would send a code first.
        signIn(existing.id);
        finish(existing.id, intent.then, `Welcome back, ${existing.name.split(' ')[0]}.`);
        return;
      }
      if (existing) {
        error.textContent = `There’s already a 3den account with that ${kind === 'phone' ? 'phone number' : 'email'}. Sign in instead.`;
        showSignIn(contact.value);
        return;
      }
      const member = createQuickAccount({ name: name.value, contact: contact.value, textNotifications: textOptIn.checked, arrival: intent.arrival });
      finish(member.id, intent.then, `You’re in, ${member.name.split(' ')[0]}!${member.textNotifications ? ' We’ll text you updates.' : ''}`);
    },
  },
    field('Your name', name),
    field('Phone number or email', contact, contactHint),
    textRow,
    error,
    h('button', { type: 'submit', class: 'button button--primary signup-sheet__submit' }, intent.action === 'RSVP' ? 'Send my RSVP' : `Continue and ${intent.action}`),
    h('p', { class: 'signup-sheet__note' }, forEvent
      ? 'That’s all for now. Groups and blogs need a full account, which you can make any time.'
      : 'That’s all for now. You can pick a username and password later, when you want a blog or the Feed.'));
}

function signUpForm(intent) {
  const name = h('input', { type: 'text', class: 'input', autocomplete: 'name', 'aria-label': 'Your name' });
  const username = h('input', { type: 'text', class: 'input', autocomplete: 'username', 'aria-label': 'Username' });
  const email = h('input', { type: 'email', class: 'input', autocomplete: 'email', 'aria-label': 'Email' });
  const password = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', 'aria-label': 'Password' });
  const usernameHint = h('span', { class: 'signup-sheet__hint' }, 'People will mention you as @username.');
  const error = h('p', { class: 'form-error', role: 'alert' });
  let usernameEdited = false;

  name.addEventListener('input', () => { if (!usernameEdited) username.value = name.value.trim() ? suggestUsername(name.value) : ''; });
  username.addEventListener('input', () => {
    usernameEdited = true;
    const problem = username.value.trim() ? usernameProblem(username.value.trim()) : null;
    usernameHint.textContent = problem || 'People will mention you as @username.';
    usernameHint.classList.toggle('is-problem', Boolean(problem));
  });

  return h('form', {
    class: 'signup-sheet__form',
    onSubmit: async (event) => {
      event.preventDefault();
      const problem = (!name.value.trim() && 'Add your name.')
        || usernameProblem(username.value.trim())
        || emailProblem(email.value.trim())
        || passwordProblem(password.value);
      if (problem) { error.textContent = problem; return; }
      const member = createAccount({
        name: name.value,
        username: username.value.trim(),
        email: email.value,
        password: await hashPassword(password.value),
        arrival: intent.arrival,
      });
      finish(member.id, intent.then, `Welcome to 3den, ${member.name.split(' ')[0]}!`);
    },
  },
    field('Your name', name),
    field('Username', username, usernameHint),
    field('Email', email),
    field('Password', password, h('span', { class: 'signup-sheet__hint' }, `At least ${MIN_PASSWORD_LENGTH} characters.`)),
    error,
    h('button', { type: 'submit', class: 'button button--primary signup-sheet__submit' }, `Create account and ${intent.action}`),
    h('p', { class: 'signup-sheet__note' }, 'Prototype: accounts are stored only in this browser.'));
}

function signInForm(intent, prefill = '') {
  const login = h('input', { type: 'text', class: 'input', autocomplete: 'username', 'aria-label': 'Username, email, or phone', value: prefill });
  const password = h('input', { type: 'password', class: 'input', autocomplete: 'current-password', 'aria-label': 'Password' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const demo = getAccounts().filter((account) => !account.password && !account.quick && (!account.growth || account.growth.starter));

  const signInAs = (account) => {
    signIn(account.id);
    finish(account.id, intent.then, `Signed in as ${account.name}.`);
  };

  return h('form', {
    class: 'signup-sheet__form',
    onSubmit: async (event) => {
      event.preventDefault();
      const account = findAccountByLogin(login.value);
      if (!account) { error.textContent = 'No account with that username, email, or phone number.'; return; }
      if (!account.password) { signInAs(account); return; } // a demo account, or a quick one (a real 3den sends a code)
      if (!(await checkPassword(password.value, account.password))) { error.textContent = 'That password isn’t right.'; return; }
      signInAs(account);
    },
  },
    field('Username, email, or phone', login),
    field('Password', password, h('span', { class: 'signup-sheet__hint' }, 'Answered an event with your phone or email? Leave this empty.')),
    error,
    h('button', { type: 'submit', class: 'button button--primary signup-sheet__submit' }, `Sign in and ${intent.action}`),
    demo.length ? h('label', { class: 'signup-sheet__field' },
      h('span', { class: 'signup-sheet__label' }, 'Or a demo account (no password)'),
      h('select', {
        class: 'input',
        'aria-label': 'Demo account',
        onChange: (event) => { const account = demo.find((a) => a.id === event.target.value); if (account) signInAs(account); },
      }, h('option', { value: '' }, 'Pick someone…'), demo.map((account) => h('option', { value: account.id }, `${account.name} (@${account.username})`)))) : null);
}
