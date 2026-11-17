// @ts-check
/**
 * child-account.js — setting up and looking after child accounts
 * (js/state/children.js has the rules).
 *
 *   childFields()               the child's name, username, birth year, and password
 *   renderChildSignUp()         the sign-up page's "Set up an account for a child"
 *                               (#signup-child): the parent's account, then the child's
 *   renderChildrenSection(user) Account settings → Children: each child, their groups,
 *                               what they've asked to join (Yes / Not now), and a
 *                               form to set up another
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { avatar } from '../ui/avatar.js';
import { getState, getSpace, getMember } from '../state/store.js';
import { createAccount, signIn, usernameProblem, emailProblem, suggestUsername } from '../state/accounts.js';
import { hashPassword, passwordProblem, MIN_PASSWORD_LENGTH } from './password.js';
import { createChildAccount, childrenOf, waitingRequests, decideRequest, birthYearProblem, CHILD_MAX_AGE, parentsOf } from '../state/children.js';
import { removeMember } from '../state/groups.js';
import { goTo, spaceHref } from '../router.js';
import { timeAgo } from '../utils/dates.js';

const field = (label, control, hint = null) => h('label', { class: 'auth__field' },
  h('span', { class: 'auth__label' }, label), control, hint ? h('span', { class: 'auth__hint' }, hint) : null);

/** The child's fields. read() → { problem } or { name, username, birthYear, password }. */
export function childFields() {
  const year = new Date().getFullYear();
  const name = h('input', { type: 'text', class: 'input', autocomplete: 'off', 'aria-label': 'Child’s name' });
  const username = h('input', { type: 'text', class: 'input', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Child’s username' });
  const birthYear = h('select', { class: 'input', 'aria-label': 'Year they were born' },
    h('option', { value: '' }, 'Choose a year'),
    Array.from({ length: CHILD_MAX_AGE + 1 }, (_, i) => year - i).map((y) => h('option', { value: String(y) }, String(y))));
  const password = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', 'aria-label': 'Child’s password' });
  let edited = false;
  name.addEventListener('input', () => { if (!edited) username.value = name.value.trim() ? suggestUsername(name.value) : ''; });
  username.addEventListener('input', () => { edited = true; username.value = username.value.toLowerCase().replace(/^@/, ''); });
  return {
    element: h('fieldset', { class: 'child-fields' },
      h('legend', { class: 'child-fields__legend' }, 'Your child'),
      field('Their name', name, 'First name is enough.'),
      field('Username', username, 'How others in their groups mention them.'),
      field('Year they were born', birthYear),
      field('Their password', password, `At least ${MIN_PASSWORD_LENGTH} characters. You can change it later.`)),
    focus: () => name.focus(),
    read: () => {
      const problem = (!name.value.trim() && 'Add your child’s name.') || usernameProblem(username.value.trim()) || birthYearProblem(birthYear.value) || passwordProblem(password.value);
      return problem ? { problem } : { name: name.value.trim(), username: username.value.trim(), birthYear: Number(birthYear.value), password: password.value };
    },
  };
}

/** What a child's account can and can't do, in a few lines. */
export function childRules() {
  return h('ul', { class: 'child-rules' },
    h('li', {}, icon('lock', 13), ' They join groups only when you say yes. You get a notification for each one.'),
    h('li', {}, icon('compass', 13), ' No Explore, no group suggestions, and search finds only their own groups.'),
    h('li', {}, icon('chat', 13), ' They message, and get messages from, only you and people in their groups.'),
    h('li', {}, icon('eyeOff', 13), ' No blog, Feed, or friend requests.'));
}

/** Sign-up page: the parent's account, then the child's. */
export function renderChildSignUp() {
  const parentName = h('input', { type: 'text', class: 'input', autocomplete: 'name', 'aria-label': 'Your name' });
  const parentEmail = h('input', { type: 'email', class: 'input', autocomplete: 'email', 'aria-label': 'Your email' });
  const parentPassword = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', 'aria-label': 'Your password' });
  const child = childFields();
  const error = h('p', { class: 'form-error', role: 'alert' });
  const form = h('form', {
    class: 'auth__form child-signup',
    onSubmit: async (event) => {
      event.preventDefault();
      const name = parentName.value.trim();
      const username = suggestUsername(name || 'parent');
      const problem = (!name && 'Add your name.') || emailProblem(parentEmail.value.trim()) || passwordProblem(parentPassword.value);
      if (problem) { error.textContent = problem; return; }
      const kid = child.read();
      if (kid.problem) { error.textContent = kid.problem; return; }
      const parent = createAccount({ name, username, email: parentEmail.value.trim(), password: await hashPassword(parentPassword.value) });
      const made = createChildAccount({ parentId: parent.id, name: kid.name, username: kid.username, birthYear: kid.birthYear, password: await hashPassword(kid.password) });
      goTo('#account-children');
      showToast(`Made ${made.name}’s account. They sign in as @${made.username}.`);
    },
  },
    h('p', { class: 'auth__hint child-signup__lede' }, 'A child’s account is run by a parent or guardian. First your own account, then theirs. Already on 3den? ', h('a', { href: '#signin' }, 'Sign in'), ', then go to Account settings → Children.'),
    childRules(),
    h('fieldset', { class: 'child-fields' },
      h('legend', { class: 'child-fields__legend' }, 'You (the parent or guardian)'),
      field('Your name', parentName),
      field('Your email', parentEmail),
      field('Your password', parentPassword, `At least ${MIN_PASSWORD_LENGTH} characters.`)),
    child.element,
    error,
    h('div', { class: 'form-row form-row--end' },
      h('a', { href: '#signup', class: 'button button--quiet' }, 'Back'),
      h('button', { type: 'submit', class: 'button button--primary' }, 'Create both accounts')));
  requestAnimationFrame(() => parentName.focus());
  return form;
}

/** Account settings → Children. */
export function renderChildrenSection(user, redraw) {
  // A child sees who runs their account instead.
  if (user.child) {
    const parents = parentsOf(user.id).map(getMember).filter(Boolean);
    return h('section', { class: 'settings-section', id: 'children-settings' },
      h('h2', { class: 'settings-section__title' }, 'Your account'),
      h('p', { class: 'settings-section__description' }, `Your account is looked after by ${parents.map((p) => p.name).join(' and ') || 'a parent'}. They say yes to new groups.`),
      childRules());
  }
  const kids = childrenOf(user.id);
  const waiting = waitingRequests(null, user.id);
  const setup = h('div', { class: 'children__setup', hidden: kids.length > 0 });
  const child = childFields();
  const error = h('p', { class: 'form-error', role: 'alert' });
  replaceChildren(setup, h('form', {
    class: 'settings-form',
    onSubmit: async (event) => {
      event.preventDefault();
      const kid = child.read();
      if (kid.problem) { error.textContent = kid.problem; return; }
      const made = createChildAccount({ parentId: user.id, name: kid.name, username: kid.username, birthYear: kid.birthYear, password: await hashPassword(kid.password) });
      showToast(`Made ${made.name}’s account. They sign in as @${made.username}.`);
      redraw();
    },
  }, childRules(), child.element, error, h('div', { class: 'form-row' }, h('button', { type: 'submit', class: 'button button--primary' }, 'Create their account'))));

  return h('section', { class: 'settings-section', id: 'children-settings' },
    h('h2', { class: 'settings-section__title' }, 'Children'),
    h('p', { class: 'settings-section__description' }, 'Accounts you look after for your children. They can’t explore, and they join a group only when you say yes.'),
    waiting.length ? h('div', { class: 'children__waiting' },
      h('h3', { class: 'children__heading' }, `Waiting for you · ${waiting.length}`),
      h('ul', { class: 'members-list' }, waiting.map((r) => {
        const kid = getMember(r.childId);
        const space = getSpace(r.spaceId);
        const how = { join: 'wants to join', invite: `was invited by ${getMember(r.byId)?.name ?? 'someone'} to`, link: 'opened an invite link to', added: `was added by ${getMember(r.byId)?.name ?? 'an admin'} to` }[r.via] ?? 'wants to join';
        return h('li', { class: 'members-list__row children__request' },
          avatar(kid, 32),
          h('span', { class: 'members-list__text' },
            h('strong', {}, `${kid?.name.split(' ')[0]} ${how} ${space?.name ?? 'a group'}`),
            h('span', { class: 'members-list__meta' }, `${space?.groupType ? `${space.groupType} · ` : ''}${space?.memberIds.length ?? 0} members · ${timeAgo(r.at)}`, space ? [' · ', h('a', { href: spaceHref(space.id) }, 'Look at it')] : null)),
          h('button', { type: 'button', class: 'button button--small button--primary', onClick: async () => { await decideRequest(r.id, user.id, true); showToast(`${kid?.name.split(' ')[0]} joined ${space?.name}.`); redraw(); } }, 'Yes'),
          h('button', { type: 'button', class: 'link-button', onClick: async () => { await decideRequest(r.id, user.id, false); showToast('Told them not this time.'); redraw(); } }, 'Not now'));
      }))) : null,
    kids.length ? h('ul', { class: 'children__list' }, kids.map((kid) => {
      const groups = getState().spaces.filter((s) => s.kind === 'group' && s.memberIds.includes(kid.id));
      const age = new Date().getFullYear() - (kid.child.birthYear ?? 0);
      return h('li', { class: 'children__child' },
        h('div', { class: 'children__child-head' },
          avatar(kid, 40),
          h('span', { class: 'members-list__text' }, h('strong', {}, kid.name), h('span', { class: 'members-list__meta' }, `@${kid.username} · about ${age}`)),
          // Prototype: see their account as they would (a real 3den would have them sign in on their own device).
          h('button', { type: 'button', class: 'button button--small', onClick: () => { signIn(kid.id); goTo('#groups'); showToast(`You’re looking at ${kid.name.split(' ')[0]}’s account. Sign out to come back.`); } }, icon('eye', 13), ' Open their account')),
        h('p', { class: 'children__groups-label' }, groups.length ? 'Their groups' : 'Not in any groups yet. When someone invites them, you’ll be asked here.'),
        groups.length ? h('ul', { class: 'children__groups' }, groups.map((g) => h('li', {},
          h('a', { href: spaceHref(g.id) }, g.name),
          h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { removeMember(g.id, kid.id); showToast(`Took ${kid.name.split(' ')[0]} out of ${g.name}.`); redraw(); } }, 'Take them out')))) : null);
    })) : null,
    kids.length ? h('button', { type: 'button', class: 'button', onClick: (event) => { setup.hidden = false; event.currentTarget.remove(); child.focus(); } }, icon('plus', 14), ' Set up an account for another child') : null,
    setup);
}
