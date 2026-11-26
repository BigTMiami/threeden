// @ts-check
/**
 * children.js — accounts for children, run by a parent or guardian.
 *
 * A parent sets one up (sign-up page: "Set up an account for a child", or
 * Account settings → Children). The child's account:
 *   - can't explore: no Explore tab, no group suggestions, and search finds
 *     only their own groups and the people in them
 *   - joins a group only with a parent's OK: Join, an invitation, an invite
 *     link, or an admin adding them all become a request to the parents
 *     (state.childRequests), who say yes or no in Account settings →
 *     Children (they get a notification)
 *   - messages only their parents and people in their groups, and only they
 *     can message the child
 *   - has no blog, Feed, or friend requests (member.socialOff)
 *
 *   member.child = { parentIds: [id], birthYear, createdAt }
 *   state.childRequests = [{ id, childId, spaceId, via, byId, at, status: 'waiting' | 'yes' | 'no', decidedBy, decidedAt }]
 *     via: 'join' (they pressed Join), 'invite' (someone invited them),
 *          'link' (an invite link), 'added' (an admin added them)
 *
 * Parents can see a child's groups, take them out of one, and (prototype
 * only) open the child's account to see it as they would.
 */

import { changeState, getState, getMember, getSpace } from './store.js';
import { notify } from './notifications.js';
import { makeId } from '../ui/dom.js';
import { initialsFor } from './accounts.js';
import { createStarterHomepage } from '../data/starters.js';

/** Is this person a child account? */
export function isChild(memberOrId) {
  const member = typeof memberOrId === 'string' ? getMember(memberOrId) : memberOrId;
  return Boolean(member?.child);
}

export const parentsOf = (childId) => getMember(childId)?.child?.parentIds ?? [];
export const isParentOf = (parentId, childId) => parentsOf(childId).includes(parentId);
export const childrenOf = (parentId) => getState().members.filter((m) => m.child?.parentIds.includes(parentId));

/** Ages a child account is for: under 18. */
export const CHILD_MAX_AGE = 17;
export function birthYearProblem(year) {
  const now = new Date().getFullYear();
  const y = Number(year);
  if (!y || y < now - CHILD_MAX_AGE - 1 || y > now) return `Pick the year they were born (for children ${CHILD_MAX_AGE} and under).`;
  return '';
}

/** Make a child's account, run by `parentId`. Returns the new member. */
export function createChildAccount({ parentId, name, username, password, birthYear }) {
  const member = {
    id: makeId('m'),
    name: name.trim(),
    username,
    email: '',
    initials: initialsFor(name),
    color: '#7b5ea7',
    bio: '',
    password,
    createdAt: Date.now(),
    socialOff: true, // no blog, Feed, or friend requests
    child: { parentIds: [parentId], birthYear: Number(birthYear), createdAt: Date.now() },
  };
  changeState((state) => {
    state.members.push(member);
    state.spaces.push(createStarterHomepage(member.id));
  }, 'account');
  return member;
}

const WHAT = { join: 'wants to join', invite: 'was invited to', link: 'opened an invite link to', added: 'was added to' };

/**
 * Ask the parents whether `childId` may join `spaceId`. Returns the request
 * (an earlier one still waiting is reused).
 */
export function askToJoin(childId, spaceId, via = 'join', byId = null) {
  const space = getSpace(spaceId);
  const child = getMember(childId);
  if (!space || !child) return null;
  const waiting = waitingRequests(childId).find((r) => r.spaceId === spaceId);
  if (waiting) return waiting;
  const request = { id: makeId('creq'), childId, spaceId, via, byId, at: Date.now(), status: 'waiting' };
  changeState((state) => { state.childRequests = [...(state.childRequests ?? []), request]; }, 'account', 'space');
  const by = byId && via !== 'join' && via !== 'link' ? ` by ${getMember(byId)?.name ?? 'someone'}` : '';
  notify({
    recipientIds: parentsOf(childId),
    actorId: childId,
    kind: 'invited',
    text: `${child.name.split(' ')[0]} ${WHAT[via] ?? 'wants to join'} ${space.name}${by}. Say yes or no in Children.`,
    spaceId,
    href: '#account-children',
  });
  return request;
}

/** Requests still waiting: one child's, or (with parentId) all of a parent's children's. */
export function waitingRequests(childId = null, parentId = null) {
  return (getState().childRequests ?? []).filter((r) => r.status === 'waiting'
    && (!childId || r.childId === childId)
    && (!parentId || isParentOf(parentId, r.childId)));
}

/** Has this child asked about this group and is waiting? */
export const isWaitingFor = (childId, spaceId) => waitingRequests(childId).some((r) => r.spaceId === spaceId);

/** A parent says yes (the child joins) or no. */
export async function decideRequest(requestId, parentId, yes) {
  const request = (getState().childRequests ?? []).find((r) => r.id === requestId);
  if (!request || request.status !== 'waiting' || !isParentOf(parentId, request.childId)) return;
  changeState(() => Object.assign(request, { status: yes ? 'yes' : 'no', decidedBy: parentId, decidedAt: Date.now() }), 'account');
  const space = getSpace(request.spaceId);
  if (yes && space) {
    const { addMember } = await import('./groups.js');
    addMember(request.spaceId, request.childId, 'member', { parentOk: true });
  }
  notify({
    recipientIds: [request.childId],
    actorId: parentId,
    kind: 'invited',
    text: yes ? `${getMember(parentId)?.name ?? 'Your parent'} said yes: you’re in ${space?.name ?? 'the group'}` : `${getMember(parentId)?.name ?? 'Your parent'} said not this time to ${space?.name ?? 'the group'}`,
    spaceId: yes ? request.spaceId : null,
    href: yes && space ? `#space-${space.id}` : '#groups',
  });
}

/** May `fromId` start a conversation with `toId`? Children: only their parents and people in their groups. */
export function canMessage(fromId, toId) {
  const childSide = [fromId, toId].filter((id) => isChild(id));
  if (!childSide.length) return true;
  return childSide.every((childId) => {
    const other = childId === fromId ? toId : fromId;
    if (isParentOf(other, childId) || isParentOf(childId, other)) return true;
    return getState().spaces.some((s) => s.kind === 'group' && s.memberIds.includes(childId) && s.memberIds.includes(other));
  });
}
