// @ts-check
/**
 * advanced-search.js — the search behind the Advanced search page (#search).
 *
 * Unlike the quick search in the top bar (js/state/search.js), it looks
 * everywhere you're allowed to look at once (people, groups, events, what's
 * inside every module of every group and homepage you can see, blogs, and
 * your messages), and it understands a small query language:
 *
 *   tenants meeting           every word, in any order
 *   "know your rights"        this exact phrase
 *   heat OR boiler            either word
 *   -cancelled                not this word (also -"exact phrase")
 *   from:@maya                written, posted, or hosted by someone
 *   in:"Juniper Tenants"      inside a group (part of its name is enough), or in:homepage, in:blogs, in:messages
 *   type:event                person, group, event, post, task, note, file, photo, message, page
 *   after:2026-11-01  before:2026-12-31
 *   tag:music                 an event tag
 *   is:upcoming  is:past  is:public  is:private  is:mine  is:member  is:near (events within your radius)
 *
 * The page's form fills the same things in (parseQuery and buildQuery go
 * both ways), so a search can be shared or saved as a link.
 *
 *   parseQuery(text) → { terms, phrases, any, exclude, filters }
 *   buildQuery(parsed) → text
 *   advancedSearch(parsed, { sort }) → [{ kind, id, title, snippet, where, date, authorId, href,
 *                                        moduleId?, itemId?, member?, group?, score, marks }]
 *   countByKind(results) → { event: 4, post: 2, … }
 */

import { isChild, canMessage } from './children.js';
import { openMessage } from './e2ee.js';
import { getCurrentUser, getSpaces, canViewSpace, canViewModule, getMember } from './store.js';
import { getAccounts } from './accounts.js';
import { isPublicGroup } from './group-access.js';
import { canViewEvent } from './events.js';
import { getConversationsFor, conversationTitle } from './messages.js';
import { normalizeEvent, isEvent } from '../modules/calendar/calendar-data.js';
import { getModuleType } from '../modules/registry.js';
import { whenLabel } from '../events/event-details.js';
import { placeById, distanceMiles } from '../utils/places.js';
import { todayKey } from '../utils/dates.js';

export const RESULT_KINDS = [
  { id: 'person', label: 'People', icon: 'people' },
  { id: 'group', label: 'Groups', icon: 'people' },
  { id: 'event', label: 'Events', icon: 'calendar' },
  { id: 'post', label: 'Posts', icon: 'announcements' },
  { id: 'task', label: 'Tasks', icon: 'todo' },
  { id: 'note', label: 'Notes', icon: 'note' },
  { id: 'file', label: 'Files', icon: 'folder' },
  { id: 'photo', label: 'Photos', icon: 'image' },
  { id: 'message', label: 'Messages', icon: 'chat' },
  { id: 'page', label: 'Modules', icon: 'expand' },
];

// Which kind of thing a module's items are.
const KIND_OF_MODULE = {
  announcements: 'post', forum: 'post', textfeed: 'post', generalfeed: 'post', blogpost: 'post', document: 'note', submissions: 'post',
  todo: 'task', kanban: 'task', gantt: 'task', grocery: 'task', bills: 'task',
  note: 'note', wiki: 'note', links: 'note',
  vault: 'file', files: 'file',
  gallery: 'photo', carousel: 'photo', photos: 'photo',
};
const TEXT_FIELDS = ['title', 'name', 'text', 'label', 'caption', 'body', 'description', 'notes', 'location', 'question'];
const AUTHOR_FIELDS = ['authorId', 'createdBy', 'by', 'uploadedBy', 'addedBy', 'postedBy'];
const DATE_FIELDS = ['createdAt', 'at', 'postedAt', 'uploadedAt', 'due', 'date'];
const plain = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// ─── The query language ──────────────────────────────────────────────────────

const FILTER_KEYS = ['from', 'in', 'type', 'after', 'before', 'tag', 'is'];

/** Split text into tokens, keeping "quoted phrases" (and -"quoted" ones, and key:"quoted") together. */
function tokenize(text) {
  const tokens = [];
  const re = /(-?(?:[a-z]+:)?"[^"]*"?|\S+)/gi;
  let m;
  while ((m = re.exec(text))) tokens.push(m[1]);
  return tokens;
}
const unquote = (s) => s.replace(/^"|"$/g, '');

