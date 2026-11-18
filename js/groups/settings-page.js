// @ts-check
/**
 * settings-page.js — a space's settings (#settings-<spaceId>).
 *
 *   ← 237 Hart Street
 *   Group settings
 *   [ General | Members | Roles & permissions | Appearance ]
 *   (the tab's contents)
 *
 * Everyone in a group can open its settings: they see what the group's
 * rules are, and only get controls for what their role allows (see
 * js/state/permissions.js). A personal homepage has just General and
 * Appearance.
 *
 * The tab is part of the URL (#settings-hart--members) so Back works.
 *
 * Changes to the name, appearance, roles and permissions aren't saved as
 * you make them: they collect in a draft (settings-drafts.js), and a bar
 * at the bottom offers Preview (see the homepage with them), Save and
 * Discard. Bigger one-off actions (adding someone, transferring ownership,
 * deleting the group) happen when you confirm them.
 */

import { renderBlogSetting } from './blog-choice.js';
import { renderModerationTab, openReportsFor } from './moderation-tab.js';
import { VISIBILITY_OPTIONS, JOINING_OPTIONS, visibilityOf, joiningOf } from '../state/group-access.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { getCurrentUser, getSpace, getSpaceMembers } from '../state/store.js';
import {
  ROLES, PERMISSIONS, roleOf, can, requiredRole, canManageRoles, isOwner,
} from '../state/permissions.js';
import { removeMember, transferOwnership, deleteGroup, snapshotGroup, restoreGroup } from '../state/groups.js';
import { renderHealthTab, healthCount } from './health-tab.js';
import {
  DRAFT_PART_LABELS, getDraft, setDraft, hasDraft, saveDraft, discardDraft, startPreview,
} from './settings-drafts.js';
import { renderMembersTab } from './members-tab.js';
import { renderLayoutTab } from './layout-tab.js';
import { renderAppearanceEditor } from './appearance-editor.js';
import { goTo, settingsHref, spaceHref } from '../router.js';
import { INTERESTS, groupInterests, groupPlace, setGroupExplore } from '../state/explore.js';
import { PLACES } from '../utils/places.js';

/**
 * Suggestions for a group's type: what it is, shown with its name ("Band",
 * "News outlet"). People can type anything; these are just offered.
 */
export const GROUP_TYPE_SUGGESTIONS = [
  'Band', 'Book club', 'Business', 'Choir', 'Class', 'Club', 'Community garden', 'Family', 'Friends', 'Household',
  'Mutual aid network', 'Neighborhood association', 'News outlet', 'Nonprofit', 'Parent group',
  'Sports team', 'Student group', 'Supper club', 'Tenants union', 'Union', 'Volunteer group',
];

/** The group type box: free text, with GROUP_TYPE_SUGGESTIONS offered as you type. */
export function groupTypeInput(value = '', { disabled = false, id = 'group-type-options' } = {}) {
  return [
    h('input', {
      type: 'text', class: 'input group-type-input', value, maxlength: '40', list: id, disabled,
      placeholder: 'e.g. Band, News outlet, Tenants union', 'aria-label': 'Group type',
    }),
    h('datalist', { id }, GROUP_TYPE_SUGGESTIONS.map((type) => h('option', { value: type }))),
  ];
}

/**
 * The two access choices, as two sets of radio buttons (General settings
 * and the New group page). Read them back with readAccessChoices(form).
 *
 *   Who can see it        ○ Public   ○ Private
 *   How people join       ○ Anyone can join  ○ Ask to join  ○ Invite only  ○ Admins add people
 */
export function accessChoices({ visibility, joining }, { disabled = false, prefix = '' } = {}) {
  const radios = (name, label, options, checkedId, hint) => h('fieldset', { class: 'settings-field settings-fieldset' },
    h('legend', { class: 'settings-field__label' }, label),
    h('div', { class: 'settings-choices', role: 'radiogroup', 'aria-label': label },
      options.map((option) => h('label', { class: 'settings-choice' },
        h('input', { type: 'radio', name: `${prefix}${name}`, value: option.id, checked: checkedId === option.id, disabled }),
        h('span', {}, h('strong', {}, option.label), h('span', { class: 'settings-field__hint' }, option.description)),
      ))),
    hint ? h('span', { class: 'settings-field__hint' }, hint) : null);
  return [
    radios('visibility', 'Who can see it', VISIBILITY_OPTIONS, visibility,
      'In a public group, you choose which tabs are public with the Public tab button above each page. Everything else stays members-only.'),
    radios('joining', 'How people join', JOINING_OPTIONS, joining),
    h('p', { class: 'access-note', role: 'status', 'aria-live': 'polite' }),
  ];
}

