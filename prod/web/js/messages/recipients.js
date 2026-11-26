// @ts-check
/**
 * recipients.js — who you can start a conversation with, for "New message"
 * (messages-page.js) and the + menu's Message (quick-create.js).
 *
 *   messageablePeople(me)   → people you share a group with, your friends, and
 *                             your parents or children, A–Z, minus anyone a
 *                             child account can't write to (children.js)
 *   suggestedIds(me)        → people you talked to lately, then friends
 *   recipientContext(me, p) → "Friend", "Your child", or a group you share
 */

import { canMessage, parentsOf, childrenOf } from '../state/children.js';
import { getFriendIds } from '../state/friends.js';
import { getMember, getSpaces } from '../state/store.js';
import { getConversationsFor } from '../state/messages.js';

const myGroups = (me) => getSpaces().filter((s) => s.kind === 'group' && s.memberIds.includes(me.id));

export function messageablePeople(me) {
  const ids = new Set([
    ...myGroups(me).flatMap((s) => s.memberIds),
    ...getFriendIds(me.id),
    ...parentsOf(me.id),
    ...childrenOf(me.id).map((c) => c.id),
  ]);
  ids.delete(me.id);
  return [...ids].filter((id) => canMessage(me.id, id)).map(getMember).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function suggestedIds(me) {
  const recent = getConversationsFor(me.id)
    .filter((c) => c.kind === 'direct')
    .map((c) => c.memberIds.find((id) => id !== me.id))
    .filter(Boolean);
  return [...new Set([...recent, ...getFriendIds(me.id)])];
}

export function recipientContext(me, person) {
  if (parentsOf(me.id).includes(person.id)) return 'Your parent';
  if (childrenOf(me.id).some((c) => c.id === person.id)) return 'Your child';
  if (getFriendIds(me.id).includes(person.id)) return 'Friend';
  const shared = myGroups(me).filter((s) => s.memberIds.includes(person.id));
  if (!shared.length) return null;
  return shared.length === 1 ? shared[0].name : `${shared[0].name} and ${shared.length - 1} more`;
}
