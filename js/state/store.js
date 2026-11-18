/**
 * store.js — the single source of truth for the app.
 *
 * ─── State shape ────────────────────────────────────────────────────────────
 *
 *   {
 *     version: 3,
 *     members: [{                                // every account (see accounts.js)
 *       id, name, username, email, initials, color, bio,
 *       password: { salt, hash } | null,         // demo accounts have none
 *       createdAt,
 *     }],
 *     currentUserId: 'm-leo' | null,             // null = signed out
 *     visits: { [memberId]: { [spaceId]: timestamp } },  // when each person last opened each space
 *     spaces: [
 *       {
 *         id: 'juniper',
 *         kind: 'group' | 'personal' | 'blog',     // a blog is public: anyone can view it
 *         name, description,
 *         visibility: 'public' | 'private',                       // groups: on Explore and in search? (group-access.js)
 *         joining: 'open' | 'request' | 'invite' | 'admins',      // groups: how people join
 *         memberIds: ['m-leo', …],      // a personal space has just its owner
 *         roles: { [memberId]: 'owner' | 'admin' | 'member' },   // groups (permissions.js)
 *         permissions: { [permissionId]: role },                  // groups, changed ones only
 *         appearance: { font, accent, background, cover, … },     // see js/groups/appearance.js
 *         tabs: [{ id: 'home', name: 'Home', visibility: 'public' }, { id, name }],   // optional; see "Tabs" below
 *                                    // visibility 'public' = anyone can see it (public groups only); missing = members only
 *         modules: [{ id, type, title, span, rows, data, tabId }]   // tabId: missing = 'home'
 *       }
 *     ],
 *     conversations: [ … ],                      // Messages; see messages.js
 *     notifications: [ … ],                      // the bell; see notifications.js
 *     friendships: [ … ],                        // friend requests and friends; see friends.js
 *   }
 *
 * You only see the spaces you're a member of: `getVisibleSpaces()`.
 *
 * A "space" is anything with a homepage of modules: each group, and every
 * account's own personal homepage. Both work exactly the same way; the only
 * differences are who's in them and how the header describes them.
 *
 * Module ids are unique across all spaces, so a module can be found (and
 * linked to) without knowing its space.
 *
 * Module size is set only in the editor, never by its content:
 *   span = width, in grid columns (3–12)
 *   rows = height, in grid rows (see ROW_HEIGHT_PX). Content that doesn't
 *          fit scrolls inside the module.
 * Modules saved before heights existed have no `rows`; `getRows()` falls
 * back to the module type's default.
 *
 * ─── The current space ──────────────────────────────────────────────────────
 *
 * The router (js/router.js) decides which space is showing and tells the
 * store with `setCurrentSpace()`, which also records the visit (used to
 * sort the Groups menu). Module actions (add, move, resize…) always act on
 * the current space.
 *
 * ─── Tabs ───────────────────────────────────────────────────────────────────
 *
 * A homepage can have tabs (e.g. "Home" with the forum, "Projects" with a
 * vault). Every space starts with just Home. Modules stay in one list,
 * `space.modules`, each saying which tab it's on (`tabId`), so everything
 * that looks through a space's modules (search, linked items, events…)
 * keeps working. The grid shows the current tab's modules; module actions
 * (add, move, nudge) work in the current tab's order. The current tab is
 * part of the URL: #space-hart--projects.
 *
 * ─── Events ─────────────────────────────────────────────────────────────────
 *
 * Other files call `subscribe(event, listener)` to react to changes:
 *
 *   'layout' — modules were added, removed, moved, resized, or renamed
 *   'mode'   — edit mode was switched on or off
 *   'space'  — the current space changed, or its name, members or look did
 *   'account'— someone signed in or out, or changed their profile
 *   'messages'— a conversation or message changed (see messages.js)
 *   'notifications' — someone got a notification, or read one (notifications.js)
 *
 * Bigger groups of actions live in their own files and change the state
 * through `changeState()`: accounts.js (sign up, sign in, profile),
 * groups.js (members, roles, permissions, appearance) and messages.js.
 *
 * Module data changes (typing in a note, checking a task) are saved but do
 * NOT fire 'layout'. That keeps the grid from re-rendering while someone is
 * typing, which would steal their cursor.
 */

import { loadState, readSavedState, saveState, clearSavedState } from './storage.js';
import { DATA_VERSION, upgradeState, stampFresh } from './upgrade.js';
import { layoutById, defaultFeatured } from '../editor/page-layouts.js';
import { createDemoState } from '../data/demo-state.js';
import { getModuleType } from '../modules/registry.js';
import { makeId } from '../ui/dom.js';
import { can, setViewingAsMember, viewingAsMemberIn } from './permissions.js';
import { isPublicGroup } from './group-access.js';