export function parseQuery(text = '') {
  const parsed = { terms: [], phrases: [], any: [], exclude: [], filters: { from: [], in: [], type: [], after: null, before: null, tag: [], is: [] } };
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // a OR b OR c
    if (tokens[i + 1]?.toUpperCase() === 'OR' && tokens[i + 2]) {
      const group = [unquote(token).toLowerCase()];
      while (tokens[i + 1]?.toUpperCase() === 'OR' && tokens[i + 2]) { group.push(unquote(tokens[i + 2]).toLowerCase()); i += 2; }
      parsed.any.push(group);
      continue;
    }
    const filter = token.match(/^([a-z]+):(.+)$/i);
    if (filter && FILTER_KEYS.includes(filter[1].toLowerCase())) {
      const key = filter[1].toLowerCase();
      const value = unquote(filter[2]);
      if (key === 'after' || key === 'before') parsed.filters[key] = value;
      else parsed.filters[key].push(key === 'from' ? value.replace(/^@/, '').toLowerCase() : value.toLowerCase());
      continue;
    }
    if (token.startsWith('-') && token.length > 1) { parsed.exclude.push(unquote(token.slice(1)).toLowerCase()); continue; }
    if (token.startsWith('"')) { const phrase = unquote(token).toLowerCase(); if (phrase) parsed.phrases.push(phrase); continue; }
    parsed.terms.push(token.toLowerCase());
  }
  return parsed;
}

/** The text form of a parsed query (what goes in the search box and the link). */
export function buildQuery(p) {
  const quote = (s) => (/\s/.test(s) ? `"${s}"` : s);
  return [
    ...p.terms,
    ...p.phrases.map((s) => `"${s}"`),
    ...p.any.filter((g) => g.length > 1).map((g) => g.map(quote).join(' OR ')),
    ...p.any.filter((g) => g.length === 1).map((g) => quote(g[0])),
    ...p.exclude.map((s) => `-${quote(s)}`),
    ...p.filters.from.map((s) => `from:@${s}`),
    ...p.filters.in.map((s) => `in:${quote(s)}`),
    ...p.filters.type.map((s) => `type:${s}`),
    p.filters.after ? `after:${p.filters.after}` : null,
    p.filters.before ? `before:${p.filters.before}` : null,
    ...p.filters.tag.map((s) => `tag:${s}`),
    ...p.filters.is.map((s) => `is:${s}`),
  ].filter(Boolean).join(' ');
}

export const isEmptyQuery = (p) => !p.terms.length && !p.phrases.length && !p.any.length && !p.exclude.length
  && !Object.values(p.filters).some((v) => (Array.isArray(v) ? v.length : v));

// ─── What can be searched ────────────────────────────────────────────────────

