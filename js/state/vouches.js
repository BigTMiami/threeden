// @ts-check
/**
 * vouches.js — "I've met them in person".
 *
 *   state.vouches = [{ fromId, toId, createdAt }]
 *
 * A quiet trust signal for people who only know each other online: on
 * someone's blog (and in member directories) you see who has met them,
 * people you know first ("Met in person by Maya and Theo"). You can say
 * you've met someone you share a group with. No counts or scores: names
 * only, and only of people the viewer can see.
 */

import { changeState, getState, getSpaces } from './store.js';
import { getFriendIds } from './friends.js';

export function hasVouched(fromId, toId) {
  return (getState().vouches ?? []).some((v) => v.fromId === fromId && v.toId === toId);
}

export function setVouch(fromId, toId, on) {
  changeState((state) => {
    const list = (state.vouches ?? []).filter((v) => !(v.fromId === fromId && v.toId === toId));
    state.vouches = on ? [...list, { fromId, toId, createdAt: Date.now() }] : list;
  }, 'account');
}

/** Who has met `toId`, for `viewerId`: you first, then your friends, then people in your groups. */
export function vouchersFor(toId, viewerId) {
  const friends = new Set(viewerId ? getFriendIds(viewerId) : []);
  const groupmates = new Set(getSpaces().filter((s) => s.kind === 'group' && s.memberIds.includes(viewerId)).flatMap((s) => s.memberIds));
  const rank = (id) => (id === viewerId ? 0 : friends.has(id) ? 1 : 2);
  return (getState().vouches ?? [])
    .filter((v) => v.toId === toId && (v.fromId === viewerId || friends.has(v.fromId) || groupmates.has(v.fromId)))
    .map((v) => v.fromId)
    .sort((a, b) => rank(a) - rank(b));
}

/** Can `fromId` say they've met `toId`? Only someone you share a group with. */
export function canVouch(fromId, toId) {
  if (!fromId || fromId === toId) return false;
  return getSpaces().some((s) => s.kind === 'group' && s.memberIds.includes(fromId) && s.memberIds.includes(toId));
}