export const GRID_COLUMNS = 12;
export const MIN_SPAN = 3;
export const MAX_SPAN = GRID_COLUMNS;

/**
 * Height of one grid row in pixels. Must match --grid-row-height in
 * css/tokens.css. With the 16px gap, each extra row adds 40px.
 */
export const ROW_HEIGHT_PX = 24;
export const MIN_ROWS = 5;
export const MAX_ROWS = 40;

/** Every homepage's first tab. Modules with no `tabId` are on it. */
export const HOME_TAB_ID = 'home';
const DEFAULT_TABS = [{ id: HOME_TAB_ID, name: 'Home' }];

// ─── Internal state ──────────────────────────────────────────────────────────

// Your saved state, brought up to date if the prototype changed since (js/state/upgrade.js: new sample
// content is added around what you made, nothing is thrown away); or the sample data, the first time.
const startup = (() => {
  const saved = loadState();
  if (!saved) return { state: stampFresh(createDemoState()), upgraded: false, added: 0 };
  try {
    return upgradeState(saved, createDemoState);
  } catch (error) {
    console.warn('[3den] Could not bring the saved state up to date; using it as it is:', error);
    return { state: saved, upgraded: false, added: 0 };
  }
})();
let state = startup.state;
/** Did this load bring an older save up to date? { added } new sample things. Read by main.js for a note. */
export const upgradeOnLoad = startup.upgraded ? { added: startup.added } : null;

// ─── Live between windows ────────────────────────────────────────────────────
//
// Until there's a server, "live" means: every window of this browser that
// has 3den open sees the others' changes as they're saved. A save in one
// window tells the rest (a BroadcastChannel); they load it and redraw, but
// not while you're in the middle of typing something (then as soon as you
// stop). Two people can be tried side by side: sign in as someone else in
// a second window and each window keeps its own person (remembered in that
// window's sessionStorage) while sharing everything else.
//
// What merges: whole modules. If two windows change the same module at the
// same moment, the later save wins. A real backend would merge finer than
// that (see README, "Live between windows").

const liveChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('3den-live') : null;
const TAB_USER_KEY = '3den.tab-user';

/** This window's own signed-in person, if it differs from the shared save. undefined = not pinned. */
function pinnedUser() {
  try {
    const raw = window.sessionStorage.getItem(TAB_USER_KEY);
    return raw == null ? undefined : JSON.parse(raw);
  } catch { return undefined; }
}
function pinUser(memberId) {
  try { window.sessionStorage.setItem(TAB_USER_KEY, JSON.stringify(memberId)); } catch { /* private mode: not remembered across a reload */ }
}
{
  const pinned = pinnedUser();
  if (pinned !== undefined && (pinned === null || state.members.some((m) => m.id === pinned))) state.currentUserId = pinned;
}

const isTyping = () => {
  const el = document.activeElement;
  return Boolean(el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)));
};

