// @ts-check
/**
 * finish-account.js — turning a quick account into a full one.
 *
 * Someone who answered an event with just their name and a phone number
 * or email has a quick account (js/state/accounts.js). Their homepage,
 * events, calendar and messages all work. Groups and blogs need more: a
 * username people can @mention, and a password. So when a quick account
 * opens a group, a blog, the Blog tab or the Groups tab, main.js shows this
 * page instead; once it's done, the page they wanted opens.
 *
 *   needsFullAccount(route)   → show this page instead?
 *   renderFinishAccount(container, route)
 *   rsvpCount(me)             → how many events a quick account has answered (going or maybe)
 *   fullAccountNudge(me, onHide) → after the second answer: "Keep your events in one place" (or null)
 *   offerFullAccountOnce(me)  → true the first time they reach two answers (for a toast)
 *
 * People who only ever answer one invitation stay at half the rate of those
 * who make a full account (the year model), so the second RSVP is when we ask.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { showToast } from '../ui/toast.js';
import { getCurrentUser, getSpace, getSpaces, getSpaceOfModule, getPersonalSpace, changeState, getMember } from '../state/store.js';
import { icon } from '../ui/icons.js';
import { usernameProblem, emailProblem, finishAccount } from '../state/accounts.js';
import { hashPassword, passwordProblem, MIN_PASSWORD_LENGTH } from '../account/password.js';
import { goTo, spaceHref } from '../router.js';

// ─── Asking after the second RSVP ────────────────────────────────────────────

export const NUDGE_AFTER_RSVPS = 2;

/** Events this person has said going or maybe to, anywhere. */
export function rsvpCount(me) {
  let count = 0;
  for (const space of getSpaces()) {
    for (const module of space.modules ?? []) {
      for (const event of module.data?.events ?? []) if (['going', 'maybe'].includes(event.rsvps?.[me.id])) count += 1;
    }
  }
  return count;
}

const wantsNudge = (me) => Boolean(me?.quick) && !me.fullAccountNudge?.hidden && rsvpCount(me) >= NUDGE_AFTER_RSVPS;

/** True once: the moment a quick account reaches its second answer. */
export function offerFullAccountOnce(me) {
  if (!wantsNudge(me) || me.fullAccountNudge?.offeredAt) return false;
  changeState(() => { const m = getMember(me.id); m.fullAccountNudge = { ...m.fullAccountNudge, offeredAt: Date.now() }; }, 'account');
  return true;
}

/** The line under the RSVP buttons, until they finish their account or hide it. */
export function fullAccountNudge(me, onHide) {
  if (!wantsNudge(me)) return null;
  return h('div', { class: 'full-account-nudge' },
    h('p', {}, icon('calendar', 14), ' ', h('strong', {}, 'Keep your events in one place.'), ' Add a username and password, and every invitation lands on your own calendar.'),
    h('div', { class: 'form-row' },
      h('a', { class: 'button button--primary button--small', href: '#finish-account' }, 'Finish my account'),
      h('button', {
        type: 'button', class: 'link-button',
        onClick: () => { changeState(() => { const m = getMember(me.id); m.fullAccountNudge = { ...m.fullAccountNudge, hidden: true }; }, 'account'); onHide?.(); },
      }, 'Not now')));
}

/** Is this page for groups or blogs (which quick accounts can't use yet)? */
export function needsFullAccount(route) {
  const me = getCurrentUser();
  if (!me?.quick) return false;
  if (route.page === 'finish-account') return true;
  // (Create a group asks for a username and password on its own form instead: one step.)
  if (route.page === 'feed') return true;
  if (route.blogUsername) return true;
  // Groups they joined from a link work right away; the rest can wait.
  const isTheirs = (space) => space?.kind === 'personal' || (space?.kind === 'group' && space.memberIds.includes(me.id));
  if (route.page === 'groups') return !getSpaces().some((s) => s.kind === 'group' && s.memberIds.includes(me.id));
  if (route.page === 'module') return !isTheirs(getSpaceOfModule(route.moduleId));
  if (route.page === 'home' && route.spaceId) return !isTheirs(getSpace(route.spaceId));
  if (route.page === 'settings' && route.spaceId) return getSpace(route.spaceId)?.kind !== 'personal';
  return false;
}

/** What they were trying to open, for the lede. */
function whatTheyWanted(route) {
  if (route.page === 'feed' || route.blogUsername) return 'Blogs and the Feed need';
  if (['groups', 'new-group', 'join'].includes(route.page)) return 'Groups need';
  const space = route.page === 'module' ? getSpaceOfModule(route.moduleId) : getSpace(route.spaceId);
  if (space?.kind === 'blog') return 'Blogs need';
  if (space?.kind === 'group') return `${space.name} needs`;
  return '3den’s groups and blogs need';
}

export function renderFinishAccount(container, route) {
  const me = getCurrentUser();
  const name = h('input', { type: 'text', class: 'input', value: me.name, autocomplete: 'name', 'aria-label': 'Your name' });
  const username = h('input', { type: 'text', class: 'input', value: me.username, autocomplete: 'username', 'aria-label': 'Username' });
  const password = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', 'aria-label': 'Password' });
  const email = me.email ? null : h('input', { type: 'email', class: 'input', autocomplete: 'email', 'aria-label': 'Email (optional)' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const goingHome = route.page === 'finish-account';

  const field = (label, input, hint = null) => h('label', { class: 'signup-sheet__field' },
    h('span', { class: 'signup-sheet__label' }, label), input, hint ? h('span', { class: 'signup-sheet__hint' }, hint) : null);

  replaceChildren(container, h('div', { class: 'welcome finish-account' },
    h('h1', { class: 'welcome__title' }, 'Make your full 3den account'),
    h('p', { class: 'welcome__lede' },
      `${goingHome ? '3den’s groups and blogs need' : whatTheyWanted(route)} a full account: a username people can @mention, and a password. Your events and homepage stay just as they are.`),
    h('form', {
      class: 'signup-sheet__form finish-account__form',
      onSubmit: async (event) => {
        event.preventDefault();
        const problem = (!name.value.trim() && 'Add your name.')
          || usernameProblem(username.value.trim(), me.id)
          || (email?.value.trim() ? emailProblem(email.value.trim(), me.id) : '')
          || passwordProblem(password.value);
        if (problem) { error.textContent = problem; return; }
        finishAccount(me.id, {
          name: name.value,
          username: username.value.trim(),
          password: await hashPassword(password.value),
          email: email?.value.trim() || null,
        });
        showToast(`You’re all set, @${username.value.trim()}.`);
        // Open what they were trying to open (or their homepage).
        if (goingHome) goTo(spaceHref(getPersonalSpace().id));
        else window.dispatchEvent(new HashChangeEvent('hashchange'));
      },
    },
      field('Your name', name),
      field('Username', username, 'People will mention you as @username. 3–20 lowercase letters, numbers, dots, or underscores.'),
      email ? field('Email (optional)', email, 'For signing in, and if you ever forget your password.') : null,
      field('Password', password, `At least ${MIN_PASSWORD_LENGTH} characters.`),
      error,
      h('div', { class: 'form-row' },
        h('button', { type: 'submit', class: 'button button--primary' }, 'Finish my account'),
        h('a', { class: 'button button--quiet', href: spaceHref(getPersonalSpace().id) }, 'Not now')))));
}
