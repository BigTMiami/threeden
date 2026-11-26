// @ts-check
/**
 * instagram.js — bring an Instagram account's posts (and people) to 3den.
 *
 *   connectInstagram(memberId, { handle, feedModuleId, autoSync })  → imports the posts
 *   syncInstagram(memberId)        → copies posts made since the last sync
 *   startInstagramSync()           → checks every minute; each account syncs on its own schedule
 *   importPeople(memberId, text)   → reads followers/following from Instagram's data download
 *   instagramSuggestions(memberId) → people from Instagram who are on 3den (for the Friends tab)
 *   disconnectInstagram(memberId, { removePosts })
 *
 * What the real API allows (checked Nov 2026), and how this prototype maps to it:
 *   • Posts: the Instagram API with Instagram Login reads a professional
 *     (Business or Creator) account's own media: GET graph.instagram.com/me/media.
 *     Personal accounts lost API access when the Basic Display API shut down
 *     (Dec 4, 2024), so the connect screen asks people to switch to a free
 *     Creator account first. There's no "new post" webhook for your own
 *     feed, so the server polls (SYNC_EVERY_MS) with the stored long-lived token.
 *   • People: no Instagram API returns follower or following lists (only
 *     counts). The honest, consented route is Instagram's own "Download your
 *     information" export (Accounts Center), which contains
 *     followers_1.json and following.json. People upload that here; we keep
 *     only the usernames. Anyone on 3den who added the same Instagram
 *     username to their profile (and allows it to be found) shows up in
 *     Friends → "From your Instagram". Everyone else waits quietly, and
 *     appears there if they join later.
 *
 * In this prototype, "Instagram" is a small simulated server (demoServer
 * below) that has a few posts and drips out a new one every few minutes, so
 * you can see periodic sync work.
 *
 * Saved on the member:
 *   member.instagram = {
 *     handle, connectedAt, lastSyncAt, autoSync, feedModuleId,
 *     imported: { [instagramMediaId]: postId },
 *     people: { [handle]: 'follower' | 'following' | 'both' },
 *     dismissed: [handle], peopleImportedAt,
 *   }
 *   member.instagramHandle      ← the handle others can find you by (on your profile)
 *   member.instagramFindable    ← allow that (default true once set)
 */

import { changeState, getState, getMember, getModule, getSpaceOfModule } from './store.js';
import { friendStatus } from './friends.js';
import { makeId } from '../ui/dom.js';

/** How often a connected account is checked for new posts. */
export const SYNC_EVERY_MS = 5 * 60 * 1000;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// ─── The simulated Instagram server ────────────────────────────────────────

const SCENES = [
  { caption: 'Golden hour on the river path 🌅', sky: ['#ff9a5a', '#ffd38a'], ground: '#3b4a6b', sun: '#fff1c1' },
  { caption: 'Porch Lights practice, take 4', sky: ['#24324f', '#4a3d6b'], ground: '#1d1d28', sun: '#ffd66b' },
  { caption: 'Community garden haul. Tomatoes everywhere.', sky: ['#a8e0a1', '#e9f7d9'], ground: '#5b8a3c', sun: '#ffffff' },
  { caption: 'New bike, who dis', sky: ['#8ec5fc', '#e0c3fc'], ground: '#6c757d', sun: '#ffffff' },
  { caption: 'Tenants union meeting turnout was huge tonight', sky: ['#f6d365', '#fda085'], ground: '#7a4b3a', sun: '#fff7e0' },
  { caption: 'Snow day on Juniper Lane', sky: ['#dfe9f3', '#ffffff'], ground: '#c9d6e3', sun: '#ffffff' },
  { caption: 'Saturday pantry crew 💪', sky: ['#fbc2eb', '#a6c1ee'], ground: '#4d5b7c', sun: '#fff' },
  { caption: 'Thanksgiving prep has begun', sky: ['#f7b267', '#f4845f'], ground: '#5c3d2e', sun: '#ffe0b5' },
];

