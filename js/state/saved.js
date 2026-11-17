// @ts-check
/**
 * saved.js — "Save for later": posts, events, and threads someone wants to
 * come back to. Only they see their saved list (Home ▾ → Saved, #saved).
 *
 *   isSaved(memberId, key)
 *   toggleSaved(memberId, entry)  → true if now saved
 *   savedOf(memberId)             → entries, newest first, without ones whose thing was deleted
 *
 * An entry: { key, kind: 'post' | 'event' | 'thread' | 'announcement' | 'photos' | 'blogpost',
 *             title, href, where, savedAt }
 * `key` is the same key reactions use (feedpost:<id>, an event id, …), so a
 * thing is saved once however you reach it.
 *
 * Saved on the member: member.saved = [entry, …]
 */

import { changeState, getMember } from './store.js';
import { findEvent } from './events.js';

export const isSaved = (memberId, key) => Boolean(getMember(memberId)?.saved?.some((s) => s.key === key));

export function toggleSaved(memberId, entry) {
  let nowSaved = false;
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    const list = member.saved ?? [];
    if (list.some((s) => s.key === entry.key)) member.saved = list.filter((s) => s.key !== entry.key);
    else { member.saved = [{ ...entry, savedAt: Date.now() }, ...list]; nowSaved = true; }
  }, 'account');
  return nowSaved;
}

export function removeSaved(memberId, key) {
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    member.saved = (member.saved ?? []).filter((s) => s.key !== key);
  }, 'account');
}

/** Newest first. Saved events that were deleted are left out. */
export function savedOf(memberId) {
  return (getMember(memberId)?.saved ?? []).filter((s) => s.kind !== 'event' || findEvent(s.eventId ?? s.key));
}
