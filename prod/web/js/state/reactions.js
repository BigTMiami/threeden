// @ts-check
/**
 * reactions.js — likes and comments on blog posts, and each blogger's
 * rules for them.
 *
 * Saved in `state.reactions`, keyed by what's being reacted to:
 *   {
 *     'feedpost:post-abc': {           ← a post in a blog feed module
 *       likes: ['m-leo', 'm-nora'],
 *       comments: [{ id, authorId, body, createdAt }],
 *     },
 *     'post-leo-blog-post': { … },     ← older blog items, by their Feed id
 *   }
 * Kept outside the posts themselves so the same likes show on the blog
 * and in the Feed.
 *
 * A blogger's rules are saved on their account as `member.blogSettings`:
 *   {
 *     likes: true,                     ← people can like posts
 *     comments: 'friends',             ← 'friends' | 'everyone' | 'off'
 *     sharing: true,                   ← people can send posts to others in Messages
 *   }
 * Following is two-way on 3den: your friends are your followers.
 */

import { changeState, getState, getMember, getCurrentUser } from './store.js';
import { friendStatus } from './friends.js';
import { notify } from './notifications.js';
import { makeId } from '../ui/dom.js';
import { can } from './permissions.js';

export const COMMENT_CHOICES = [
  { id: 'friends', label: 'Friends', hint: 'Only your friends (who follow you) can comment.' },
  { id: 'everyone', label: 'Anyone signed in', hint: 'Anyone with a 3den account can comment.' },
  { id: 'off', label: 'Nobody', hint: 'Comments are turned off. Existing comments are hidden.' },
];

const BLOG_DEFAULTS = { likes: true, comments: 'friends', sharing: true };

// ─── A blogger's rules ───────────────────────────────────────────────────────

export function getBlogSettings(memberId) {
  return { ...BLOG_DEFAULTS, ...getMember(memberId)?.blogSettings };
}

/** `updateBlogSettings(id, (s) => { s.likes = false; })` */
export function updateBlogSettings(memberId, changeFn) {
  const next = getBlogSettings(memberId);
  changeFn(next);
  changeState((state) => { state.members.find((m) => m.id === memberId).blogSettings = next; }, 'account');
}

/** What `viewerId` may do with `ownerId`'s posts. */
export function permissionsFor(ownerId, viewerId) {
  const rules = getBlogSettings(ownerId);
  const isOwner = ownerId === viewerId;
  const isFriend = friendStatus(ownerId, viewerId) === 'friends';
  return {
    showLikes: rules.likes,
    canLike: Boolean(viewerId) && rules.likes,
    showComments: rules.comments !== 'off',
    canComment: Boolean(viewerId) && (isOwner || rules.comments === 'everyone' || (rules.comments === 'friends' && isFriend)),
    commentRule: rules.comments,
    canShare: Boolean(viewerId) && (isOwner || rules.sharing),
    isOwner,
  };
}

/**
 * The same rules for a post in a group's feed: anyone who can see it can
 * like it; members can comment and send it on; moderators can delete
 * anyone's comments.
 */
export function groupPermissionsFor(space, viewerId) {
  const isMember = space.memberIds.includes(viewerId);
  return {
    showLikes: true,
    canLike: Boolean(viewerId),
    showComments: true,
    canComment: isMember,
    commentRule: 'members',
    canShare: isMember,
    isOwner: can(space, viewerId, 'moderate'),
  };
}

// ─── Reading and changing reactions ──────────────────────────────────────────

export function getReactions(key) {
  const saved = getState().reactions?.[key];
  return { likes: saved?.likes ?? [], comments: saved?.comments ?? [] };
}

function change(key, changeFn) {
  changeState((state) => {
    state.reactions = state.reactions ?? {};
    const entry = state.reactions[key] ?? { likes: [], comments: [] };
    changeFn(entry);
    state.reactions[key] = entry;
  }, 'notifications'); // the bell and the Feed listen to this
}

/**
 * Like or unlike. `about` describes the post for the notification:
 * { ownerId, title, moduleId, itemId }.
 */
export function toggleLike(key, about) {
  const me = getCurrentUser();
  const liked = getReactions(key).likes.includes(me.id);
  change(key, (entry) => {
    entry.likes = liked ? entry.likes.filter((id) => id !== me.id) : [...entry.likes, me.id];
  });
  if (!liked) {
    notify({ recipientIds: [about.ownerId], actorId: me.id, kind: 'like', text: `${me.name} liked your post “${about.title}”`, moduleId: about.moduleId, itemId: about.itemId });
  }
}

/** Add a comment, and tell the blogger and the post's other commenters. */
export function addComment(key, body, about) {
  const me = getCurrentUser();
  const text = body.trim();
  if (!text) return;
  const earlier = getReactions(key).comments.map((c) => c.authorId);
  change(key, (entry) => { entry.comments.push({ id: makeId('comment'), authorId: me.id, body: text, createdAt: Date.now() }); });
  const preview = text.length > 60 ? `${text.slice(0, 59)}…` : text;
  const common = { actorId: me.id, kind: 'comment', moduleId: about.moduleId, itemId: about.itemId };
  notify({ ...common, recipientIds: [about.ownerId], text: `${me.name} commented on your post “${about.title}”: “${preview}”` });
  notify({ ...common, recipientIds: earlier.filter((id) => id !== about.ownerId), text: `${me.name} also commented on “${about.title}”: “${preview}”` });
}

/** The comment's author or the blogger can delete a comment. */
export function deleteComment(key, commentId) {
  change(key, (entry) => { entry.comments = entry.comments.filter((c) => c.id !== commentId); });
}

/** Put a deleted comment back where it was (for Undo). */
export function restoreComment(key, comment, index) {
  change(key, (entry) => {
    entry.comments = entry.comments ?? [];
    if (entry.comments.some((c) => c.id === comment.id)) return;
    entry.comments.splice(Math.min(index, entry.comments.length), 0, comment);
  });
}
