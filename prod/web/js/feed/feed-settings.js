// @ts-check
/**
 * feed-settings.js — how each person's Feed is put together, in plain
 * terms they can see and change (Account settings → Your feed).
 *
 * Saved on the account as `member.feedSettings`:
 *   {
 *     order: 'relevant' | 'newest',
 *     show: { posts: true, photos: true, events: true, groupPosts: true },   ← kinds of things
 *     people: { 'm-priya': 'more' | 'normal' | 'less' | 'mute' },
 *     groups: { tenants: false },                          ← groups whose forum posts you don't want
 *     days: 30,                                            ← how far back
 *     boostMessaged: true,                                 ← friends you talk to rank higher
 *     includeMine: false,                                  ← your own posts too
 *     calmFollows: true,                                   ← groups you follow (not in) stay calm
 *   }
 *
 * Calm follows (calmFollowed below): a bar or a venue you follow might post
 * promotions every day. In the All view each followed group shows at most
 * one post a day (its newest; "+2 more today" opens the rest), and posts
 * from followed groups never fill more than a quarter of the Feed. The
 * Following chip shows all of them, newest first.
 *
 * "Most relevant" is a score, not a black box. For each item:
 *
 *   score = person weight × freshness × boosts
 *     person weight  More 2 · Normal 1 · Less 0.4 · Mute: hidden
 *     freshness      1 for brand new, ½ after a day, ⅓ after two…
 *     boosts         ×1.5 for an event in the next two weeks
 *                    ×1.3 if you've messaged them in the last two weeks
 *
 * explainScore() turns the same numbers into the "Why am I seeing this?"
 * line under each item, so what people read is exactly what's applied.
 */

import { changeState, getState, getMember } from '../state/store.js';
import { getFriendIds as getFriendIdsOf } from '../state/friends.js';
import { daysBetween, todayKey } from '../utils/dates.js';

export const PEOPLE_LEVELS = [
  { id: 'more', label: 'More', weight: 2 },
  { id: 'normal', label: 'Normal', weight: 1 },
  { id: 'less', label: 'Less', weight: 0.4 },
  { id: 'mute', label: 'Mute', weight: 0 },
];
export const DAY_CHOICES = [7, 30, 90, 365];
export const KINDS = [
  { id: 'posts', label: 'Posts and writing' },
  { id: 'photos', label: 'Photos' },
  { id: 'events', label: 'Events they’re hosting' },
  { id: 'groupPosts', label: 'Forum threads from your groups' },
];

const DEFAULTS = { order: 'relevant', show: { posts: true, photos: true, events: true, groupPosts: true }, people: {}, groups: {}, days: 30, boostMessaged: true, includeMine: false, calmFollows: true };
const HOUR_MS = 60 * 60 * 1000;
const SOON_DAYS = 14;
const EVENT_BOOST = 1.5;
const MESSAGED_BOOST = 1.3;
const MESSAGED_WITHIN_MS = 14 * 24 * HOUR_MS;

export function getFeedSettings(memberId) {
  const saved = getMember(memberId)?.feedSettings ?? {};
  return { ...DEFAULTS, ...saved, show: { ...DEFAULTS.show, ...saved.show }, people: { ...saved.people }, groups: { ...saved.groups } };
}

/** Change some settings: `updateFeedSettings(id, (s) => { s.order = 'newest'; })`. */
export function updateFeedSettings(memberId, changeFn) {
  const next = getFeedSettings(memberId);
  changeFn(next);
  changeState((state) => {
    state.members.find((m) => m.id === memberId).feedSettings = next;
  }, 'account');
}

export const levelOf = (settings, personId) => settings.people[personId] ?? 'normal';
const weightOf = (settings, personId) => PEOPLE_LEVELS.find((l) => l.id === levelOf(settings, personId)).weight;

/** Do you want forum threads from this group in your feed? (Yes unless you said no.) */
export const showsGroup = (settings, spaceId) => settings.groups[spaceId] !== false;

/** Anonymous posts aren't ranked by who wrote them (that would give it away). */
const personOf = (item) => (item.anonymous ? null : item.authorId);

