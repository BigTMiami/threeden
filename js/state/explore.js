// @ts-check
/**
 * explore.js — what Explore shows first: groups and events by neighborhood
 * and interest, with the ones your friends are in at the top.
 *
 *   INTERESTS                 the interests people pick ("What are you into?")
 *   interestsOf(member)       their picks (member.interests), or [] before they pick
 *   setInterests(id, ids)     saves them
 *   groupInterests(space)     space.interests, or a guess from its name and type
 *   eventInterests(event, space)  from its tags, plus its group's
 *   groupPlace(space)         where it meets: space.area ('online' → ONLINE), else where its events are
 *   ONLINE                    the "Online" choice for where a group meets (Nov 22): no map spot,
 *                             so it shows for Near me and Anywhere, and under its own Online
 *   rankGroups(me, groups, { where })    → [{ space, friends, place, distance, matches, score }]
 *   whereChoices(me)          "Near me", each neighborhood with something public, "Anywhere"
 *
 * Ranking, highest first: friends in the group (the strongest sign someone
 * stays, in the year model), then your interests, then nearness, then size.
 */

import { changeState, getMember, getState } from './store.js';
import { getFriendIds } from './friends.js';
import { areaOf } from './events.js';
import { PLACES, placeById, guessPlace, distanceMiles } from '../utils/places.js';

/** The interests, each with the event tags and words that point to it. */
export const INTERESTS = [
  { id: 'music', label: 'Music', emoji: '🎵', tags: ['music'], words: ['band', 'music', 'open mic', 'choir', 'jam', 'gig', 'lantern', 'orchard', 'harbor', 'tin hours'] },
  { id: 'sports', label: 'Sports and fitness', emoji: '🏃', tags: ['sports'], words: ['soccer', 'run club', 'running', 'league', 'yoga', 'climb', 'pickup', 'rec ', 'basketball', 'swim'] },
  { id: 'outdoors', label: 'Outdoors', emoji: '🌳', tags: ['outdoors'], words: ['park', 'hike', 'garden', 'bike', 'trail', 'cleanup'] },
  { id: 'arts', label: 'Arts and books', emoji: '🎨', tags: ['arts'], words: ['book', 'film', 'design', 'art', 'theater', 'theatre', 'writing', 'studio', 'poetry', 'photo'] },
  { id: 'food', label: 'Food', emoji: '🍲', tags: ['food'], words: ['supper', 'cook', 'potluck', 'dinner', 'food', 'baking'] },
  { id: 'organizing', label: 'Organizing', emoji: '🗣️', tags: ['meeting'], words: ['union', 'tenants', 'coalition', 'climate', 'riders', 'organizing', 'campaign', 'association'] },
  { id: 'helping', label: 'Helping out', emoji: '🤝', tags: ['volunteering'], words: ['mutual aid', 'fridge', 'pantry', 'volunteer', 'shelter', 'coat'] },
  { id: 'news', label: 'Local news', emoji: '📰', tags: [], words: ['bulletin', 'dispatch', 'newsletter', 'news', 'gazette', 'zine'] },
  { id: 'learning', label: 'Classes', emoji: '🛠️', tags: ['workshop'], words: ['class', 'workshop', 'study', 'course', 'lesson', 'school of'] },
  { id: 'family', label: 'Families', emoji: '👨‍👩‍👧', tags: ['family'], words: ['parent', 'kids', 'school', 'family', 'pta'] },
  { id: 'social', label: 'Going out', emoji: '🎉', tags: ['party'], words: ['party', 'night', 'trivia', 'games', 'social', 'club night'] },
];

const INTEREST_IDS = new Set(INTERESTS.map((i) => i.id));
export const interestById = (id) => INTERESTS.find((i) => i.id === id) ?? null;

/** @param {any} member */
export const interestsOf = (member) => (member?.interests ?? []).filter((id) => INTEREST_IDS.has(id));

export function setInterests(memberId, ids) {
  changeState(() => { getMember(memberId).interests = ids.filter((id) => INTEREST_IDS.has(id)); }, 'account');
}

/**
 * Where a group meets and what it's about, for Explore (Group settings → General → On Explore).
 * @param {string} spaceId
 * @param {{ area?: string | null, interests?: string[] }} changes
 */
export function setGroupExplore(spaceId, { area, interests }) {
  changeState(() => {
    const space = getState().spaces.find((x) => x.id === spaceId);
    if (!space) return;
    if (area !== undefined) space.area = area || null;
    if (interests !== undefined) space.interests = interests.filter((id) => INTEREST_IDS.has(id)).slice(0, 3);
  }, 'space');
}

/** What a group is about: its own list, or a guess from its name, type, and description. */
export function groupInterests(space) {
  if (Array.isArray(space?.interests) && space.interests.length) return space.interests.filter((id) => INTEREST_IDS.has(id));
  const text = ` ${space?.name ?? ''} ${space?.groupType ?? ''} ${space?.description ?? ''} `.toLowerCase();
  return INTERESTS.filter((i) => i.words.some((w) => text.includes(w))).map((i) => i.id).slice(0, 2);
}

/** What an event is about: its tags, plus its group's interests. */
export function eventInterests(event, space) {
  const tags = event?.tags ?? [];
  const fromTags = INTERESTS.filter((i) => i.tags.some((t) => tags.includes(t))).map((i) => i.id);
  return [...new Set([...fromTags, ...(space ? groupInterests(space) : [])])];
}

