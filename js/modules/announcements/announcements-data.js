/**
 * announcements-data.js — the shape of posts and comments, and the rules
 * for sorting and filtering them.
 *
 * Data saved for an Announcements module:
 *
 *   {
 *     posts: [ {
 *       id, authorId,
 *       title, body,
 *       pinned: false,
 *       createdAt,               ← ms timestamp
 *       editedAt: null,          ← ms timestamp of the last edit, if any
 *       poll: null | { … },     ← an optional poll (js/utils/polls.js)
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
  return {
    body: '',
    pinned: false,
    editedAt: null,
    seenBy: [],
    comments: [],
    ...post,
  };
}

export function createPost({ authorId, title, body, pinned = false, poll = null, media = [], rsvp = null, signups = [] }) {
  return normalizePost({ id: makeId('post'), authorId, title, body, pinned, poll, media, rsvp, signups, createdAt: Date.now() });
}

export function createComment(authorId, body) {
  return { id: makeId('comment'), authorId, body, createdAt: Date.now() };
}

/** Has this member seen the post? Authors have always seen their own posts. */
export function hasSeen(post, memberId) {
  return post.authorId === memberId || post.seenBy.includes(memberId);
}

/** Pinned first, then newest first. */
export function sortPosts(posts) {
  return [...posts].sort((a, b) => (b.pinned - a.pinned) || (b.createdAt - a.createdAt));
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
    if (filter === 'pinned' && !post.pinned) return false;
    if (filter === 'mine' && post.authorId !== memberId) return false;
    if (!query) return true;
    const text = [post.title, post.body, ...post.comments.map((c) => c.body)].join(' ').toLowerCase();
    return text.includes(query);
  });
}