/**
 * Keeps the two access choices a pair that works, without disabling any of
 * them: a private group can't be found, so picking "Anyone can join" or "Ask
 * to join" makes it public, and picking Private on an open group makes it
 * invite only. Says what moved in the note under the choices.
 * @param {HTMLElement} form
 * @param {string} prefix
 * @param {string} changed  the name of the input that changed
 */
export function reconcileAccess(form, prefix, changed) {
  const pick = (name, value) => { const input = /** @type {HTMLInputElement | null} */ (form.querySelector(`input[name=${prefix}${name}][value=${value}]`)); if (input) input.checked = true; };
  const { visibility, joining } = readAccessChoices(form, prefix);
  const findable = joining === 'open' || joining === 'request';
  let message = '';
  if (visibility === 'private' && findable) {
    if (changed === `${prefix}joining`) {
      pick('visibility', 'public');
      message = `People can only find a group to ${joining === 'open' ? 'join' : 'ask'} if it’s public, so it’s Public now.`;
    } else {
      pick('joining', 'invite');
      message = 'Nobody can find a private group to join, so people join by invite now.';
    }
  }
  const note = form.querySelector('.access-note');
  if (note && (message || changed.startsWith(prefix))) note.textContent = message;
}

export function readAccessChoices(form, prefix = '') {
  return {
    visibility: form.querySelector(`input[name=${prefix}visibility]:checked`)?.value,
    joining: form.querySelector(`input[name=${prefix}joining]:checked`)?.value,
  };
}

const LAYOUT_TAB = { id: 'layout', label: 'Layout' };
// Groups have no Layout tab: their page is arranged in edit mode (Edit → Edit this page).
const GROUP_TABS = [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Members' },
  { id: 'permissions', label: 'Roles & permissions' },
  { id: 'appearance', label: 'Cover' },
  { id: 'moderation', label: 'Moderation' }, // moderation-tab.js: reports, for whoever can 'moderate'
  { id: 'health', label: 'Health' }, // health-tab.js: quiet members, unanswered questions, events with no host (organizers)
];
// Personal homepages and blogs: General, Layout (templates or modules), Appearance.
const PERSONAL_TABS = [GROUP_TABS[0], LAYOUT_TAB, GROUP_TABS.find((t) => t.id === 'appearance')];

export function renderSettingsPage(container, spaceId, tabId) {
  const space = getSpace(spaceId);
  const me = getCurrentUser();
  if (!space || !roleOf(space, me.id)) {
    replaceChildren(container, h('p', { class: 'module-empty' }, 'This group doesn’t exist, or you’re not a member.'));
    return;
  }

  // Personal homepages and blogs have just General, Layout, and Appearance.
  const isPersonal = space.kind === 'personal' || space.kind === 'blog';
  // Moderation only for people who moderate (moderation-tab.js).
  const tabs = isPersonal ? PERSONAL_TABS : GROUP_TABS
    .filter((tab) => tab.id !== 'moderation' || can(space, me.id, 'moderate'))
    .filter((tab) => tab.id !== 'health' || canManageRoles(space, me.id));
  const activeTab = tabs.find((tab) => tab.id === tabId) ?? tabs[0];
  const redraw = () => renderSettingsPage(container, spaceId, activeTab.id);

  // The bar with Preview / Save / Discard, shown while there are unsaved changes.
  const saveBar = h('div', { class: 'settings-save-bar', role: 'region', 'aria-label': 'Unsaved changes' });
  const onDraftChange = () => drawSaveBar(saveBar, space, redraw);

  const body = activeTab.id === 'layout' ? renderLayoutTab(space, me, redraw)
    : activeTab.id === 'members' ? renderMembersTab(space, me, redraw, onDraftChange)
    : activeTab.id === 'permissions' ? renderPermissionsTab(space, me, onDraftChange)
      : activeTab.id === 'appearance' ? renderAppearanceEditor(space, me, onDraftChange)
        : activeTab.id === 'moderation' ? renderModerationTab(space, me, redraw)
          : activeTab.id === 'health' ? renderHealthTab(space, me, redraw)
          : renderGeneralTab(space, me, onDraftChange);

  replaceChildren(container,
    // Back to the group (or homepage, or blog) these settings are for, always.
    h('a', { class: 'link-button module-page__back', href: spaceHref(space.id) }, icon('arrowLeft', 14), ` ${space.name}`),
    h('header', { class: 'settings-page__header' },
      h('h1', { class: 'settings-page__title' }, { personal: 'Homepage settings', blog: 'Blog settings' }[space.kind] ?? 'Group settings'),
      isPersonal ? null : h('p', { class: 'settings-page__subtitle' }, `You’re ${roleDescription(roleOf(space, me.id))} of ${space.name}.`),
    ),
    renderSettingsTabs(space, me, tabs, activeTab),
    h('div', { class: 'settings-page__body' }, body),
    saveBar,
  );
  onDraftChange();
}