/** The last save this window made or took, without who's signed in: only real changes are announced. */
let lastSaved = '';
const withoutUser = (json) => json.replace(/"currentUserId":("[^"]*"|null)/, '"currentUserId":0');

let liveTimer = null;
let applyingRemote = false;
async function takeRemoteSave() {
  const loaded = await readSavedState();
  if (!loaded || isGuestBrowsing()) return;
  // A window still on an older version saved: ignore it (this window's newer save wins on its next change).
  if (loaded.dataVersion !== DATA_VERSION) return;
  const incoming = withoutUser(JSON.stringify(loaded));
  if (incoming === lastSaved) return;
  lastSaved = incoming;
  // Keep this window's own person.
  if (loaded.currentUserId !== state.currentUserId) {
    pinUser(state.currentUserId);
    loaded.currentUserId = state.currentUserId;
    liveChannel?.postMessage({ type: 'pin' }); // the other windows remember their own person too
  }
  state = loaded;
  clearInterval(liveTimer);
  const redraw = () => {
    if (isTyping()) return false;
    clearInterval(liveTimer);
    // Redrawing saves small things of its own (a visit, a read mark); those aren't news for the other windows.
    applyingRemote = true;
    try { for (const event of ['account', 'space', 'layout', 'messages', 'notifications']) emit(event); } finally { applyingRemote = false; }
    return true;
  };
  if (!redraw()) liveTimer = setInterval(redraw, 600);
}

let liveDebounce = null;
liveChannel?.addEventListener('message', (event) => {
  if (event.data?.type === 'pin') { pinUser(state.currentUserId); return; }
  if (event.data?.type !== 'saved') return;
  clearTimeout(liveDebounce);
  liveDebounce = setTimeout(takeRemoteSave, 120);
});

/** UI-only state. Not saved: the page always opens in view mode. */
const ui = {
  editMode: false,
  spaceId: null, // Set by main.js from the URL on startup.
  tabId: HOME_TAB_ID, // The tab showing on the current space's homepage.
  guest: false, // Signed out, but looking at something public (see "Guests" below).
};

// ─── Guests ──────────────────────────────────────────────────────────────────
//
// Someone who isn't signed in can still open a public link: a public event,
// a group's public tabs, a blog, an invite link (main.js decides which). While
// they look, getCurrentUser() returns this stand-in, who is in no group and
// has no friends, so everything shows read-only. Anything that would save
// (RSVP, Join, Add friend, Like) asks them to sign up first: see
// js/onboarding/guest.js. Nothing a guest does is saved.

export const GUEST_ID = 'm-guest';
const GUEST = Object.freeze({
  id: GUEST_ID, name: 'Guest', username: 'guest', initials: '?', color: '#72777d', bio: '', isGuest: true,
});

/** Start or stop guest browsing (main.js, from the URL). */
export function setGuestBrowsing(isGuest) {
  if (ui.guest === Boolean(isGuest)) return;
  ui.guest = Boolean(isGuest);
  emit('account');
}

/** True while a signed-out person looks at something public (or you "view as a stranger"). */
export function isGuestBrowsing() {
  return (ui.guest && !state.currentUserId) || Boolean(ui.stranger);
}

/**
 * "View as a stranger" (js/account/privacy-checkup.js): while on, this
 * window shows 3den as someone signed out would see it, and saves nothing.
 */
export function setStrangerView(on) {
  if (Boolean(ui.stranger) === Boolean(on)) return;
  ui.stranger = Boolean(on);
  emit('account');
}
export const isStrangerView = () => Boolean(ui.stranger);

// 'person': small changes to someone's own settings that don't change what's on the page (reminders, who they follow).
// Unlike 'account', nothing redraws the whole app for it, so answering an RSVP (which sets a reminder and may follow
// the host) doesn't move the view or close what's open.
const listeners = { layout: new Set(), mode: new Set(), space: new Set(), account: new Set(), person: new Set(), messages: new Set(), notifications: new Set() };

/** Called after any module's data is saved: (module, dataBefore, dataAfter). See onModuleDataChange(). */
const dataListeners = new Set();

function emit(event) {
  for (const listener of listeners[event]) listener(state, ui);
}

function persist() {
  if (isGuestBrowsing()) return; // nothing a guest does is saved
  // Tell other windows once it's written (storage.js writes in the background), but only when
  // something other than who's signed in changed.
  let announce = false;
  const saved = withoutUser(saveState(state, () => { if (announce) liveChannel?.postMessage({ type: 'saved' }); }));
  announce = saved !== lastSaved && !applyingRemote;
  if (pinnedUser() !== undefined) pinUser(state.currentUserId);
  lastSaved = saved;
}

// A save brought up to date on this load: write it back now, so the next load needn't do it again.
if (startup.upgraded) setTimeout(persist, 0);

/**
 * For accounts.js and groups.js: change the state, save it, then announce
 * the given events. `changeFn(state)` edits the state in place.
 *
 *   changeState((s) => { s.currentUserId = null; }, 'account', 'space');
 */
export function changeState(changeFn, ...events) {
  changeFn(state);
  persist();
  for (const event of events) emit(event);
}

/** For accounts.js: forget which space is showing (after signing in or out). */
export function resetCurrentSpace() {
  ui.spaceId = null;
  ui.editMode = false;
  ui.guest = false;
}

const tabOf = (module) => module.tabId ?? HOME_TAB_ID;

/** The modules on the tab being shown, in order. (A filtered copy: change space.modules.) */
function currentModules() {
  const space = getCurrentSpace();
  return space ? space.modules.filter((m) => tabOf(m) === getCurrentTabId()) : [];
}

/** A module's position on the current tab. */
function findIndex(moduleId) {
  return currentModules().findIndex((module) => module.id === moduleId);
}

/**
 * Put `module` into the space's full list so it lands at `tabIndex` among
 * the current tab's modules (other tabs' modules keep their places).
 */
function insertAtTabIndex(module, tabIndex) {
  const all = getCurrentSpace().modules;
  const tabModules = currentModules();
  const before = tabModules[tabIndex];
  if (before) all.splice(all.indexOf(before), 0, module);
  else if (tabModules.length) all.splice(all.indexOf(tabModules[tabModules.length - 1]) + 1, 0, module);
  else all.push(module);
}

function clampSpan(span) {
  return Math.min(MAX_SPAN, Math.max(MIN_SPAN, Math.round(span)));
}

function clampRows(rows) {
  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.round(rows)));
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export function getState() {
  return state;
}

export function isEditMode() {
  return ui.editMode;
}

