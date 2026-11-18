// @ts-check
/**
 * members-tab.js — the Members tab of group settings.
 *
 *   Add people  [ @username        ][ Member ▾ ][ Add ]
 *     (in an invite-only group: Invite people [ @username ][ Invite ],
 *      for every member; they accept from their Groups page)
 *     [Invite link] → (clicked) https://…#join-k3x9q2ab  [Copy] [QR code] [New link] [Turn off]
 *   ── 4 members ──────────────────────── [ Search members ]
 *   (LL) Leo L  @leo · you            Owner
 *   (AA) Anna A @anna                 [ Admin ▾ ]   Remove
 *   …
 *   ‹ Previous   1–50 of 112   Next ›   (over 50 members: 50 at a time)
 *
 * Role changes and removals go into the settings draft (Save at the
 * bottom of the page applies them); adding someone happens right away.
 *
 * What you can do depends on your role (js/state/permissions.js):
 *   - "Add and remove members" decides who sees Add and Remove
 *   - admins and the owner change roles; nobody changes the owner's role
 *     (the owner hands the group on in General → Transfer ownership)
 */

import { joiningOf } from '../state/group-access.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { getSpaceMembers, getMember } from '../state/store.js';
import { ROLES, roleOf, roleLabel, can, canManageMember } from '../state/permissions.js';
import { getAccounts, findAccountByLogin } from '../state/accounts.js';
import { renderMemberImport } from './member-import.js';
import {
  addMember, declineJoinRequest, canInvite, inviteToGroup, cancelInvite, resetInviteLink, turnOffInviteLink, inviteLinkOf,
} from '../state/groups.js';
import { section, lockedNote } from './settings-page.js';
import { getDraft, setDraft } from './settings-drafts.js';
import { openInviteQr } from './invite-qr.js';

/** Owners first, then admins, then members; A–Z within each. */
const ROLE_ORDER = { owner: 0, admin: 1, member: 2 };

/** Members shown at a time. */
export const MEMBERS_PER_PAGE = 50;

/** The search and page of each group's list, kept while the tab redraws (a role change redraws it). */
const listViews = new Map();

/** Groups whose invite link was revealed (the link shows only after clicking "Invite link"). */
const shownLinks = new Set();

export function renderMembersTab(space, me, redraw, onDraftChange) {
  const canAddRemove = can(space, me.id, 'manageMembers');
  const members = getSpaceMembers(space).sort((a, b) =>
    ROLE_ORDER[roleOf(space, a.id)] - ROLE_ORDER[roleOf(space, b.id)] || a.name.localeCompare(b.name));

  const inviteOnly = joiningOf(space) === 'invite';
  // The invite link sits in the Add people (or Invite people) box.
  const linkBlock = canInvite(space, me.id) ? renderInviteLink(space, me, canAddRemove, redraw) : null;
  const addBox = canAddRemove && !inviteOnly ? renderAddForm(space, redraw, linkBlock)
    : inviteOnly && canInvite(space, me.id) ? renderInviteForm(space, me, redraw, linkBlock)
      : linkBlock ? section('Add people', null, linkBlock) : null;
  return [
    canAddRemove ? renderJoinRequests(space, redraw) : null,
    addBox,
    canInvite(space, me.id) ? renderMemberImport(space, me, redraw) : null,
    renderMemberList(space, me, members, canAddRemove, redraw, onDraftChange),
  ];
}

