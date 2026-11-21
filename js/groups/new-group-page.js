// @ts-check
/**
 * new-group-page.js — "Create a group" (#new-group).
 *
 * One page (no steps): name, type, description, and one question (Nov 20):
 *
 *   Do you want a searchable, public page for this group?
 *   This is useful for public facing groups like bands, businesses, official groups, and more.
 *   ( ) No, keep it private      ( ) Yes, give it a public page
 *
 * Every new group is invite only. No: private, with a chat and a calendar
 * ("friends" in starter-layouts.js). Yes: public, still invite only, with
 * a Private tab for members and a Public tab with posts and upcoming
 * events ("public-page"). There's no template picker and no "Who can see
 * it" / "How people join" here any more; both can be changed later in
 * Group settings, and modules in edit mode. You become the group's owner;
 * a short tour shows you around after (group-tour.js).
 */

import { isChild } from '../state/children.js';
import { h, replaceChildren } from '../ui/dom.js';
import { showToast } from '../ui/toast.js';
import { createGroup } from '../state/groups.js';
import { goTo, spaceHref } from '../router.js';
import { section, field, groupTypeInput } from './settings-page.js';
import { getOnboarding, updateOnboarding } from '../onboarding/onboarding-state.js';
import { getCurrentUser } from '../state/store.js';
import { usernameProblem, suggestUsername, finishAccount } from '../state/accounts.js';
import { hashPassword, passwordProblem, MIN_PASSWORD_LENGTH } from '../account/password.js';
import { startGroupTour } from '../onboarding/group-tour.js';

/** The modules a new group starts with (Nov 20: no template picker). */
const PRIVATE_TEMPLATE = 'friends';
const PUBLIC_TEMPLATE = 'public-page';

export function renderNewGroupPage(container) {
  if (isChild(getCurrentUser())) {
    replaceChildren(container, h('header', { class: 'settings-page__header' }, h('h1', { class: 'settings-page__title' }, 'Create a group')),
      h('p', { class: 'module-empty' }, 'Groups are started by grown-ups on 3den. Ask your parent to start one and add you.'));
    return;
  }
  const nameInput = h('input', { type: 'text', class: 'input', placeholder: 'e.g. Maple Ave Tenants Union', 'aria-label': 'Group name' });
  const [groupTypeField, groupTypeOptions] = groupTypeInput('', { id: 'new-group-type-options' });
  const descriptionInput = h('textarea', { class: 'input', rows: '3', placeholder: 'What the group is for, who it’s for', 'aria-label': 'Description' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  // Someone on a quick account (from answering an event) picks a username and
  // password right here, so starting a group is one step, not two.
  const me = getCurrentUser();
  const isQuick = Boolean(me?.quick);
  const usernameInput = isQuick ? h('input', { type: 'text', class: 'input', value: suggestUsername(me.name), autocomplete: 'username', spellcheck: 'false', 'aria-label': 'Username' }) : null;
  const passwordInput = isQuick ? h('input', { type: 'password', class: 'input', autocomplete: 'new-password', 'aria-label': 'Password' }) : null;

  const form = h('form', {
    class: 'settings-form new-group-form',
    onSubmit: async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      if (!name) {
        error.textContent = 'Give the group a name.';
        nameInput.focus();
        return;
      }
      if (isQuick) {
        const problem = usernameProblem(usernameInput.value.trim(), me.id) || passwordProblem(passwordInput.value);
        if (problem) { error.textContent = problem; return; }
        finishAccount(me.id, { name: me.name, username: usernameInput.value.trim(), password: await hashPassword(passwordInput.value) });
      }
      const wantsPublic = form.querySelector('input[name=new-public]:checked')?.value === 'yes';
      const group = createGroup({
        name,
        description: descriptionInput.value,
        visibility: wantsPublic ? 'public' : 'private',
        joining: 'invite', // every new group is invite only
        template: wantsPublic ? PUBLIC_TEMPLATE : PRIVATE_TEMPLATE,
        groupType: groupTypeField.value,
      });
      // Someone who came to 3den to organize: their Get started card follows this group.
      if (getOnboarding()?.source === 'organizer' && !getOnboarding().spaceId) updateOnboarding({ spaceId: group.id });
      goTo(spaceHref(group.id));
      showToast(`Created ${group.name}.`);
      startGroupTour(group.id);
    },
  },
    isQuick ? h('fieldset', { class: 'settings-field settings-fieldset new-group__account' },
      h('legend', { class: 'settings-field__label' }, 'Your account'),
      h('p', { class: 'settings-field__hint' }, 'Running a group needs a username and password. Pick them here, and you’re done.'),
      field('Username', usernameInput),
      field(`Password (at least ${MIN_PASSWORD_LENGTH} characters)`, passwordInput)) : null,
    field('Group name', nameInput),
    h('label', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Group type (optional)'),
      groupTypeField, groupTypeOptions,
      h('span', { class: 'settings-field__hint' }, 'What it is, in a word or two, like “Band” or “News outlet”. Shown with its name.')),
    field('Description (optional)', descriptionInput),
    // The one access question (Nov 20). Either way it's invite only.
    h('fieldset', { class: 'settings-field settings-fieldset new-group__public' },
      h('legend', { class: 'settings-field__label' }, 'Do you want a searchable, public page for this group?'),
      h('p', { class: 'settings-field__hint' }, 'This is useful for public facing groups like bands, businesses, official groups, and more.'),
      h('div', { class: 'new-group__public-choices' },
        h('label', { class: 'template-choice' },
          h('input', { type: 'radio', name: 'new-public', value: 'no', checked: true }),
          h('span', {}, h('strong', {}, 'No, keep it private'), h('span', { class: 'settings-field__hint' }, 'Only members can see it or find it.'))),
        h('label', { class: 'template-choice' },
          h('input', { type: 'radio', name: 'new-public', value: 'yes' }),
          h('span', {}, h('strong', {}, 'Yes, give it a public page'), h('span', { class: 'settings-field__hint' }, 'Anyone can find it and see its Public tab. It’s still invite only, and members get a Private tab of their own.')))),
      h('p', { class: 'settings-field__hint' }, 'New groups are invite only. You can change who can see it and how people join later, in Group settings.')),
    error,
    h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--primary' }, 'Create group'),
      h('a', { class: 'button button--quiet', href: '#' }, 'Cancel')),
  );

  replaceChildren(container,
    h('header', { class: 'settings-page__header' },
      h('h1', { class: 'settings-page__title' }, 'Create a group'),
      h('p', { class: 'settings-page__subtitle' }, 'You’ll be its owner. You can change everything later.'),
    ),
    section('About the group', null, form),
  );
  requestAnimationFrame(() => nameInput.focus());
}
