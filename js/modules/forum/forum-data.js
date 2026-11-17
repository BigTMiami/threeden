// @ts-check
/**
 * forum-data.js — threads, replies, votes, and the rules for ranking them.
 *
 * Data saved for a Forum module:
 *
 *   {
 *     tags: ['General', 'Questions', …],
 *     settings: {                      ← changed by moderators in "Forum settings"
 *       whoCanStart: 'everyone' | 'admins',   ← who can start threads
 *       whoCanReply: 'everyone' | 'admins',
 *       allowEditing: true,            ← people can edit their own posts
 *       anonymous: false,              ← people may post without their name (moderators still see it)
 *       requireApproval: false,        ← new threads wait for a moderator before others see them
 *       showInFeed: false,             ← new threads show in members' Feeds (js/feed/)
 *       notifyNewThreads: false,       ← every member is told about new threads
 *       downvotes: true,               ← show the ▼ arrow
 *       qa: false,                     ← question-and-answer: threads can have a best answer
 *       defaultSort: 'hot',
 *       guidelines: '',                ← shown above the threads
 *     },
 *     threads: [ {
 *       id, authorId, title, body, tag,
 *       createdAt, editedAt: null,
 *       pinned: false,                 ← stays at the top of the list
 *       locked: false,                 ← no new replies
 *       votes: { [memberId]: 1 | -1 },
 *       answerId: null | 'reply-…',    ← the best answer (Q&A forums)
 *       followers: ['m-leo'],          ← told about new replies (the author, repliers, and anyone who follows)
 *       seenAt: { [memberId]: time },  ← when each person last opened it, for "3 new"
 *       reports: [{ memberId, reason, at }],   ← flagged for the moderators
 *       anonymous: false,              ← posted without a name (when the forum allows it)
 *       pending: false,                ← waiting for a moderator's approval
 *       poll: null | { … },            ← an optional poll (js/utils/polls.js)
 *       replies: [ {
 *         id, authorId, body, createdAt, editedAt: null,
 *         parentId: null | 'reply-…',  ← replying to another reply (threads nest)
 *         deleted: false,              ← kept as "[deleted]" if others replied to it
 *         votes: { … },
 *         reports: [ … ],
 *       } ],
 *     } ],
 *   }
 *
 * Older threads without pinned/locked/parentId still work: normalize* fills
 * them in. Nothing here touches the page.
 */

import { makeId } from '../../ui/dom.js';

export const DEFAULT_TAGS = ['General', 'Questions', 'Ideas', 'Meetings'];

export const SORT_OPTIONS = [
  { id: 'hot', label: 'Hot' },
  { id: 'new', label: 'New' },
  { id: 'top', label: 'Top' },
  { id: 'active', label: 'Recently active' },
];

export const REPLY_SORTS = [
  { id: 'best', label: 'Best' },
  { id: 'old', label: 'Oldest first' },
];

/** Replies nest this deep; deeper replies line up with their parent. */
export const MAX_DEPTH = 4;

// ─── Shapes ──────────────────────────────────────────────────────────────────

export function normalizeThread(thread) {
  return {
    body: '',
    media: [], // photos and videos: [{ kind: 'image' | 'video', src, … }] (js/ui/media-attach.js)
    tag: DEFAULT_TAGS[0],
    editedAt: null,
    pinned: false,
    locked: false,
    votes: {},
    answerId: null,
    followers: [thread.authorId].filter(Boolean),
    seenAt: {},
    reports: [],
    anonymous: false,
    pending: false,
    ...thread,
    replies: (thread.replies ?? []).map(normalizeReply),
  };
}

export function normalizeReply(reply) {
  return { parentId: null, editedAt: null, deleted: false, votes: {}, reports: [], anonymous: false, media: [], ...reply };
}

