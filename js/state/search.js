// @ts-check
/**
 * search.js — what the search box in the top bar finds.
 *
 *   searchPeople('ro')       → accounts whose name or @username matches
 *   searchGroups('tenants')   → your groups, then public ones you could join
 *   searchEvents('potluck')  → public events, and events in your groups
 *   searchSpace(space, 'x')  → things inside one homepage or blog: tasks,
 *                              posts, threads, events, cards, photos…
 *
 * Every result has { kind, id, title, detail, href } (and sometimes
 * `moduleId` + `itemId`, to open a module's full page at that item).
 *
 * searchSpace() doesn't need to know each module's data shape: it walks
 * the module's data and picks out the text fields people write (title,
 * name, text, body, caption…), remembering which item each came from.
 * So a new module type is searchable without changes here.
 */

import { isChild, canMessage } from './children.js';
import { isPublicGroup } from './group-access.js';
import { getSpaces, getCurrentUser, canViewSpace, getBlogOf } from './store.js';
import { getAccounts } from './accounts.js';
import { normalizeEvent, canSeeEvent } from '../modules/calendar/calendar-data.js';
import { getModuleType } from '../modules/registry.js';
import { whenLabel } from '../events/event-details.js';

const MAX_PER_KIND = 6;
/** Fields that hold text people wrote, in the order they make a good title. */
const TEXT_FIELDS = ['title', 'name', 'text', 'label', 'caption', 'body', 'description', 'notes', 'location'];
const SNIPPET_CHARS = 90;

const matches = (text, query) => (text ?? '').toLowerCase().includes(query);
const plain = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export function searchPeople(query) {
  const q = query.trim().toLowerCase().replace(/^@/, '');
  if (!q) return [];
  const me = getCurrentUser();
  return getAccounts()
    .filter((m) => matches(m.name, q) || matches(m.username, q))
    .filter((m) => !me || canMessage(me.id, m.id)) // child accounts: only people they share a group with (children.js)
    .slice(0, MAX_PER_KIND)
    .map((member) => ({
      kind: 'person',
      id: member.id,
      member,
      title: member.name,
      // Someone without a blog (turned off) opens a conversation instead.
      detail: member.socialOff ? `@${member.username} · send a message` : `@${member.username}${getBlogOf(member.id)?.description ? ` · ${getBlogOf(member.id).description}` : ''}`,
      href: member.socialOff ? null : `#blog-${member.username}`,
      messageId: member.socialOff ? member.id : null,
    }));
}

export function searchGroups(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const me = getCurrentUser();
  return getSpaces()
    // Private groups are hidden from people outside them.
    .filter((s) => s.kind === 'group' && (s.memberIds.includes(me.id) || (isPublicGroup(s) && !isChild(me))))
    .filter((s) => matches(s.name, q) || matches(s.description, q) || matches(s.groupType, q))
    .sort((a, b) => Number(b.memberIds.includes(me.id)) - Number(a.memberIds.includes(me.id)))
    .slice(0, MAX_PER_KIND)
    .map((group) => {
      const isMember = group.memberIds.includes(me.id);
      return {
        kind: 'group',
        id: group.id,
        group,
        title: group.name,
        detail: `${group.groupType ? `${group.groupType} · ` : ''}${group.memberIds.length} ${group.memberIds.length === 1 ? 'member' : 'members'}${isMember ? ' · joined' : ''}`,
        href: isMember ? `#space-${group.id}` : '#groups-explore',
      };
    });
}