/**
 * The tabs. A group shows General and Members, and keeps the rest
 * behind "More" (opened by itself when you're on one of them, or when there
 * are reports to look at).
 */
const PRIMARY_TABS = ['general', 'members'];
let moreTabsOpen = false;
function renderSettingsTabs(space, me, tabs, activeTab) {
  const reports = can(space, me.id, 'moderate') ? new Set(openReportsFor(space.id).map((r) => r.key)).size : 0;
  const isGroup = space.kind === 'group';
  const extra = isGroup ? tabs.filter((t) => !PRIMARY_TABS.includes(t.id)) : [];
  const open = moreTabsOpen || extra.some((t) => t.id === activeTab.id);
  const shown = isGroup && !open ? tabs.filter((t) => PRIMARY_TABS.includes(t.id)) : tabs;
  const link = (tab) => h('a', {
    href: settingsHref(space.id, tab.id === 'general' ? null : tab.id),
    class: `settings-tabs__tab${tab.id === activeTab.id ? ' is-active' : ''}`,
    'aria-current': tab.id === activeTab.id ? 'page' : null,
  }, tab.label, tab.id === 'moderation' && reports ? h('span', { class: 'unread-badge settings-tabs__badge' }, String(reports)) : null,
    tab.id === 'health' && healthCount(space, me.id) ? h('span', { class: 'settings-tabs__dot', 'aria-label': 'needs a look' }) : null);
  const nav = h('nav', { class: 'settings-tabs', 'aria-label': 'Settings sections' },
    shown.map(link),
    extra.length && !extra.some((t) => t.id === activeTab.id) ? h('button', {
      type: 'button', class: 'settings-tabs__tab settings-tabs__more', 'aria-expanded': String(open),
      onClick: () => { moreTabsOpen = !open; nav.replaceWith(renderSettingsTabs(space, me, tabs, activeTab)); },
    }, open ? 'Fewer' : 'More', !open && reports ? h('span', { class: 'unread-badge settings-tabs__badge' }, String(reports)) : null, ' ', icon(open ? 'chevronUp' : 'chevronDown', 12)) : null);
  return nav;
}