export const DEFAULT_SETTINGS = {
  whoCanStart: 'everyone',
  whoCanReply: 'everyone',
  allowEditing: true,
  anonymous: false,
  requireApproval: false,
  showInFeed: false,
  notifyNewThreads: false,
  downvotes: true,
  qa: false,
  defaultSort: 'hot',
  guidelines: '',
};

const isAdminRole = (role) => role === 'admin' || role === 'owner';

/** Replying: everyone, or admins and the owner only. */
export function canReply(settings, role) {
  return settings.whoCanReply === 'everyone' || isAdminRole(role);
}

/**
 * Can `viewerId` see this thread? Threads waiting for approval are only
 * shown to their author and the moderators.
 */
export function isVisibleTo(thread, viewerId, isModerator) {
  return !thread.pending || isModerator || thread.authorId === viewerId;
}

export function settingsOf(data) {
  return { ...DEFAULT_SETTINGS, ...data.settings };
}

/** Starting a thread: everyone, or admins and the owner only (a forum for announcements). */
export function canStartThread(settings, role) {
  return settings.whoCanStart === 'everyone' || isAdminRole(role);
}

export function createThread({ authorId, title, body, tag, anonymous = false, pending = false, poll = null, media = [] }) {
  return normalizeThread({
    id: makeId('thread'),
    authorId,
    title: title.trim(),
    body: body.trim(),
    tag,
    anonymous,
    pending,
    poll,
    media,
    createdAt: Date.now(),
    votes: { [authorId]: 1 }, // authors upvote their own thread, like most forums
  });
}

export function createReply({ authorId, body, parentId = null, anonymous = false, media = [] }) {
  return normalizeReply({ id: makeId('reply'), authorId, body: body.trim(), parentId, anonymous, media, createdAt: Date.now() });
}

// ─── Votes and ranking ───────────────────────────────────────────────────────

/** Upvotes minus downvotes. */
export function scoreOf(item) {
  return Object.values(item.votes ?? {}).reduce((sum, vote) => sum + vote, 0);
}

/** Clicking the same arrow again takes the vote back; the other arrow switches it. */
export function toggleVote(item, memberId, direction) {
  if (item.votes[memberId] === direction) delete item.votes[memberId];
  else item.votes[memberId] = direction;
}

/** "Hot": well-liked threads rise, older ones slowly sink. */
function hotRank(thread) {
  const ageInHours = (Date.now() - thread.createdAt) / (60 * 60 * 1000);
  return (scoreOf(thread) + 1) / Math.pow(ageInHours + 2, 1.5);
}

/** When anyone last posted in a thread. */
export function lastActivity(thread) {
  return Math.max(thread.createdAt, ...thread.replies.map((r) => r.createdAt));
}

/** Live (not deleted) replies. */
export function replyCount(thread) {
  return thread.replies.filter((r) => !r.deleted).length;
}

/** Pinned threads first, then by the chosen order. */
export function sortThreads(threads, sortId) {
  const rank = {
    hot: (t) => hotRank(t),
    new: (t) => t.createdAt,
    top: (t) => scoreOf(t),
    active: (t) => lastActivity(t),
  }[sortId] ?? ((t) => hotRank(t));
  return [...threads].sort((a, b) => (b.pinned - a.pinned) || (rank(b) - rank(a)));
}

/**
 * The threads to list. `show` narrows it further:
 *   'unanswered' (Q&A: no best answer yet) | 'following' (needs `memberId`) | 'reported'
 */
export function filterThreads(threads, { tag = '', search = '', show = '', memberId = null }) {
  const query = search.trim().toLowerCase();
  return threads.filter((thread) => {
    if (tag && thread.tag !== tag) return false;
    if (show === 'unanswered' && thread.answerId) return false;
    if (show === 'following' && !thread.followers.includes(memberId)) return false;
    if (show === 'reported' && reportCount(thread) === 0) return false;
    if (show === 'pending' && !thread.pending) return false;
    if (!query) return true;
    const text = [thread.title, thread.body, ...thread.replies.map((r) => r.body)].join(' ').toLowerCase();
    return text.includes(query);
  });
}

