// @ts-check
/**
 * feed-data.js — posts in a blog's feed modules.
 *
 * Three kinds of feed module share one data shape (see feed-modules.js):
 *   photo    "Photo & video feed"  every post has pictures or a video (like Instagram)
 *   text     "Text feed"           short posts, words only (like X)
 *   general  "General feed"        anything, as much as you like in one post:
 *                                  text, pictures and videos, files from your
 *                                  vault, links and event invitations
 *
 * Data saved for a feed module:
 *   {
 *     posts: [ {
 *       id, authorId, createdAt, editedAt: null,
 *       text: '',
 *       media: [ { id, kind: 'image' | 'video', src, caption } ],
 *       attachments: [                  ← General feeds only, any number, in order:
 *           { kind: 'file', item }      ← a copy of a vault item (see snapshotVaultItem)
 *         | { kind: 'event', eventId }  ← an event to RSVP to
 *         | { kind: 'link', url, name } ← a web link
 *         | { kind: 'poll', poll }      ← a poll (js/utils/polls.js; General and Text feeds)
 *         | { kind: 'signups', signups: [{ id, label, spots, memberIds }] }  ← sign-ups (js/ui/asks.js; Nov 18)
 *       ],
 *     } ],
 *     display: { layout, … },           ← General feeds: list or grid, and sizes (feed-layouts.js)
 *     events: [ … ],                    ← events made from the composer, when the blog has no
 *                                         Upcoming events module to keep them in
 *   }
 *
 * Likes and comments aren't in here: they're in js/state/reactions.js under
 * postKey(post.id), so the blog and the Feed show the same ones.
 */

import { makeId } from '../../ui/dom.js';

export const VARIANTS = {
  // A photo post can have one event connected to it, shown small under the pictures.
  photo: { textLimit: 2200, allowsMedia: true, needsMedia: true, allowsAttachments: false, allowsEvent: true, maxMedia: 10, placeholder: 'Write a caption…' },
  text: { textLimit: 500, allowsMedia: false, needsMedia: false, allowsAttachments: false, allowsPolls: true, maxMedia: 0, placeholder: 'What’s happening?' },
  general: { textLimit: 5000, allowsMedia: true, needsMedia: false, allowsAttachments: true, allowsPolls: true, maxMedia: 10, placeholder: 'Write a post…' },
};

/** Videos are saved in the browser, so only small ones fit. */
export const MAX_VIDEO_BYTES = 3 * 1024 * 1024;

/** Where a post's likes and comments are kept (js/state/reactions.js). */
export const postKey = (postId) => `feedpost:${postId}`;

export function normalizeFeed(data) {
  return { posts: [], events: [], ...data };
}

export function normalizePost(post) {
  const { attachment, ...rest } = post;
  // Early posts had a single `attachment`.
  return { text: '', media: [], attachments: attachment ? [attachment] : [], editedAt: null, ...rest };
}

export function createPost({ authorId, text = '', media = [], attachments = [], audience = null }) {
  const post = normalizePost({ id: makeId('post'), authorId, createdAt: Date.now(), text: text.trim(), media, attachments });
  // 'friends' (a blog) or 'members' (a group's public tab); left out for everyone.
  if (audience && audience !== 'everyone') post.audience = audience;
  return post;
}

/** Newest first. */
export function sortedPosts(data) {
  return normalizeFeed(data).posts.map(normalizePost).sort((a, b) => b.createdAt - a.createdAt);
}

/** A short title for a post, for notifications and "Send": the start of its text, or what it shows. */
export function postTitle(post) {
  const text = post.text.replace(/\s+/g, ' ').trim();
  if (text) return text.length > 50 ? `${text.slice(0, 49)}…` : text;
  if (post.media.length) return post.media.some((m) => m.kind === 'video') ? 'a video' : post.media.length === 1 ? 'a photo' : `${post.media.length} photos`;
  const first = post.attachments[0];
  if (first?.kind === 'event') return 'an event';
  if (first?.kind === 'file') return first.item.name;
  if (first?.kind === 'link') return first.name;
  if (first?.kind === 'poll') return first.poll.question;
  if (first?.kind === 'signups') return `Sign-ups: ${first.signups.map((x) => x.label).join(', ')}`.slice(0, 50);
  return 'a post';
}

/** Is there anything to post yet, for this kind of feed? */
export function canPost(variant, { text, media, attachments }) {
  const rules = VARIANTS[variant];
  if (text.trim().length > rules.textLimit) return false;
  if (rules.needsMedia) return media.length > 0;
  return Boolean(text.trim() || media.length || attachments.length);
}
