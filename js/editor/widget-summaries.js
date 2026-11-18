// @ts-check
/**
 * widget-summaries.js — what a module's widget says at a glance, on a
 * group's first screen on phones (mobile-widgets.js).
 *
 *   widgetSummary(module, space, me) → {
 *     badge?:    '2' | '1 new'           a count in the corner
 *     date?:     { month, day }           a date block (the next event)
 *     progress?: { done, total }          a ring (tasks)
 *     image?:    src                      a picture (the newest photo post)
 *     title?:    the main line
 *     lines:     [smaller lines]
 *     chips?:    ['Rice', 'Lemons', '+2'] (groceries)
 *   }
 *
 * Every kind of module gets something: the ones without their own summary
 * show their description. Nothing here changes data.
 */

import { getMember as getAnyMember, getModule, memberIn } from '../state/store.js';
import { needsYou, myUpcoming, groupUpdates } from '../modules/dashboard/dashboard-data.js';
import { getModuleType } from '../modules/registry.js';
import { getConversation, unreadCount, lastMessage, messagePreview } from '../state/messages.js';
import { hasSeen } from '../modules/announcements/announcements-data.js';
import { nextEventIn } from '../modules/upnext/upnext-data.js';
import { normalizeEvent, occurrencesBetween, occurrenceTimeLabel } from '../modules/calendar/calendar-data.js';
import { listsOf } from '../modules/grocery/grocery-lists.js';
import { addDays, todayKey, timeAgo } from '../utils/dates.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const plain = (text = '') => String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
/** The space being summarized, so people show by the names they go by there (aliases). */
let here = null;
const getMember = (id) => (here ? memberIn(here, id) : getAnyMember(id));
const firstName = (id) => getMember(id)?.name?.split(' ')[0] ?? 'Someone';
const dateBlock = (key) => { const d = new Date(`${key}T12:00:00`); return { month: MONTHS[d.getMonth()], day: String(d.getDate()), weekday: DAYS[d.getDay()] }; };

/** The next thing on a module's own calendar, from today. */
function nextIn(events) {
  const start = todayKey();
  const found = occurrencesBetween((events ?? []).map(normalizeEvent), start, addDays(start, 120)).filter((o) => o.dayNumber === 1);
  found.sort((a, b) => a.date.localeCompare(b.date) || (a.event.time ?? '').localeCompare(b.event.time ?? ''));
  return { next: found[0] ?? null, count: found.filter((o) => o.date <= addDays(start, 7)).length };
}