function sceneImage(scene, seed) {
  const hill = 260 + (seed % 5) * 14;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${scene.sky[0]}"/><stop offset="1" stop-color="${scene.sky[1]}"/></linearGradient></defs>
<rect width="800" height="800" fill="url(#g)"/>
<circle cx="${220 + (seed * 97) % 360}" cy="${240 + (seed * 31) % 120}" r="90" fill="${scene.sun}" opacity="0.9"/>
<path d="M0 ${800 - hill} Q 200 ${700 - hill} 400 ${790 - hill} T 800 ${760 - hill} V800 H0Z" fill="${scene.ground}" opacity="0.75"/>
<path d="M0 ${860 - hill} Q 260 ${760 - hill} 520 ${850 - hill} T 800 ${820 - hill} V800 H0Z" fill="${scene.ground}"/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** The account's media, oldest first: some from before connecting, then one every few minutes. */
const demoServer = {
  media(handle, connectedAt, now) {
    const list = [];
    const seed = [...handle].reduce((sum, c) => sum + c.charCodeAt(0), 0);
    // Five older posts, a few days apart.
    for (let i = 0; i < 5; i += 1) {
      const scene = SCENES[(seed + i) % SCENES.length];
      list.push({ id: `ig-${handle}-${i}`, caption: scene.caption, media_type: 'IMAGE', media_url: sceneImage(scene, seed + i), timestamp: connectedAt - (5 - i) * 3 * DAY, permalink: `https://www.instagram.com/p/demo${i}/` });
    }
    // Then a new post every 4 minutes after connecting (up to three), to show syncing.
    for (let i = 0; i < 3; i += 1) {
      const at = connectedAt + (i + 1) * 4 * MINUTE;
      if (at > now) break;
      const scene = SCENES[(seed + 5 + i) % SCENES.length];
      list.push({ id: `ig-${handle}-new${i}`, caption: scene.caption, media_type: 'IMAGE', media_url: sceneImage(scene, seed + 5 + i), timestamp: at, permalink: `https://www.instagram.com/p/demonew${i}/` });
    }
    return list;
  },
};

/** A sample "Download your information" export, for trying the people step without a real file. */
export function sampleDataDownload() {
  const followers = ['iris.novak', 'marcus.bell', 'priya.organizes', 'jordan_t', 'sunny.daze', 'bikeshop_dan', 'kayla.m', 'river.runs'];
  const following = ['iris.novak', 'marcus.bell', 'elena.park', 'jordan_t', 'eastside.mutualaid', 'bikeshop_dan', 'citycouncilwatch'];
  const wrap = (handles) => handles.map((h) => ({ string_list_data: [{ href: `https://www.instagram.com/${h}`, value: h, timestamp: 1700000000 }] }));
  return JSON.stringify({ followers_1: wrap(followers), following: { relationships_following: wrap(following) } });
}

// ─── Connection ────────────────────────────────────────────────────────────

export const getInstagram = (memberId) => getMember(memberId)?.instagram ?? null;

export const cleanHandle = (text) => String(text ?? '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '').toLowerCase();

export const isValidHandle = (handle) => /^[a-z0-9._]{1,30}$/.test(handle);

export function connectInstagram(memberId, { handle, feedModuleId, autoSync = true }) {
  const now = Date.now();
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    member.instagram = { handle, connectedAt: now, lastSyncAt: null, autoSync, feedModuleId, imported: {}, people: {}, dismissed: [], peopleImportedAt: null };
    // Let people who follow you there find you here (they can turn it off in Account).
    if (!member.instagramHandle) { member.instagramHandle = handle; member.instagramFindable = true; }
  }, 'account');
  return syncInstagram(memberId);
}

export function setInstagramOptions(memberId, changes) {
  changeState((state) => { Object.assign(state.members.find((m) => m.id === memberId).instagram, changes); }, 'account');
}

/** Copy posts we haven't copied yet into the chosen feed. Returns how many were added. */
export function syncInstagram(memberId, now = Date.now()) {
  const link = getInstagram(memberId);
  if (!link) return 0;
  const module = getModule(link.feedModuleId);
  if (!module || !getSpaceOfModule(module.id)) return 0;
  const fresh = demoServer.media(link.handle, link.connectedAt, now).filter((item) => !link.imported[item.id]);
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    const target = state.spaces.flatMap((s) => s.modules).find((m) => m.id === link.feedModuleId);
    target.data = { posts: [], events: [], ...target.data };
    target.data.posts = [...(target.data.posts ?? [])];
    for (const item of fresh) {
      const post = {
        id: makeId('post'), authorId: memberId, createdAt: item.timestamp, editedAt: null,
        text: item.caption ?? '', attachments: [],
        media: [{ id: makeId('media'), kind: item.media_type === 'VIDEO' ? 'video' : 'image', src: item.media_url, caption: '' }],
        source: { kind: 'instagram', id: item.id, permalink: item.permalink },
      };
      target.data.posts.push(post);
      member.instagram.imported[item.id] = post.id;
    }
    member.instagram.lastSyncAt = now;
  }, 'layout', 'account');
  return fresh.length;
}

