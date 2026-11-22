// @ts-check
/**
 * feed-page.js — the Feed (#feed) and Friends (#feed-friends) pages.
 *
 *   (All) (Friends) (Groups) (Events) (Nearby)        [Take a break] [Adjust your feed]
 *   ┌ From groups ─────────────── answer right here (feed-needs.js) ┐
 *   …new since you last looked…
 *   ✓ You’re caught up. Earlier posts are below.
 *   …older…
 *   ✓ That’s everything. Time to go do something together.
 *
 *   (RP) Rosa P added 3 photos to “The garden this year” · 5 hours ago
 *        [▓▓] [▓▓] [▓▓]
 *        Rosa is your friend · you asked to see more from Rosa
 *   (LL) Leo L posted “Why our block needs the garden” · yesterday
 *        Last spring, forty of us signed…   Read more →
 *   (DK) Dev K is hosting “Open mic night” · Tue, Nov 24 · The Backroom
 *        [👍 Going] [🤔 Maybe] [😢 Can't go]
 *   (PN) Priya N started “Heat log” in Tenant forum · Juniper Tenants Union
 *        Every morning at 7, write down…   Open the thread →
 *
 *   Friends: requests to answer, your friends, and people from your groups
 *   you might know.
 *
 * Every item has Like · Comment · Send underneath (js/ui/reactions-bar.js).
 * For blog posts they follow the blogger's rules (Account settings → Your
 * blog). For a group's forum thread, Upvote and Reply go to the thread
 * itself, and it can only be sent to people in that group.
 *
 * What's shown and in what order comes from feed-settings.js (changed in
 * Account settings → Your feed); the items come from feed-items.js.
 */

import { isPinned } from '../modules/announcements/announcements-data.js';
import { postMenu } from './post-menu.js';
import { getReactions } from '../state/reactions.js';
import { postKey } from '../modules/blog-feeds/feed-data.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { timeAgo } from '../utils/dates.js';
import { changeState, getCurrentUser, getMember, getSpaces, getModule, updateModuleData, publicTabsOf } from '../state/store.js';
import { renderNeedsYou } from './feed-needs.js';
import { renderFriends } from './friends-page.js';
import { areaOf, eventsNear, getPublicEvents } from '../state/events.js';
import { getFriendIds, usesSocial } from '../state/friends.js';
import { updateEvent, findEvent } from '../state/events.js';
import { applyRsvp, colorValue } from '../modules/calendar/calendar-data.js';
import { rsvpButtons, rsvpSummary } from '../events/rsvp.js';
import { dateBlock } from '../modules/events/events-list.js';
import { eventHref, whenLabel } from '../events/event-details.js';
import { formatMiles } from '../utils/places.js';
import { eventCoverBanner } from '../events/event-cover.js';
import { openEventShare } from '../events/event-share.js';
import { isMuted } from '../state/blocks.js';
import { followedTags, tagsIn } from '../state/tags.js';
import { collectFeedItems, collectGroupItems, collectFollowedGroupItems } from './feed-items.js';
import { followedPeopleIds } from '../state/follows.js';
import { requestModuleFocus } from '../editor/module-context.js';
import { readingTime } from '../modules/articles/articles-data.js';
import { availabilityChip } from '../ui/availability-chip.js';
import { blogPostReactions, blogPostSend } from '../ui/post-reactions.js';
import { reactionsBar } from '../ui/reactions-bar.js';
import { openShareDialog } from '../ui/share-dialog.js';
import { renderFeedPost, renderMedia, renderEventStrip } from '../modules/blog-feeds/feed-post.js';
import { notify } from '../state/notifications.js';
import { roleOf } from '../state/permissions.js';
import {
  normalizeThread, settingsOf as forumSettingsOf, canReply, createReply, toggleVote, setFollowing,
} from '../modules/forum/forum-data.js';
import { getFeedSettings, arrangeFeed, explainScore, calmFollowed } from './feed-settings.js';
import { blogHref, openModulePage, spaceHref } from '../router.js';
import { feedBreakControl, isOnFeedBreak, renderFeedBreak } from './feed-break.js';

const PAGE_SIZE = 20;

/** The Feed's redraw, for menus that change what it shows (Mute, Block). */
let feedRedraw = null;

