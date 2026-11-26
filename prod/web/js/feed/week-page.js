// @ts-check
/**
 * week-page.js — "Your week" (#week).
 *
 *   Your week · Nov 15 – 21
 *   COMING UP
 *   Tue  Rehearsal · Porch Lights · Going
 *   Sat  Saturday free pantry · Eastside Mutual Aid · Going
 *   YOURS TO DO
 *   ☐ Find last winter’s heating bills · due Wed
 *   LAST WEEK
 *   Grace thanked you for the Saturday pantry
 *   3 new posts in Juniper Tenants Union
 *   That’s all for this week. ✓
 *
 * Short on purpose, and it ends: "That's all". It works any day, from
 * search (Jump to). Its card at the top of the Feed on Sundays was removed
 * on Nov 22.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getCurrentUser, getSpaces, getMember } from '../state/store.js';
import { myUpcoming, myTasks } from '../modules/dashboard/dashboard-data.js';
import { thanksFor } from '../state/thanks.js';
import { todayKey, addDays, fromDateKey, formatShortDate } from '../utils/dates.js';
import { eventHref } from '../events/event-details.js';
import { spaceHref } from '../router.js';

const WEEK_MS = 7 * 864e5;
const dayName = (key) => fromDateKey(key).toLocaleDateString('en-US', { weekday: 'short' });

/** What goes in the week, for `me`. */
export function weekFor(me) {
  const start = todayKey();
  const end = addDays(start, 6);
  const weekAgo = Date.now() - WEEK_MS;
  const upcoming = myUpcoming(me, 6).filter((o) => o.date <= end);
  const tasks = myTasks(me).filter(({ task }) => task.due && task.due <= end);
  const thanks = thanksFor(me.id).filter((t) => t.createdAt > weekAgo);
  // New posts in each of your groups since a week ago (others' posts).
  const busy = getSpaces().filter((s) => s.kind === 'group' && s.memberIds.includes(me.id)).map((space) => {
    let count = 0;
    for (const module of space.modules) {
      for (const item of [...(module.data?.posts ?? []), ...(module.data?.threads ?? []), ...(module.data?.articles ?? [])]) {
        const at = item.publishedAt ?? item.createdAt;
        if (at > weekAgo && item.authorId !== me.id) count += 1;
      }
    }
    return { space, count };
  }).filter((g) => g.count > 0).sort((a, b) => b.count - a.count).slice(0, 3);
  return { start, end, upcoming, tasks, thanks, busy };
}

export function renderWeekPage(container) {
  const me = getCurrentUser();
  const week = weekFor(me);
  const section = (title, rows, empty) => h('section', { class: 'week__section' },
    h('h2', { class: 'week__heading' }, title),
    rows.length ? h('ul', { class: 'week__list' }, rows) : h('p', { class: 'week__empty' }, empty));

  replaceChildren(container, h('div', { class: 'week' },
    h('h1', { class: 'week__title' }, 'Your week'),
    h('p', { class: 'week__range' }, `${formatShortDate(week.start)} – ${formatShortDate(week.end)}`),
    section('Coming up', week.upcoming.map((o) => h('li', { class: 'week__row' },
      h('span', { class: 'week__day' }, o.date === week.start ? 'Today' : dayName(o.date)),
      h('a', { href: o.role === 'shift' ? `#module-${o.moduleId}` : eventHref(o.event.id) }, o.event.title),
      h('span', { class: 'week__where' }, [o.space.kind === 'group' ? o.space.name : null, { host: 'Hosting', going: 'Going', maybe: 'Maybe', invited: 'Invited', shift: 'Your shift', mine: null }[o.role]].filter(Boolean).join(' · ')))),
    'Nothing on the calendar. Enjoy it.'),
    section('Yours to do', week.tasks.map(({ task, space, moduleId }) => h('li', { class: 'week__row' },
      h('span', { class: 'week__day' }, task.due < week.start ? 'Late' : dayName(task.due)),
      h('a', { href: `#module-${moduleId}` }, task.text),
      h('span', { class: 'week__where' }, space.kind === 'group' ? space.name : 'Your list'))),
    'Nothing due this week.'),
    week.thanks.length || week.busy.length ? section('Last week', [
      ...week.thanks.map((t) => h('li', { class: 'week__row' }, icon('heart', 13), h('span', {}, `${getName(t.fromId)} thanked you for ${t.eventTitle}${t.text ? `: “${t.text}”` : ''}`))),
      ...week.busy.map((g) => h('li', { class: 'week__row' }, icon('chat', 13), h('a', { href: spaceHref(g.space.id) }, `${g.count} new in ${g.space.name}`))),
    ], '') : null,
    h('p', { class: 'week__end' }, icon('check', 15), ' That’s all for this week.')));
}

function getName(id) {
  return getMember(id)?.name.split(' ')[0] ?? 'Someone';
}
