// @ts-check
/**
 * join-page.js — what an invite link opens (#join-<code>).
 *
 *   (PL)  Porch Lights
 *         Private group · Invite only · 4 members
 *         Four friends, two guitars…
 *         [ Join Porch Lights ]  Not now
 *
 * Already in the group? It just opens the group. A link that was turned
 * off or replaced says so. Someone who isn't signed in sees this page too;
 * the button makes a full account (js/onboarding/guest.js; Nov 20: no more
 * quick name-and-phone accounts), then joins.
 * Signed out, the page shows one button, "Create an account and join", and
 * no blog choice or "Not now" (Nov 20).
 */

import { blogJoinCheckbox } from './blog-choice.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { groupInitials } from '../utils/initials.js';
import { getCurrentUser, getSpaceMembers } from '../state/store.js';
import { findGroupByInviteCode, addMember, setBlogShownIn } from '../state/groups.js';
import { goTo, spaceHref } from '../router.js';
import { requireAccount } from '../onboarding/guest.js';

export function renderJoinPage(container, inviteCode) {
  const me = getCurrentUser();
  const group = findGroupByInviteCode(inviteCode);

  if (!group) {
    replaceChildren(container, h('div', { class: 'settings-section join-page' },
      h('h1', { class: 'settings-page__title' }, 'This invite link doesn’t work'),
      h('p', {}, 'It may have been turned off or replaced with a new one. Ask whoever sent it for a fresh link.'),
      h('p', {}, h('a', { href: '#groups' }, 'Go to your groups'))));
    return;
  }

  if (group.memberIds.includes(me.id)) {
    history.replaceState(null, '', spaceHref(group.id));
    goTo(spaceHref(group.id));
    return;
  }

  const count = getSpaceMembers(group).length;
  const signedOut = Boolean(me?.isGuest);
  const blogChoice = signedOut ? { element: null, shown: () => true } : blogJoinCheckbox(me); // show your blog to the members? (blog-choice.js)
  replaceChildren(container, h('div', { class: 'settings-section join-page' },
    h('p', { class: 'join-page__kicker' }, 'You’re invited to join'),
    h('div', { class: 'join-page__group' },
      h('span', { class: 'groups-menu__badge join-page__badge', 'aria-hidden': 'true' }, groupInitials(group.name)),
      h('div', {},
        h('h1', { class: 'join-page__name' }, group.name),
        h('p', { class: 'join-page__meta' }, `${group.groupType ? `${group.groupType} · ` : ''}${count} ${count === 1 ? 'member' : 'members'}`),
        group.description ? h('p', { class: 'join-page__description' }, group.description) : null)),
    blogChoice.element,
    h('div', { class: 'form-row' },
      h('button', {
        type: 'button',
        class: 'button button--primary',
        onClick: () => {
          // Not signed in: sign up (or in) first, then join and open the group.
          if (requireAccount({
            reason: `to join ${group.name}`,
            action: 'join',
            arrival: { source: 'group', spaceId: group.id },
            then: (newId) => { addMember(group.id, newId); history.replaceState(null, '', spaceHref(group.id)); },
          })) return;
          if (addMember(group.id, me.id, 'member', { via: 'link' }) === 'asked') {
            showToast(`We asked your parent if you can join ${group.name}.`);
            goTo('#groups');
            return;
          }
          setBlogShownIn(group.id, me.id, blogChoice.shown());
          showToast(`Welcome to ${group.name}!`);
          goTo(spaceHref(group.id));
        },
      }, icon('plus', 14), signedOut ? ' Create an account and join' : ` Join ${group.name}`),
      signedOut ? null : h('a', { href: '#', class: 'button button--quiet' }, 'Not now'))));
}