export function renderFeedPage(container, tab = 'feed') {
  const me = getCurrentUser();
  const redraw = () => renderFeedPage(container, tab);

  if (!usesSocial(me.id)) {
    replaceChildren(container,
      h('header', { class: 'settings-page__header' }, h('h1', { class: 'settings-page__title' }, 'Blog')),
      h('p', { class: 'module-empty' }, 'You’ve turned off blogs and the feed. ', h('a', { href: '#account-feed' }, 'Turn them back on in Account settings'), '.'));
    return;
  }

  // The Feed needs no title (the top bar says where you are; the heading is
  // kept for screen readers). Friends, reached from the Home menu, has one.
  replaceChildren(container,
    tab === 'friends'
      ? h('header', { class: 'settings-page__header' }, h('h1', { class: 'settings-page__title' }, 'Friends'))
      : h('h1', { class: 'visually-hidden' }, 'Feed'),
    tab === 'friends' ? renderFriends(me, redraw) : renderFeed(me, redraw),
  );
}

// ─── The feed ────────────────────────────────────────────────────────────────

/** Which chip is on (All, Friends, Groups, Events, Nearby). Kept while the page is open. */
let feedFilter = 'all';
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'friends', label: 'Friends' },
  { id: 'groups', label: 'Groups' },
  { id: 'events', label: 'Events' },
  { id: 'nearby', label: 'Nearby' },
  { id: 'following', label: 'Following' }, // every post from groups you follow (All keeps them calm: feed-settings.js)
];

/**
 * "You're caught up": the first time you open the Feed in a visit, it
 * remembers when you last looked (member.feedSeenAt) and moves the mark to
 * now. Posts since then come first; a divider says you're caught up; older
 * ones follow. Redraws during the same visit keep the same mark.
 */
let feedVisit = null;
window.addEventListener('hashchange', () => { if (!window.location.hash.startsWith('#feed')) feedVisit = null; });
function seenBefore(me) {
  if (feedVisit?.memberId === me.id) return feedVisit.seenBefore;
  feedVisit = { memberId: me.id, seenBefore: me.feedSeenAt ?? 0 };
  changeState((state) => { state.members.find((m) => m.id === me.id).feedSeenAt = Date.now(); });
  return feedVisit.seenBefore;
}

const isEventItem = (item) => item.kind === 'event' || (item.kind === 'feedpost' && item.post.attachments?.some((a) => a.kind === 'event'));

/** Public events near your area (Account settings → Your area), as Feed items. */
function nearbyItems(me, already) {
  const area = areaOf(me);
  if (!area) return null;
  const { near } = eventsNear(getPublicEvents(60), area);
  return near
    .filter(({ event }) => !already.has(event.id) && event.createdBy !== me.id)
    .map((occurrence) => {
      const module = getModule(occurrence.moduleId);
      return {
        id: `near-${occurrence.event.id}`, kind: 'event', kindGroup: 'events', authorId: occurrence.event.createdBy,
        timestamp: occurrence.event.createdAt ?? Date.now(), blog: occurrence.space, space: occurrence.space.kind === 'group' ? occurrence.space : null,
        module, event: occurrence.event, distance: occurrence.distance, nearby: true,
      };
    })
    .filter((item) => item.module && getMember(item.authorId));
}