/** Every space, including ones the current user isn't in. Most code wants getVisibleSpaces(). */
export function getSpaces() {
  return state.spaces;
}

/** The spaces the current user is a member of: their groups, their own homepage and their blog. */
export function getVisibleSpaces() {
  return state.spaces.filter((space) => space.memberIds.includes(state.currentUserId));
}

/**
 * Can the current user open this space? Their own spaces, anyone's blog
 * (unless its owner turned blogs off in their account settings), and a
 * group they're not in if it has at least one public tab: then they see
 * just those tabs, as a visitor.
 */
export function canViewSpace(space) {
  if (!space) return false;
  if (space.kind === 'blog') return !getMember(space.memberIds[0])?.socialOff;
  if (space.memberIds.includes(state.currentUserId)) return true;
  return space.kind === 'group' && publicTabsOf(space).length > 0;
}

/** Is the current user looking at a group from outside (its public tabs only)? */
export function isVisitingGroup(space) {
  return space?.kind === 'group' && !space.memberIds.includes(state.currentUserId);
}

/** A group's tabs that anyone can see: tab.visibility === 'public', and only in a public group. */
export function publicTabsOf(space) {
  if (space?.kind === 'group' && !isPublicGroup(space)) return []; // a private group shows nothing to outsiders
  return (space?.tabs?.length ? space.tabs : DEFAULT_TABS).filter((tab) => tab.visibility === 'public');
}

/** Can the current user open this module (and its full page)? */
export function canViewModule(moduleId) {
  const space = getSpaceOfModule(moduleId);
  if (!canViewSpace(space)) return false;
  if (!isVisitingGroup(space)) return true;
  const module = space.modules.find((m) => m.id === moduleId);
  return publicTabsOf(space).some((tab) => tab.id === (module.tabId ?? HOME_TAB_ID));
}

export function getSpace(spaceId) {
  return state.spaces.find((space) => space.id === spaceId) ?? null;
}

/**
 * The tabs of a space (always at least Home). Someone visiting a group
 * they're not in only gets its public tabs.
 */
export function getTabs(space = getCurrentSpace()) {
  const tabs = space?.tabs?.length ? space.tabs : DEFAULT_TABS;
  return isVisitingGroup(space) ? publicTabsOf(space) : tabs;
}

/** The tab showing on the current homepage (the first tab if the remembered one is gone). */
export function getCurrentTabId() {
  const tabs = getTabs();
  return tabs.some((t) => t.id === ui.tabId) ? ui.tabId : (tabs[0]?.id ?? HOME_TAB_ID);
}

/** The current tab's modules, for the grid. */
export function getVisibleModules() {
  return currentModules();
}

export function getCurrentSpace() {
  const chosen = getSpace(ui.spaceId);
  if (canViewSpace(chosen)) return chosen;
  return getGroupsByRecentVisit()[0] ?? getPersonalSpace() ?? getVisibleSpaces()[0] ?? null;
}

/** Your groups, the one you opened most recently first. */
export function getGroupsByRecentVisit() {
  const lastVisit = (space) => getLastVisit(space.id) ?? 0;
  return getVisibleSpaces()
    .filter((space) => space.kind === 'group')
    .sort((a, b) => lastVisit(b) - lastVisit(a));
}

/** @type {Map<string, number | null>} when you'd opened each space before this visit (not saved) */
const visitBefore = new Map();

/** When you opened this space before the current visit (falls back to the last saved visit). */
export function getVisitBefore(spaceId) {
  return visitBefore.has(spaceId) ? visitBefore.get(spaceId) : getLastVisit(spaceId);
}

/** When the current user last opened a space (ms timestamp), or null if never. */
export function getLastVisit(spaceId) {
  return state.visits?.[state.currentUserId]?.[spaceId] ?? null;
}

/** The current user's own homepage. */
export function getPersonalSpace() {
  return state.spaces.find((space) => space.kind === 'personal' && space.memberIds[0] === state.currentUserId) ?? null;
}

/** Someone's blog (anyone can view it), or null. */
export function getBlogOf(memberId) {
  return state.spaces.find((space) => space.kind === 'blog' && space.memberIds[0] === memberId) ?? null;
}

/** The space a module belongs to, or null. */
export function getSpaceOfModule(moduleId) {
  return state.spaces.find((space) => space.modules.some((m) => m.id === moduleId)) ?? null;
}

/** Find a module in any space. */
export function getModule(moduleId) {
  for (const space of state.spaces) {
    const module = space.modules.find((m) => m.id === moduleId);
    if (module) return module;
  }
  return null;
}

/** A module's height in grid rows (older saved modules use the type's default). */
export function getRows(module) {
  return module.rows ?? getModuleType(module.type).defaultRows;
}