/** The members, with a search box, 50 at a time. */
function renderMemberList(space, me, members, canAddRemove, redraw, onDraftChange) {
  const view = listViews.get(space.id) ?? { query: '', page: 0 };
  listViews.set(space.id, view);
  const list = h('ul', { class: 'members-list' });
  const pager = h('div', { class: 'members-pager' });
  const search = h('input', {
    type: 'search',
    class: 'input input--compact members-search',
    placeholder: 'Search members',
    'aria-label': 'Search members',
    value: view.query,
    onInput: (event) => { view.query = event.target.value; view.page = 0; draw(); },
  });

  function draw() {
    const words = view.query.trim().toLowerCase();
    const found = words ? members.filter((m) => `${m.name} ${m.realName ?? ''} @${m.username}`.toLowerCase().includes(words)) : members;
    const pages = Math.max(1, Math.ceil(found.length / MEMBERS_PER_PAGE));
    view.page = Math.min(view.page, pages - 1);
    const start = view.page * MEMBERS_PER_PAGE;
    const shown = found.slice(start, start + MEMBERS_PER_PAGE);
    list.replaceChildren(...(shown.length
      ? shown.map((member) => renderMemberRow(space, me, member, canAddRemove, redraw, onDraftChange))
      : [h('li', { class: 'members-list__none' }, `No one matches “${view.query.trim()}”.`)]));
    pager.hidden = pages <= 1;
    pager.replaceChildren(...(pages <= 1 ? [] : [
      h('button', { type: 'button', class: 'button button--small', disabled: view.page === 0, onClick: () => { view.page -= 1; draw(); list.scrollIntoView({ block: 'nearest' }); } }, icon('chevronLeft', 13), ' Previous'),
      h('span', { class: 'members-pager__count' }, `${start + 1}–${start + shown.length} of ${found.length}`),
      h('button', { type: 'button', class: 'button button--small', disabled: view.page >= pages - 1, onClick: () => { view.page += 1; draw(); list.scrollIntoView({ block: 'nearest' }); } }, 'Next ', icon('chevronRight', 13)),
    ]));
  }
  draw();

  const element = section(`${members.length} ${members.length === 1 ? 'member' : 'members'}`, null,
    list,
    pager,
    canAddRemove ? null : lockedNote(space, 'manageMembers'),
  );
  // The search box sits on the heading's line.
  const heading = element.querySelector('h2');
  const head = h('div', { class: 'members-section__head' });
  heading?.replaceWith(head);
  head.append(...[heading, search].filter(Boolean));
  element.classList.add('members-section');
  return element;
}

/** People who asked to join (from the Groups page's Explore tab). */
function renderJoinRequests(space, redraw) {
  const requests = (space.joinRequests ?? []).map((r) => ({ ...r, member: getMember(r.memberId) })).filter((r) => r.member);
  if (requests.length === 0) return null;
  return section(`Requests to join · ${requests.length}`, null,
    h('ul', { class: 'members-list' }, requests.map(({ member }) => h('li', { class: 'members-list__row' },
      avatar(member, 32),
      h('span', { class: 'members-list__text' }, h('strong', {}, member.name), h('span', { class: 'members-list__meta' }, `@${member.username}`)),
      h('button', {
        type: 'button',
        class: 'button button--small button--primary',
        onClick: () => { addMember(space.id, member.id); showToast(`${member.name} joined ${space.name}.`); redraw(); },
      }, 'Accept'),
      h('button', {
        type: 'button',
        class: 'link-button link-button--danger',
        onClick: () => { declineJoinRequest(space.id, member.id); redraw(); },
      }, 'Decline'),
    ))));
}

function renderAddForm(space, redraw, linkBlock = null) {
  // Everyone with an account who isn't in the group yet, for suggestions.
  const others = getAccounts().filter((account) => !space.memberIds.includes(account.id));
  const listId = `add-member-options-${space.id}`;

  const input = h('input', {
    type: 'text',
    class: 'input',
    placeholder: '@username or email',
    list: listId,
    autocomplete: 'off',
    'aria-label': 'Username or email of the person to add',
  });
  const roleSelect = h('select', { class: 'input input--compact', 'aria-label': 'Role' },
    ROLES.filter((r) => r.id !== 'owner').reverse().map((role) => h('option', { value: role.id }, role.label)));
  const error = h('p', { class: 'form-error', role: 'alert' });

  const form = h('form', {
    class: 'settings-form',
    onSubmit: (event) => {
      event.preventDefault();
      const account = findAccountByLogin(input.value);
      if (!account) {
        error.textContent = 'There’s no account with that username or email. Send them the invite link instead.';
        return;
      }
      if (space.memberIds.includes(account.id)) {
        error.textContent = `${account.name} is already in the group.`;
        return;
      }
      if (addMember(space.id, account.id, roleSelect.value) === 'asked') showToast(`${account.name} has a child’s account, so we asked their parent first.`);
      else showToast(`Added ${account.name} to ${space.name}.`);
      redraw();
    },
  },
    h('div', { class: 'form-row' }, input, roleSelect, h('button', { type: 'submit', class: 'button button--primary' }, icon('plus', 14), ' Add')),
    h('datalist', { id: listId }, others.map((account) => h('option', { value: `@${account.username}` }, account.name))),
    error,
  );

  return section('Add people', 'Add someone who already has a 3den account. They’ll see the group in their Groups menu right away.', form, linkBlock);
}

