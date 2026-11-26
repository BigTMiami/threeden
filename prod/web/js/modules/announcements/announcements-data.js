/**
 * announcements-data.js — the shape of posts and comments, and the rules
 * for sorting and filtering them.
 *
 * Since Nov 18 this module is the group's **Board** (it keeps the type
 * 'announcements', so saved pages and everything that reads it carry on):
 * anyone can post (the "Post on the board" permission, members by default),
 * admins pin, with a duration, and posts show in members' Feeds.
 *
 * Data saved for a Board:
 *
 *   {
 *     posts: [ {
 *       id, authorId,
 *       title, body,             ← the title is optional on the board
 *       pin: null | { until, by, at },  ← pinned until `until` (ms), or until unpinned (until: null)
 *       toFeed: true,            ← shown in members' Feeds (feed-items.js); off: only on the board
 *       likes: ['m-owen'],       ← who liked it
 *       createdAt,               ← ms timestamp
 *       editedAt: null,          ← ms timestamp of the last edit, if any
 *       poll: null | { … },     ← an optional poll (js/utils/polls.js)
 *       media: [ … ],            ← photos and videos (js/ui/media-attach.js)
 *       files: [ … ],            ← copies of vault files (announcement-attach.js), when there are any
 *       rsvp: null | { when, answers },  signups: [ … ]   ← asks (js/ui/asks.js)
 *       seenBy: ['m-maya'],      ← members who marked it as seen (the author counts as seen)
 *       comments: [ { id, authorId, body, createdAt } ],
 *     } ],
 *   }
 *
 * Older posts only had { id, authorId, title, body, pinned, createdAt };
 * `normalizePost` fills in the rest.
 */

import { makeId } from '../../ui/dom.js';

export const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'mine', label: 'Mine' },
];

export function normalizePost(post) {
  const normal = {
    title: '',
    body: '',
    pin: null,
    toFeed: true,
    likes: [],
    editedAt: null,
    seenBy: [],
    comments: [],
    ...post,
  };
  // Older posts had `pinned: true` (pinned until unpinned).
  if (normal.pinned && !normal.pin) normal.pin = { until: null, by: normal.authorId, at: normal.createdAt };
  delete normal.pinned;
  return normal;
}

/** How long a pin lasts: the choices admins see. */
export const PIN_DURATIONS = [
  { id: '1d', label: '1 day', ms: 864e5 },
  { id: '3d', label: '3 days', ms: 3 * 864e5 },
  { id: '1w', label: '1 week', ms: 7 * 864e5 },
  { id: '2w', label: '2 weeks', ms: 14 * 864e5 },
  { id: 'forever', label: 'Until unpinned', ms: null },
];

/** A pin from one of PIN_DURATIONS, by this member, from now. */
export function makePin(durationId, by) {
  const duration = PIN_DURATIONS.find((d) => d.id === durationId) ?? PIN_DURATIONS[2];
  const at = Date.now();
  return { until: duration.ms == null ? null : at + duration.ms, by, at };
}

/** Is it pinned right now? (A pin past its end drops back into the stream.) */
export function isPinned(post, now = Date.now()) {
  const pin = post.pin ?? (post.pinned ? { until: null } : null);
  return Boolean(pin) && (pin.until == null || pin.until > now);
}

/** "Pinned" or "Pinned until Fri, Nov 20". */
export function pinLabel(post) {
  if (!isPinned(post)) return '';
  const until = post.pin?.until;
  return until ? `Pinned until ${new Date(until).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : 'Pinned';
}

export function createPost({ authorId, title = '', body, pin = null, toFeed = true, poll = null, media = [], files = [], rsvp = null, signups = [], eventId = null }) {
  // eventId: one of the poster's calendar events (Add → Event, event-picker.js), shown on it with its RSVP.
  return normalizePost({ id: makeId('post'), authorId, title, body, pin, toFeed, poll, media, ...(files.length ? { files } : {}), rsvp, signups, ...(eventId ? { eventId } : {}), createdAt: Date.now() });
}

/** What to call a post in a sentence: its title, else the start of its text. */
export function postName(post) {
  const text = (post.title || post.body || '').replace(/\s+/g, ' ').trim();
  return text.length > 50 ? `${text.slice(0, 49)}…` : text || 'a post';
}

export function createComment(authorId, body) {
  return { id: makeId('comment'), authorId, body, createdAt: Date.now() };
}

/** Has this member seen the post? Authors have always seen their own posts. */
export function hasSeen(post, memberId) {
  return post.authorId === memberId || post.seenBy.includes(memberId);
}

/** Pinned first (latest pin first), then newest first. */
export function sortPosts(posts) {
  const now = Date.now();
  return [...posts].sort((a, b) => (Number(isPinned(b, now)) - Number(isPinned(a, now)))
    || (isPinned(a, now) ? (b.pin?.at ?? 0) - (a.pin?.at ?? 0) : 0)
    || (b.createdAt - a.createdAt));
}

/**
 * @param {object[]} posts
 * @param {object}   options  { filter: one of FILTERS' ids, search }
 * @param {string}   memberId the person looking
 */
export function filterPosts(posts, { filter = 'all', search = '' }, memberId) {
  const query = search.trim().toLowerCase();
  return posts.filter((post) => {
    if (filter === 'unread' && hasSeen(post, memberId)) return false;
    if (filter === 'pinned' && !isPinned(post)) return false;
    if (filter === 'mine' && post.authorId !== memberId) return false;
    if (!query) return true;
    const text = [post.title, post.body, ...post.comments.map((c) => c.body)].join(' ').toLowerCase();
    return text.includes(query);
  });
}