/** The signed-in account, or null when signed out. */
export function getCurrentUser() {
  if (ui.stranger) return GUEST;
  if (!state.currentUserId) return ui.guest ? GUEST : null;
  return getMember(state.currentUserId);
}

export function getMember(memberId) {
  if (memberId === GUEST_ID) return GUEST;
  return state.members.find((member) => member.id === memberId) ?? null;
}

/** The members of a space, in the order they're listed. */
export function getSpaceMembers(space) {
  return space.memberIds.map(getMember).filter(Boolean);
}

// ─── Subscribing ─────────────────────────────────────────────────────────────

/** Listen for an event. Returns a function that stops listening. */
export function subscribe(event, listener) {
  if (!listeners[event]) throw new Error(`Unknown store event: "${event}"`);
  listeners[event].add(listener);
  return () => listeners[event].delete(listener);
}

// ─── Actions: mode and spaces ────────────────────────────────────────────────

export function setEditMode(isOn) {
  // Only people allowed to edit this homepage can switch edit mode on.
  if (isOn && !can(getCurrentSpace(), state.currentUserId, 'editHomepage')) return;
  ui.editMode = Boolean(isOn);
  emit('mode');
}

/**
 * See the current group the way a plain member does (true), or go back to
 * your own view (false). Turning it on leaves edit mode; turning it off
 * returns to edit mode if you came from there.
 */
export function setMemberView(isOn, { backToEditing = false } = {}) {
  const space = getCurrentSpace();
  if (isOn && space?.kind !== 'group') return;
  setViewingAsMember(isOn ? space.id : null);
  ui.editMode = false;
  emit('mode');
  emit('space');
  emit('layout');
  if (!isOn && backToEditing) setEditMode(true);
}

export function isMemberView() {
  return viewingAsMemberIn() !== null && viewingAsMemberIn() === ui.spaceId;
}

/** Show a different space and record the visit. Called via main.js. Leaves edit mode. */
export function setCurrentSpace(spaceId) {
  const space = getSpace(spaceId);
  if (spaceId === ui.spaceId || !canViewSpace(space)) return;
  ui.spaceId = spaceId;
  ui.editMode = false;
  setViewingAsMember(null);
  ui.tabId = HOME_TAB_ID;
  const userId = state.currentUserId;
  // Keep the visit before this one, for "Since Tuesday: …" (js/modules/upnext/).
  visitBefore.set(spaceId, state.visits?.[userId]?.[spaceId] ?? null);
  if (userId) state.visits = { ...state.visits, [userId]: { ...state.visits?.[userId], [spaceId]: Date.now() } };
  persist();
  emit('space');
  emit('mode');
  emit('layout');
}

export function renameCurrentSpace(name) {
  const space = getCurrentSpace();
  const fallback = { personal: 'My homepage', blog: `${getCurrentUser()?.name ?? 'My'} blog` }[space.kind] ?? 'Untitled group';
  space.name = name.trim() || fallback;
  persist();
  emit('space');
}

// ─── Actions: modules (in the current space) ─────────────────────────────────

/**
 * Add a new module of `type` at position `index` (defaults to the end).
 * `overrides` can set its title and data (e.g. a Vault file module pointing
 * at a file). Returns the new module.
 */
export function addModule(type, index = currentModules().length, overrides = {}) {
  const moduleType = getModuleType(type);
  const module = {
    id: makeId('mod'),
    type,
    title: moduleType.label,
    span: moduleType.defaultSpan,
    rows: moduleType.defaultRows,
    data: moduleType.createInitialData(state),
    ...overrides,
  };
  // New modules go on the tab being shown (Home needs no tabId).
  if (getCurrentTabId() !== HOME_TAB_ID) module.tabId = getCurrentTabId();
  insertAtTabIndex(module, index);
  persist();
  emit('layout');
  return module;
}

// ─── Page layouts ────────────────────────────────────────────────────────────
//
// Each tab of a space can have its own layout (space.pageLayouts[tabId]):
// { kind, featuredId }. No entry means the 12-column grid. The layouts and
// how modules fill them: js/editor/page-layouts.js; drawn by grid.js.

/**
 * The current tab's layout: { kind, featuredId, featuredRows } ('grid' when none is set).
 * featuredRows: the featured module's height in rows when someone set it with
 * its resize handle (Spotlight and Main and sidebar); null means it fits its content.
 */
export function getPageLayout(space = getCurrentSpace(), tabId = getCurrentTabId()) {
  const saved = space?.pageLayouts?.[tabId];
  if (!saved || layoutById(saved.kind).id !== saved.kind || saved.kind === 'grid') return { kind: 'grid', featuredId: null, featuredRows: null };
  const modules = space.modules.filter((m) => tabOf(m) === tabId);
  const featuredId = modules.some((m) => m.id === saved.featuredId) ? saved.featuredId : defaultFeatured(modules);
  return { kind: saved.kind, featuredId, featuredRows: featuredId === saved.featuredId ? saved.featuredRows ?? null : null };
}

