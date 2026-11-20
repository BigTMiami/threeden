// @ts-check
/**
 * shifts-module.js — Shifts: a week of shifts, and who's on each.
 * (Called "Volunteer shifts" until Nov 20.)
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
 * Click a shift to open it (Nov 20): its notes, where, who's on, and
 * whether it repeats; Edit changes any of it, including Repeat (every week,
 * every 2 weeks, or every month, until a date or not). Editing one date of
 * a repeating shift asks whether to change just it or it and the later ones.
 *
 * Shifts you've taken show on your homepage calendar (linked-items.js) and
 * your dashboard under "Coming up".
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
  findShift, seriesOf, updateShift, deleteShift, setRepeat, extendSeries, REPEATS, repeatLabel,
} from './shifts-data.js';

const SHORT_NOTICE_DAYS = 2;
/**
 * The shift opened in each Shifts module (card and page share it), kept
 * across redraws; and a date each view should jump to once (an opened
 * shift's week). The card behind a module page can take a focus request
 * before the page does, so it's handed on to both.
 */
const openShifts = new Map();
const weekShown = new Map();
const jumpTo = new Map();

function timeRange(shift) {
  return `${formatTime(shift.start)}–${formatTime(shift.end)}`;
}
const dayLabel = (date) => `${weekdayName(fromDateKey(date).getDay(), true)}, ${formatShortDate(date)}`;

