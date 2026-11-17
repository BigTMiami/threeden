// @ts-check
/**
 * recents.js — what you've opened lately, for the Recents module.
 *
 * Every time the page changes (js/main.js), the thing you opened is noted:
 * a homepage or group, a module's full page, an event, a blog, or a
 * conversation. Each person keeps their own list, newest first, one entry
 * per thing, up to MAX_RECENTS.
 *
 *   recordRoute(route)            → note what this route opens (signed in only)
 *   getRecents(memberId, kind?)   → [{ kind, id, at, title, detail, href, space?, member? }]
 *                                   things you can no longer open are left out
 *   clearRecents(memberId)        → returns the old list (for Undo)
 *   restoreRecents(memberId, list)
 *
 * Saved as state.recents = { [memberId]: [{ kind, id, at }] }. Saving emits
 * no event, so opening a page doesn't redraw anything.
 */

import {
  changeState, getState, getCurrentUser, getSpace, getSpaceOfModule, canViewSpace, canViewModule, getMember,
} from './store.js';
import { getAccounts } from './accounts.js';
import { findEvent, canViewEvent } from './events.js';
import { getConversationsFor, conversationTitle } from './messages.js';
import { getModuleType } from '../modules/registry.js';
import { whenLabel } from '../events/event-details.js';
import { spaceHref, blogHref } from '../router.js';

export const MAX_RECENTS = 60;

export const RECENT_KINDS = [
  { id: 'all', label: 'All' },
  { id: 'space', label: 'Groups & homepages' },
  { id: 'module', label: 'Pages' },
  { id: 'event', label: 'Events' },
  { id: 'blog', label: 'Blogs' },
  { id: 'conversation', label: 'Messages' },
];

/** Which thing a route opens: { kind, id } or null. */
function entryFor(route) {
  if (route.page === 'module' && route.moduleId) return { kind: 'module', id: route.moduleId };
  if (route.page === 'event' && route.eventId) return { kind: 'event', id: route.eventId };
  if (route.page === 'messages' && route.conversationId && route.conversationId !== 'new') return { kind: 'conversation', id: route.conversationId };
  if (route.page === 'home' && route.blogUsername) return { kind: 'blog', id: route.blogUsername };
  if (route.page === 'home' && route.spaceId) return { kind: 'space', id: route.spaceId };
  return null;
}

export function recordRoute(route) {
  const me = getCurrentUser();
  if (!me || me.isGuest) return;
  const entry = entryFor(route);
  if (!entry) return;
  const { id } = entry;
  changeState((state) => {
    const list = (state.recents?.[me.id] ?? []).filter((e) => !(e.kind === entry.kind && e.id === id));
    state.recents = { ...state.recents, [me.id]: [{ kind: entry.kind, id, at: Date.now() }, ...list].slice(0, MAX_RECENTS) };
  });
}

/** The list with titles and links, skipping things that are gone or you can't open now. */
export function getRecents(memberId, kind = 'all') {
  const raw = getState().recents?.[memberId] ?? [];
  return raw
    .filter((e) => kind === 'all' || e.kind === kind)
    .map((e) => describe(e, memberId))
    .filter(Boolean);
}

function describe(entry, memberId) {
  const { kind, id, at } = entry;
  if (kind === 'space') {
    const space = getSpace(id);
    if (!space || !canViewSpace(space)) return null;
    const detail = { personal: 'Your homepage', blog: 'Blog' }[space.kind] ?? (space.groupType || 'Group');
    return { kind, id, at, space, title: space.kind === 'personal' ? 'My homepage' : space.name, detail, href: spaceHref(space.id) };
  }
  if (kind === 'module') {
    const space = getSpaceOfModule(id);
    const module = space?.modules.find((m) => m.id === id);
    if (!module || !canViewModule(id)) return null;
    let typeLabel = module.type;
    try { typeLabel = getModuleType(module.type).label; } catch { /* an old module type */ }
    const where = space.kind === 'personal' ? 'your homepage' : space.name;
    return { kind, id, at, space, moduleType: module.type, title: module.title, detail: `${typeLabel} · ${where}`, href: `#module-${id}` };
  }
  if (kind === 'event') {
    const found = findEvent(id);
    if (!found || !canViewEvent(found, memberId)) return null;
    const where = found.space.kind === 'personal' ? 'a calendar' : found.space.name;
    return { kind, id, at, title: found.event.title, detail: `${whenLabel(found.event)} · ${where}`, href: `#event-${id}` };
  }
  if (kind === 'blog') {
    const member = getAccounts().find((m) => m.username === id);
    if (!member || member.socialOff) return null;
    return { kind, id, at, member, title: memberId === member.id ? 'Your blog' : `${member.name.split(' ')[0]}’s blog`, detail: `@${member.username}`, href: blogHref(member) };
  }
  if (kind === 'conversation') {
    const conversation = getConversationsFor(memberId).find((c) => c.id === id);
    if (!conversation) return null;
    const other = conversation.kind === 'direct' ? getMember(conversation.memberIds.find((m) => m !== memberId)) : null;
    return { kind, id, at, member: other, title: conversationTitle(conversation, memberId), detail: conversation.kind === 'direct' ? 'Message' : 'Group chat', href: `#messages-${id}` };
  }
  return null;
}

export function clearRecents(memberId) {
  const old = getState().recents?.[memberId] ?? [];
  changeState((state) => { state.recents = { ...state.recents, [memberId]: [] }; });
  return old;
}

export function restoreRecents(memberId, list) {
  changeState((state) => { state.recents = { ...state.recents, [memberId]: list }; });
}
