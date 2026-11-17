// @ts-check
/**
 * shifts-module.js — Volunteer shifts: a week of shifts, and who's on each.
 *
 *   ‹  Next 7 days  ›                             3 open   [Mine]
 *   Sat, Nov 21
 *     8:30–10:00am  Setup · Pantry      (GO)(LL)·   2 of 3   [Take it]
 *     10:00–noon    Doors               (NL)···     1 of 4   [Take it]
 *   Fri, Nov 20
 *     3:00–5:00pm   Driver: orchard     (NL)        Full
 *
 * Anyone in the group takes a shift with one tap, and drops it the same way.
 * Dropping one in the next two days tells the group's organizers, so the
 * gap gets filled. The full page (↗) shows four weeks, adds shifts, and
 * copies a week's shifts to the next.
 *
 * Shifts you've taken also show on your dashboard under "Coming up".
 * Data: see shifts-data.js.
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatarStack } from '../../ui/avatar.js';
import { showToast } from '../../ui/toast.js';
import { notify } from '../../state/notifications.js';
import { getSpaceOfModule } from '../../state/store.js';
import { addDays, todayKey, formatShortDate, formatTime, fromDateKey, weekdayName, daysBetween } from '../../utils/dates.js';
import {
  createShift, shiftsBetween, byDay, takeShift, dropShift, copyWeek, isFullShift, openSpots,
} from './shifts-data.js';

const SHORT_NOTICE_DAYS = 2;

function timeRange(shift) {
  return `${formatTime(shift.start)}–${formatTime(shift.end)}`;
}
const dayLabel = (date) => `${weekdayName(fromDateKey(date).getDay(), true)}, ${formatShortDate(date)}`;

function renderShifts(container, context, { full }) {
  const me = context.currentUser;
  let weekStart = todayKey(); // the card shows the next 7 days; the full page the next 28
  let mineOnly = false;
  let adding = false;
  const weeks = full ? 4 : 1;
  const root = h('div', { class: `shifts${full ? ' shifts--page' : ''}` });

  function save(data) { context.saveData(data); draw(); }

  function take(shift) {
    save(takeShift(context.getData(), shift.id, me.id));
    showToast(`You’re on ${shift.role}, ${dayLabel(shift.date)} at ${formatTime(shift.start)}.`);
  }
  function drop(shift) {
    save(dropShift(context.getData(), shift.id, me.id));
    const soon = daysBetween(todayKey(), shift.date) <= SHORT_NOTICE_DAYS;
    if (soon) {
      const space = getSpaceOfModule(context.moduleId);
      const organizers = Object.entries(space?.roles ?? {}).filter(([, r]) => r === 'owner' || r === 'admin').map(([id]) => id);
      notify({ recipientIds: organizers, actorId: me.id, kind: 'shift', moduleId: context.moduleId, itemId: shift.id, text: `${me.name} dropped ${shift.role} on ${dayLabel(shift.date)} (${timeRange(shift)}). It’s open again.` });
    }
    showToast(soon ? 'Dropped. The organizers have been told, so someone can fill it.' : 'Dropped. It’s open for someone else now.');
  }

  function shiftRow(shift) {
    const mine = shift.memberIds.includes(me.id);
    const people = shift.memberIds.map(context.getMember).filter(Boolean);
    const isPast = shift.date < todayKey();
    return h('li', { class: `shifts__row${mine ? ' is-mine' : ''}${isFullShift(shift) ? ' is-full' : ''}` },
      h('span', { class: 'shifts__time' }, timeRange(shift)),
      h('span', { class: 'shifts__what' }, h('strong', {}, shift.role), shift.location ? h('span', { class: 'shifts__where' }, ` · ${shift.location}`) : null,
        shift.notes && full ? h('span', { class: 'shifts__notes' }, shift.notes) : null),
      h('span', { class: 'shifts__who' },
        people.length ? avatarStack(people, 22, 4) : null,
        h('span', { class: 'shifts__count', title: `${openSpots(shift)} open` }, `${shift.memberIds.length} of ${shift.spots}`)),
      context.isVisitor || isPast ? null
        : mine ? h('button', { type: 'button', class: 'button button--small', onClick: () => drop(shift) }, 'Drop')
          : isFullShift(shift) ? h('span', { class: 'shifts__full' }, 'Full')
            : h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => take(shift) }, 'Take it'));
  }

  function addForm() {
    const date = h('input', { type: 'date', class: 'input input--compact', value: addDays(weekStart, 6) >= todayKey() ? (todayKey() > weekStart ? todayKey() : weekStart) : todayKey(), 'aria-label': 'Date' });
    const start = h('input', { type: 'time', class: 'input input--compact', value: '09:00', 'aria-label': 'Starts' });
    const end = h('input', { type: 'time', class: 'input input--compact', value: '11:00', 'aria-label': 'Ends' });
    const role = h('input', { type: 'text', class: 'input input--compact', placeholder: 'What (e.g. Setup, Driver)', 'aria-label': 'What the shift is', required: true });
    const spots = h('input', { type: 'number', class: 'input input--compact shifts__spots', value: '2', min: '1', max: '99', 'aria-label': 'How many people' });
    const location = h('input', { type: 'text', class: 'input input--compact', placeholder: 'Where (optional)', 'aria-label': 'Where' });
    requestAnimationFrame(() => role.focus());
    return h('form', {
      class: 'shifts__add',
      onSubmit: (event) => {
        event.preventDefault();
        if (!role.value.trim()) { role.focus(); return; }
        if (end.value <= start.value) { showToast('The shift has to end after it starts.'); return; }
        const d = context.getData();
        save({ ...d, shifts: [...(d.shifts ?? []), createShift({ date: date.value, start: start.value, end: end.value, role: role.value.trim(), spots: spots.value, location: location.value.trim() })] });
        showToast('Shift added.');
      },
    },
    date, start, h('span', { 'aria-hidden': 'true' }, 'to'), end, role, spots, h('span', { class: 'shifts__unit' }, 'people'), location,
    h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Add'),
    h('button', { type: 'button', class: 'link-button', onClick: () => { adding = false; draw(); } }, 'Done'));
  }

  function draw() {
    const data = context.getData();
    const end = addDays(weekStart, 7 * weeks);
    let shifts = shiftsBetween(data, weekStart, end);
    const open = shifts.filter((s) => s.date >= todayKey()).reduce((n, s) => n + openSpots(s), 0);
    if (mineOnly) shifts = shifts.filter((s) => s.memberIds.includes(me.id));
    const days = byDay(shifts);
    const label = weekStart === todayKey() ? (weeks === 1 ? 'Next 7 days' : 'Next four weeks') : `${formatShortDate(weekStart)}–${formatShortDate(addDays(end, -1))}`;
    replaceChildren(root,
      h('div', { class: 'shifts__bar' },
        h('button', { type: 'button', class: 'icon-button', 'aria-label': weeks === 1 ? 'Previous week' : 'Earlier', onClick: () => { weekStart = addDays(weekStart, -7); draw(); } }, icon('chevronLeft', 16)),
        h('strong', { class: 'shifts__range' }, label),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': weeks === 1 ? 'Next week' : 'Later', onClick: () => { weekStart = addDays(weekStart, 7); draw(); } }, icon('chevronRight', 16)),
        open ? h('span', { class: 'shifts__open' }, `${open} open`) : null,
        h('button', { type: 'button', class: `chip feed-filters__chip shifts__mine${mineOnly ? ' is-on' : ''}`, 'aria-pressed': String(mineOnly), onClick: () => { mineOnly = !mineOnly; draw(); } }, 'Mine'),
        full && !context.isVisitor ? h('button', { type: 'button', class: 'button button--small', onClick: () => { adding = !adding; draw(); } }, icon('plus', 12), ' Add a shift') : null,
        full && !context.isVisitor ? h('button', {
          type: 'button', class: 'button button--small button--quiet', title: 'Copy the first 7 days of shifts shown to the 7 days after (nobody signed up yet)',
          onClick: () => { const { data: next, added } = copyWeek(context.getData(), weekStart); if (!added) { showToast('Nothing to copy: next week already has these shifts.'); return; } save(next); showToast(`Copied ${added} ${added === 1 ? 'shift' : 'shifts'} to the week of ${formatShortDate(addDays(weekStart, 7))}.`); },
        }, icon('repeat', 12), ' Copy to next week') : null),
      adding && full ? addForm() : null,
      days.size ? h('div', { class: 'shifts__days' }, [...days].map(([date, list]) => h('section', { class: `shifts__day${date === todayKey() ? ' is-today' : ''}${date < todayKey() ? ' is-past' : ''}` },
        h('h3', { class: 'shifts__date' }, date === todayKey() ? `Today · ${formatShortDate(date)}` : dayLabel(date)),
        h('ul', { class: 'shifts__list' }, list.map(shiftRow)))))
        : h('div', { class: 'empty-state empty-state--compact' },
          h('p', { class: 'empty-state__title' }, mineOnly ? 'You haven’t taken any shifts here yet.' : 'No shifts here yet.'),
          !mineOnly && !context.isVisitor ? (full
            ? h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => { adding = true; draw(); } }, 'Add the first shift')
            : h('button', { type: 'button', class: 'button button--small', onClick: () => context.openFullPage?.() }, 'Add shifts')) : null));
  }
  draw();
  replaceChildren(container, root);
}

export const shiftsModule = {
  type: 'shifts',
  label: 'Volunteer shifts',
  description: 'Shifts people take with one tap: who’s on, what’s open, and a heads-up when someone drops',
  icon: 'hand2',
  defaultSpan: 6,
  defaultRows: 13,
  available: true,
  spaceKinds: ['group'],
  createInitialData() { return { shifts: [] }; },
  render: (container, context) => renderShifts(container, context, { full: false }),
  renderFullPage: (container, context) => renderShifts(container, context, { full: true }),
  assignments: {
    items: (data) => data.shifts ?? [],
    isAssignedTo: (shift, memberId) => (shift.memberIds ?? []).includes(memberId),
    describe: (shift) => `${shift.role} · ${formatShortDate(shift.date)} ${formatTime(shift.start)}`,
  },
};