/** "Unsaved changes: appearance, roles   [Preview] [Save changes] [Discard]" */
function drawSaveBar(bar, space, redraw) {
  bar.hidden = !hasDraft(space.id);
  if (bar.hidden) {
    replaceChildren(bar);
    delete bar.dataset.signature;
    return;
  }
  const draft = getDraft(space.id);
  const parts = Object.keys(draft).map((part) => DRAFT_PART_LABELS[part]).filter(Boolean);
  const canPreview = Boolean(draft.appearance || draft.details);

  // Only rebuild when the summary changes: typing in a field and then
  // clicking Save fires a change on the way, and rebuilding the bar right
  // then would swallow the click.
  const signature = `${parts.join(',')}|${canPreview}`;
  if (bar.dataset.signature === signature) return;
  bar.dataset.signature = signature;

  replaceChildren(bar,
    h('span', { class: 'settings-save-bar__text' }, h('strong', {}, 'Unsaved changes: '), parts.join(', ')),
    h('span', { class: 'settings-save-bar__actions' },
      canPreview ? h('button', {
        type: 'button',
        class: 'button',
        title: 'See the homepage with these changes, before saving',
        onClick: () => {
          startPreview(space.id);
          goTo(spaceHref(space.id));
        },
      }, icon('eye', 14), ' Preview') : null,
      h('button', {
        type: 'button',
        class: 'button button--primary',
        onClick: () => {
          const latest = getDraft(space.id);
          if (latest.details && !latest.details.name?.trim()) { showToast('The name can’t be empty.'); return; }
          saveDraft(space.id);
          showToast('Changes saved.');
          redraw();
        },
      }, 'Save changes'),
      h('button', {
        type: 'button',
        class: 'button button--quiet',
        onClick: () => {
          discardDraft(space.id);
          showToast('Changes discarded.');
          redraw();
        },
      }, 'Discard'),
    ),
  );
}

/** 'owner' → 'the owner', 'admin' → 'an admin', 'member' → 'a member'. */
const roleDescription = (roleId) => (roleId === 'owner' ? 'the owner' : roleId === 'admin' ? 'an admin' : 'a member');

// ─── Shared pieces ───────────────────────────────────────────────────────────

export function section(title, description, ...children) {
  return h('section', { class: 'settings-section' },
    h('h2', { class: 'settings-section__title' }, title),
    description ? h('p', { class: 'settings-section__description' }, description) : null,
    ...children,
  );
}

export function field(labelText, control, hint = null) {
  return h('label', { class: 'settings-field' },
    h('span', { class: 'settings-field__label' }, labelText),
    control,
    hint ? h('span', { class: 'settings-field__hint' }, hint) : null,
  );
}

/** "Only admins can change this." */
export function lockedNote(space, permissionId) {
  const role = requiredRole(space, permissionId);
  return h('p', { class: 'settings-locked' }, icon('lock', 13),
    role === 'owner' ? ' Only the owner can change this.' : role === 'admin' ? ' Only admins and the owner can change this.' : ' Any member can change this.');
}

// ─── General ─────────────────────────────────────────────────────────────────

function renderGeneralTab(space, me, onDraftChange) {
  const isPersonal = space.kind === 'personal';
  const isBlog = space.kind === 'blog';
  const canEdit = isPersonal || can(space, me.id, 'editDetails');
  // Start from the unsaved draft, if there is one.
  const current = {
    name: space.name, description: space.description ?? '', groupType: space.groupType ?? '',
    visibility: visibilityOf(space), joining: joiningOf(space), ...getDraft(space.id).details,
  };

  const nameInput = h('input', { type: 'text', class: 'input', value: current.name, disabled: !canEdit, 'aria-label': 'Name' });
  const descriptionInput = h('textarea', {
    class: 'input', rows: '3', disabled: !canEdit, 'aria-label': 'Description',
    placeholder: isBlog ? 'A line about you, shown at the top of your blog' : 'What the group is for, who it’s for',
  });
  descriptionInput.value = current.description;
  const [groupTypeField, groupTypeOptions] = groupTypeInput(current.groupType, { disabled: !canEdit });

  /** Every edit updates the draft (or clears it, if it matches what's saved). */
  function updateDraft() {
    const details = {
      name: nameInput.value,
      description: descriptionInput.value.trim(),
      ...(isPersonal || isBlog ? {} : { groupType: groupTypeField.value.trim(), ...readAccessChoices(form) }),
    };
    const unchanged = details.name.trim() === space.name
      && (isPersonal || details.description === (space.description ?? ''))
      && (isPersonal || isBlog || (details.visibility === visibilityOf(space) && details.joining === joiningOf(space)))
      && (isPersonal || isBlog || details.groupType === (space.groupType ?? ''));
    setDraft(space.id, 'details', unchanged ? null : { ...details, name: details.name.trim() });
    onDraftChange();
  }

  const form = h('form', {
    class: 'settings-form',
    onSubmit: (event) => event.preventDefault(),
    onInput: updateDraft,
    onChange: (event) => { reconcileAccess(form, '', event.target.name ?? ''); updateDraft(); },
  },
    field({ personal: 'Homepage name', blog: 'Blog name' }[space.kind] ?? 'Group name', nameInput),
    isPersonal || isBlog ? null : h('label', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Group type'),
      groupTypeField, groupTypeOptions,
      h('span', { class: 'settings-field__hint' }, 'What the group is, in a word or two. Shown with its name, on its page, and on Explore.')),
    isPersonal ? null : field(isBlog ? 'About you' : 'Description', descriptionInput),
    isPersonal || isBlog ? null : accessChoices(current, { disabled: !canEdit }),
    isBlog ? h('p', { class: 'settings-field__hint' }, 'Your blog is public: anyone on 3den can read it.') : null,
    canEdit ? null : lockedNote(space, 'editDetails'),
  );

  return [
    section({ personal: 'Your homepage', blog: 'Your blog' }[space.kind] ?? 'About this group', null, form),
    isPersonal || isBlog ? null : renderOnExplore(space, canEdit),
    isPersonal || isBlog ? null : renderBlogSetting(space, me), // show or hide your blog from members (blog-choice.js)
    isPersonal || isBlog ? null : renderDangerZone(space, me),
  ];
}