const SUMMARIES = {
  upnext(module, space, me) {
    const next = nextEventIn(space, me);
    if (!next) return { title: 'Nothing planned yet', lines: ['Plan the first event'] };
    const going = Object.values(next.event.rsvps ?? {}).filter((a) => a === 'going').length;
    const block = dateBlock(next.date);
    return { date: block, kicker: `Next event · ${block.weekday}`, title: next.event.title, lines: [[occurrenceTimeLabel(next), next.event.location, going ? `${going} going` : ''].filter(Boolean).join(' · ')] };
  },
  chat(module, space, me) {
    const conversation = module.data?.conversationId ? getConversation(module.data.conversationId) : null;
    const last = conversation ? lastMessage(conversation) : null;
    const unread = conversation && me ? unreadCount(conversation, me.id) : 0;
    return { badge: unread ? String(unread) : '', lines: [last ? `${firstName(last.authorId)}: ${messagePreview(last)}` : 'Say hello'], people: [...new Set((conversation?.messages ?? []).slice(-6).map((m) => m.authorId))].reverse().slice(0, 3) };
  },
  announcements(module, space, me) {
    const posts = module.data?.posts ?? [];
    const unseen = me ? posts.filter((p) => !hasSeen(p, me.id)).length : 0;
    const top = [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)[0];
    if (!top) return { lines: ['No announcements yet'] };
    return { badge: unseen ? `${unseen} new` : '', kicker: top.pinned ? 'Pinned' : '', title: top.title, lines: [`${getMember(top.authorId)?.name ?? 'Someone'} · ${timeAgo(top.createdAt)}`] };
  },
  todo(module) {
    const tasks = module.data?.tasks ?? [];
    const done = tasks.filter((t) => t.done).length;
    const open = tasks.filter((t) => !t.done).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const next = open[0];
    return { progress: { done, total: tasks.length }, lines: [next ? `Next: ${next.text}${next.due ? ` · ${dateBlock(next.due).month.slice(0, 1)}${dateBlock(next.due).month.slice(1).toLowerCase()} ${dateBlock(next.due).day}` : ''}` : tasks.length ? 'All done' : 'No tasks yet'] };
  },
  calendar(module) {
    const { next, count } = nextIn(module.data?.events);
    if (!next) return { lines: ['Nothing coming up'] };
    const block = dateBlock(next.date);
    return { date: block, title: next.event.title, lines: [[occurrenceTimeLabel(next), count > 1 ? `${count} this week` : ''].filter(Boolean).join(' · ')] };
  },
  grocery(module) {
    const items = listsOf(module.data).flatMap((l) => l.items ?? []).filter((i) => !i.bought);
    if (!items.length) return { lines: ['Nothing to get'] };
    const shown = items.slice(0, 3).map((i) => i.name);
    return { badge: `${items.length} to get`, chips: items.length > 3 ? [...shown, `+${items.length - 3}`] : shown, lines: [] };
  },
  forum(module) {
    const threads = (module.data?.threads ?? []).filter((t) => !t.pending);
    const latest = [...threads].sort((a, b) => (b.lastActivityAt ?? b.createdAt ?? 0) - (a.lastActivityAt ?? a.createdAt ?? 0))[0];
    if (!latest) return { lines: ['No threads yet'] };
    return { title: latest.title, lines: [`${(latest.replies ?? []).length} replies · ${threads.length} threads`] };
  },
  generalfeed(module) {
    const posts = [...(module.data?.posts ?? [])].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const top = posts[0];
    if (!top) return { lines: ['No posts yet'] };
    const image = top.media?.find((m) => m.kind === 'image')?.src ?? null;
    return { image, title: plain(top.text ?? top.body).slice(0, 90) || (image ? 'A new photo' : 'A new post'), lines: [`${getMember(top.authorId)?.name ?? 'Someone'} · ${timeAgo(top.createdAt)}`] };
  },
  vault(module) {
    const items = module.data?.items ?? [];
    const files = items.filter((i) => i.kind !== 'folder');
    const newest = [...files].sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))[0];
    return { badge: files.length ? `${files.length} files` : '', lines: [newest ? `Newest: ${newest.name}` : 'Nothing saved yet'] };
  },
  note(module) {
    const text = plain(module.data?.html ?? module.data?.text ?? '');
    return { lines: [text ? text.slice(0, 90) : 'Empty'] };
  },
};
// ─── Homepage modules ───
SUMMARIES.dashboard = (module, space, me) => {
  const needs = needsYou(me);
  const asks = needs.invites.length + needs.rsvps.length + needs.joinRequests.reduce((n, j) => n + j.count, 0);
  const next = myUpcoming(me, 14)[0];
  const block = next ? dateBlock(next.date) : null;
  return {
    badge: asks ? `${asks} for you` : '',
    date: block,
    kicker: block ? `Coming up · ${block.weekday}` : '',
    title: next ? next.event.title : (asks ? `${asks} thing${asks === 1 ? '' : 's'} waiting on you` : 'You’re all caught up'),
    lines: next ? [[next.space?.kind === 'group' ? next.space.name : '', occurrenceTimeLabel(next)].filter(Boolean).join(' · ')] : [],
  };
};
SUMMARIES.recentgroups = (module, space, me) => {
  const groups = groupUpdates(me).slice(0, 3);
  if (!groups.length) return { lines: ['No groups yet'] };
  return { lines: groups.map((g) => { const fresh = (g.newPosts ?? 0) + (g.newThreads ?? 0) + (g.unreadChat ?? 0); return fresh ? `${g.space.name} · ${fresh} new` : g.space.name; }) };
};
SUMMARIES.events = (module, space, me) => {
  if (module.data?.events?.length) return SUMMARIES.calendar(module);
  if (space.kind !== 'personal') return SUMMARIES.upnext(module, space, me);
  const next = myUpcoming(me, 60)[0];
  if (!next) return { lines: ['Nothing coming up'] };
  const block = dateBlock(next.date);
  return { date: block, title: next.event.title, lines: [[occurrenceTimeLabel(next), next.space?.kind === 'group' ? next.space.name : ''].filter(Boolean).join(' · ')] };
};
SUMMARIES.kanban = (module) => {
  const columns = module.data?.columns ?? [];
  const cards = module.data?.cards ?? [];
  if (!columns.length) return { lines: ['An empty board'] };
  return { chips: columns.slice(0, 4).map((c) => `${c.title} ${cards.filter((card) => card.columnId === c.id).length}`), lines: [] };
};
SUMMARIES.vaultfile = (module) => {
  const vault = module.data?.vaultModuleId ? getModule(module.data.vaultModuleId) : null;
  const item = vault?.data?.items?.find((i) => i.id === module.data.itemId);
  if (!item) return { lines: ['Pick a file from your vault'] };
  const text = item.kind === 'note' ? plain(item.html).slice(0, 90) : '';
  return { title: item.name, lines: [text || ({ note: 'Note', link: 'Link', module: 'File', file: 'File' }[item.kind] ?? 'File')] };
};
SUMMARIES.textfeed = SUMMARIES.generalfeed;
SUMMARIES.carousel = SUMMARIES.generalfeed;
SUMMARIES.document = SUMMARIES.note;

export function widgetSummary(module, space, me) {
  here = space;
  const summarize = SUMMARIES[module.type];
  try {
    if (summarize) return { lines: [], ...summarize(module, space, me) };
  } catch { /* an odd module's data: fall back to its description */ }
  return { lines: [getModuleType(module.type)?.description ?? ''] };
}
