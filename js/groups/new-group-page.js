// @ts-check
/**
 * new-group-page.js — "Create a group" (#new-group).
 *
 * One page with every option (no steps): name, type, description, a
 * template, then who can see it and how people join (Nov 20: the template
 * comes first, since picking one sets those two). You become the group's
 * owner. A template (a set of modules for a household, a band, a
 * newsroom…) or a blank slate can be changed in edit mode, and you add
 * people in Group settings → Members. Picking a template moves the access
 * choices to where that kind of group usually wants them (until you pick
 * them yourself). Every access choice can be picked: "Anyone can join" or
 * "Ask to join" on a private group makes it public, and the page says so
 * (reconcileAccess in settings-page.js). After it's made, a short tour shows you around (group-tour.js).
 */

import { isChild } from '../state/children.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { createGroup } from '../state/groups.js';
import { goTo, spaceHref } from '../router.js';
import { section, field, accessChoices, readAccessChoices, reconcileAccess, groupTypeInput } from './settings-page.js';
import { GROUP_TEMPLATES } from '../data/starter-layouts.js';
import { getOnboarding, updateOnboarding } from '../onboarding/onboarding-state.js';
import { getCurrentUser } from '../state/store.js';
import { usernameProblem, suggestUsername, finishAccount } from '../state/accounts.js';
import { hashPassword, passwordProblem, MIN_PASSWORD_LENGTH } from '../account/password.js';
import { accessFor } from './group-access-defaults.js';
import { startGroupTour } from '../onboarding/group-tour.js';

const DEFAULT_TEMPLATE = 'friends';

/** Four broad templates, then "See more templates" for the rest (js/data/starter-layouts.js). */
function templateChoices() {
  const choice = (template) => h('label', { class: 'template-choice' },
    h('input', { type: 'radio', name: 'new-template', value: template.id, checked: template.id === DEFAULT_TEMPLATE }),
    h('span', {}, h('strong', {}, template.label), h('span', { class: 'settings-field__hint' }, template.description)));
  const offered = GROUP_TEMPLATES.filter((t) => !t.hidden);
  const more = h('div', { class: 'template-choices template-choices--more', hidden: true }, offered.filter((t) => !t.featured).map(choice));
  const toggle = h('button', {
    type: 'button', class: 'link-button template-choices__more', 'aria-expanded': 'false',
    onClick: () => {
      more.hidden = !more.hidden;
      toggle.setAttribute('aria-expanded', String(!more.hidden));
      replaceChildren(toggle, icon(more.hidden ? 'chevronDown' : 'chevronUp', 13), more.hidden ? ' See more templates' : ' Fewer templates');
    },
  }, icon('chevronDown', 13), ' See more templates');
  return h('div', { class: 'template-choices__wrap' },
    h('div', { class: 'template-choices' }, offered.filter((t) => t.featured).map(choice)),
    toggle,
    more);
}

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
      const group = createGroup({
        name,
        description: descriptionInput.value,
        ...readAccessChoices(form, 'new-'),
        template: form.querySelector('input[name=new-template]:checked').value,
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
    // A template decides the first modules; the full library is always there.
    // It comes before the access choices (Nov 20), since picking one sets them.
    h('div', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Start from a template'),
      h('span', { class: 'settings-field__hint' }, 'Each one is just a starting set of modules. You can change everything later in edit mode: add, remove, and rearrange modules.'),
      templateChoices()),
    // Two separate choices: a band can be public but add its own members.
    accessChoices(accessFor(DEFAULT_TEMPLATE), { prefix: 'new-' }),
    error,
    h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--primary' }, 'Create group'),
      h('a', { class: 'button button--quiet', href: '#' }, 'Cancel')),
  );

  // The access choices follow the template until you pick them yourself.
  // Every choice can be picked: one that needs the other choice to change
  // (a private group that anyone can join) changes it and says so.
  let accessTouched = false;
  const radio = (name, value) => form.querySelector(`input[name=new-${name}][value=${value}]`);
  form.addEventListener('change', (event) => {
    const { name, value } = event.target;
    if (name === 'new-template' && !accessTouched) {
      const access = accessFor(value);
      radio('visibility', access.visibility).checked = true;
      radio('joining', access.joining).checked = true;
    }
    if (name === 'new-visibility' || name === 'new-joining') {
      accessTouched = true;
      reconcileAccess(form, 'new-', name);
    }
  });

  replaceChildren(container,
    h('header', { class: 'settings-page__header' },
      h('h1', { class: 'settings-page__title' }, 'Create a group'),
      h('p', { class: 'settings-page__subtitle' }, 'You’ll be its owner. Pick a template to start with, or a blank slate. You can change everything later.'),
    ),
    section('About the group', null, form),
  );
  requestAnimationFrame(() => nameInput.focus());
}