/** Lay the current tab out another way ('grid', 'spotlight', 'sidebar'…). */
export function setPageLayout(kind) {
  const space = getCurrentSpace();
  const tabId = getCurrentTabId();
  if (!space) return;
  const current = space.pageLayouts?.[tabId];
  if (kind === 'grid') { if (space.pageLayouts) delete space.pageLayouts[tabId]; }
  else space.pageLayouts = { ...(space.pageLayouts ?? {}), [tabId]: { kind, featuredId: current?.featuredId ?? defaultFeatured(currentModules()), featuredRows: current?.featuredRows ?? null } };
  persist();
  emit('layout');
}

/** Choose the featured module (the spotlight, the main column, the one across the top). */
export function setFeaturedModule(moduleId) {
  const space = getCurrentSpace();
  const tabId = getCurrentTabId();
  const layout = getPageLayout(space, tabId);
  if (layout.kind === 'grid' || !space) return;
  const incoming = space.modules.find((m) => m.id === moduleId);
  const outgoing = space.modules.find((m) => m.id === layout.featuredId);
  if (outgoing && incoming && outgoing !== incoming && incoming.slot) outgoing.slot = incoming.slot; // they trade places
  space.pageLayouts[tabId] = { kind: layout.kind, featuredId: moduleId, featuredRows: moduleId === layout.featuredId ? layout.featuredRows : null };
  persist();
  emit('layout');
}

/** The featured module's height (rows), set with its resize handle; null to fit its content again. */
export function setFeaturedRows(rows) {
  const space = getCurrentSpace();
  const tabId = getCurrentTabId();
  const layout = getPageLayout(space, tabId);
  if (layout.kind === 'grid' || !space) return;
  const value = rows == null ? null : Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.round(rows)));
  space.pageLayouts[tabId] = { kind: layout.kind, featuredId: layout.featuredId, featuredRows: value };
  persist();
  emit('layout');
}

/**
 * Move a module within a layout: into column `slot` (saved as module.slot,
 * or null to keep it), before the module `beforeId`, or after `afterId`
 * (the end of a column), or at the end of the tab.
 */
export function placeModule(moduleId, { slot = null, beforeId = null, afterId = null } = {}) {
  const space = getCurrentSpace();
  const tabId = getCurrentTabId();
  const module = space?.modules.find((m) => m.id === moduleId);
  if (!module || moduleId === beforeId || moduleId === afterId) return;
  const layout = getPageLayout(space, tabId);
  if (layout.featuredId === moduleId && layout.kind !== 'grid') {
    // Taking the featured module out: the next best one takes its place.
    const others = currentModules().filter((m) => m.id !== moduleId);
    space.pageLayouts[tabId] = { kind: layout.kind, featuredId: defaultFeatured(others) };
  }
  if (slot) module.slot = slot;
  const all = space.modules;
  all.splice(all.indexOf(module), 1);
  const before = beforeId ? all.find((m) => m.id === beforeId) : null;
  const after = afterId ? all.find((m) => m.id === afterId) : null;
  if (before) all.splice(all.indexOf(before), 0, module);
  else if (after) all.splice(all.indexOf(after) + 1, 0, module);
  else insertAtTabIndex(module, currentModules().length);
  persist();
  emit('layout');
}

// ─── The order modules show in on phones ──────────────────────────────────────
//
// On a phone a page is one stack. By default it follows the page's own order
// (the featured module first in a layout); people who edit the page can set
// it with the small phone numbers on each module (module-frame.js), saved
// per tab: space.mobileOrders[tabId] = [moduleId, …]. Modules not in the
// list (added later) go at the end in their usual order.

