// @ts-check
/**
 * groups.js — creating groups and running them: details, members, roles,
 * permissions, appearance, leaving and deleting.
 *
 * These actions save straight away. They don't check permissions
 * themselves; the settings page only shows people the controls they're
 * allowed to use (see permissions.js), and a real backend would check
 * again on the server.
 */

import { changeState, getSpace, getState, getMember } from './store.js';
import { can } from './permissions.js';
import { notify } from './notifications.js';
import { createStarterGroupModules } from '../data/starters.js';
import { makeId } from '../ui/dom.js';
import { getModuleType } from '../modules/registry.js';
import { visibilityOf, joiningOf, isPublicGroup } from './group-access.js';
import { isChild, isParentOf, askToJoin } from './children.js';

/** Make a group with you as its owner, and a few modules to start with (from a template). Returns it. */
/** Module types that face outward: on a two-tab group, they start on the Public tab. */
const PUBLIC_FACING = ['generalfeed', 'textfeed', 'articles', 'events', 'carousel'];

export function createGroup({ name, description = '', visibility = 'private', joining = 'invite', template = 'other', groupType = '' }) {
  const { currentUserId } = getState();
  // Template modules without data start with their type's own (a forum, a to-do list…).
  let modules = createStarterGroupModules(template)
    .map((m) => (m.data ? m : { ...m, data: getModuleType(m.type).createInitialData(getState()) }));
  // A public group that picks its own members (a band, a newsroom) starts with two tabs: Private for
  // members, first, and Public for everyone. What faces outward (photos, events, stories, posts) goes on Public.
  const twoTabs = visibility === 'public' && (joining === 'admins' || joining === 'invite');
  /** @type {{ id: string, name: string, visibility?: string }[] | null} */
  let tabs = visibility === 'public' ? [{ id: 'home', name: 'Home', visibility: 'public' }] : null;
  if (twoTabs) {
    tabs = [{ id: 'home', name: 'Private' }, { id: 'public', name: 'Public', visibility: 'public' }];
    const outward = modules.filter((m) => PUBLIC_FACING.includes(m.type));
    const onPublic = new Set((outward.length ? outward : modules.filter((m) => m.type !== 'upnext').slice(0, 1)).map((m) => m.id));
    modules = modules.map((m) => (onPublic.has(m.id) ? { ...m, tabId: 'public' } : m));
  }
  const group = {
    id: makeId('grp'),
    kind: 'group',
    name: name.trim(),
    description: description.trim(),
    visibility, // who can see it: 'public' or 'private' (see group-access.js)
    joining, // how people join: 'open', 'request', 'invite', or 'admins'
    groupType: groupType.trim(), // what it is: "Band", "News outlet" (optional)
    memberIds: [currentUserId],
    roles: { [currentUserId]: 'owner' },
    permissions: {},
    appearance: {},
    template,
    createdAt: Date.now(), // also turns on suggestions as it grows (js/groups/group-suggestions.js)
    modules,
    // A public group starts with its Home tab public (or a Private and a Public tab, above); an invite-only one with a link to share.
    ...(tabs ? { tabs } : {}),
    ...(joining === 'invite' ? { inviteCode: Math.random().toString(36).slice(2, 10) } : {}),
  };
  changeState((state) => state.spaces.push(group), 'space');
  return group;
}

/** Rename any space (a personal homepage falls back to "My homepage"). */
export function renameSpace(spaceId, name) {
  changeState(() => {
    const space = getSpace(spaceId);
    space.name = name.trim() || (space.kind === 'personal' ? 'My homepage' : space.name);
  }, 'space');
}

/** A space's short description (a blog's About). */
export function setSpaceDescription(spaceId, text) {
  changeState(() => { getSpace(spaceId).description = text.trim(); }, 'space');
}

/**
 * Change a group's name, description, type, who can see it, or how people
 * join. Making a group public with nothing public on it makes Home public,
 * so visitors find something; switching to invite only makes an invite link.
 */
export function updateGroupDetails(spaceId, changes) {
  changeState(() => {
    const space = getSpace(spaceId);
    const wasPublic = isPublicGroup(space);
    Object.assign(space, changes);
    delete space.privacy; // the old single setting (see group-access.js)
    if (isPublicGroup(space) && !wasPublic) {
      const tabs = space.tabs?.length ? space.tabs : [{ id: 'home', name: 'Home' }];
      if (!tabs.some((t) => t.visibility === 'public')) tabs[0] = { ...tabs[0], visibility: 'public' };
      space.tabs = tabs;
    }
    if (joiningOf(space) === 'invite' && !space.inviteCode) space.inviteCode = Math.random().toString(36).slice(2, 10);
  }, 'space', 'layout');
}

