// @ts-check
/**
 * feed-items.js — what's new on people's blogs, as a list of feed items.
 *
 * Feed items aren't saved anywhere: they're read straight from the blogs'
 * modules each time, using the timestamps the blog modules keep:
 *
 *   Document         updatedAt        → kind 'post'    ("posted Why our block…")
 *   Gallery/Carousel photos' addedAt  → kind 'photos'  (one item per album per day)
 *   Upcoming events  events' createdAt→ kind 'event'   (upcoming, public ones)
 *   Feed modules     posts' createdAt  → kind 'feedpost' (the whole post, shown in full)
 *
 * And from the groups you're in, for forums whose moderators turned on
 * "Show new threads in members' Feeds":
 *
 *   Forum            threads' createdAt → kind 'thread'  ("started Heat log…")
 *   Board            posts' createdAt   → kind 'boardpost' (every post, unless its
 *                                        poster unticked "Show in members' Feeds")
 *
 * Each item: { id, kind, kindGroup ('posts'|'photos'|'events'|'groupPosts'),
 *              authorId, timestamp, blog or space, module, …kind-specific fields }
 * feed-settings.js filters and orders them.
 */

import { getBlogOf, getSpaces, publicTabsOf, getCurrentUser } from '../state/store.js';
import { canSeePost } from '../ui/audience-chip.js';
import { followedSpaceIds } from '../state/follows.js';
import { normalizeEvent } from '../modules/calendar/calendar-data.js';
import { normalizeThread, settingsOf as forumSettingsOf } from '../modules/forum/forum-data.js';
import { sortedPosts } from '../modules/blog-feeds/feed-data.js';
import { normalizeArticle, summaryOf } from '../modules/articles/articles-data.js';
import { normalizePost as normalizeBoardPost } from '../modules/announcements/announcements-data.js';
import { toDateKey, todayKey } from '../utils/dates.js';

const EXCERPT_CHARS = 240;