function renderFeed(me, redraw) {
  feedRedraw = redraw;
  if (isOnFeedBreak(me.id)) return renderFeedBreak(me.id);
  const settings = getFeedSettings(me.id);
  const friendIds = getFriendIds(me.id);
  // Friends, plus people you follow (one-way), plus your own posts if you like.
  const followedPeople = followedPeopleIds(me.id).filter((id) => !friendIds.includes(id));
  const people = [...friendIds, ...followedPeople];
  const authors = settings.includeMine ? [...people, me.id] : people;
  const groupItems = [...collectGroupItems(me.id), ...collectFollowedGroupItems(me.id)];
  // People you muted or blocked (blocks.js) are left out.
  // Topics you follow (tags.js): matching posts from other public blogs.
  const topics = followedTags(me.id);
  const others = topics.length ? getSpaces().filter((sp) => sp.kind === 'blog' && !authors.includes(sp.memberIds[0]) && sp.memberIds[0] !== me.id).map((sp) => sp.memberIds[0]) : [];
  const topicItems = collectFeedItems(others).filter((item) => item.kind === 'feedpost')
    .map((item) => ({ ...item, viaTag: tagsIn(item.post.text).find((t) => topics.includes(t)) })).filter((item) => item.viaTag);
  const allItems = arrangeFeed([...collectFeedItems(authors), ...groupItems, ...topicItems], me.id, settings).filter((item) => !item.authorId || !isMuted(me.id, item.authorId));
  const lastLooked = seenBefore(me);
  let shown = PAGE_SIZE;

  if (people.length === 0 && groupItems.length === 0) {
    return h('div', { class: 'settings-section feed-empty' },
      h('p', {}, 'Your feed shows new posts, photos, and events from your friends, the people you follow, and your groups.'),
      h('p', {}, 'Nothing here yet. ', h('a', { href: '#feed-friends' }, 'Find people you know'), ', or follow a blog or a group’s public page.'));
  }

  const chips = h('div', { class: 'feed-filters', role: 'group', 'aria-label': 'Show' });
  const needs = h('div', {});
  const list = h('ol', { class: 'feed' });
  const more = h('div', { class: 'feed__more' });

  function itemsForFilter() {
    if (feedFilter === 'following') return allItems.filter((item) => item.followed).sort((a, b) => b.timestamp - a.timestamp);
    if (feedFilter === 'all' && settings.calmFollows) return calmFollowed(allItems);
    if (feedFilter === 'friends') return allItems.filter((item) => !item.space && item.blog?.kind === 'blog');
    if (feedFilter === 'groups') return allItems.filter((item) => item.space);
    if (feedFilter === 'events') return allItems.filter(isEventItem);
    if (feedFilter === 'nearby') {
      const already = new Set(allItems.filter((i) => i.kind === 'event').map((i) => i.event.id));
      return nearbyItems(me, already);
    }
    return allItems;
  }

  function draw() {
    replaceChildren(chips, FILTERS.map((f) => h('button', {
      type: 'button', class: `chip feed-filters__chip${feedFilter === f.id ? ' is-on' : ''}`, 'aria-pressed': String(feedFilter === f.id),
      onClick: () => { feedFilter = f.id; shown = PAGE_SIZE; draw(); },
    }, f.label)));
    // What your groups need, first. ("Your week" on Sundays came off the Feed Nov 22.)
    replaceChildren(needs, feedFilter === 'all' ? [renderNeedsYou(me, redraw)] : null);
    const items = itemsForFilter();
    if (items === null) {
      replaceChildren(list, h('li', { class: 'feed__end' }, 'Set your area to see public events near you. ', h('a', { href: '#account-location' }, 'Set my area')));
      replaceChildren(more);
      return;
    }
    // New since you last looked first, then a "caught up" line, then the rest.
    const fresh = feedFilter === 'nearby' ? items : items.filter((item) => item.timestamp > lastLooked);
    const older = feedFilter === 'nearby' ? [] : items.filter((item) => item.timestamp <= lastLooked);
    const ordered = [...fresh, ...older];
    const rows = [];
    if (feedFilter !== 'nearby' && !fresh.length && older.length) rows.push(caughtUp('You’re caught up. Nothing new since you last looked.', true));
    const page = ordered.slice(0, shown);
    const freshShown = page.filter((item) => fresh.includes(item));
    const olderShown = page.filter((item) => !fresh.includes(item));
    // Several posts from one place in one go become one card (clusterItems).
    clusterItems(freshShown).forEach((entry) => rows.push(entry.cluster ? renderCluster(entry.cluster, me, settings, redraw) : withSameDay(entry.item, renderItem(entry.item, me, settings, redraw))));
    if (feedFilter !== 'nearby' && freshShown.length && olderShown.length) rows.push(caughtUp('You’re caught up. Earlier posts are below.'));
    clusterItems(olderShown).forEach((entry) => rows.push(entry.cluster ? renderCluster(entry.cluster, me, settings, redraw) : withSameDay(entry.item, renderItem(entry.item, me, settings, redraw))));
    replaceChildren(list, rows);
    replaceChildren(more, ordered.length > shown
      ? h('button', { type: 'button', class: 'button', onClick: () => { shown += PAGE_SIZE; draw(); } }, 'Show more')
      : h('div', { class: 'feed__end feed__end--done' },
        icon('check', 18),
        h('p', {}, ordered.length ? `That’s everything${feedFilter === 'nearby' ? ' near you' : ` from the last ${settings.days} days`}.` : feedFilter === 'nearby' ? 'No public events near you right now.' : 'Nothing here yet.'),
        h('p', { class: 'feed__end-hint' }, 'Time to go do something together. ', h('a', { href: '#groups-explore' }, 'See what’s on near you'))));
  }
  /** A followed group's post that stands for its day: "+2 more today from The Lantern" opens Following. */
  function withSameDay(item, row) {
    if (item.sameDay?.length) {
      row.append(h('button', {
        type: 'button', class: 'link-button feed-item__same-day',
        onClick: () => { feedFilter = 'following'; shown = PAGE_SIZE; draw(); },
      }, `+${item.sameDay.length} more today from ${item.space.name}`));
    }
    return row;
  }

  draw();

  return h('div', { class: 'feed-page' },
    h('div', { class: 'feed__summary' },
      chips,
      h('span', { class: 'feed__summary-tools' },
        feedBreakControl(me, { onStart: redraw, compact: true }),
        h('a', { href: '#account-feed', class: 'feed__adjust' }, icon('settings', 12), ' Adjust your feed'))),
    needs, list, more);
}