/** "Online": a group that meets online, wherever its members are. */
export const ONLINE = Object.freeze({ id: 'online', name: 'Online', online: true });

/** Where a group meets: its own area (space.area), else where most of its events are. */
export function groupPlace(space) {
  if (!space) return null;
  if (space.area === ONLINE.id) return ONLINE;
  if (space.area) return placeById(space.area);
  const counts = new Map();
  for (const module of space.modules ?? []) {
    for (const event of module.data?.events ?? []) {
      const place = event.area ? placeById(event.area) : guessPlace(event.location);
      if (place) counts.set(place.id, (counts.get(place.id) ?? 0) + 1);
    }
  }
  if (counts.size) return placeById([...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return null; // unknown: it shows under Anywhere (a group can set where it meets in Settings)
}

/** A neighborhood counts as "in" it within about a mile and a half of its middle. */
const NEIGHBORHOOD_MILES = 1.5;

/**
 * The Where menu: near you (your area and radius), each neighborhood that has
 * a public group or event, and anywhere.
 * @returns {{ id: string, label: string }[]}
 */
export function whereChoices(me, publicPlaces) {
  const area = areaOf(me);
  const near = area ? [{ id: 'near', label: area.radiusMiles == null ? `Near ${area.label.replace(/^Near /, '')}` : `Within ${area.radiusMiles} mi of ${area.label.replace(/^Near /, '')}` }] : [];
  const places = PLACES.filter((p) => publicPlaces.has(p.id))
    .sort((a, b) => (area ? distanceMiles(area.point, a) - distanceMiles(area.point, b) : a.name.localeCompare(b.name)))
    .map((p) => ({ id: p.id, label: p.name }));
  const online = publicPlaces.has(ONLINE.id) ? [{ id: ONLINE.id, label: 'Online' }] : [];
  return [...near, ...places, ...online, { id: 'anywhere', label: 'Anywhere' }];
}

/**
 * Is this place inside the chosen Where? Unplaced things show only for Anywhere.
 * @param {any} place  a PLACES entry or null
 * @param {string} where  'near' | 'anywhere' | a place id
 * @param {any} area  areaOf(me)
 */
export function inWhere(place, where, area) {
  if (where === 'anywhere') return true;
  if (!place) return false;
  // Online groups are a tap away for everyone: near you too, but not "in" a neighborhood.
  if (place.online) return where === 'near' || where === ONLINE.id;
  if (where === ONLINE.id) return false;
  if (where === 'near') return !area || area.radiusMiles == null || distanceMiles(area.point, place) <= area.radiusMiles;
  const hood = placeById(where);
  return Boolean(hood) && distanceMiles(hood, place) <= NEIGHBORHOOD_MILES;
}

/**
 * Groups in the chosen place, best first.
 * @param {any} me
 * @param {any[]} groups
 * @param {{ where?: string, only?: string | null }} [options]  only: one interest id
 */
export function rankGroups(me, groups, { where = 'near', only = null } = {}) {
  const area = areaOf(me);
  const friends = new Set(getFriendIds(me.id));
  const mine = new Set(interestsOf(me));
  return groups.map((space) => {
    const place = /** @type {any} */ (groupPlace(space)); // a PLACES entry, ONLINE, or null
    const interests = groupInterests(space);
    const friendIds = space.memberIds.filter((id) => friends.has(id));
    const matches = interests.filter((id) => mine.has(id));
    const distance = area && place && !place.online ? distanceMiles(area.point, place) : null;
    const score = friendIds.length * 10 + matches.length * 6
      + (distance == null ? 0 : Math.max(0, 4 - distance / 2))
      + Math.log2(1 + space.memberIds.length);
    return { space, friends: friendIds, place, distance, interests, matches, score };
  })
    .filter((row) => inWhere(row.place, where, area))
    .filter((row) => !only || row.interests.includes(only))
    .sort((a, b) => b.score - a.score);
}

/** Every place that has a public group or event, for the Where menu. */
export function publicPlaceIds(groups, occurrences) {
  const ids = new Set();
  for (const g of groups) { const p = groupPlace(g); if (p) ids.add(p.id); }
  for (const { event } of occurrences) { const p = event.area ? placeById(event.area) : guessPlace(event.location); if (p) ids.add(p.id); }
  return ids;
}

/** Interests to suggest before someone has picked: what their groups are about. */
export function suggestedInterests(me) {
  const counts = new Map();
  for (const space of getState().spaces) {
    if (space.kind !== 'group' || !space.memberIds.includes(me.id)) continue;
    for (const id of groupInterests(space)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 3);
}

/** "Maya is in it", "Maya and Leo are in it", "Maya and 3 other friends are in it". */
export function friendsInLine(friendIds) {
  if (!friendIds.length) return '';
  const first = (id) => getMember(id)?.name.split(' ')[0] ?? 'A friend';
  if (friendIds.length === 1) return `${first(friendIds[0])} is in it`;
  if (friendIds.length === 2) return `${first(friendIds[0])} and ${first(friendIds[1])} are in it`;
  return `${first(friendIds[0])} and ${friendIds.length - 1} other friends are in it`;
}