/**
 * Put someone in a group. A child account goes in only with a parent's OK:
 * without `parentOk`, their parents are asked instead (children.js), and
 * this returns 'asked'. Otherwise 'joined' (or null if already in).
 */
export function addMember(spaceId, memberId, role = 'member', { parentOk = false, via = null, byId = null } = {}) {
  if (getSpace(spaceId)?.memberIds.includes(memberId)) return null;
  const me = getState().currentUserId;
  if (isChild(memberId) && !parentOk && !isParentOf(me, memberId)) { // a parent adding their own child is the OK
    askToJoin(memberId, spaceId, via ?? (me === memberId ? 'join' : 'added'), byId ?? (me === memberId ? null : me));
    return 'asked';
  }
  changeState(() => {
    const space = getSpace(spaceId);
    if (space.memberIds.includes(memberId)) return;
    space.memberIds.push(memberId);
    space.roles = { ...space.roles, [memberId]: role };
    space.joinedAt = { ...space.joinedAt, [memberId]: Date.now() }; // for the welcome checklist (welcome-checklist.js)
    space.joinRequests = (space.joinRequests ?? []).filter((r) => r.memberId !== memberId);
    space.invites = (space.invites ?? []).filter((i) => i.memberId !== memberId);
  }, 'space', 'layout');
  return 'joined';
}

// ─── Invitations and invite links ───────────────────────────────────────────
//
// In an invite-only group (joining 'invite') any member can bring people in,
// two ways:
//   - a member invites them by username: they get a notification, and an
//     Accept / Decline on their Groups page   (space.invites)
//   - they open the group's invite link, #join-<code>   (space.inviteCode)
// Other groups can have an invite link too; there only admins share it.
// Whether the group shows up on Explore is separate (visibilityOf).

/** Can this member invite people? Anyone in an invite-only group; elsewhere, whoever can add members. */
export function canInvite(space, memberId) {
  if (!space?.memberIds.includes(memberId)) return false;
  return joiningOf(space) === 'invite' || can(space, memberId, 'manageMembers');
}

/** Invite someone. Returns false if they're already in the group or invited. */
export function inviteToGroup(spaceId, memberId, invitedBy) {
  const space = getSpace(spaceId);
  if (!space || space.memberIds.includes(memberId) || (space.invites ?? []).some((i) => i.memberId === memberId)) return false;
  changeState(() => {
    space.invites = [...(space.invites ?? []), { memberId, invitedBy, at: Date.now() }];
  }, 'space');
  notify({
    recipientIds: [memberId],
    actorId: invitedBy,
    kind: 'invited',
    text: `${getMember(invitedBy)?.name ?? 'Someone'} invited you to join ${space.name}`,
    spaceId,
    href: '#groups',
  });
  return true;
}

/** Your open invitations: [{ space, invite }], newest first. */
export function getInvitesFor(memberId) {
  return getState().spaces
    .filter((space) => space.kind === 'group' && !space.memberIds.includes(memberId))
    .flatMap((space) => (space.invites ?? []).filter((i) => i.memberId === memberId).map((invite) => ({ space, invite })))
    .sort((a, b) => b.invite.at - a.invite.at);
}

/** Returns 'joined', or 'asked' for a child account (its parents decide). */
export function acceptInvite(spaceId, memberId) {
  const invite = (getSpace(spaceId)?.invites ?? []).find((i) => i.memberId === memberId);
  return addMember(spaceId, memberId, 'member', { via: 'invite', byId: invite?.invitedBy ?? null }); // also clears the invitation
}

/** Turn an invitation down, or (as a member) take one back. */
export function cancelInvite(spaceId, memberId) {
  changeState(() => {
    const space = getSpace(spaceId);
    space.invites = (space.invites ?? []).filter((i) => i.memberId !== memberId);
  }, 'space');
}

/** Make a new invite link (the old one stops working). Returns the code. */
export function resetInviteLink(spaceId) {
  const code = Math.random().toString(36).slice(2, 10);
  changeState(() => { getSpace(spaceId).inviteCode = code; }, 'space');
  return code;
}

export function turnOffInviteLink(spaceId) {
  changeState(() => { delete getSpace(spaceId).inviteCode; }, 'space');
}

/** The whole link to share: https://…/index.html#join-k3x9q2ab */
export function inviteLinkOf(space) {
  if (!space?.inviteCode) return null;
  return `${window.location.href.split('#')[0]}#join-${space.inviteCode}`;
}