/** The line between what's new and what you've seen. */
// ─── Grouping similar posts ─────────────────────────────────────────────────

const CLUSTER_KINDS = ['feedpost', 'post', 'photos'];
const CLUSTER_MIN = 3; // three or more posts from one place in a day become one card
const CLUSTER_WINDOW_MS = 24 * 3600 * 1000;

/** [{ item } | { cluster: [items] }], in order of each one's newest post. */
function clusterItems(items) {
  const byPlace = new Map();
  for (const item of items) {
    if (!CLUSTER_KINDS.includes(item.kind)) continue;
    const place = item.space?.id ?? item.blog?.id;
    if (!place) continue;
    const key = `${place}:${item.module?.id ?? ''}`;
    byPlace.set(key, [...(byPlace.get(key) ?? []), item]);
  }
  const clustered = new Map(); // first item → its cluster
  const absorbed = new Set();
  for (const list of byPlace.values()) {
    const close = list.filter((item) => Math.abs(item.timestamp - list[0].timestamp) <= CLUSTER_WINDOW_MS);
    if (close.length < CLUSTER_MIN) continue;
    clustered.set(close[0], close);
    close.slice(1).forEach((item) => absorbed.add(item));
  }
  return items.filter((item) => !absorbed.has(item)).map((item) => (clustered.has(item) ? { cluster: clustered.get(item) } : { item }));
}