/** An Invite-only group: any member invites someone, who then accepts (or not). */
function renderInviteForm(space, me, redraw, linkBlock = null) {
  const others = getAccounts().filter((account) => !space.memberIds.includes(account.id));
  const listId = `invite-options-${space.id}`;
  const input = h('input', {
    type: 'text', class: 'input', placeholder: '@username or email', list: listId, autocomplete: 'off',
    'aria-label': 'Username or email of the person to invite',
  });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const pending = (space.invites ?? []).map((invite) => ({ ...invite, member: getMember(invite.memberId) })).filter((i) => i.member);

  const form = h('form', {
    class: 'settings-form',
    onSubmit: (event) => {
      event.preventDefault();
      const account = findAccountByLogin(input.value);
      if (!account) { error.textContent = 'There’s no account with that username or email. Send them the invite link instead.'; return; }
      if (space.memberIds.includes(account.id)) { error.textContent = `${account.name} is already in the group.`; return; }
      if (!inviteToGroup(space.id, account.id, me.id)) { error.textContent = `${account.name} is already invited.`; return; }
      showToast(`Invited ${account.name}. They’ll see it in their notifications and on their Groups page.`);
      redraw();
    },
  },
    h('div', { class: 'form-row' }, input, h('button', { type: 'submit', class: 'button button--primary' }, icon('plus', 14), ' Invite')),
    h('datalist', { id: listId }, others.map((account) => h('option', { value: `@${account.username}` }, account.name))),
    error,
    pending.length ? h('ul', { class: 'members-list members-list--invites' }, pending.map((invite) => h('li', { class: 'members-list__row' },
      avatar(invite.member, 28),
      h('span', { class: 'members-list__text' },
        h('strong', {}, invite.member.name),
        h('span', { class: 'members-list__meta' }, `Invited by ${getMember(invite.invitedBy)?.name ?? 'someone'} · waiting for an answer`)),
      h('button', { type: 'button', class: 'link-button', onClick: () => { cancelInvite(space.id, invite.memberId); redraw(); } }, 'Cancel'),
    ))) : null,
  );
  return section('Invite people', 'Anyone in the group can invite people. They join when they accept.', form, linkBlock);
}

/**
 * The group's invite link: anyone who opens it can join. Members who can
 * invite see and copy it; admins make a new one or turn it off.
 */