/**
 * On Explore: where the group meets and up to three things it's about, so
 * people nearby who are into them find it (js/state/explore.js). Saves
 * right away; a guess fills in until someone picks.
 */
function renderOnExplore(space, canEdit) {
  const root = h('div', {});
  const draw = () => {
    const fresh = getSpace(space.id) ?? space;
    const place = groupPlace(fresh);
    const chosen = groupInterests(fresh);
    const where = h('select', {
      class: 'input', disabled: !canEdit, 'aria-label': 'Where it meets',
      onChange: (e) => { setGroupExplore(space.id, { area: e.target.value }); showToast('Saved.'); draw(); },
    }, h('option', { value: '' }, 'Not set'), PLACES.map((p) => h('option', { value: p.id, selected: place?.id === p.id }, p.name)));
    replaceChildren(root, section('On Explore', visibilityOf(fresh) === 'public' ? 'Helps people nearby who are into these find the group.' : 'Only public groups show on Explore. These are used if you make it public.',
      h('div', { class: 'settings-form' },
        h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Where it meets'), where),
        h('div', { class: 'settings-field' },
          h('span', { class: 'settings-field__label' }, 'What it’s about (up to 3)'),
          h('div', { class: 'explore-interests', role: 'group', 'aria-label': 'What it’s about' }, INTERESTS.map((interest) => {
            const isOn = chosen.includes(interest.id);
            return h('button', {
              type: 'button', class: `chip${isOn ? ' is-on' : ''}`, 'aria-pressed': String(isOn), disabled: !canEdit || (!isOn && chosen.length >= 3),
              onClick: () => { setGroupExplore(space.id, { interests: isOn ? chosen.filter((id) => id !== interest.id) : [...chosen, interest.id] }); draw(); },
            }, `${interest.emoji} ${interest.label}`);
          }))))));
  };
  draw();
  return root;
}