/** "Grace, Theo, and 2 others posted in Eastside Mutual Aid": the newest post, and "Show 3 more". */
function renderCluster(items, me, settings, redraw) {
  const people = [...new Set(items.map((i) => i.authorId))].map(getMember).filter(Boolean);
  const names = people.map((p) => (p.id === me.id ? 'You' : p.name.split(' ')[0]));
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]}, ${names[1]}, and ${names.length - 2} ${names.length - 2 === 1 ? 'other' : 'others'}`;
  const place = items[0].space?.name ?? items[0].blog?.name ?? '';
  const where = items[0].module?.title ? `${place} · ${items[0].module.title}` : place;
  const rest = h('ul', { class: 'feed-cluster__rest', hidden: true });
  const toggle = h('button', {
    type: 'button', class: 'link-button feed-cluster__toggle', 'aria-expanded': 'false',
    onClick: () => {
      const open = rest.hidden;
      if (open && !rest.childElementCount) replaceChildren(rest, items.slice(1).map((item) => renderItem(item, me, settings, redraw)));
      rest.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Show fewer' : `Show ${items.length - 1} more`;
    },
  }, `Show ${items.length - 1} more`);
  return h('li', { class: 'feed-cluster' },
    h('p', { class: 'feed-cluster__head' }, h('span', { class: 'avatar-row' }, people.slice(0, 3).map((p) => avatar(p, 20))), ` ${who} posted ${items.length} times in `, h('strong', {}, where)),
    h('ul', { class: 'feed-cluster__first' }, renderItem(items[0], me, settings, redraw)),
    rest,
    toggle);
}

function caughtUp(text, top = false) {
  return h('li', { class: `feed__caught-up${top ? ' feed__caught-up--top' : ''}`, role: 'separator' }, icon('check', 14), ` ${text}`);
}

/**
 * Every Feed item has the same shape, whatever it is:
 *
 *   (JB) Jamal Brooks is hosting an event            ← who, and what they did
 *        Jamal’s blog · 2 days ago                    ← where, and when
 *   Text, if there is any (same type for everything)
 *   [photos, one size for all]  or  ┌ the event / blog post / thread ┐
 *   ♡ Like · Comment · Send
 *   👁 Why you’re seeing this
 */
function cardHead(person, headline, where, timestamp, { href = null, anonymous = false, menu = null } = {}) {
  const face = anonymous || !person
    ? h('span', { class: 'avatar avatar--empty forum__anon-face feed-item__anon' }, '?')
    : avatar(person, 36);
  return h('header', { class: 'feed-item__head' },
    href ? h('a', { href, class: 'feed-item__avatar', 'aria-hidden': 'true', tabindex: '-1' }, face) : h('span', { class: 'feed-item__avatar', 'aria-hidden': 'true' }, face),
    h('div', { class: 'feed-item__who' },
      h('p', { class: 'feed-item__headline' }, headline),
      h('p', { class: 'feed-item__meta', title: new Date(timestamp).toLocaleString() }, where, ` · ${timeAgo(timestamp)}`)),
    menu);
}

/**
 * The "…" on a Feed card (js/feed/post-menu.js): why it's here, more
 * about it, and Report. (Why used to be a line under every card.)
 */
function menuFor(item, me, settings, extras = {}) {
  const space = item.space ?? item.blog;
  const author = item.anonymous ? null : getMember(item.authorId);
  const inGroup = space?.kind === 'group';
  const tabPublic = inGroup && publicTabsOf(space).some((t) => t.id === (item.module?.tabId ?? 'home'));
  const reactions = getReactions(item.kind === 'feedpost' ? postKey(item.post.id) : item.id);
  const counts = item.kind === 'thread' ? null
    : [`${reactions.likes.length} ${reactions.likes.length === 1 ? 'like' : 'likes'}`, `${reactions.comments.length} ${reactions.comments.length === 1 ? 'comment' : 'comments'}`].join(' · ');
  const itemId = item.post?.id ?? item.thread?.id ?? item.event?.id ?? null;
  const hash = item.kind === 'event' ? eventHref(item.event.id) : `#module-${item.module.id}`;
  const edited = item.post?.editedAt ?? item.thread?.editedAt ?? null;
  const kindLabel = { feedpost: 'Post', article: 'Article', post: 'Blog post', photos: 'Photos', event: 'Event', thread: 'Forum thread' }[item.kind] ?? 'Post';
  // Send to someone: posts follow the blogger's or group's rules; events use the event share sheet.
  const send = extras.send !== undefined ? extras.send
    : item.kind === 'event' ? () => openEventShare(findEvent(item.event.id), me)
      : item.kind === 'thread' ? () => openShareDialog({
        title: item.thread.title,
        candidateIds: item.space.memberIds, // a group's thread only goes to people in the group
        attachment: { kind: 'post', moduleId: item.module.id, itemId: item.thread.id, authorId: item.anonymous ? null : item.authorId, where: item.space.name, title: item.thread.title, excerpt: (item.thread.body ?? '').slice(0, 120), image: null },
      })
        : blogPostSend({ ownerId: item.authorId, spaceId: item.space?.id ?? null, share: { title: item.title ?? 'A post', attachment: { kind: 'post', moduleId: item.module.id, itemId: null, authorId: item.authorId, where: item.blog?.name ?? '', title: item.title ?? 'A post', excerpt: item.excerpt ?? '', image: item.photos?.[0]?.src ?? null } } });
  return postMenu({
    ...extras,
    send,
    why: item.viaTag ? `You follow #${item.viaTag}. Unfollow it on the tag’s page.` : explainScore(item, me.id, settings),
    title: item.kind === 'event' ? 'this event' : 'this post',
    info: [
      ['What', kindLabel],
      ['Posted by', author ? author.name : 'Someone (anonymous)'],
      ['Where', [space?.name, item.module?.title].filter(Boolean).join(' · ')],
      ['When', new Date(item.timestamp).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })],
      ['Edited', edited ? new Date(edited).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null],
      ['Who can see it', inGroup ? (tabPublic ? 'Anyone with the link (a public tab)' : `Members of ${space.name}`) : 'Anyone on 3den (a public blog)'],
      ['Reactions', counts],
    ],
    link: `${window.location.origin}${window.location.pathname}${hash}`,
    save: {
      key: item.kind === 'feedpost' ? postKey(item.post.id) : item.kind === 'event' ? item.event.id : item.id,
      kind: { feedpost: 'post', post: 'blogpost', photos: 'photos', event: 'event', thread: 'thread' }[item.kind] ?? 'post',
      eventId: item.event?.id ?? null,
      title: item.kind === 'feedpost' ? (item.post.text.slice(0, 80) || `${author?.name ?? 'Someone'}’s post`) : item.title ?? item.event?.title ?? item.thread?.title ?? item.module?.title ?? 'A post',
      href: hash,
      where: [space?.name, item.module?.title].filter(Boolean).join(' · '),
    },
    report: item.authorId === me.id ? null : {
      key: `${item.kind}:${itemId ?? item.id}`, kind: item.kind, spaceId: space?.id ?? null, moduleId: item.module?.id ?? null, itemId, authorId: item.authorId,
    },
    person: author && !item.anonymous ? { id: author.id, name: author.name } : null,
    igCard: item.kind === 'feedpost' && item.authorId === me.id && item.post.media.some((m) => m.kind === 'image')
      ? { src: item.post.media.find((m) => m.kind === 'image').src, caption: item.post.text, author: me } : null,
    onChange: () => feedRedraw?.(),
  });
}