/** Everything this person may see, as plain records. */
function collect(me) {
  const docs = [];
  const seenEvents = new Set(); // an event can sit in more than one module
  const myPoint = me.location?.placeId ? placeById(me.location.placeId) : me.location?.lat != null ? me.location : null;

  // People
  for (const member of getAccounts()) {
    if (!canMessage(me.id, member.id)) continue; // children are found only by people they share a group with (children.js)
    docs.push({
      kind: 'person', id: member.id, member, title: member.name,
      text: [member.username, member.bio].filter(Boolean).join(' · '),
      where: `@${member.username}`, date: member.createdAt ?? null, authorId: member.id,
      href: member.socialOff ? null : `#blog-${member.username}`, messageId: member.socialOff ? member.id : null,
      flags: { mine: member.id === me.id },
    });
  }

  for (const space of getSpaces()) {
    const isMember = space.memberIds.includes(me.id);
    if (isChild(me) && !isMember) continue; // child accounts: their own groups and homepage only
    const visible = space.kind === 'group' ? (isMember || isPublicGroup(space)) && canViewSpace(space) : canViewSpace(space);

    // Groups
    if (space.kind === 'group' && (isMember || isPublicGroup(space))) {
      docs.push({
        kind: 'group', id: space.id, group: space, title: space.name,
        text: [space.groupType, space.description].filter(Boolean).join(' · '),
        where: `${space.groupType ? `${space.groupType} · ` : ''}${isMember ? 'You’re a member' : 'Not joined'} · ${space.memberIds.length} members`,
        date: space.createdAt ?? null, authorId: Object.keys(space.roles ?? {}).find((id) => space.roles[id] === 'owner') ?? null,
        spaceName: space.name, spaceKind: 'group',
        href: isMember || isPublicGroup(space) ? `#space-${space.id}` : '#groups-explore',
        flags: { member: isMember, public: isPublicGroup(space), private: !isPublicGroup(space) },
      });
    }

    const where = space.kind === 'personal' ? 'Your homepage' : space.kind === 'blog' ? `${getMember(space.memberIds[0])?.name ?? 'A'}’s blog` : space.name;
    for (const module of space.modules) {
      // Events: wherever they are, if you can see them (a public event in a group you're not in, too).
      for (const raw of module.data?.events ?? []) {
        const event = normalizeEvent(raw);
        if (!isEvent(event) || seenEvents.has(event.id) || !canViewEvent({ event, space }, me.id)) continue;
        seenEvents.add(event.id);
        const point = event.area ? placeById(event.area) : null;
        docs.push({
          kind: 'event', id: event.id, title: event.title,
          text: [event.location, event.notes, (event.tags ?? []).join(' ')].filter(Boolean).join(' · '),
          where: `${whenLabel(event)} · ${space.kind === 'personal' ? 'a calendar' : where}`,
          date: event.date, eventEnd: event.endDate ?? event.date, authorId: event.createdBy ?? null, tags: event.tags ?? [],
          spaceName: where, spaceKind: space.kind, href: `#event-${event.id}`,
          flags: {
            public: event.visibility === 'public', private: event.visibility !== 'public', mine: event.createdBy === me.id, member: isMember,
            near: Boolean(myPoint && point && distanceMiles(myPoint, point) <= (me.location?.radiusMiles ?? 10)),
          },
        });
      }
      if (!visible || !canViewModule(module.id)) continue;
      const kind = KIND_OF_MODULE[module.type] ?? 'note';
      let typeLabel = module.type;
      try { typeLabel = getModuleType(module.type).label; } catch { /* an old module type */ }

      // The module itself (by its title).
      docs.push({
        kind: 'page', id: module.id, title: module.title, text: typeLabel, where: `${typeLabel} · ${where}`,
        date: null, authorId: null, spaceName: where, spaceKind: space.kind, href: `#module-${module.id}`, moduleId: module.id,
        flags: { member: isMember, mine: space.kind === 'personal' && isMember },
      });
      if (module.type === 'calendar' || module.type === 'events') continue;

      // Items inside it: the top-level things with an id (posts, tasks, files, photos…), with all their text.
      for (const item of itemsOf(module.data)) {
        const text = textOf(item);
        if (!text.trim()) continue;
        const title = titleOf(item) ?? module.title;
        docs.push({
          kind, id: `${module.id}:${item.id}`, title, text, where: `${module.title} · ${where}`,
          date: dateOf(item), authorId: authorOf(item), spaceName: where, spaceKind: space.kind,
          href: `#module-${module.id}`, moduleId: module.id, itemId: item.id, thumb: kind === 'photo' ? item.src ?? null : null,
          flags: { member: isMember, mine: authorOf(item) === me.id },
        });
      }
    }
  }

  // Messages in your conversations
  for (const conversation of getConversationsFor(me.id)) {
    const title = conversationTitle(conversation, me.id);
    for (const message of conversation.messages ?? []) {
      // Encrypted messages are searched on this device only, from what's been unlocked (e2ee.js).
      const text = message.deleted ? '' : openMessage(message)?.body ?? '';
      if (!text) continue;
      docs.push({
        kind: 'message', id: message.id, title, text, where: conversation.kind === 'direct' ? 'Message' : 'Group chat',
        date: message.createdAt, authorId: message.authorId, spaceName: 'Messages', spaceKind: 'messages',
        href: `#messages-${conversation.id}`, flags: { mine: message.authorId === me.id },
      });
    }
  }
  return docs;
}

function itemsOf(data) {
  if (!data || typeof data !== 'object') return [];
  const out = [];
  for (const value of Object.values(data)) {
    if (Array.isArray(value)) for (const item of value) if (item && typeof item === 'object' && item.id && !item.pending) out.push(item);
  }
  if (!out.length && (typeof data.html === 'string' || typeof data.text === 'string')) out.push({ id: 'body', ...data });
  return out;
}