export function disconnectInstagram(memberId, { removePosts = false } = {}) {
  const link = getInstagram(memberId);
  if (!link) return;
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    if (removePosts) {
      const ids = new Set(Object.values(link.imported));
      const target = state.spaces.flatMap((s) => s.modules).find((m) => m.id === link.feedModuleId);
      if (target?.data?.posts) target.data.posts = target.data.posts.filter((p) => !ids.has(p.id));
    }
    delete member.instagram;
  }, 'layout', 'account');
}

/** Sync whoever is due. Runs once now and then every minute. */
let timer = null;
export function startInstagramSync() {
  const tick = () => {
    const now = Date.now();
    for (const member of getState().members) {
      const link = member.instagram;
      if (link?.autoSync && (!link.lastSyncAt || now - link.lastSyncAt >= SYNC_EVERY_MS)) syncInstagram(member.id, now);
    }
  };
  tick();
  clearInterval(timer);
  timer = setInterval(tick, MINUTE);
}

// ─── People ────────────────────────────────────────────────────────────────

/** Usernames from an Instagram export (followers_1.json, following.json, or both together). */
export function parseDataDownload(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  const people = {};
  const add = (list, relation) => {
    for (const entry of list ?? []) {
      for (const item of entry.string_list_data ?? []) {
        const handle = cleanHandle(item.value || item.href);
        if (!isValidHandle(handle)) continue;
        people[handle] = people[handle] && people[handle] !== relation ? 'both' : relation;
      }
    }
  };
  // followers_1.json is a bare list; following.json wraps it.
  if (Array.isArray(data)) add(data, 'follower');
  add(data.followers_1 ?? data.followers, 'follower');
  add(data.relationships_following ?? data.following?.relationships_following ?? (Array.isArray(data.following) ? data.following : null), 'following');
  return Object.keys(people).length ? people : null;
}

export function importPeople(memberId, text) {
  const people = parseDataDownload(text);
  if (!people) return null;
  changeState((state) => {
    const link = state.members.find((m) => m.id === memberId).instagram;
    link.people = { ...link.people, ...people };
    link.peopleImportedAt = Date.now();
  }, 'account');
  return Object.keys(people).length;
}

/** Instagram people who are on 3den (and allow it), and not already friends or dismissed. */
export function instagramSuggestions(memberId) {
  const link = getInstagram(memberId);
  if (!link) return [];
  const byHandle = new Map(getState().members.filter((m) => m.instagramHandle && m.instagramFindable !== false && m.id !== memberId).map((m) => [m.instagramHandle, m]));
  return Object.entries(link.people)
    .filter(([handle]) => byHandle.has(handle) && !link.dismissed.includes(handle))
    .map(([handle, relation]) => ({ handle, relation, member: byHandle.get(handle) }))
    .filter(({ member }) => friendStatus(memberId, member.id) === 'none');
}

/** How many of the imported people aren't on 3den (yet). */
export function instagramWaiting(memberId) {
  const link = getInstagram(memberId);
  if (!link) return 0;
  const handles = new Set(getState().members.map((m) => m.instagramFindable !== false && m.instagramHandle).filter(Boolean));
  return Object.keys(link.people).filter((h) => !handles.has(h)).length;
}

export function dismissSuggestion(memberId, handle) {
  changeState((state) => {
    const link = state.members.find((m) => m.id === memberId).instagram;
    if (!link.dismissed.includes(handle)) link.dismissed.push(handle);
  }, 'account');
}

export const RELATION_LABEL = { follower: 'Follows you on Instagram', following: 'You follow them on Instagram', both: 'You follow each other on Instagram' };