/** Public events anywhere, plus events you can see in your own groups and homepage. */
export function searchEvents(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const me = getCurrentUser();
  const results = [];
  for (const space of getSpaces()) {
    const isMine = space.memberIds.includes(me.id);
    if (isChild(me) && !isMine) continue; // child accounts: their own groups only
    for (const module of space.modules) {
      for (const raw of module.data?.events ?? []) {
        const event = normalizeEvent(raw);
        const visible = event.visibility === 'public' || (isMine && canSeeEvent(event, me.id)) || event.inviteeIds.includes(me.id);
        if (!visible || !(matches(event.title, q) || matches(event.location, q) || matches(event.notes, q))) continue;
        results.push({
          kind: 'event',
          id: event.id,
          title: event.title,
          detail: `${whenLabel(event)} · ${space.kind === 'personal' ? 'your calendar' : space.name}`,
          href: `#event-${event.id}`,
          date: event.date,
        });
      }
    }
  }
  return results.sort((a, b) => a.date.localeCompare(b.date)).slice(0, MAX_PER_KIND);
}

/**
 * Everything in one space that matches: module titles, and text inside
 * module data (tasks, posts, replies, events, cards, photos…).
 */
export function searchSpace(space, query) {
  const q = query.trim().toLowerCase();
  if (!q || !space || !canViewSpace(space)) return [];
  const results = [];

  for (const module of space.modules) {
    const typeLabel = safeLabel(module.type);
    if (matches(module.title, q)) {
      results.push({ kind: 'module', id: module.id, title: module.title, detail: typeLabel, moduleId: module.id, itemId: null, href: `#module-${module.id}` });
    }
    for (const hit of findInData(module.data, q)) {
      results.push({
        kind: 'item',
        id: `${module.id}:${hit.itemId}`,
        title: hit.title ?? module.title,
        detail: `${module.title}${hit.snippet ? ` · ${hit.snippet}` : ''}`,
        moduleId: module.id,
        itemId: hit.itemId,
        href: `#module-${module.id}`,
      });
    }
  }
  // Titles that start with what was typed come first.
  const startsWith = (r) => (r.title.toLowerCase().split(/\s+/).some((word) => word.startsWith(q)) ? 0 : 1);
  return results.sort((a, b) => startsWith(a) - startsWith(b)).slice(0, MAX_PER_KIND * 2);
}

function safeLabel(type) {
  try { return getModuleType(type).label; } catch { return type; }
}

/**
 * Walk module data for items (objects with an `id`) whose text matches.
 * The nearest top-level item is what gets opened, so a match in a reply
 * opens its thread, and a match in a subtask opens its task.
 */
function findInData(data, query) {
  const hits = [];
  const seen = new Set();

  function visit(value, topItem) {
    if (Array.isArray(value)) { value.forEach((v) => visit(v, topItem)); return; }
    if (!value || typeof value !== 'object') return;
    if (value.pending === true) return; // forum threads waiting for approval aren't public yet
    const item = topItem ?? (value.id ? value : null);

    for (const field of TEXT_FIELDS) {
      const text = typeof value[field] === 'string' ? value[field] : null;
      if (!text || !matches(field === 'body' || field === 'html' ? plain(text) : text, query)) continue;
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        hits.push({ itemId: item.id, title: titleOf(item), snippet: snippetAround(text === titleOf(item) ? '' : plain(text), query) });
      }
      break;
    }
    if (typeof value.html === 'string' && matches(plain(value.html), query) && !seen.has(item?.id ?? 'module')) {
      seen.add(item?.id ?? 'module');
      hits.push({ itemId: item?.id ?? null, title: item ? titleOf(item) : (value.title || null), snippet: snippetAround(plain(value.html), query) });
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'html' && typeof child === 'object') visit(child, item);
    }
  }

  visit(data, null);
  return hits;
}

function titleOf(item) {
  for (const field of TEXT_FIELDS) if (typeof item[field] === 'string' && item[field].trim()) return truncate(plain(item[field]), 70);
  return 'Item';
}

function snippetAround(text, query) {
  if (!text) return '';
  const at = text.toLowerCase().indexOf(query);
  if (at === -1) return truncate(text, SNIPPET_CHARS);
  const start = Math.max(0, at - 30);
  return `${start > 0 ? '…' : ''}${truncate(text.slice(start), SNIPPET_CHARS)}`;
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