/**
 * Replies arranged as a tree: [{ reply, children: [...] }], each level
 * sorted best-first or oldest-first. Deleted replies with no replies of
 * their own are left out entirely.
 */
export function replyTree(thread, sortId = 'best') {
  const byParent = new Map();
  for (const reply of thread.replies) {
    const key = reply.parentId ?? 'top';
    byParent.set(key, [...(byParent.get(key) ?? []), reply]);
  }
  const order = sortId === 'old'
    ? (a, b) => a.createdAt - b.createdAt
    : (a, b) => scoreOf(b) - scoreOf(a) || a.createdAt - b.createdAt;

  const build = (parentKey) => (byParent.get(parentKey) ?? [])
    .slice()
    .sort(order)
    .map((reply) => ({ reply, children: build(reply.id) }))
    .filter((node) => !node.reply.deleted || node.children.length > 0);

  return build('top');
}

// ─── Unread, following, reports ──────────────────────────────────────────────

/** Replies posted since this person last opened the thread (not their own). */
export function newReplyCount(thread, memberId) {
  const seen = thread.seenAt[memberId];
  if (!seen) return thread.authorId === memberId ? 0 : replyCount(thread);
  return thread.replies.filter((r) => !r.deleted && r.authorId !== memberId && r.createdAt > seen).length;
}

/** Has this person never opened the thread (and didn't write it)? */
export function isUnseen(thread, memberId) {
  return !thread.seenAt[memberId] && thread.authorId !== memberId;
}

/** Open reports on a thread and its replies. */
export function reportCount(thread) {
  return thread.reports.length + thread.replies.reduce((n, r) => n + (r.deleted ? 0 : r.reports.length), 0);
}

// ─── Changing (these change `data` in place; callers clone first) ───────────

/** Note that someone just read a thread. */
export function markSeen(data, threadId, memberId) {
  const thread = findThread(data, threadId);
  if (thread) thread.seenAt = { ...thread.seenAt, [memberId]: Date.now() };
}

export function setFollowing(thread, memberId, isFollowing) {
  const followers = new Set(thread.followers ?? [thread.authorId]);
  if (isFollowing) followers.add(memberId);
  else followers.delete(memberId);
  thread.followers = [...followers];
}

/** Flag a thread or reply for the moderators (once per person). */
export function report(item, memberId, reason) {
  item.reports = [...(item.reports ?? []).filter((r) => r.memberId !== memberId), { memberId, reason: reason.trim(), at: Date.now() }];
}

export function findThread(data, threadId) {
  return data.threads.find((t) => t.id === threadId);
}

export function findReply(data, threadId, replyId) {
  return findThread(data, threadId)?.replies.find((r) => r.id === replyId);
}

/** Delete a reply: removed outright, or kept as "[deleted]" if people replied to it. */
export function deleteReply(data, threadId, replyId) {
  const thread = findThread(data, threadId);
  const hasChildren = thread.replies.some((r) => r.parentId === replyId);
  if (hasChildren) Object.assign(thread.replies.find((r) => r.id === replyId), { deleted: true, body: '', votes: {} });
  else thread.replies = thread.replies.filter((r) => r.id !== replyId);
}

/** Rename a tag everywhere it's used. */
export function renameTag(data, oldName, newName) {
  data.tags = data.tags.map((t) => (t === oldName ? newName : t));
  for (const thread of data.threads) if (thread.tag === oldName) thread.tag = newName;
}

/** Remove a tag; its threads move to the first remaining tag. */
export function removeTag(data, name) {
  data.tags = data.tags.filter((t) => t !== name);
  const fallback = data.tags[0] ?? 'General';
  if (data.tags.length === 0) data.tags = [fallback];
  for (const thread of data.threads) if (thread.tag === name) thread.tag = fallback;
}