function renderItem(item, me, settings, redraw) {
  if (item.kind === 'thread') return renderThreadItem(item, me, settings);
  if (item.kind === 'boardpost') return renderBoardItem(item, me, settings);
  if (item.kind === 'feedpost') return renderFeedPostItem(item, me, settings);
  const author = getMember(item.authorId);
  const name = h('a', { href: blogHref(author), class: 'feed-item__name' }, author.name);
  const openModule = (e) => { e.preventDefault(); openModulePage(item.module.id); };
  const where = item.space
    ? h('a', { href: spaceHref(item.space.id) }, item.space.name)
    : h('a', { href: blogHref(author) }, `${author.name.split(' ')[0]}’s blog`);

  // Short headlines: just who. The card itself shows what it is, and the
  // line under the name says where and when ("Porch Lights · 2h").
  let headline;
  let body;
  let whereExtra = null;
  if (item.kind === 'article') {
    // Laid out like a story on a news site: picture, section, headline, summary.
    const { article } = item;
    headline = [name];
    const openArticle = (e) => { e.preventDefault(); requestModuleFocus(item.module.id, article.id); openModulePage(item.module.id); };
    body = h('a', { class: 'feed-article', href: `#module-${item.module.id}`, onClick: openArticle },
      article.hero ? h('img', { class: 'feed-article__image', src: article.hero.src, alt: '' }) : null,
      h('span', { class: 'feed-article__text' },
        article.kicker ? h('span', { class: 'article-kicker' }, article.kicker) : null,
        h('span', { class: 'feed-article__headline' }, article.headline),
        item.excerpt ? h('span', { class: 'feed-article__dek' }, item.excerpt) : null,
        h('span', { class: 'feed-article__more' }, `${readingTime(article)} · Read the article →`)));
  } else if (item.kind === 'post') {
    headline = [name];
    body = h('a', { class: 'feed-attach', href: `#module-${item.module.id}`, onClick: openModule },
      h('span', { class: 'feed-attach__icon', 'aria-hidden': 'true' }, icon('note', 18)),
      h('span', { class: 'feed-attach__text' },
        h('span', { class: 'feed-attach__title' }, item.title),
        item.excerpt ? h('span', { class: 'feed-attach__excerpt' }, item.excerpt) : null,
        h('span', { class: 'feed-attach__more' }, 'Read more →')));
  } else if (item.kind === 'photos') {
    headline = [name];
    whereExtra = [' · ', h('a', { href: `#module-${item.module.id}`, onClick: openModule }, item.module.title)];
    // The same picture layout as posts (one big, or a grid with "+3").
    body = renderMedia(item.photos.map((photo, i) => ({ id: photo.id ?? `p${i}`, kind: 'image', src: photo.src, caption: photo.caption ?? '' })));
  } else {
    const { event } = item;
    headline = [name];
    // The cover (if it has one) across the top of the box, then the date and details.
    // Share is in the box, in place of Send (see blogPostReactions below).
    const cover = eventCoverBanner(event, 'feed-attach__cover');
    body = h('div', { class: `feed-attach feed-attach--event${cover ? ' feed-attach--has-cover' : ''}` },
      cover ? h('a', { href: eventHref(event.id), class: 'feed-attach__cover-link', tabindex: '-1', 'aria-hidden': 'true' }, cover) : null,
      dateBlock(event.date, colorValue(event.color)),
      h('div', { class: 'feed-attach__text' },
        h('a', { class: 'feed-attach__title', href: eventHref(event.id) }, event.title),
        h('span', { class: 'feed-attach__excerpt' }, [whenLabel(event), event.location, item.distance != null ? `${formatMiles(item.distance)} away` : null].filter(Boolean).join(' · ')),
        h('span', { class: 'feed-attach__meta' }, rsvpSummary(event)),
        availabilityChip(event, { date: item.date ?? event.date }),
        h('div', { class: 'feed-attach__actions' },
          rsvpButtons(event, me.id, (answer) => {
            updateEvent(event.id, (saved) => applyRsvp(saved, me.id, answer));
            if (answer === 'going') showToast(`You’re going to “${event.title}”. It’s on your calendar.`);
            redraw();
          }, { compact: true }))));
  }

  const title = item.kind === 'post' || item.kind === 'article' ? item.title : item.kind === 'photos' ? `${item.photos.length === 1 ? 'A photo' : 'Photos'} in “${item.module.title}”` : item.event.title;
  return h('li', { class: 'feed-item' },
    cardHead(author, headline, whereExtra ? [where, whereExtra] : where, item.timestamp, { href: blogHref(author), menu: menuFor(item, me, settings) }),
    body,
    blogPostReactions({
      // An article's likes and comments are the same ones its own page shows.
      key: item.kind === 'article' ? `article:${item.article.id}` : item.id,
      ownerId: item.authorId,
      spaceId: item.kind === 'article' ? item.space?.id ?? null : null,
      about: { title, moduleId: item.module.id, itemId: item.article?.id ?? null },
      share: item.kind === 'event' ? null : {
        title,
        attachment: {
          kind: 'post', moduleId: item.module.id, itemId: item.article?.id ?? null, authorId: item.authorId, where: item.blog.name, title,
          excerpt: item.excerpt ?? '', image: item.photos?.[0]?.src ?? null,
        },
      },
    }));
}

