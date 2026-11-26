// @ts-check
/**
 * presence.js — who's online, for the "2 online" count on each group.
 *
 * Someone counts as online if they've used 3den in the last five minutes.
 * The app notes when the signed-in person is active (clicks, typing,
 * every minute while the tab is visible) in `state.presence`:
 *
 *   state.presence = { 'm-leo': 1731400000000, … }   ← last active, ms
 *
 * This prototype keeps everything in one browser, so other people only
 * show as online when someone signs in as them here, or when the demo
 * marks them online (`demoOnline: true` on a demo account, so the count
 * isn't always just you). A real server would track this live.
 */

import { getState, getMember, getCurrentUser, changeState } from './store.js';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
/** Don't save "still here" more often than this. */
const SAVE_EVERY_MS = 60 * 1000;

export function isOnline(memberId) {
  if (memberId === getCurrentUser()?.id) return true;
  if (getMember(memberId)?.demoOnline) return true;
  const lastActive = getState().presence?.[memberId] ?? 0;
  return Date.now() - lastActive < ONLINE_WINDOW_MS;
}

/** The members of a space who are online now. */
export function onlineMemberIds(space) {
  return (space?.memberIds ?? []).filter(isOnline);
}

/** Note that the signed-in person is here (saved at most once a minute). */
export function markActive() {
  const me = getCurrentUser();
  if (!me) return;
  const last = getState().presence?.[me.id] ?? 0;
  if (Date.now() - last < SAVE_EVERY_MS) return;
  changeState((state) => { state.presence = { ...state.presence, [me.id]: Date.now() }; });
}
