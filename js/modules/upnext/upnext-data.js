// @ts-check
/**
 * upnext-data.js — what the Up next module reads from the rest of its group.
 *
 *   nextEventIn(space, me)   → the soonest upcoming event you can see, or null
 *   streamOf(space, me)      → everything posted in the group, newest first:
 *     [{ kind, kindLabel, icon, id, moduleId, itemId, authorId, timestamp,
 *        title, excerpt, newCount?, href?, anonymous? }]
 *     kinds: announcement, thread, post (photo/text/general feeds), article, event
 *     A forum thread is dated by its newest reply, so active threads come back up.
 *   sinceLine(stream, me, since) → "Since Tuesday: 1 announcement, 3 replies" (or '')
 */

import { normalizeEvent, occurrencesBetween, isEvent } from '../calendar/calendar-data.js';
import { normalizeThread } from '../forum/forum-data.js';
import { sortedPosts, postTitle } from '../blog-feeds/feed-data.js';
import { normalizeArticle, summaryOf } from '../articles/articles-data.js';
import { canSeePost } from '../../ui/audience-chip.js';
import { addDays, todayKey, weekdayName } from '../../utils/dates.js';

export const STREAM_KINDS = [
  { id: 'announcement', label: 'Announcements' },
  { id: 'thread', label: 'Forum' },
  { id: 'post', label: 'Posts' },
  { id: 'article', label: 'Articles' },
  { id: 'event', label: 'Events' },
];

const FEED_TYPES = ['photofeed', 'textfeed', 'generalfeed'];
const EXCERPT = 160;
const DAY_MS = 24 * 60 * 60 * 1000;

const plain = (text) => String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const cut = (text) => { const t = plain(text); return t.length > EXCERPT ? `${t.slice(0, EXCERPT - 1)}…` : t; };
const canSeeEvent = (event, me) => event.visibility !== 'invite' || event.createdBy === me.id || (event.inviteeIds ?? []).includes(me.id);

export function nextEventIn(space, me) {
  const start = todayKey();
  const found = [];
  for (const module of space.modules) {
    if (!Array.isArray(module.data?.events)) continue;
    const events = module.data.events.map(normalizeEvent).filter((e) => isEvent(e) && canSeeEvent(e, me));
    for (const occurrence of occurrencesBetween(events, start, addDays(start, 120))) {
      if (occurrence.dayNumber === 1) found.push({ ...occurrence, moduleId: module.id });
    }
  }
  found.sort((a, b) => a.date.localeCompare(b.date) || (a.event.time ?? '').localeCompare(b.event.time ?? ''));
  return found[0] ?? null;
}

export function streamOf(space, me) {
  const items = [];
  for (const module of space.modules) {
    const data = module.data ?? {};
    if (module.type === 'announcements') {
      for (const post of data.posts ?? []) {
        items.push({ kind: 'announcement', kindLabel: post.pinned ? 'Announcement · pinned' : 'Announcement', icon: 'announcements', id: `a-${post.id}`, moduleId: module.id, itemId: post.id, authorId: post.authorId, timestamp: post.createdAt, title: post.title || cut(post.body).slice(0, 80), excerpt: post.title ? cut(post.body) : '' });
      }
    } else if (module.type === 'forum') {
      for (const thread of (data.threads ?? []).map(normalizeThread)) {
        if (thread.pending) continue;
        const replies = thread.replies ?? [];
        const latest = Math.max(thread.createdAt ?? 0, ...replies.map((r) => r.createdAt ?? 0));
        const seen = thread.seenAt?.[me.id] ?? 0;
        const newCount = replies.filter((r) => r.createdAt > seen && r.authorId !== me.id).length;
        items.push({ kind: 'thread', kindLabel: `${module.title}${replies.length ? ` · ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : ''}`, icon: 'forum', id: `t-${thread.id}`, moduleId: module.id, itemId: thread.id, authorId: thread.anonymous ? null : thread.authorId, anonymous: thread.anonymous, timestamp: latest, title: thread.title, excerpt: cut(thread.body), newCount, replies: replies.filter((r) => r.authorId !== me.id) });
      }
    } else if (FEED_TYPES.includes(module.type)) {
      for (const post of sortedPosts(data)) {
        if (!canSeePost(post, space, me.id)) continue;
        items.push({ kind: 'post', kindLabel: module.title, icon: module.type === 'photofeed' ? 'image' : 'chat', id: `p-${post.id}`, moduleId: module.id, itemId: post.id, authorId: post.authorId, timestamp: post.createdAt, title: postTitle(post), excerpt: post.text && plain(post.text) !== postTitle(post) ? cut(post.text) : '' });
      }
    } else if (module.type === 'articles') {
      for (const article of (data.articles ?? []).map(normalizeArticle)) {
        if (article.status !== 'published') continue;
        items.push({ kind: 'article', kindLabel: `${module.title}${article.kicker ? ` · ${article.kicker}` : ''}`, icon: 'newspaper', id: `r-${article.id}`, moduleId: module.id, itemId: article.id, authorId: article.authorId, timestamp: article.publishedAt, title: article.headline, excerpt: cut(summaryOf(article)) });
      }
    }
    if (Array.isArray(data.events) && (module.type === 'calendar' || module.type === 'events')) {
      const today = todayKey();
      for (const event of data.events.map(normalizeEvent)) {
        if (!isEvent(event) || !event.createdAt || event.date < today || !canSeeEvent(event, me)) continue;
        items.push({ kind: 'event', kindLabel: 'New event', icon: 'calendar', id: `e-${event.id}`, moduleId: module.id, itemId: event.id, authorId: event.createdBy, timestamp: event.createdAt, title: event.title, excerpt: [event.date, event.location].filter(Boolean).join(' · '), href: `#event-${event.id}` });
      }
    }
  }
  return items.filter((i) => i.timestamp).sort((a, b) => b.timestamp - a.timestamp);
}

/** "Since Tuesday: 1 announcement, 3 replies, 2 posts" for what others posted since your last visit. */
export function sinceLine(stream, me, since) {
  if (!since) return '';
  const counts = { announcement: 0, reply: 0, thread: 0, post: 0, article: 0, event: 0 };
  for (const item of stream) {
    if (item.kind === 'thread') {
      if (item.authorId !== me.id && item.timestamp > since && (item.replies ?? []).length === 0) counts.thread += 1;
      counts.reply += (item.replies ?? []).filter((r) => r.createdAt > since).length;
    } else if (item.timestamp > since && item.authorId !== me.id) counts[item.kind] += 1;
  }
  const words = [
    [counts.announcement, 'announcement', 'announcements'], [counts.thread, 'new thread', 'new threads'], [counts.reply, 'reply', 'replies'],
    [counts.post, 'post', 'posts'], [counts.article, 'article', 'articles'], [counts.event, 'new event', 'new events'],
  ].filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  const ago = Date.now() - since;
  const when = ago < DAY_MS ? 'your last visit' : ago < 6 * DAY_MS ? weekdayName(new Date(since).getDay()) : 'last week';
  return words.length ? `Since ${when}: ${words.join(', ')}` : `Nothing new since ${when}.`;
}