/** A post from a friend's blog feed (or a group's feed), shown whole, as where it was posted. */
function renderFeedPostItem(item, me, settings) {
  const author = getMember(item.authorId);
  // A group's feed: just the feed's name ("Shared with the union"), linked to it; the group is in its tooltip.
  const context = item.space
    ? h('a', { href: `#module-${item.module.id}`, title: `${item.module.title}, in ${item.space.name}` }, item.module.title)
    : author ? h('a', { href: blogHref(author) }, `${author.name.split(' ')[0]}’s blog`) : 'A blog';
  return h('li', { class: 'feed-item feed-item--post' },
    renderFeedPost(item.post, { moduleId: item.module.id, ownerId: item.authorId, where: item.blog.name, spaceId: item.space?.id ?? null, context, menu: (extras) => menuFor(item, me, settings, extras) }));
}

/** A new forum thread from one of your groups. Anonymous threads don't say who. */
/** A post on a group's Board (feed-items.js): the words, the first picture, and the way to it. */
function renderBoardItem(item, me, settings) {
  const { post, module, space } = item;
  const author = getMember(item.authorId);
  const open = (event) => { event.preventDefault(); requestModuleFocus(module.id, post.id); openModulePage(module.id); };
  const text = (post.body ?? '').replace(/\s+/g, ' ').trim();
  const picture = (post.media ?? []).find((m) => m.kind === 'image');
  return h('li', { class: 'feed-item feed-item--board' },
    cardHead(author,
      [author ? h('a', { href: blogHref(author), class: 'feed-item__name' }, author.name) : h('span', { class: 'feed-item__name' }, 'Someone')],
      [h('a', { href: spaceHref(space.id) }, space.name), ` · ${module.title}`, isPinned(post) ? ' · pinned' : ''],
      item.timestamp, { href: author ? blogHref(author) : null, menu: menuFor(item, me, settings) }),
    post.title ? h('p', { class: 'feed-board__title' }, post.title) : null,
    text ? h('p', { class: 'feed-board__text' }, text.length > 280 ? `${text.slice(0, 279)}…` : text) : null,
    picture ? h('img', { class: 'feed-board__photo', src: picture.src, alt: picture.caption ?? '' }) : null,
    // An event made with the post, with its RSVP (feed-post.js).
    post.eventId ? renderEventStrip(post.eventId, () => {}) : null,
    h('a', { class: 'link-button feed-board__open', href: `#module-${module.id}`, onClick: open },
      `${post.comments?.length ? `${post.comments.length} ${post.comments.length === 1 ? 'comment' : 'comments'} · ` : ''}${post.likes?.length ? `♡ ${post.likes.length} · ` : ''}Open on the board →`));
}