/** The current tab's modules in phone order. `natural` = the order they'd have without a set order. */
export function phoneOrdered(natural, space = getCurrentSpace(), tabId = getCurrentTabId()) {
  const saved = space?.mobileOrders?.[tabId];
  if (!saved?.length) return natural;
  const rank = new Map(saved.map((id, i) => [id, i]));
  const placed = natural.filter((m) => rank.has(m.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  return [...placed, ...natural.filter((m) => !rank.has(m.id))];
}

/** The modules in their natural phone order: the featured one first in a layout, else the page's order. */
export function naturalPhoneOrder(modules = getVisibleModules()) {
  const layout = getPageLayout();
  if (layout.kind === 'grid') return modules;
  const featured = modules.find((m) => m.id === layout.featuredId);
  return [featured, ...modules.filter((m) => m !== featured)].filter(Boolean);
}

/** Put a module at `position` (1 = first) in the phone order of the current tab. */
export function setPhonePosition(moduleId, position) {
  const space = getCurrentSpace();
  const tabId = getCurrentTabId();
  if (!space) return;
  const order = phoneOrdered(naturalPhoneOrder()).map((m) => m.id).filter((id) => id !== moduleId);
  order.splice(Math.max(0, Math.min(order.length, position - 1)), 0, moduleId);
  space.mobileOrders = { ...(space.mobileOrders ?? {}), [tabId]: order };
  persist();
  emit('layout');
}

/** Back to the page's own order on phones (and, in a group, the widgets' own sizes). */
export function resetPhoneOrder() {
  const space = getCurrentSpace();
  if (!space?.mobileOrders && !space?.mobileWidgets) return;
  if (space.mobileOrders) delete space.mobileOrders[getCurrentTabId()];
  if (space.mobileWidgets) delete space.mobileWidgets[getCurrentTabId()];
  persist();
  emit('layout');
}

// ─── Widgets: a group's first screen on phones ──────────────────────────────
//
// On a phone a group opens on a grid of widgets, one per module, in the phone
// order above (js/editor/mobile-widgets.js). Each widget is 'small' (half
// the width) or 'wide' (the whole width), saved per tab:
// space.mobileWidgets[tabId] = { [moduleId]: 'small' | 'wide' }.

/** Modules whose widget starts wide: what's going on, lists, and streams. */
const WIDE_WIDGETS = new Set(['upnext', 'dashboard', 'generalfeed', 'textfeed', 'carousel', 'grocery', 'forum', 'events', 'kanban', 'gantt', 'budget']);

/** A module's widget size on the current tab: what was set, else its kind's default. */
export function widgetSize(module, space = getCurrentSpace(), tabId = getCurrentTabId()) {
  return space?.mobileWidgets?.[tabId]?.[module.id] ?? (WIDE_WIDGETS.has(module.type) ? 'wide' : 'small');
}

/** Set a module's widget size on the current tab. */
export function setWidgetSize(moduleId, size) {
  const space = getCurrentSpace();
  const tabId = getCurrentTabId();
  if (!space) return;
  space.mobileWidgets = { ...(space.mobileWidgets ?? {}), [tabId]: { ...(space.mobileWidgets?.[tabId] ?? {}), [moduleId]: size } };
  persist();
  emit('layout');
}

/** Set the whole phone order of the current tab at once (the widget editor's drag). */
export function setPhoneOrder(moduleIds) {
  const space = getCurrentSpace();
  if (!space) return;
  space.mobileOrders = { ...(space.mobileOrders ?? {}), [getCurrentTabId()]: [...moduleIds] };
  persist();
  emit('layout');
}

/** Has the current tab a phone order of its own? */
export const hasPhoneOrder = (space = getCurrentSpace(), tabId = getCurrentTabId()) => Boolean(space?.mobileOrders?.[tabId]?.length || Object.keys(space?.mobileWidgets?.[tabId] ?? {}).length);

/** Move a module to a new position on the current tab. */
export function moveModule(moduleId, toIndex) {
  const fromIndex = findIndex(moduleId);
  if (fromIndex === -1) return;

  const all = getCurrentSpace().modules;
  const module = all.find((m) => m.id === moduleId);
  all.splice(all.indexOf(module), 1);
  // Removing the module shifts everything after it back by one.
  const adjustedIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
  insertAtTabIndex(module, adjustedIndex);

  persist();
  emit('layout');
}

/** Move a module one step earlier (-1) or later (+1). Used by the arrow buttons. */
export function nudgeModule(moduleId, direction) {
  const index = findIndex(moduleId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= currentModules().length) return;
  moveModule(moduleId, direction > 0 ? target + 1 : target);
}

/**
 * Change a module's size. Pass either or both:
 *   resizeModule(id, { span: 8 })            // width in columns
 *   resizeModule(id, { rows: 12 })           // height in rows
 */
export function resizeModule(moduleId, { span, rows }) {
  const module = getModule(moduleId);
  if (!module) return;
  if (span !== undefined) module.span = clampSpan(span);
  if (rows !== undefined) module.rows = clampRows(rows);
  persist();
  emit('layout');
}

export function renameModule(moduleId, title) {
  const module = getModule(moduleId);
  if (!module) return;
  module.title = title.trim() || getModuleType(module.type).label;
  persist();
  // No 'layout' event: the title input already shows the new name.
}

/**
 * Remove a module. Returns what's needed to undo the removal:
 *   const removed = removeModule(id);
 *   restoreModule(removed);
 */
export function removeModule(moduleId) {
  const all = getCurrentSpace().modules;
  const index = all.findIndex((m) => m.id === moduleId);
  if (index === -1) return null;
  const [module] = all.splice(index, 1);
  persist();
  emit('layout');
  return { module, index, spaceId: ui.spaceId };
}

export function restoreModule({ module, index, spaceId }) {
  const space = getSpace(spaceId) ?? getCurrentSpace();
  space.modules.splice(index, 0, module);
  persist();
  emit('layout');
}

/**
 * Replace a module's data. Called by module files when their content changes.
 * Saves, but does not re-render the grid (see "Events" at the top).
 */
export function updateModuleData(moduleId, data) {
  const module = getModule(moduleId);
  if (!module) return;
  const before = module.data;
  module.data = data;
  persist();
  for (const listener of dataListeners) listener(module, before, data);
}

/**
 * Run `listener(module, dataBefore, dataAfter)` whenever module data is
 * saved. Used by notifications.js to notice when someone is assigned to
 * something. Returns a function that stops listening.
 */
export function onModuleDataChange(listener) {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}

// ─── Actions: tabs (in the current space) ────────────────────────────────────

/** Show a tab. Called by main.js from the URL (#space-hart--projects). */
export function setCurrentTab(tabId) {
  const next = getTabs().some((t) => t.id === tabId) ? tabId : (getTabs()[0]?.id ?? HOME_TAB_ID);
  if (next === ui.tabId) return;
  ui.tabId = next;
  emit('space');
  emit('layout');
}

/** Add a tab after the others and return it. */
export function addTab(name) {
  const space = getCurrentSpace();
  const tab = { id: makeId('tab'), name: name.trim() || 'New tab' };
  space.tabs = [...getTabs(space), tab];
  persist();
  emit('space');
  return tab;
}

export function renameTab(tabId, name) {
  const space = getCurrentSpace();
  space.tabs = getTabs(space).map((t) => (t.id === tabId ? { ...t, name: name.trim() || t.name } : t));
  persist();
  emit('space');
}

/** Make a tab public (anyone with the link can see it) or members-only. */
export function setTabVisibility(tabId, visibility) {
  const space = getCurrentSpace();
  space.tabs = getTabs(space).map((t) => {
    if (t.id !== tabId) return t;
    const { visibility: _old, ...rest } = t;
    return visibility === 'public' ? { ...rest, visibility: 'public' } : rest;
  });
  persist();
  emit('space');
}

/** Move a tab one step left (-1) or right (+1). Home always stays first. */
export function moveTab(tabId, direction) {
  const space = getCurrentSpace();
  const tabs = [...getTabs(space)];
  const index = tabs.findIndex((t) => t.id === tabId);
  const target = index + direction;
  if (index < 1 || target < 1 || target >= tabs.length) return;
  [tabs[index], tabs[target]] = [tabs[target], tabs[index]];
  space.tabs = tabs;
  persist();
  emit('space');
}

/**
 * Remove a tab. Its modules move to the Home tab, so nothing is lost.
 * Returns what restoreTab() needs to undo it.
 */
export function removeTab(tabId) {
  const space = getCurrentSpace();
  if (tabId === HOME_TAB_ID) return null;
  const tabs = getTabs(space);
  const removed = { tab: tabs.find((t) => t.id === tabId), index: tabs.findIndex((t) => t.id === tabId), moduleIds: space.modules.filter((m) => m.tabId === tabId).map((m) => m.id), spaceId: space.id };
  space.tabs = tabs.filter((t) => t.id !== tabId);
  for (const module of space.modules) if (module.tabId === tabId) delete module.tabId;
  if (ui.tabId === tabId) ui.tabId = HOME_TAB_ID;
  persist();
  emit('space');
  emit('layout');
  return removed;
}

export function restoreTab({ tab, index, moduleIds, spaceId }) {
  const space = getSpace(spaceId);
  if (!space) return;
  const tabs = [...getTabs(space)];
  tabs.splice(index, 0, tab);
  space.tabs = tabs;
  for (const module of space.modules) if (moduleIds.includes(module.id)) module.tabId = tab.id;
  persist();
  emit('space');
  emit('layout');
}

/** Move a module to another tab (it goes to the end of that tab). */
export function moveModuleToTab(moduleId, tabId) {
  const space = getCurrentSpace();
  const module = space.modules.find((m) => m.id === moduleId);
  if (!module) return;
  space.modules.splice(space.modules.indexOf(module), 1);
  if (tabId === HOME_TAB_ID) delete module.tabId;
  else module.tabId = tabId;
  space.modules.push(module);
  persist();
  emit('layout');
}

// ─── Actions: demo ───────────────────────────────────────────────────────────

/** Throw away all changes and go back to the demo data. */
export function resetToDemo() {
  clearSavedState();
  state = stampFresh(createDemoState());
  if (!getVisibleSpaces().some((space) => space.id === ui.spaceId)) ui.spaceId = null;
  persist();
  emit('account');
  emit('space');
  emit('layout');
}
