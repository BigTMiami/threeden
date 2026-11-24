// @ts-check
/**
 * auth-view.js — the screen you see when signed out: sign in, or create an
 * account. (#signin and #signup in the URL.)
 *
 *   ┌ 3den ─────────────────────────────────────┐
 *   │ [ Sign in ] [ Create account ]            │
 *   │ Username or email  [            ]         │
 *   │ Password           [            ]         │
 *   │                           [ Sign in ]     │
 *   │ ─ or try a demo account (no password) ─   │
 *   │ (LL) Leo L  @leo        (AA) Anna A @anna │
 *   └───────────────────────────────────────────┘
 *
 * Demo accounts have no password, so you can quickly see the app as an
 * owner, an admin or an ordinary member.
 */

import { renderChildSignUp } from './child-account.js';
import { h, replaceChildren } from '../ui/dom.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { getState } from '../state/store.js';
import { roleOf } from '../state/permissions.js';
import {
  getAccounts, findAccountByLogin, usernameProblem, emailProblem, suggestUsername, createAccount, signIn,
} from '../state/accounts.js';
import { hashPassword, checkPassword, passwordProblem, MIN_PASSWORD_LENGTH } from './password.js';
import { goTo } from '../router.js';
import { PREVIEW_PATHS, startPreview } from './preview-as-new.js';

/**
 * Where to go once signed in: the homepage, unless the person came from
 * somewhere that needs an account first (an invite link).
 */
let afterSignIn = null;

export function setAfterSignIn(href, note = null) {
  afterSignIn = href ? { href, note } : null;
}

function takeAfterSignIn() {
  const href = afterSignIn?.href ?? '#';
  afterSignIn = null;
  return href;
}

export function renderAuthView(container, mode = 'signin') {
  const isChild = mode === 'child';
  const isSignUp = mode === 'signup' || isChild;

  const tabs = h('div', { class: 'auth__tabs', role: 'tablist' },
    h('a', { href: '#signin', role: 'tab', class: `auth__tab${isSignUp ? '' : ' is-active'}`, 'aria-selected': String(!isSignUp) }, 'Sign in'),
    h('a', { href: '#signup', role: 'tab', class: `auth__tab${isSignUp ? ' is-active' : ''}`, 'aria-selected': String(isSignUp) }, 'Create account'),
  );

  replaceChildren(container,
    h('div', { class: 'auth' },
      h('h1', { class: 'auth__title' }, isChild ? 'An account for a child' : isSignUp ? 'Create your 3den account' : 'Sign in to 3den'),
      h('p', { class: 'auth__lede' }, 'Groups, homepages, and shared tools for the people you organize with.'),
      afterSignIn?.note ? h('p', { class: 'auth__invite' }, afterSignIn.note) : null,
      tabs,
      isChild ? renderChildSignUp() : isSignUp ? renderSignUpForm() : renderSignInForm(),
      // A small line under the form (child-account.js).
      mode === 'signup' ? h('p', { class: 'auth__child-link' }, h('a', { href: '#signup-child' }, 'Set up an account for a child')) : null,
      isSignUp ? null : renderPreviewAsNew(),
      isSignUp ? null : renderDemoAccounts(),
      h('p', { class: 'auth__note' },
        'Prototype: accounts are stored only in this browser. Don’t use a password you use anywhere else.'),
    ),
  );
}

// ─── Sign in ─────────────────────────────────────────────────────────────────

