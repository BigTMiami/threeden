// @ts-check
/**
 * blocks.js — blocking and muting people.
 *
 *   Mute   You stop seeing their posts in your Feed and their comments are
 *          folded away. They aren't told and nothing else changes.
 *   Block  Mute, plus: neither of you can message the other, you don't show
 *          up in each other's member directories or searches, and any
 *          friendship between you ends. They aren't told either.
 *
 * Saved on the member who chose: member.blocked = [memberId], member.muted = [memberId].
 * Both are listed in Account → Blocked and muted, with Undo.
 *
 *   isBlocked(a, b)   → either has blocked the other
 *   isMuted(me, id)   → I muted or blocked them
 *   setBlocked(me, id, on) / setMuted(me, id, on)
 */

import { changeState, getMember } from './store.js';
import { removeFriendship } from './friends.js';

export function isBlocked(a, b) {
  if (!a || !b || a === b) return false;
  return Boolean(getMember(a)?.blocked?.includes(b) || getMember(b)?.blocked?.includes(a));
}

export function isMuted(meId, otherId) {
  const me = getMember(meId);
  return Boolean(me?.muted?.includes(otherId) || me?.blocked?.includes(otherId));
}

function setIn(listName, meId, otherId, on) {
  changeState(() => {
    const me = getMember(meId);
    const list = (me[listName] ?? []).filter((id) => id !== otherId);
    me[listName] = on ? [...list, otherId] : list;
  }, 'account');
}

export function setMuted(meId, otherId, on) { setIn('muted', meId, otherId, on); }

export function setBlocked(meId, otherId, on) {
  setIn('blocked', meId, otherId, on);
  if (on) { try { removeFriendship(meId, otherId); } catch { /* weren't friends */ } }
}

export const blockedBy = (meId) => getMember(meId)?.blocked ?? [];
export const mutedBy = (meId) => getMember(meId)?.muted ?? [];