/** Leave the group; for the owner, hand it over or delete it. */
function renderDangerZone(space, me) {
  if (!isOwner(space, me.id)) {
    return section('Leave group', 'You’ll stop seeing this group. You can undo for a few seconds; after that, someone will have to add you back.',
      h('button', {
        type: 'button',
        class: 'button button--danger',
        onClick: () => {
          const before = snapshotGroup(space.id);
          removeMember(space.id, me.id);
          goTo('#');
          showToast(`You left ${space.name}.`, {
            actionLabel: 'Undo',
            duration: 8000,
            onAction: () => { restoreGroup(before); goTo(settingsHref(space.id)); },
          });
        },
      }, 'Leave group'));
  }

  const others = getSpaceMembers(space).filter((m) => m.id !== me.id);
  const transferSelect = h('select', { class: 'input', 'aria-label': 'New owner' },
    others.map((m) => h('option', { value: m.id }, `${m.name} (@${m.username})`)));
  const transferButton = h('button', { type: 'button', class: 'button', disabled: others.length === 0 }, 'Make them the owner');
  transferButton.addEventListener('click', () => {
    const newOwner = others.find((m) => m.id === transferSelect.value);
    const before = snapshotGroup(space.id);
    transferOwnership(space.id, newOwner.id);
    goTo(settingsHref(space.id));
    showToast(`${newOwner.name} now owns ${space.name}. You’re an admin.`, {
      actionLabel: 'Undo',
      duration: 8000,
      onAction: () => { restoreGroup(before); goTo(settingsHref(space.id)); },
    });
  });

  // Undo replaces "type the name to confirm": one click, then a long toast.
  const deleteButton = h('button', { type: 'button', class: 'button button--danger' }, 'Delete this group');
  deleteButton.addEventListener('click', () => {
    const before = snapshotGroup(space.id);
    deleteGroup(space.id);
    goTo('#');
    showToast(`Deleted ${space.name}.`, {
      actionLabel: 'Undo',
      duration: 10000,
      onAction: () => { restoreGroup(before); goTo(spaceHref(space.id)); },
    });
  });

  return [
    section('Transfer ownership', 'You’ll become an admin. Owners can’t leave a group without handing it on first.',
      others.length ? h('div', { class: 'form-row' }, transferSelect, transferButton) : h('p', { class: 'module-empty' }, 'Add another member first.')),
    section('Delete group', 'Deletes the homepage and everything in its modules for every member. You’ll have a few seconds to undo it.',
      h('div', { class: 'form-row' }, deleteButton)),
  ];
}

// ─── Roles & permissions ─────────────────────────────────────────────────────

function renderPermissionsTab(space, me, onDraftChange) {
  const canEdit = canManageRoles(space, me.id);
  const draftPermissions = { ...getDraft(space.id).permissions };

  const rows = PERMISSIONS.map((permission) => {
    const saved = requiredRole(space, permission.id);
    const current = draftPermissions[permission.id] ?? saved;
    return h('tr', { class: current !== saved ? 'is-changed' : '' },
      h('th', { scope: 'row' },
        h('span', { class: 'permissions-table__label' }, permission.label),
        h('span', { class: 'settings-field__hint' }, permission.description)),
      h('td', {}, canEdit
        ? h('select', {
            class: 'input input--compact',
            'aria-label': `Who can ${permission.label.toLowerCase()}`,
            onChange: (event) => {
              // Only differences from what's saved go in the draft.
              if (event.target.value === saved) delete draftPermissions[permission.id];
              else draftPermissions[permission.id] = event.target.value;
              setDraft(space.id, 'permissions', Object.keys(draftPermissions).length ? { ...draftPermissions } : null);
              event.target.closest('tr').classList.toggle('is-changed', event.target.value !== saved);
              onDraftChange();
            },
          }, ROLES.slice().reverse().map((role) => h('option', { value: role.id, selected: role.id === current }, whoLabel(role.id))))
        : whoLabel(current)),
    );
  });

  return [
    section('Roles', null,
      h('dl', { class: 'roles-list' }, ROLES.map((role) => [
        h('dt', {}, role.label, ` · ${countWithRole(space, role.id)}`),
        h('dd', {}, role.description),
      ]))),
    section('Who can do what',
      canEdit ? 'Choose the lowest role allowed to do each thing. Higher roles can always do it too.' : null,
      h('table', { class: 'permissions-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Permission'), h('th', { scope: 'col' }, 'Who can'))),
        h('tbody', {}, rows)),
      canEdit ? null : h('p', { class: 'settings-locked' }, icon('lock', 13), ' Admins and the owner can change these.'),
    ),
  ];
}

/** 'member' → 'Everyone', 'admin' → 'Admins and owner', 'owner' → 'Only the owner'. */
function whoLabel(roleId) {
  return roleId === 'member' ? 'Everyone' : roleId === 'admin' ? 'Admins and owner' : 'Only the owner';
}

function countWithRole(space, roleId) {
  const count = space.memberIds.filter((id) => roleOf(space, id) === roleId).length;
  return `${count} ${count === 1 ? 'person' : 'people'}`;
}