/** All the text in an item, replies and subtasks included. */
function textOf(value, depth = 0) {
  if (depth > 4 || !value || typeof value !== 'object') return '';
  const parts = [];
  for (const field of TEXT_FIELDS) if (typeof value[field] === 'string') parts.push(field === 'body' ? plain(value[field]) : value[field]);
  if (typeof value.html === 'string') parts.push(plain(value.html));
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) for (const c of child) parts.push(textOf(c, depth + 1));
    else if (child && typeof child === 'object') parts.push(textOf(child, depth + 1));
  }
  return parts.filter(Boolean).join(' · ');
}
function titleOf(item) {
  for (const field of TEXT_FIELDS) if (typeof item[field] === 'string' && item[field].trim()) return truncate(plain(item[field]), 80);
  if (typeof item.html === 'string') return truncate(plain(item.html), 80);
  return null;
}
function authorOf(item) {
  for (const field of AUTHOR_FIELDS) if (typeof item[field] === 'string') return item[field];
  return null;
}
function dateOf(item) {
  for (const field of DATE_FIELDS) if (item[field] != null) return item[field];
  return null;
}
const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A date (a timestamp or 'YYYY-MM-DD') as 'YYYY-MM-DD', for before:/after:. */
function dayOf(date) {
  if (date == null) return null;
  if (typeof date === 'string') return date.slice(0, 10);
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const sortTime = (date) => (date == null ? 0 : typeof date === 'string' ? new Date(`${date.slice(0, 10)}T12:00`).getTime() : date);

// ─── Matching ────────────────────────────────────────────────────────────────

function passesFilters(doc, f, me) {
  if (f.type.length && !f.type.includes(doc.kind)) return false;
  if (f.from.length) {
    const author = doc.authorId ? getMember(doc.authorId) : null;
    if (!author || !f.from.some((who) => author.username.toLowerCase() === who || author.name.toLowerCase().includes(who))) return false;
  }
  if (f.in.length && !f.in.some((place) => {
    if (place === 'homepage') return doc.spaceKind === 'personal';
    if (place === 'blogs') return doc.spaceKind === 'blog';
    if (place === 'messages') return doc.kind === 'message';
    return (doc.spaceName ?? '').toLowerCase().includes(place) || (doc.kind === 'group' && doc.title.toLowerCase().includes(place));
  })) return false;
  const day = dayOf(doc.date);
  if (f.after && (!day || day < f.after)) return false;
  if (f.before && (!day || day > f.before)) return false;
  if (f.tag.length && !(doc.tags ?? []).some((t) => f.tag.includes(t.toLowerCase()))) return false;
  for (const flag of f.is) {
    if (flag === 'upcoming' && !(doc.kind === 'event' && doc.eventEnd >= todayKey())) return false;
    if (flag === 'past' && !(doc.kind === 'event' && doc.eventEnd < todayKey())) return false;
    if (['public', 'private', 'mine', 'member', 'near'].includes(flag) && !doc.flags?.[flag]) return false;
  }
  return true;
}

/** Run a parsed query. sort: 'best' | 'newest' | 'oldest' | 'soonest'. */
export function advancedSearch(parsed, { sort = 'best' } = {}) {
  const me = getCurrentUser();
  if (!me || isEmptyQuery(parsed)) return [];
  const results = [];
  for (const doc of collect(me)) {
    if (!passesFilters(doc, parsed.filters, me)) continue;
    const title = doc.title.toLowerCase();
    const hay = `${title} · ${doc.text.toLowerCase()}`;
    if (!parsed.terms.every((t) => hay.includes(t))) continue;
    if (!parsed.phrases.every((p) => hay.includes(p))) continue;
    if (!parsed.any.every((group) => group.some((t) => hay.includes(t)))) continue;
    if (parsed.exclude.some((t) => hay.includes(t))) continue;

    const marks = [...parsed.terms, ...parsed.phrases, ...parsed.any.flat()].filter((t) => hay.includes(t));
    let score = 0;
    for (const t of marks) {
      if (title.includes(t)) score += 3;
      if (new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay)) score += 1;
      if (title.startsWith(t)) score += 2;
    }
    score += parsed.phrases.length * 2;
    // A little for being recent, or coming up soon.
    const days = Math.abs(Date.now() - sortTime(doc.date)) / 86400000;
    if (doc.date != null) score += Math.max(0, 1 - days / 60);
    results.push({ ...doc, score, marks, snippet: snippet(doc.text, marks) });
  }
  const byTime = (a, b) => sortTime(b.date) - sortTime(a.date);
  if (sort === 'newest') results.sort(byTime);
  else if (sort === 'oldest') results.sort((a, b) => -byTime(a, b));
  else if (sort === 'soonest') {
    const today = todayKey();
    const key = (r) => (r.kind === 'event' && r.eventEnd >= today ? sortTime(r.date) : Infinity);
    results.sort((a, b) => key(a) - key(b) || b.score - a.score);
  } else results.sort((a, b) => b.score - a.score || byTime(a, b));
  return results;
}

/** About 160 characters of the text, around the first match. */
function snippet(text, marks) {
  if (!text) return '';
  const lower = text.toLowerCase();
  const at = marks.map((m) => lower.indexOf(m)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 50);
  const piece = text.slice(start, start + 170);
  return `${start > 0 ? '…' : ''}${piece}${start + 170 < text.length ? '…' : ''}`;
}

export function countByKind(results) {
  const counts = {};
  for (const r of results) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  return counts;
}