function renderShifts(container, context, { full }) {
  const me = context.currentUser;
  const key = `${context.moduleId}:${full ? 'page' : 'card'}`;
  let weekStart = weekShown.get(key) ?? todayKey(); // the card shows the next 7 days; the full page the next 28
  let mineOnly = false;
  let adding = false;
  let editingId = null; // the shift being edited
  const weeks = full ? 4 : 1;
  // Opened from somewhere else (your calendar, a notification): open that shift, on its week.
  const focus = context.takeFocusRequest?.();
  const focused = focus ? findShift(context.getData(), focus) : null;
  if (focused) {
    openShifts.set(context.moduleId, focused.id);
    jumpTo.set(`${context.moduleId}:card`, focused.date);
    jumpTo.set(`${context.moduleId}:page`, focused.date);
  }
  let openId = openShifts.get(context.moduleId) ?? null; // the shift opened to show its details
  const jump = jumpTo.get(key);
  if (jump) {
    jumpTo.delete(key);
    if (jump < weekStart || jump >= addDays(weekStart, 7 * weeks)) weekStart = jump;
  }
  const root = h('div', { class: `shifts${full ? ' shifts--page' : ''}` });

  function save(data) { context.saveData(data); draw(); }

  function take(shift) {
    save(takeShift(context.getData(), shift.id, me.id));
    showToast(`You’re on ${shift.role}, ${dayLabel(shift.date)} at ${formatTime(shift.start)}. It’s on your calendar.`);
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
    const isOpen = openId === shift.id;
    const repeats = seriesOf(context.getData(), shift);
    return h('li', { class: `shifts__row${mine ? ' is-mine' : ''}${isFullShift(shift) ? ' is-full' : ''}${isOpen ? ' is-open' : ''}`, 'data-shift-id': shift.id },
      h('button', {
        type: 'button', class: 'shifts__open-button', 'aria-expanded': String(isOpen), title: isOpen ? 'Close' : 'Open this shift',
        onClick: () => { openId = isOpen ? null : shift.id; editingId = null; draw(); },
      },
      h('span', { class: 'shifts__time' }, timeRange(shift), repeats ? h('span', { class: 'shifts__repeat', title: repeatLabel(repeats.every) }, ' ↻') : null),
      h('span', { class: 'shifts__what' }, h('strong', {}, shift.role), shift.location ? h('span', { class: 'shifts__where' }, ` · ${shift.location}`) : null,
        shift.notes && !isOpen ? h('span', { class: 'shifts__note-mark', title: 'Has notes' }, ' ', icon('note', 11)) : null)),
      h('span', { class: 'shifts__who' },
        people.length ? avatarStack(people, 22, 4) : null,
        h('span', { class: 'shifts__count', title: `${openSpots(shift)} open` }, `${shift.memberIds.length} of ${shift.spots}`)),
      h('span', { class: 'shifts__act' }, context.isVisitor || isPast ? null
        : mine ? h('button', { type: 'button', class: 'button button--small', onClick: () => drop(shift) }, 'Drop')
          : isFullShift(shift) ? h('span', { class: 'shifts__full' }, 'Full')
            : h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => take(shift) }, 'Take it')),
      isOpen ? (editingId === shift.id ? editForm(shift) : details(shift, people, repeats)) : null);
  }

  //   Notes: Ask for Dale at the barn. About 25 crates.
  //   Fri, Nov 27 · 3:00–5:00pm · Van · Repeats every week
  //   On it: Nora Lund (1 of 1)
  //   [Edit]
  function details(shift, people, repeats) {
    const canEdit = !context.isVisitor;
    return h('div', { class: 'shifts__details' },
      shift.notes
        ? h('p', { class: 'shifts__notes' }, shift.notes)
        : h('p', { class: 'shifts__notes is-empty' }, 'No notes yet.'),
      h('p', { class: 'shifts__meta' }, [dayLabel(shift.date), timeRange(shift), shift.location, repeats ? `Repeats ${repeatLabel(repeats.every).toLowerCase()}${repeats.until ? ` until ${formatShortDate(repeats.until)}` : ''}` : null].filter(Boolean).join(' · ')),
      h('p', { class: 'shifts__meta' }, people.length ? `On it: ${people.map((p) => p.name).join(', ')}` : 'Nobody’s on it yet.', ` (${shift.memberIds.length} of ${shift.spots})`),
      canEdit ? h('div', { class: 'form-row' },
        h('button', { type: 'button', class: 'button button--small', onClick: () => { editingId = shift.id; draw(); } }, icon('pencil', 12), ' Edit'),
        !shift.notes ? h('button', { type: 'button', class: 'link-button', onClick: () => { editingId = shift.id; draw(); requestAnimationFrame(() => root.querySelector('.shifts__edit textarea')?.focus()); } }, 'Add notes') : null) : null);
  }

  /** Edit one shift: when, what, where, notes, and Repeat. */
  function editForm(shift) {
    const data = context.getData();
    const series = seriesOf(data, shift);
    const field = (label, input) => h('label', { class: 'shifts__field' }, h('span', {}, label), input);
    const date = h('input', { type: 'date', class: 'input input--compact', value: shift.date, 'aria-label': 'Date' });
    const start = h('input', { type: 'time', class: 'input input--compact', value: shift.start, 'aria-label': 'Starts' });
    const end = h('input', { type: 'time', class: 'input input--compact', value: shift.end, 'aria-label': 'Ends' });
    const role = h('input', { type: 'text', class: 'input input--compact', value: shift.role, 'aria-label': 'What the shift is', required: true });
    const spots = h('input', { type: 'number', class: 'input input--compact shifts__spots', value: String(shift.spots), min: '1', max: '99', 'aria-label': 'How many people' });
    const location = h('input', { type: 'text', class: 'input input--compact', value: shift.location, placeholder: 'Where (optional)', 'aria-label': 'Where' });
    const notes = h('textarea', { class: 'input shifts__notes-input', rows: '3', placeholder: 'What to bring, who to ask for, where to park…', 'aria-label': 'Notes' }, shift.notes);
    const repeat = h('select', { class: 'input input--compact', 'aria-label': 'Repeat' }, REPEATS.map(([value, label]) => h('option', { value, selected: (series?.every ?? 'none') === value }, label)));
    const until = h('input', { type: 'date', class: 'input input--compact', value: series?.until ?? '', 'aria-label': 'Repeat until' });
    const untilField = field('Until (optional)', until);
    const scope = series ? h('select', { class: 'input input--compact', 'aria-label': 'Change which' },
      h('option', { value: 'later' }, 'This and later ones'), h('option', { value: 'one' }, 'Just this one')) : null;
    const showUntil = () => { untilField.hidden = repeat.value === 'none'; };
    repeat.addEventListener('change', showUntil);
    showUntil();
    requestAnimationFrame(() => role.focus());
    return h('form', {
      class: 'shifts__edit',
      onSubmit: (event) => {
        event.preventDefault();
        if (!role.value.trim()) { role.focus(); return; }
        if (end.value <= start.value) { showToast('The shift has to end after it starts.'); return; }
        if (repeat.value !== 'none' && until.value && until.value < date.value) { showToast('“Until” has to be after the shift.'); return; }
        const which = scope?.value ?? 'one';
        let next = updateShift(context.getData(), shift.id, { date: date.value, start: start.value, end: end.value, role: role.value.trim(), spots: spots.value, location: location.value.trim(), notes: notes.value.trim() }, { scope: which });
        const before = series ? `${series.every}|${series.until}` : 'none|';
        const after = repeat.value === 'none' ? 'none|' : `${repeat.value}|${until.value}`;
        if (before !== after) next = setRepeat(next, shift.id, repeat.value, repeat.value === 'none' ? '' : until.value, todayKey());
        editingId = null;
        save(next);
        showToast(before !== after
          ? (repeat.value === 'none' ? 'Saved. It doesn’t repeat now.' : `Saved. It repeats ${repeatLabel(repeat.value).toLowerCase()}.`)
          : which === 'later' ? 'Saved this and the later ones.' : 'Shift saved.');
      },
    },
    h('div', { class: 'shifts__edit-row' }, field('Date', date), field('Starts', start), field('Ends', end)),
    h('div', { class: 'shifts__edit-row' }, field('What', role), field('People', spots), field('Where', location)),
    field('Notes', notes),
    h('div', { class: 'shifts__edit-row' }, field('Repeat', repeat), untilField, scope ? field('Change', scope) : null),
    h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Save'),
      h('button', { type: 'button', class: 'button button--small', onClick: () => { editingId = null; draw(); } }, 'Cancel'),
      h('button', {
        type: 'button', class: 'link-button link-button--danger', style: { marginLeft: 'auto' },
        onClick: () => {
          const which = scope?.value ?? 'one';
          openId = null; editingId = null;
          save(deleteShift(context.getData(), shift.id, { scope: which }));
          showToast(which === 'later' ? 'Deleted this and the later ones.' : 'Shift deleted.');
        },
      }, series ? 'Delete' : 'Delete shift')));
  }

  function addForm() {
    const date = h('input', { type: 'date', class: 'input input--compact', value: addDays(weekStart, 6) >= todayKey() ? (todayKey() > weekStart ? todayKey() : weekStart) : todayKey(), 'aria-label': 'Date' });
    const start = h('input', { type: 'time', class: 'input input--compact', value: '09:00', 'aria-label': 'Starts' });
    const end = h('input', { type: 'time', class: 'input input--compact', value: '11:00', 'aria-label': 'Ends' });
    const role = h('input', { type: 'text', class: 'input input--compact', placeholder: 'What (e.g. Setup, Driver)', 'aria-label': 'What the shift is', required: true });
    const spots = h('input', { type: 'number', class: 'input input--compact shifts__spots', value: '2', min: '1', max: '99', 'aria-label': 'How many people' });
    const location = h('input', { type: 'text', class: 'input input--compact', placeholder: 'Where (optional)', 'aria-label': 'Where' });
    const notes = h('input', { type: 'text', class: 'input input--compact shifts__add-notes', placeholder: 'Notes (optional)', 'aria-label': 'Notes' });
    const repeat = h('select', { class: 'input input--compact', 'aria-label': 'Repeat' }, REPEATS.map(([value, label]) => h('option', { value }, label)));
    requestAnimationFrame(() => role.focus());
    return h('form', {
      class: 'shifts__add',
      onSubmit: (event) => {
        event.preventDefault();
        if (!role.value.trim()) { role.focus(); return; }
        if (end.value <= start.value) { showToast('The shift has to end after it starts.'); return; }
        const d = context.getData();
        const made = createShift({ date: date.value, start: start.value, end: end.value, role: role.value.trim(), spots: spots.value, location: location.value.trim(), notes: notes.value.trim(), createdBy: me.id });
        let next = { ...d, shifts: [...(d.shifts ?? []), made] };
        if (repeat.value !== 'none') next = setRepeat(next, made.id, repeat.value, '', todayKey());
        save(next);
        showToast(repeat.value !== 'none' ? `Shift added. It repeats ${repeatLabel(repeat.value).toLowerCase()}.` : 'Shift added.');
      },
    },
    date, start, h('span', { 'aria-hidden': 'true' }, 'to'), end, role, spots, h('span', { class: 'shifts__unit' }, 'people'), location, notes, repeat,
    h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Add'),
    h('button', { type: 'button', class: 'link-button', onClick: () => { adding = false; draw(); } }, 'Done'));
  }

  function draw() {
    openShifts.set(context.moduleId, openId);
    weekShown.set(key, weekStart);
    let data = context.getData();
    // Repeating shifts: make dates as they come into range (eight weeks ahead).
    if (!context.isVisitor && data.series) {
      const topped = extendSeries(data, todayKey());
      if (topped.added) { context.saveData(topped.data); data = topped.data; }
    }
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
  label: 'Shifts',
  description: 'Shifts people take with one tap: who’s on, what’s open, notes, repeating shifts, and a heads-up when someone drops',
  icon: 'hand2',
  defaultSpan: 6,
  defaultRows: 13,
  available: true,
  spaceKinds: ['group'],
  createInitialData() { return { shifts: [], series: {} }; },
  render: (container, context) => renderShifts(container, context, { full: false }),
  renderFullPage: (container, context) => renderShifts(container, context, { full: true }),
  assignments: {
    items: (data) => data.shifts ?? [],
    isAssignedTo: (shift, memberId) => (shift.memberIds ?? []).includes(memberId),
    describe: (shift) => `${shift.role} · ${formatShortDate(shift.date)} ${formatTime(shift.start)}`,
  },
};