function renderInviteLink(space, me, isAdmin, redraw) {
  const link = inviteLinkOf(space);
  const copy = () => {
    navigator.clipboard?.writeText(link).then(() => showToast('Invite link copied.'), () => showToast('Couldn’t copy. Select the link and copy it.'));
  };
  const block = (...children) => h('div', { class: 'invite-link-block' }, ...children);
  // At first just a button; clicking it shows the link (making one first if there isn't one yet).
  if (!link || !shownLinks.has(space.id)) {
    return block(
      link || isAdmin
        ? h('button', {
            type: 'button', class: 'button button--small invite-link-block__reveal',
            onClick: () => { if (!link) resetInviteLink(space.id); shownLinks.add(space.id); redraw(); },
          }, icon('link', 14), ' Invite link')
        : h('p', { class: 'settings-field__hint' }, 'There’s no invite link yet. An admin can make one.'));
  }
  const field = h('input', { type: 'text', class: 'input invite-link__field', value: link, readonly: true, 'aria-label': 'Invite link', onFocus: (event) => event.target.select() });
  return block(
    h('h3', { class: 'invite-link-block__title' }, icon('link', 13), ' Invite link'),
    h('p', { class: 'settings-field__hint' }, 'Anyone who opens this link can join the group, so share it only with people you want in.'),
    h('div', { class: 'form-row invite-link' },
      field,
      h('button', { type: 'button', class: 'button button--primary', onClick: copy }, 'Copy'),
      // For meetings: a code people in the room scan with their phones (invite-qr.js).
      h('button', { type: 'button', class: 'button', onClick: () => openInviteQr(space, link) }, 'QR code'),
      isAdmin ? h('button', {
        type: 'button', class: 'button', title: 'The old link stops working',
        onClick: () => { resetInviteLink(space.id); showToast('Made a new link. The old one no longer works.'); redraw(); },
      }, 'New link') : null,
      isAdmin ? h('button', {
        type: 'button', class: 'link-button link-button--danger',
        onClick: () => { turnOffInviteLink(space.id); shownLinks.delete(space.id); showToast('Invite link turned off.'); redraw(); },
      }, 'Turn off') : null));
}

function renderMemberRow(space, me, member, canAddRemove, redraw, onDraftChange) {
  const savedRole = roleOf(space, member.id);
  const draft = getDraft(space.id);
  const role = draft.roles?.[member.id] ?? savedRole;
  const isRemoved = (draft.removed ?? []).includes(member.id);
  const isMe = member.id === me.id;
  const canChange = canManageMember(space, me.id, member.id);

  /** Put a change for this member in the draft, then redraw the tab. */
  function changeDraft(changeFn) {
    const current = getDraft(space.id);
    const { roles, removed } = changeFn({ roles: { ...current.roles }, removed: [...(current.removed ?? [])] });
    setDraft(space.id, 'roles', Object.keys(roles).length ? roles : null);
    setDraft(space.id, 'removed', removed.length ? removed : null);
    onDraftChange();
    redraw();
  }

  const roleControl = canChange && !isRemoved
    ? h('select', {
        class: 'input input--compact',
        'aria-label': `${member.name}'s role`,
        onChange: (event) => changeDraft(({ roles, removed }) => {
          if (event.target.value === savedRole) delete roles[member.id];
          else roles[member.id] = event.target.value;
          return { roles, removed };
        }),
      }, ROLES.filter((r) => r.id !== 'owner').map((r) => h('option', { value: r.id, selected: r.id === role }, r.label)))
    : h('span', { class: `role-badge role-badge--${role}` }, roleLabel(role));

  let removeControl = h('span', { class: 'members-list__spacer' });
  if (canAddRemove && canChange) {
    removeControl = isRemoved
      ? h('button', {
          type: 'button',
          class: 'link-button',
          onClick: () => changeDraft(({ roles, removed }) => ({ roles, removed: removed.filter((id) => id !== member.id) })),
        }, 'Keep')
      : h('button', {
          type: 'button',
          class: 'link-button link-button--danger',
          onClick: () => changeDraft(({ roles, removed }) => ({ roles, removed: [...removed, member.id] })),
        }, 'Remove');
  }

  return h('li', { class: `members-list__row${isRemoved ? ' is-removed' : ''}${role !== savedRole ? ' is-changed' : ''}` },
    avatar(member, 32),
    h('span', { class: 'members-list__text' },
      h('strong', {}, member.name),
      h('span', { class: 'members-list__meta' },
        // An alias (store.memberIn): their own name beside it.
        `${member.realName ? `${member.realName} · ` : ''}@${member.username}${isMe ? ' · you' : ''}`,
        isRemoved ? ' · will be removed when you save' : role !== savedRole ? ` · will become ${roleLabel(role).toLowerCase()} when you save` : '')),
    roleControl,
    removeControl,
  );
}
