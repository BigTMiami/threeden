// @ts-check
/**
 * tags.js — hashtags (#tenantrights) and the topics people follow.
 *
 *   tagsIn('Rent letters #TenantRights #organizing')  → ['tenantrights', 'organizing']
 *   collectTagged('tenantrights', me)  → posts and threads with that tag that `me` can see,
 *                                        newest first: [{ id, kind, authorId, text, title, media,
 *                                        timestamp, where, href }]
 *   popularTags(me, limit)   → [{ tag, count }] across what `me` can see
 *   isFollowingTag / toggleFollowTag   (member.followedTags)
 *
 * Tags are lowercase letters, numbers, and underscores, 2 to 40 long, after
 * a "#" that starts a word. They're read from the text each time; nothing is
 * indexed. A followed tag brings matching posts from public blogs into your
 * Feed (feed-page.js).
 */

import { getSpaces, getMember, changeState } from './store.js';
import { sortedPosts } from '../modules/blog-feeds/feed-data.js';
import { normalizeThread } from '../modules/forum/forum-data.js';

export const TAG_PATTERN = /(^|[^\w&#/])#([A-Za-z][\w]{1,39})\b/g;

export function tagsIn(text) {
  return [...new Set([...String(text ?? '').matchAll(TAG_PATTERN)].map((m) => m[2].toLowerCase()))];
}

const FEED_TYPES = ['photofeed', 'textfeed', 'generalfeed'];

/** Everything with tags that `me` can see: public blogs, and the groups they're in. */
function taggable(me) {
  const items = [];
  for (const space of getSpaces()) {
    const isBlog = space.kind === 'blog';
    const isMine = space.kind === 'group' && space.memberIds.includes(me.id);
    if (!isBlog && !isMine) continue;
    for (const module of space.modules) {
      const data = module.data ?? {};
      const where = isBlog ? `${getMember(space.memberIds[0])?.name ?? 'Someone'}’s blog` : `${space.name} · ${module.title}`;
      const href = `#module-${module.id}`;
      if (FEED_TYPES.includes(module.type)) {
        for (const post of sortedPosts(data)) items.push({ id: `fp-${post.id}`, kind: 'post', authorId: post.authorId ?? space.memberIds[0], text: post.text ?? '', media: post.media ?? [], timestamp: post.createdAt, where, href, spaceKind: space.kind });
      } else if (module.type === 'announcements') {
        for (const post of data.posts ?? []) items.push({ id: `an-${post.id}`, kind: 'announcement', authorId: post.authorId, title: post.title, text: post.body ?? '', media: post.media ?? [], timestamp: post.createdAt, where, href, spaceKind: space.kind });
      } else if (module.type === 'forum') {
        for (const raw of data.threads ?? []) { const t = normalizeThread(raw); items.push({ id: `th-${t.id}`, kind: 'thread', authorId: t.authorId, title: t.title, text: t.body ?? '', media: [], timestamp: t.createdAt, where, href, spaceKind: space.kind }); }
      }
    }
  }
  return items;
}

export function collectTagged(tag, me) {
  const want = tag.toLowerCase();
  return taggable(me).filter((item) => tagsIn(`${item.title ?? ''} ${item.text}`).includes(want)).sort((a, b) => b.timestamp - a.timestamp);
}

export function popularTags(me, limit = 12) {
  const counts = new Map();
  for (const item of taggable(me)) for (const tag of tagsIn(`${item.title ?? ''} ${item.text}`)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)).slice(0, limit);
}

export const followedTags = (memberId) => getMember(memberId)?.followedTags ?? [];
export const isFollowingTag = (memberId, tag) => followedTags(memberId).includes(tag.toLowerCase());

export function toggleFollowTag(memberId, tag) {
  const t = tag.toLowerCase();
  changeState(() => {
    const member = getMember(memberId);
    const list = member.followedTags ?? [];
    member.followedTags = list.includes(t) ? list.filter((x) => x !== t) : [...list, t];
  }, 'account');
  return isFollowingTag(memberId, t);
}