function renderThreadItem(item, me, settings) {
  const { thread, module, space } = item;
  const author = item.anonymous ? null : getMember(item.authorId);
  const openThread = (event) => { event.preventDefault(); requestModuleFocus(module.id, thread.id); openModulePage(module.id); };

  return h('li', { class: 'feed-item feed-item--thread' },
    cardHead(author,
      [author ? h('a', { href: blogHref(author), class: 'feed-item__name' }, author.name) : h('span', { class: 'feed-item__name' }, 'Someone (anonymous)')],
      [h('a', { href: spaceHref(space.id) }, space.name), ` · ${module.title}`],
      item.timestamp, { href: author ? blogHref(author) : null, anonymous: !author, menu: menuFor(item, me, settings) }),
    h('a', { class: 'feed-attach', href: `#module-${module.id}`, onClick: openThread },
      h('span', { class: 'feed-attach__icon', 'aria-hidden': 'true' }, icon('forum', 18)),
      h('span', { class: 'feed-attach__text' },
        h('span', { class: 'feed-attach__title' }, thread.title),
        item.excerpt ? h('span', { class: 'feed-attach__excerpt' }, item.excerpt) : null,
        h('span', { class: 'feed-attach__more' }, 'Open the thread →'))),
    threadReactions(item, me, null));
}

/**
 * Upvote · Reply · Send for a forum thread in the Feed. Upvotes and
 * replies are saved on the thread itself, following the forum's settings;
 * it can only be sent to people in the group.
 */
function threadReactions(item, me, moreLink) {
  const { module, space } = item;
  const threadId = item.thread.id;
  const current = () => normalizeThread((getModule(module.id)?.data.threads ?? []).find((t) => t.id === threadId) ?? item.thread);
  const changeThread = (changeFn) => {
    const data = structuredClone(getModule(module.id).data);
    const index = data.threads.findIndex((t) => t.id === threadId);
    if (index === -1) return;
    data.threads[index] = normalizeThread(data.threads[index]);
    changeFn(data.threads[index]);
    updateModuleData(module.id, data);
  };

  return reactionsBar(() => {
    const thread = current();
    const settings = forumSettingsOf(getModule(module.id)?.data ?? {});
    const replies = thread.replies.filter((r) => !r.deleted && !r.parentId);
    return {
      liked: thread.votes[me.id] === 1,
      likeCount: Object.values(thread.votes).filter((v) => v > 0).length,
      likeLabel: 'Upvote',
      showLikes: true,
      canLike: true,
      onLike: () => changeThread((t) => toggleVote(t, me.id, 1)),
      commentNoun: 'reply',
      comments: replies.map((r) => ({ id: r.id, authorId: r.anonymous ? null : r.authorId, body: r.body, createdAt: r.createdAt })),
      showComments: true,
      canComment: !thread.locked && canReply(settings, roleOf(space, me.id)),
      cantCommentReason: thread.locked ? 'This thread is locked.' : 'Only admins and the owner reply in this forum.',
      onComment: (body) => {
        changeThread((t) => {
          t.replies = [...(t.replies ?? []), createReply({ authorId: me.id, body })];
          setFollowing(t, me.id, true);
        });
        notify({ recipientIds: thread.followers, actorId: me.id, kind: 'reply', text: `${me.name} replied in “${thread.title}”`, moduleId: module.id, itemId: threadId });
      },
      canDelete: () => false,
      // Send is in the card's … menu (menuFor).
      moreLink,
    };
  });
}

// ─── Friends ─────────────────────────────────────────────────────────────────