const plain = (html) => (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** Every feed item from these people's blogs. */
export function collectFeedItems(memberIds) {
  const items = [];
  for (const authorId of memberIds) {
    const blog = getBlogOf(authorId);
    if (!blog) continue;
    for (const module of blog.modules) items.push(...itemsFromModule(module, blog, authorId));
  }
  return items;
}

const FEED_TYPES = ['textfeed', 'generalfeed', 'carousel'];

function itemsFromModule(module, blog, authorId) {
  const base = { authorId, blog, module };
  const data = module.data ?? {};

  if (FEED_TYPES.includes(module.type)) {
    const viewerId = getCurrentUser()?.id;
    return sortedPosts(data).filter((post) => canSeePost(post, blog, viewerId)).map((post) => ({
      ...base,
      id: `feedpost-${post.id}`,
      kind: 'feedpost',
      // Pictures-only posts count as photos for "Show me" in feed settings.
      kindGroup: post.media.length && !post.text ? 'photos' : 'posts',
      timestamp: post.createdAt,
      post,
    }));
  }

  if (module.type === 'articles') return articleItems(module, blog, 'posts');

  if (module.type === 'note') { // a Document on a blog
    const text = plain(data.html);
    if (!data.updatedAt || (!text && !data.title)) return [];
    return [{
      ...base,
      id: `post-${module.id}`,
      kind: 'post',
      kindGroup: 'posts',
      timestamp: data.updatedAt,
      title: data.title || module.title,
      excerpt: text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS - 1)}…` : text,
    }];
  }

  if (module.type === 'gallery' || module.type === 'carousel') {
    const photos = (data.photos ?? data.slides ?? []).filter((p) => p.addedAt);
    // One item per album per day, so ten photos at once is one post.
    const byDay = new Map();
    for (const photo of photos) {
      const day = toDateKey(new Date(photo.addedAt));
      byDay.set(day, [...(byDay.get(day) ?? []), photo]);
    }
    return [...byDay.entries()].map(([day, dayPhotos]) => ({
      ...base,
      id: `photos-${module.id}-${day}`,
      kind: 'photos',
      kindGroup: 'photos',
      timestamp: Math.max(...dayPhotos.map((p) => p.addedAt)),
      photos: dayPhotos,
    }));
  }

  if (module.type === 'events') {
    return (data.events ?? [])
      .map(normalizeEvent)
      .filter((event) => event.visibility === 'public' && event.createdAt && event.date >= todayKey())
      .map((event) => ({ ...base, id: `event-${event.id}`, kind: 'event', kindGroup: 'events', timestamp: event.createdAt, event }));
  }

  return [];
}

/** Published articles (articles-data.js) as Feed items: kind 'article'. */
function articleItems(module, blog, kindGroup, space = null) {
  return (module.data?.articles ?? []).map(normalizeArticle).filter((a) => a.status === 'published')
    .map((article) => ({ id: `article-${article.id}`, kind: 'article', kindGroup, authorId: article.authorId, timestamp: article.publishedAt, blog, space, module, article, title: article.headline, excerpt: summaryOf(article), photos: article.hero ? [article.hero] : undefined }));
}

/**
 * From groups `memberId` follows but isn't in: posts in the feeds on their
 * public tabs (members-only tabs stay private, even to followers).
 */
export function collectFollowedGroupItems(memberId) {
  const items = [];
  const groups = getSpaces().filter((space) => space.kind === 'group' && !space.memberIds.includes(memberId)
    && followedSpaceIds(memberId).includes(space.id));
  for (const space of groups) {
    const publicTabIds = publicTabsOf(space).map((tab) => tab.id);
    for (const module of space.modules) {
      if (!FEED_TYPES.includes(module.type) || !publicTabIds.includes(module.tabId ?? 'home')) continue;
      for (const post of sortedPosts(module.data ?? {})) {
        if (!canSeePost(post, space, memberId)) continue; // "Members" posts on a public tab
        items.push({ id: `feedpost-${post.id}`, kind: 'feedpost', kindGroup: 'groupPosts', authorId: post.authorId, timestamp: post.createdAt, blog: space, space, module, post, followed: true });
      }
    }
  }
  return items;
}

/**
 * From `memberId`'s groups: new threads from forums that share to the
 * Feed (threads waiting for approval are left out), and posts in the
 * groups' photo, text and general feeds.
 */
export function collectGroupItems(memberId) {
  const items = [];
  const groups = getSpaces().filter((space) => space.kind === 'group' && space.memberIds.includes(memberId));
  for (const space of groups) {
    for (const module of space.modules) {
      if (FEED_TYPES.includes(module.type)) {
        for (const post of sortedPosts(module.data ?? {})) {
          items.push({ id: `feedpost-${post.id}`, kind: 'feedpost', kindGroup: 'groupPosts', authorId: post.authorId, timestamp: post.createdAt, blog: space, space, module, post });
        }
        continue;
      }
      if (module.type === 'articles') { items.push(...articleItems(module, space, 'groupPosts', space)); continue; }
      // The group's Board (the 'announcements' type): its posts go to members' Feeds by default.
      if (module.type === 'announcements') {
        for (const post of (module.data?.posts ?? []).map(normalizeBoardPost)) {
          if (post.toFeed === false || post.authorId === memberId) continue;
          items.push({ id: `boardpost-${post.id}`, kind: 'boardpost', kindGroup: 'groupPosts', authorId: post.authorId, timestamp: post.createdAt, space, module, post });
        }
        continue;
      }
      if (module.type !== 'forum' || !forumSettingsOf(module.data ?? {}).showInFeed) continue;
      for (const thread of (module.data.threads ?? []).map(normalizeThread)) {
        if (thread.pending) continue;
        const text = thread.body.replace(/\s+/g, ' ').trim();
        items.push({
          id: `thread-${thread.id}`,
          kind: 'thread',
          kindGroup: 'groupPosts',
          authorId: thread.authorId,
          anonymous: thread.anonymous,
          timestamp: thread.createdAt,
          space,
          module,
          thread,
          excerpt: text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS - 1)}…` : text,
        });
      }
    }
  }
  return items;
}