function renderSignInForm() {
  const loginInput = h('input', { type: 'text', class: 'input', autocomplete: 'username', 'aria-label': 'Username, email, or phone' });
  const passwordInput = h('input', { type: 'password', class: 'input', autocomplete: 'current-password', 'aria-label': 'Password' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  const form = h('form', {
    class: 'auth__form',
    onSubmit: async (event) => {
      event.preventDefault();
      const account = findAccountByLogin(loginInput.value);
      if (!account) {
        error.textContent = 'No account with that username, email, or phone number.';
        loginInput.focus();
        return;
      }
      // A quick account (made answering an event) has no password: a real
      // 3den would text or email a sign-in code. The prototype lets them in.
      if (account.quick) {
        signIn(account.id);
        goTo(takeAfterSignIn());
        showToast(`Welcome back, ${account.name.split(' ')[0]}. (A real 3den would have sent you a sign-in code.)`);
        return;
      }
      if (!account.password) {
        error.textContent = `${account.name} is a demo account with no password. Pick it from the list below.`;
        return;
      }
      if (!(await checkPassword(passwordInput.value, account.password))) {
        error.textContent = 'That password isn’t right.';
        passwordInput.select();
        return;
      }
      signIn(account.id);
      goTo(takeAfterSignIn());
      showToast(`Welcome back, ${account.name.split(' ')[0]}.`);
    },
  },
    field('Username, email, or phone', loginInput),
    field('Password', passwordInput, 'No password yet? If you answered an event with your phone or email, just type that.'),
    error,
    h('div', { class: 'form-row form-row--end' }, h('button', { type: 'submit', class: 'button button--primary' }, 'Sign in')),
  );
  requestAnimationFrame(() => loginInput.focus());
  return form;
}

/** Prototype (Nov 20): each way in, as a brand-new person, from the first page they'd see (preview-as-new.js). It replaced the "first visit" links. */
function renderPreviewAsNew() {
  return h('section', { class: 'auth__demo auth__preview-new' },
    h('h2', { class: 'auth__demo-title' }, 'Preview as a new user'),
    h('p', { class: 'auth__hint' }, 'Each opens the page that person would see, signed out. You make the account yourself, then see every tutorial from the start.'),
    h('ul', { class: 'auth__demo-list' }, PREVIEW_PATHS.map((path) => h('li', {},
      h('button', { type: 'button', class: 'auth__demo-account auth__preview-path', 'data-preview': path.id, onClick: () => startPreview(path.id) },
        h('span', { class: 'auth__demo-text' },
          h('span', { class: 'auth__demo-name' }, path.label),
          h('span', { class: 'auth__demo-roles' }, path.detail)))))));
}

/** One button per demo account (the ones without a password). */
function renderDemoAccounts() {
  const demo = getAccounts().filter((account) => !account.password && !account.quick && !account.preview && (!account.growth || account.growth.starter));
  if (demo.length === 0) return null;

  return h('section', { class: 'auth__demo' },
    h('h2', { class: 'auth__demo-title' }, 'Or try a demo account (no password)'),
    h('ul', { class: 'auth__demo-list' }, demo.map((account) => h('li', {},
      h('button', {
        type: 'button',
        class: 'auth__demo-account',
        onClick: () => {
          signIn(account.id);
          goTo(takeAfterSignIn());
          showToast(`Signed in as ${account.name}.`);
        },
      },
        avatar(account, 32),
        h('span', { class: 'auth__demo-text' },
          h('span', { class: 'auth__demo-name' }, account.name, h('span', { class: 'auth__demo-username' }, ` @${account.username}`)),
          h('span', { class: 'auth__demo-roles' }, describeRoles(account.id)),
        ),
      ),
    ))),
  );
}

/** "Owner of 237 Hart Street · Member of Elm St Community Garden" */
function describeRoles(memberId) {
  const groups = getState().spaces.filter((space) => space.kind === 'group' && space.memberIds.includes(memberId));
  const roles = groups.map((space) => {
    const role = roleOf(space, memberId);
    return `${role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'Member'} of ${space.name}`;
  });
  // The growth model's starters (js/data/demo/growth.js): say what they started.
  if (getState().members.find((m) => m.id === memberId)?.growth?.starter) {
    const hosted = getState().spaces.filter((space) => space.kind === 'personal' && space.memberIds[0] === memberId)
      .flatMap((space) => space.modules.flatMap((m) => m.data?.events ?? []))
      .filter((event) => event.kind === 'event' && event.createdBy === memberId)
      .map((event) => `Hosted ${event.title}`);
    return ['Growth model starter', ...hosted, ...roles].join(' · ');
  }
  return roles.length ? roles.join(' · ') : 'Not in any groups yet';
}

// ─── Create account ──────────────────────────────────────────────────────────

function renderSignUpForm() {
  const nameInput = h('input', { type: 'text', class: 'input', autocomplete: 'name', 'aria-label': 'Your name' });
  const usernameInput = h('input', { type: 'text', class: 'input', autocomplete: 'username', 'aria-label': 'Username', spellcheck: 'false' });
  const usernameHint = h('span', { class: 'auth__hint' }, 'People will mention you as @username.');
  const emailInput = h('input', { type: 'email', class: 'input', autocomplete: 'email', 'aria-label': 'Email' });
  const passwordInput = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', 'aria-label': 'Password' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  // Suggest a username from the name, until the person types their own.
  let usernameEdited = false;
  nameInput.addEventListener('input', () => {
    if (!usernameEdited) usernameInput.value = nameInput.value.trim() ? suggestUsername(nameInput.value) : '';
    checkUsername();
  });
  usernameInput.addEventListener('input', () => {
    usernameEdited = true;
    usernameInput.value = usernameInput.value.toLowerCase().replace(/^@/, '');
    checkUsername();
  });

  function checkUsername() {
    const username = usernameInput.value;
    const problem = username ? usernameProblem(username) : '';
    usernameHint.textContent = problem || (username ? `@${username} is available.` : 'People will mention you as @username.');
    usernameHint.classList.toggle('is-problem', Boolean(problem));
  }

  const form = h('form', {
    class: 'auth__form',
    onSubmit: async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const username = usernameInput.value.trim();
      const email = emailInput.value.trim();
      const problem = (!name && 'Add your name.')
        || usernameProblem(username)
        || emailProblem(email)
        || passwordProblem(passwordInput.value);
      if (problem) {
        error.textContent = problem;
        return;
      }
      const account = createAccount({ name, username, email, password: await hashPassword(passwordInput.value) });
      goTo(takeAfterSignIn());
      showToast(`Welcome to 3den, ${account.name.split(' ')[0]}!`);
    },
  },
    field('Your name', nameInput, 'As you’d like it shown to others.'),
    field('Username', usernameInput, usernameHint),
    field('Email', emailInput),
    field('Password', passwordInput, `At least ${MIN_PASSWORD_LENGTH} characters.`),
    error,
    h('div', { class: 'form-row form-row--end' }, h('button', { type: 'submit', class: 'button button--primary' }, 'Create account')),
  );
  requestAnimationFrame(() => nameInput.focus());
  return form;
}

/** A labeled form field, with an optional hint under it. */
function field(labelText, control, hint = null) {
  return h('label', { class: 'auth__field' },
    h('span', { class: 'auth__label' }, labelText),
    control,
    typeof hint === 'string' ? h('span', { class: 'auth__hint' }, hint) : hint,
  );
}
