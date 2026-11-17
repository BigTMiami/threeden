// @ts-check
/**
 * friends.js — friend requests and friends.
 *
 * You send a friend request from someone's blog; when they accept, you're
 * friends, and each of you sees the other's new blog posts in your Feed
 * (js/feed/). Either of you can unfriend at any time.
 *
 * Saved in `state.friendships`:
 *   [{ id, from: 'm-leo', to: 'm-priya', status: 'pending' | 'accepted', createdAt, respondedAt }]
 * Declined and cancelled requests (and unfriending) simply remove the entry.
 *
 * People who've turned off blogs and the feed (`member.socialOff`, see
 * account settings) don't take part: no requests to or from them.
 */

import { changeState, getState, getMember, getCurrentUser } from './store.js';
import { notify } from './notifications.js';
import { makeId } from '../ui/dom.js';

function all() {
  return getState().friendships ?? [];
}

function between(a, b) {
  return all().find((f) => (f.from === a && f.to === b) || (f.from === b && f.to === a)) ?? null;
}

/** Does this person use blogs and the feed? (Everyone does unless they turned it off.) */
export function usesSocial(memberId) {
  const member = getMember(memberId);
  return Boolean(member) && !member.socialOff;
}

/**
 * Where `me` stands with `other`:
 *   'friends' | 'sent' (you asked) | 'received' (they asked) | 'none' | 'unavailable'
 */
export function friendStatus(me, other) {
  if (me === other || !usesSocial(me) || !usesSocial(other)) return 'unavailable';
  const friendship = between(me, other);
  if (!friendship) return 'none';
  if (friendship.status === 'accepted') return 'friends';
  return friendship.from === me ? 'sent' : 'received';
}

/** Member ids of someone's friends. */
export function getFriendIds(memberId) {
  return all()
    .filter((f) => f.status === 'accepted' && (f.from === memberId || f.to === memberId))
    .map((f) => (f.from === memberId ? f.to : f.from))
    .filter(usesSocial);
}

/** Requests waiting for this person to answer, newest first. */
export function incomingRequests(memberId) {
  return all().filter((f) => f.status === 'pending' && f.to === memberId && usesSocial(f.from)).sort((a, b) => b.createdAt - a.createdAt);
}

/** Requests this person sent that haven't been answered. */
export function outgoingRequests(memberId) {
  return all().filter((f) => f.status === 'pending' && f.from === memberId);
}

// ─── Changing ────────────────────────────────────────────────────────────────

export function sendFriendRequest(from, to) {
  if (friendStatus(from, to) !== 'none') return;
  changeState((state) => {
    state.friendships = [...(state.friendships ?? []), { id: makeId('friend'), from, to, status: 'pending', createdAt: Date.now(), respondedAt: null }];
  }, 'account');
  notify({ recipientIds: [to], actorId: from, kind: 'friend', text: `${getMember(from)?.name} sent you a friend request`, href: '#feed-friends' });
}

/** Accept the request between `me` and `other` (it must be theirs to you). */
export function acceptFriendRequest(me, other) {
  const friendship = between(me, other);
  if (!friendship || friendship.status !== 'pending' || friendship.to !== me) return;
  changeState(() => {
    friendship.status = 'accepted';
    friendship.respondedAt = Date.now();
  }, 'account');
  notify({ recipientIds: [other], actorId: me, kind: 'friend', text: `${getMember(me)?.name} accepted your friend request`, href: `#blog-${getMember(me)?.username}` });
}

/** Decline a request, cancel your own, or unfriend: all remove the friendship. */
export function removeFriendship(me, other) {
  const before = between(me, other);
  const copy = before ? { ...before } : null;
  changeState((state) => {
    state.friendships = (state.friendships ?? []).filter((f) => !((f.from === me && f.to === other) || (f.from === other && f.to === me)));
  }, 'account');
  return copy;
}

/** Undo removeFriendship: put the same friendship back. */
export function restoreFriendship(copy) {
  if (!copy) return;
  changeState((state) => {
    const list = state.friendships ?? [];
    if (!list.some((f) => (f.from === copy.from && f.to === copy.to) || (f.from === copy.to && f.to === copy.from))) state.friendships = [...list, copy];
  }, 'account');
}

/** Turn blogs and the feed on or off for the signed-in person. */
export function setSocialOff(isOff) {
  const me = getCurrentUser();
  changeState((state) => {
    const member = state.members.find((m) => m.id === me.id);
    member.socialOff = Boolean(isOff);
  }, 'account', 'space', 'layout');
}
