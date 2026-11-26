// @ts-check
/**
 * health-tab.js — Group settings → Health, for organizers: the quiet
 * problems a group has before anyone says anything, each with a nudge.
 *
 *   Haven't been around in a month (2)
 *     (OW) Owen Walsh · last seen Oct 2                     [Send a note]
 *   Questions nobody has answered (1)
 *     “Is the boiler on a timer?” · Tenant forum · 3 days    [Answer it]
 *   Coming up with no host (1)
 *     Building C meeting · Sat, Nov 21                      [Host it] [Ask someone]
 *
 * When there's nothing: "All good. Nothing needs a nudge right now."
 *
 * "Last seen" is the latest of: their last visit to the group, when they
 * were last active, and the last thing they posted, replied, or commented
 * in it. A real 3den would know visits for everyone; the prototype only
 * knows what's in this browser, so it leans on what people posted.
 *
 *   groupHealth(space, meId) → { quiet, unanswered, unhosted }
 */

import { h } from '../ui/dom.js';
import { avatar } from '../ui/avatar.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { getState, getSpaceMembers } from '../state/store.js';
import { openDirectConversation } from '../state/messages.js';
import { updateEvent } from '../state/events.js';
import { requestModuleFocus } from '../editor/module-context.js';
import { goTo, openModulePage } from '../router.js';
import { normalizeEvent, occurrencesBetween, hostIdsOf } from '../modules/calendar/calendar-data.js';
import { todayKey, addDays, formatShortDate, toDateKey, timeAgo } from '../utils/dates.js';

const MONTH_MS = 30 * 864e5;
const DAY_MS = 864e5;

/** When `memberId` last did anything in `space` that 3den can see. */
function lastSeenIn(space, memberId) {
  const state = getState();
  let latest = Math.max(state.visits?.[memberId]?.[space.id] ?? 0, state.presence?.[memberId] ?? 0, space.joinedAt?.[memberId] ?? 0);
  const look = (item) => {
    if (!item || typeof item !== 'object') return;
    if (item.authorId === memberId && typeof item.createdAt === 'number') latest = Math.max(latest, item.createdAt);
    for (const key of ['replies', 'comments']) for (const child of item[key] ?? []) look(child);
  };
  for (const module of space.modules) {
    for (const key of ['posts', 'threads', 'articles', 'tasks']) for (const item of module.data?.[key] ?? []) look(item);
  }
  return latest;
}

export function groupHealth(space, meId) {
  const now = Date.now();
  const quiet = getSpaceMembers(space)
    .filter((m) => m.id !== meId && !m.demoOnline)
    .map((m) => ({ member: m, lastSeen: lastSeenIn(space, m.id) }))
    .filter((q) => now - q.lastSeen > MONTH_MS)
    .sort((a, b) => a.lastSeen - b.lastSeen);

  const unanswered = space.modules.filter((m) => m.type === 'forum').flatMap((module) => (module.data?.threads ?? [])
    .filter((t) => !t.pending && !t.locked && !(t.replies ?? []).length && now - t.createdAt > DAY_MS)
    .map((thread) => ({ thread, module })));

  const start = todayKey();
  const unhosted = [];
  for (const module of space.modules) {
    if (!Array.isArray(module.data?.events)) continue;
    const events = module.data.events.map(normalizeEvent).filter((e) => e.kind !== 'entry' && e.kind !== 'task'
      && !hostIdsOf(e).some((id) => space.memberIds.includes(id)));
    for (const o of occurrencesBetween(events, start, addDays(start, 30))) {
      if (o.dayNumber === 1 && !unhosted.some((u) => u.event.id === o.event.id)) unhosted.push({ event: o.event, date: o.date, module });
    }
  }
  return { quiet, unanswered, unhosted };
}

/** How many things need a look, for the "Health" tab's badge. */
export function healthCount(space, meId) {
  const { quiet, unanswered, unhosted } = groupHealth(space, meId);
  return quiet.length + unanswered.length + unhosted.length;
}

export function renderHealthTab(space, me, redraw) {
  const { quiet, unanswered, unhosted } = groupHealth(space, me.id);
  const section = (title, hint, rows) => (rows.length ? h('section', { class: 'settings-section health__section' },
    h('h2', { class: 'settings-section__title' }, `${title} (${rows.length})`),
    h('p', { class: 'settings-section__description' }, hint),
    h('ul', { class: 'health__list' }, rows)) : null);

  if (!quiet.length && !unanswered.length && !unhosted.length) {
    return h('section', { class: 'settings-section health__all-good' },
      h('p', {}, icon('check', 16), ' All good. Nothing needs a nudge right now.'));
  }

  return [
    section('Haven’t been around in a month', 'A personal note brings people back more than any notification does.', quiet.map(({ member, lastSeen }) => h('li', { class: 'health__row' },
      avatar(member, 28),
      h('span', { class: 'health__text' }, h('strong', {}, member.name), h('span', { class: 'health__muted' }, lastSeen ? ` · last seen ${formatShortDate(toDateKey(new Date(lastSeen)))}` : ' · not seen yet')),
      h('button', {
        type: 'button', class: 'button button--small',
        onClick: () => goTo(`#messages-${openDirectConversation(me.id, member.id).id}`),
      }, icon('chat', 13), ' Send a note')))),
    section('Questions nobody has answered', 'An answer within a day or two keeps people asking.', unanswered.map(({ thread, module }) => h('li', { class: 'health__row' },
      h('span', { class: 'health__text' }, h('strong', {}, `“${thread.title}”`), h('span', { class: 'health__muted' }, ` · ${module.title} · ${timeAgo(thread.createdAt)}`)),
      h('button', {
        type: 'button', class: 'button button--small',
        onClick: () => { requestModuleFocus(module.id, thread.id); openModulePage(module.id); },
      }, 'Answer it')))),
    section('Coming up with no host', 'Events go better with someone in charge: to open up, greet people, and answer questions.', unhosted.map(({ event, date }) => h('li', { class: 'health__row' },
      h('span', { class: 'health__text' }, h('strong', {}, event.title), h('span', { class: 'health__muted' }, ` · ${formatShortDate(date)}`)),
      h('button', {
        type: 'button', class: 'button button--small',
        onClick: () => {
          updateEvent(event.id, (e) => { e.createdBy = me.id; });
          showToast(`You’re hosting “${event.title}”.`, { actionLabel: 'Undo', onAction: () => { updateEvent(event.id, (e) => { e.createdBy = event.createdBy; }); redraw(); } });
          redraw();
        },
      }, 'Host it'),
      h('a', { class: 'button button--small button--quiet', href: `#event-${event.id}` }, 'Ask someone')))),
  ];
}

/** One line under a group's name for its organizers, when something needs a look. */
export function healthNudge(space, me) {
  const count = healthCount(space, me.id);
  if (!count) return null;
  return h('a', { class: 'health-nudge', href: `#settings-${space.id}--health` },
    icon('heart', 13), ` Group health: ${count} ${count === 1 ? 'thing' : 'things'} to look at`);
}