export function findGroupByInviteCode(code) {
  return getState().spaces.find((space) => space.kind === 'group' && space.inviteCode && space.inviteCode === code) ?? null;
}

// ─── Finding and joining groups (the Groups page's Explore tab) ─────────────

/** Public groups you're not in (private ones never show up on Explore or in search; none for child accounts). */
export function getDiscoverableGroups(memberId) {
  if (isChild(memberId)) return [];
  return getState().spaces.filter((space) => space.kind === 'group'
    && !space.memberIds.includes(memberId)
    && visibilityOf(space) === 'public');
}

export function hasRequestedToJoin(space, memberId) {
  return (space.joinRequests ?? []).some((r) => r.memberId === memberId);
}

/**
 * Join an open group straight away, or ask to join an "Ask to join" group
 * (an admin says yes in Settings → Members). Invite-only and admins-add
 * groups have no button for this; people come in by invitation.
 * Returns 'joined', 'requested', 'asked' (a child account: its parents were
 * asked), or null.
 */
export function joinOrRequest(spaceId, memberId) {
  const space = getSpace(spaceId);
  const joining = joiningOf(space);
  if (joining !== 'open' && joining !== 'request') return null;
  if (isChild(memberId)) { askToJoin(memberId, spaceId, 'join'); return 'asked'; }
  if (joining === 'open') {
    addMember(spaceId, memberId);
    return 'joined';
  }
  changeState(() => {
    if (!hasRequestedToJoin(space, memberId)) space.joinRequests = [...(space.joinRequests ?? []), { memberId, at: Date.now() }];
  }, 'space');
  return 'requested';
}

/** Take back your request, or (as an admin) turn someone's down. */
export function declineJoinRequest(spaceId, memberId) {
  changeState(() => {
    const space = getSpace(spaceId);
    space.joinRequests = (space.joinRequests ?? []).filter((r) => r.memberId !== memberId);
  }, 'space');
}

/** Remove someone from a group (also used for leaving). The owner can't be removed. */
export function removeMember(spaceId, memberId) {
  changeState(() => {
    const space = getSpace(spaceId);
    if (space.roles?.[memberId] === 'owner') return;
    space.memberIds = space.memberIds.filter((id) => id !== memberId);
    const { [memberId]: _removed, ...roles } = space.roles ?? {};
    space.roles = roles;
  }, 'space', 'layout');
}

/** Make someone an admin or a member. (Use transferOwnership for 'owner'.) */
export function setRole(spaceId, memberId, role) {
  if (role === 'owner') return;
  changeState(() => {
    const space = getSpace(spaceId);
    if (space.roles?.[memberId] === 'owner') return;
    space.roles = { ...space.roles, [memberId]: role };
  }, 'space', 'mode');
}

/** Hand the group to another member. The old owner becomes an admin. */
export function transferOwnership(spaceId, toMemberId) {
  changeState(() => {
    const space = getSpace(spaceId);
    const roles = { ...space.roles };
    for (const [id, role] of Object.entries(roles)) if (role === 'owner') roles[id] = 'admin';
    roles[toMemberId] = 'owner';
    space.roles = roles;
  }, 'space', 'mode');
}

/** Set the lowest role allowed to do something (see PERMISSIONS in permissions.js). */
export function setPermission(spaceId, permissionId, role) {
  changeState(() => {
    const space = getSpace(spaceId);
    space.permissions = { ...space.permissions, [permissionId]: role };
  }, 'space', 'mode');
}

/** Replace a space's appearance settings (see js/groups/appearance.js). */
export function updateAppearance(spaceId, appearance) {
  changeState(() => { getSpace(spaceId).appearance = appearance; }, 'space');
}

/**
 * A copy of a group as it is now, so Undo can put it back after leaving,
 * removing someone, handing it on, or deleting it.
 */
export function snapshotGroup(spaceId) {
  const spaces = getState().spaces;
  const index = spaces.findIndex((space) => space.id === spaceId);
  return index < 0 ? null : { index, space: structuredClone(spaces[index]) };
}

/** Put a group back exactly as `snapshotGroup` saw it. */
export function restoreGroup(snapshot) {
  if (!snapshot) return;
  changeState((state) => {
    const at = state.spaces.findIndex((space) => space.id === snapshot.space.id);
    if (at >= 0) state.spaces[at] = structuredClone(snapshot.space);
    else state.spaces.splice(Math.min(snapshot.index, state.spaces.length), 0, structuredClone(snapshot.space));
  }, 'space', 'layout');
}

export function deleteGroup(spaceId) {
  changeState((state) => {
    state.spaces = state.spaces.filter((space) => space.id !== spaceId);
  }, 'space', 'layout');
}