/** Did these two message each other recently? */
function messagedRecently(me, other) {
  const since = Date.now() - MESSAGED_WITHIN_MS;
  return (getState().conversations ?? []).some((c) => c.kind === 'direct' && c.memberIds.includes(me) && c.memberIds.includes(other)
    && c.messages.some((m) => m.createdAt > since));
}

/** The parts of an item's score, so the page can show them. */
function scoreParts(item, me, settings) {
  const ageHours = Math.max(0, (Date.now() - item.timestamp) / HOUR_MS);
  const parts = {
    weight: item.authorId === me || !personOf(item) ? 1 : weightOf(settings, item.authorId),
    freshness: 1 / (1 + ageHours / 24),
    soonEvent: item.kind === 'event' && daysBetween(todayKey(), item.event.date) <= SOON_DAYS,
    messaged: settings.boostMessaged && personOf(item) && item.authorId !== me && messagedRecently(me, item.authorId),
  };
  parts.score = parts.weight * parts.freshness * (parts.soonEvent ? EVENT_BOOST : 1) * (parts.messaged ? MESSAGED_BOOST : 1);
  return parts;
}

/** Filter and order feed items by these settings. */
export function arrangeFeed(items, me, settings) {
  const cutoff = Date.now() - settings.days * 24 * HOUR_MS;
  const kept = items.filter((item) => settings.show[item.kindGroup]
    && item.timestamp >= cutoff
    && (!item.space || showsGroup(settings, item.space.id))
    && (item.authorId === me ? settings.includeMine : !personOf(item) || levelOf(settings, item.authorId) !== 'mute'));
  if (settings.order === 'newest') return kept.sort((a, b) => b.timestamp - a.timestamp);
  return kept
    .map((item) => ({ item, score: scoreParts(item, me, settings).score }))
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

/** "Rosa is your friend · you asked to see more of her · an event coming up soon" */
export function explainScore(item, me, settings) {
  if (item.authorId === me) return 'Your own post (you chose to include these)';
  const parts = scoreParts(item, me, settings);
  const name = getMember(item.authorId)?.name.split(' ')[0] ?? 'They';
  const isFriend = getFriendIdsOf(me).includes(item.authorId);
  const reasons = item.kind === 'thread' ? [`You’re in ${item.space.name}, and its ${item.module.title} shares new threads to members’ Feeds`]
    : item.followed ? [`You follow ${item.space.name}`]
      : item.space ? [`You’re in ${item.space.name}, and this is from its ${item.module.title}`]
        : [isFriend ? `${name} is your friend` : `You follow ${name}`];
  const level = personOf(item) ? levelOf(settings, item.authorId) : 'normal';
  if (level === 'more') reasons.push(`you asked to see more from ${name}`);
  if (level === 'less') reasons.push(`you asked to see less from ${name}, so it’s lower`);
  if (settings.order === 'relevant') {
    if (parts.soonEvent) reasons.push('the event is coming up soon');
    if (parts.messaged) reasons.push('you’ve messaged lately');
  } else {
    reasons.push('newest first');
  }
  return reasons.join(' · ');
}

/** At most this share of the Feed comes from groups you follow but aren't in. */
export const FOLLOWED_SHARE = 0.25;

/**
 * Keep followed groups calm (settings.calmFollows): one post a day from each
 * (the rest ride along as `item.sameDay`), and no more than FOLLOWED_SHARE of
 * the list. Items keep their order; the ones left out are still under
 * Following.
 */
export function calmFollowed(items) {
  const dayKey = (item) => `${item.space?.id}:${new Date(item.timestamp).toDateString()}`;
  const firstOfDay = new Map();
  const kept = [];
  let followedCount = 0;
  for (const item of items) {
    if (!item.followed) { kept.push(item); continue; }
    const key = dayKey(item);
    const first = firstOfDay.get(key);
    if (first) { first.sameDay.push(item); continue; }
    // Room for one more? Never more than a quarter, counting this one.
    if ((followedCount + 1) > Math.max(1, Math.floor((kept.length + 1) * FOLLOWED_SHARE))) continue;
    const copy = { ...item, sameDay: [] };
    firstOfDay.set(key, copy);
    kept.push(copy);
    followedCount += 1;
  }
  return kept;
}
