/**
 * calendar-views.js — the four ways the full-page calendar can show events.
 *
 *   renderMonthView    a 6-week grid; each day lists its first few events
 *   renderTimeGrid     days side by side with an hour-by-hour column
 *                      (7 days = week view, 1 day = day view)
 *   renderAgendaView   a plain list of what's coming up, grouped by day
 *
 * Each function returns an element and talks back through callbacks:
 *   onOpenEvent(occurrence)     a click on an event
 *   onCreateAt(date, time)      a double-click on empty space (time is '' for all-day): add something there
 *   onTapEmpty(date, time)      a single click or tap on empty space (phones: go to that day); optional
 *   onShowDay(date)             a click on a day's number (month view)
 *
 * And, when given, the drag callbacks (like Google Calendar):
 *   onCreateRange(date, startTime, endTime)   drag down an empty column (week/day)
 *   onMoveEvent(occurrence, changes)          drag an event to another time or day,
 *                                              or drag its bottom edge to change its length;
 *                                              changes = { date, time, endTime } (week/day)
 *                                              or { dayDelta } (month)
 * Repeating events and events from other groups can't be dragged (open them
 * to change them).
 */

import { sourceLabel } from '../../ui/source-tag.js';
import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { trackPointer } from '../../ui/pointer-tracker.js';
import { onLongPress } from '../../ui/long-press.js';

/**
 * Dragging events (and drag-to-create) is for mouse and pen. On a touch
 * screen a finger on the calendar swipes to the next month or week, and a
 * tap opens the event, so dragging stays out of the way.
 */
function trackDrag(downEvent, handlers) {
  if (downEvent.pointerType === 'touch') return;
  trackPointer(downEvent, handlers);
}
import {
  todayKey, addDays, startOfWeek, startOfMonth, fromDateKey, weekdayName, formatLongDate, formatShortDate,
} from '../../utils/dates.js';
import {
  occurrencesBetween, occurrencesOn, assignLanes, timeRangeLabel, occurrenceTimeLabel, belongsInAllDayRow,
  colorValue, timeToMinutes, minutesToTime, durationMinutes,
} from './calendar-data.js';

/** How many events a month-view day shows before "+N more". */
const MONTH_DAY_EVENT_LIMIT = 3;

/** Height of one hour in the week and day views, in pixels (keep in sync with CSS). */
export const HOUR_HEIGHT_PX = 48;

/** Where the week and day views start scrolled to. */
const FIRST_VISIBLE_HOUR = 7;

/** Clicking an empty time slot snaps the new event to this many minutes. */
const SNAP_MINUTES = 30;

/** Dragging events snaps to this many minutes. */
const DRAG_SNAP_MINUTES = 15;

/** Can this event be dragged? Not repeating ones, nor ones from other groups. */
function isDraggable(event, onMoveEvent) {
  return Boolean(onMoveEvent) && event.repeat === 'none' && !event._link;
}

// ─── Shared pieces ───────────────────────────────────────────────────────────

/**
 * A small colored event "chip" used in the month view and all-day rows.
 * All-day and multi-day events are solid bands; on the 2nd+ day of a
 * multi-day event the title starts with "↳" to show it's continuing.
 */
function eventChip(occurrence, { onOpenEvent, selectedEventId }) {
  const { event, dayNumber, dayCount } = occurrence;
  const isSelected = event.id === selectedEventId;
  const isBand = event.allDay || dayCount > 1;
  const showStartTime = !event.allDay && dayNumber === 1;

  return h('button', {
    type: 'button',
    class: `event-chip${isBand ? ' event-chip--band' : ''}${isSelected ? ' is-selected' : ''}${event._link ? ' is-linked' : ''}`,
    style: { '--event-color': colorValue(event.color) },
    // Linked events (from a group, on a personal calendar) say where they're from.
    title: `${event.title} · ${timeRangeLabel(event)}${event._link ? ` · from ${event._link.spaceName}` : ''}`,
    onClick: (clickEvent) => {
      clickEvent.stopPropagation(); // Don't also create an event on the empty space behind it.
      onOpenEvent(occurrence);
    },
  },
    showStartTime ? h('span', { class: 'event-chip__time' }, formatStartTime(event.time)) : null,
    eventMark(event),
    h('span', { class: 'event-chip__title' }, dayNumber > 1 ? `↳ ${event.title}` : event.title),
  );
}

/**
 * A small ticket in front of events (gatherings with RSVPs), so they stand
 * out from plain calendar entries.
 */
function eventMark(event) {
  if (event.kind !== 'event') return null;
  return h('span', { class: 'event-mark', title: 'Event with RSVPs', 'aria-label': 'Event:' }, icon('ticket', 11));
}

/** '19:00' → '7:00' for compact labels (the am/pm is usually obvious in context). */
function formatStartTime(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')}`;
}

// ─── Month view ──────────────────────────────────────────────────────────────

export function renderMonthView({ anchorDate, events, selectedEventId, onOpenEvent, onCreateAt, onShowDay, onMoveEvent, onLongPressAt = null, onTapEmpty = null }) {
  const monthStart = startOfMonth(anchorDate);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = addDays(gridStart, 6 * 7 - 1); // Always 6 weeks, so the grid doesn't jump.
  const monthIndex = fromDateKey(monthStart).getMonth();

  const occurrences = occurrencesBetween(events, gridStart, gridEnd);
  const byDate = new Map();
  for (const occurrence of occurrences) {
    if (!byDate.has(occurrence.date)) byDate.set(occurrence.date, []);
    byDate.get(occurrence.date).push(occurrence);
  }

  const headerCells = [0, 1, 2, 3, 4, 5, 6].map((day) => h('div', { class: 'month-view__weekday' }, weekdayName(day, true)));

  const dayCells = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(gridStart, i);
    const dayOccurrences = byDate.get(date) ?? [];
    const shown = dayOccurrences.slice(0, MONTH_DAY_EVENT_LIMIT);
    const hiddenCount = dayOccurrences.length - shown.length;
    const isOtherMonth = fromDateKey(date).getMonth() !== monthIndex;

    const dayCell = h('div', {
      class: `month-view__day${isOtherMonth ? ' is-other-month' : ''}${date === todayKey() ? ' is-today' : ''}`,
      dataset: { date },
      title: 'Double-click to add an event',
      onClick: () => onTapEmpty?.(date, ''),
      onDblclick: (e) => { if (!e.target.closest?.('.event-chip, .month-view__more')) onCreateAt(date, ''); },
    },
      h('button', {
        type: 'button',
        class: 'month-view__date',
        'aria-label': `${formatLongDate(date)}: show day`,
        onClick: (clickEvent) => { clickEvent.stopPropagation(); onShowDay(date); },
      }, String(fromDateKey(date).getDate())),
      h('div', { class: 'month-view__events' },
        shown.map((occurrence) => withMonthDrag(eventChip(occurrence, { onOpenEvent, selectedEventId }), occurrence, onMoveEvent)),
        hiddenCount > 0
          ? h('button', {
              type: 'button',
              class: 'month-view__more',
              onClick: (clickEvent) => { clickEvent.stopPropagation(); onShowDay(date); },
            }, `+${hiddenCount} more`)
          : null,
      ),
    );
    // Phones: press and hold a day to add something on it.
    if (onLongPressAt) onLongPress(dayCell, () => onLongPressAt(date, ''), { shouldStart: (event) => !event.target.closest?.('.event-chip, .month-view__more') });
    dayCells.push(dayCell);
  }

  return h('div', { class: 'month-view' }, headerCells, dayCells);
}

/** Let a month-view chip be dragged onto another day. */
function withMonthDrag(chip, occurrence, onMoveEvent) {
  if (!isDraggable(occurrence.event, onMoveEvent)) return chip;
  chip.classList.add('is-draggable');
  chip.addEventListener('pointerdown', (downEvent) => {
    let ghost = null;
    let targetCell = null;
    trackDrag(downEvent, {
      onStart: () => {
        ghost = chip.cloneNode(true);
        ghost.classList.add('event-chip--ghost');
        ghost.style.width = `${chip.offsetWidth}px`;
        document.body.append(ghost);
        chip.classList.add('is-drag-source');
      },
      onMove: (point) => {
        ghost.style.transform = `translate(${point.x - 20}px, ${point.y - 10}px)`;
        const cell = document.elementFromPoint(point.x, point.y)?.closest('.month-view__day');
        if (cell !== targetCell) {
          targetCell?.classList.remove('is-drop-target');
          targetCell = cell;
          targetCell?.classList.add('is-drop-target');
        }
      },
      onEnd: () => {
        ghost.remove();
        chip.classList.remove('is-drag-source');
        targetCell?.classList.remove('is-drop-target');
        const date = targetCell?.dataset.date;
        if (date && date !== occurrence.date) onMoveEvent(occurrence, { dayDelta: daysBetweenKeys(occurrence.date, date) });
      },
      onCancel: () => {
        ghost.remove();
        chip.classList.remove('is-drag-source');
        targetCell?.classList.remove('is-drop-target');
      },
    });
  });
  return chip;
}

function daysBetweenKeys(from, to) {
  return Math.round((fromDateKey(to) - fromDateKey(from)) / (24 * 60 * 60 * 1000));
}

// ─── Week and day views ──────────────────────────────────────────────────────

/**
 * Days side by side, each with an all-day row on top and a 24-hour column
 * below. Timed events are placed by start time and sized by length;
 * overlapping events share the width (see assignLanes in calendar-data.js).
 */
export function renderTimeGrid({ days, events, selectedEventId, onOpenEvent, onCreateAt, onShowDay, onCreateRange, onMoveEvent, onLongPressAt = null, onTapEmpty = null }) {
  const columnTemplate = `56px repeat(${days.length}, minmax(0, 1fr))`;

  // Header: weekday + date for each column.
  const header = h('div', { class: 'time-grid__header', style: { gridTemplateColumns: columnTemplate } },
    h('div'),
    days.map((date) => h('button', {
      type: 'button',
      class: `time-grid__day-label${date === todayKey() ? ' is-today' : ''}`,
      onClick: () => onShowDay(date),
    },
      h('span', { class: 'time-grid__weekday' }, weekdayName(fromDateKey(date).getDay(), true)),
      h('span', { class: 'time-grid__date' }, String(fromDateKey(date).getDate())),
    )),
  );

  // All-day row.
  const allDayRow = h('div', { class: 'time-grid__all-day', style: { gridTemplateColumns: columnTemplate } },
    h('div', { class: 'time-grid__all-day-label' }, 'All day'),
    days.map((date) => {
      const cell = h('div', {
        class: 'time-grid__all-day-cell',
        title: 'Double-click to add an all-day entry',
        onClick: () => onTapEmpty?.(date, ''),
        onDblclick: (e) => { if (!e.target.closest?.('.event-chip')) onCreateAt(date, ''); },
      }, occurrencesOn(events, date)
        .filter(belongsInAllDayRow)
        .map((occurrence) => eventChip(occurrence, { onOpenEvent, selectedEventId })));
      if (onLongPressAt) onLongPress(cell, () => onLongPressAt(date, ''), { shouldStart: (event) => !event.target.closest?.('.event-chip') });
      return cell;
    }),
  );

  // Hour labels down the left side.
  const hourLabels = h('div', { class: 'time-grid__hours' },
    Array.from({ length: 24 }, (_, hour) => h('div', { class: 'time-grid__hour-label', style: { height: `${HOUR_HEIGHT_PX}px` } },
      hour === 0 ? '' : hourLabel(hour))));

  // One column per day with its timed events.
  const dayColumns = days.map((date) => renderDayColumn(date, { events, selectedEventId, onOpenEvent, onCreateAt, onCreateRange, onMoveEvent, onLongPressAt, onTapEmpty }));

  const body = h('div', { class: 'time-grid__body', style: { gridTemplateColumns: columnTemplate } }, hourLabels, dayColumns);
  const scroller = h('div', { class: 'time-grid__scroller' }, body);

  // Start scrolled to the morning, not midnight.
  requestAnimationFrame(() => { scroller.scrollTop = FIRST_VISIBLE_HOUR * HOUR_HEIGHT_PX; });

  return h('div', { class: `time-grid time-grid--${days.length === 1 ? 'day' : 'week'}` }, header, allDayRow, scroller);
}

function renderDayColumn(date, { events, selectedEventId, onOpenEvent, onCreateAt, onCreateRange, onMoveEvent, onLongPressAt = null, onTapEmpty = null }) {
  // Multi-day events are drawn in the all-day row instead (see belongsInAllDayRow).
  const timed = occurrencesOn(events, date).filter((o) => !belongsInAllDayRow(o));
  const column = h('div', {
    class: `time-grid__column${date === todayKey() ? ' is-today' : ''}`,
    style: { height: `${24 * HOUR_HEIGHT_PX}px` },
    dataset: { date },
    title: onCreateRange ? 'Double-click to add an event, or drag to choose the time' : 'Double-click to add an event',
    // Turn the click's height into a time, snapped to the nearest half hour.
    onClick: (clickEvent) => { if (clickEvent.target === column) onTapEmpty?.(date, timeAtClick(clickEvent)); },
    onDblclick: (clickEvent) => { if (clickEvent.target === column) onCreateAt(date, timeAtClick(clickEvent)); },
  });

  function timeAtClick(clickEvent) {
    const offsetY = clickEvent.clientY - column.getBoundingClientRect().top;
    return minutesToTime(Math.floor((offsetY / HOUR_HEIGHT_PX) * 60 / SNAP_MINUTES) * SNAP_MINUTES);
  }

  if (onCreateRange) column.addEventListener('pointerdown', (downEvent) => startCreateDrag(downEvent, column, date, onCreateRange));
  // Phones: press and hold a time to add something then (snapped to the half hour).
  if (onLongPressAt) {
    onLongPress(column, (point) => {
      const minutes = Math.floor((((point.y - column.getBoundingClientRect().top) / HOUR_HEIGHT_PX) * 60) / SNAP_MINUTES) * SNAP_MINUTES;
      onLongPressAt(date, minutesToTime(Math.max(0, Math.min(minutes, 24 * 60 - SNAP_MINUTES))));
    }, { shouldStart: (event) => event.target === column });
  }

  for (const { lane, laneCount, end, ...occurrence } of assignLanes(timed)) {
    const { event } = occurrence;
    const top = (timeToMinutes(event.time) / 60) * HOUR_HEIGHT_PX;
    const height = Math.max(20, (durationMinutes(event) / 60) * HOUR_HEIGHT_PX - 2);
    const isSelected = event.id === selectedEventId;
    const draggable = isDraggable(event, onMoveEvent);

    const block = h('button', {
      type: 'button',
      class: `time-grid__event${isSelected ? ' is-selected' : ''}${draggable ? ' is-draggable' : ''}`,
      style: {
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${(lane / laneCount) * 100}% + 2px)`,
        width: `calc(${100 / laneCount}% - 4px)`,
        '--event-color': colorValue(event.color),
      },
      onClick: (clickEvent) => {
        clickEvent.stopPropagation();
        onOpenEvent(occurrence);
      },
    },
      h('span', { class: 'time-grid__event-title' }, eventMark(event), event.title),
      h('span', { class: 'time-grid__event-time' }, timeRangeLabel(event)),
      event.location && height > 50 ? h('span', { class: 'time-grid__event-time' }, event.location) : null,
      draggable ? h('span', { class: 'time-grid__resize', 'aria-hidden': 'true', title: 'Drag to change the end time' }) : null,
    );
    if (draggable) {
      block.addEventListener('pointerdown', (downEvent) => {
        downEvent.stopPropagation(); // not a "create" drag on the column underneath
        startEventDrag(downEvent, block, occurrence, onMoveEvent, downEvent.target.classList.contains('time-grid__resize'));
      });
    }
    column.append(block);
  }

  // A red line at the current time, on today's column.
  if (date === todayKey()) {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    column.append(h('div', { class: 'time-grid__now', style: { top: `${(minutes / 60) * HOUR_HEIGHT_PX}px` }, 'aria-hidden': 'true' }));
  }

  return column;
}

// ─── Dragging in the week and day views ──────────────────────────────────────

/** Minutes from the top of a day column to a point, snapped. */
function minutesAt(column, clientY, snap = DRAG_SNAP_MINUTES) {
  const offset = clientY - column.getBoundingClientRect().top;
  const minutes = Math.round(((offset / HOUR_HEIGHT_PX) * 60) / snap) * snap;
  return Math.max(0, Math.min(24 * 60, minutes));
}

/** Drag down an empty column to choose a new event's start and end. */
function startCreateDrag(downEvent, column, date, onCreateRange) {
  if (downEvent.target !== column) return; // started on an event or the now-line
  const startMinutes = minutesAt(column, downEvent.clientY);
  let endMinutes = startMinutes;
  let preview = null;

  const drawPreview = () => {
    const from = Math.min(startMinutes, endMinutes);
    const to = Math.max(startMinutes, endMinutes, from + DRAG_SNAP_MINUTES);
    preview.style.top = `${(from / 60) * HOUR_HEIGHT_PX}px`;
    preview.style.height = `${((to - from) / 60) * HOUR_HEIGHT_PX}px`;
    preview.textContent = `${formatClock(from)} – ${formatClock(to)}`;
  };

  trackDrag(downEvent, {
    onStart: () => {
      preview = h('div', { class: 'time-grid__draft', 'aria-hidden': 'true' });
      column.append(preview);
      drawPreview();
    },
    onMove: (point) => {
      endMinutes = minutesAt(column, point.y);
      drawPreview();
    },
    onEnd: () => {
      preview.remove();
      const from = Math.min(startMinutes, endMinutes);
      const to = Math.max(startMinutes, endMinutes, from + DRAG_SNAP_MINUTES);
      onCreateRange(date, minutesToTime(from), minutesToTime(Math.min(to, 24 * 60 - 1)));
    },
    onCancel: () => preview?.remove(),
  });
}

/**
 * Drag an event to a new time (and, in week view, another day), or drag
 * its bottom edge (`isResize`) to change when it ends.
 */
function startEventDrag(downEvent, block, occurrence, onMoveEvent, isResize) {
  const { event } = occurrence;
  const startMinutes = timeToMinutes(event.time);
  const length = durationMinutes(event);
  const grabOffset = downEvent.clientY - block.getBoundingClientRect().top;
  let result = null;

  trackDrag(downEvent, {
    threshold: 3,
    onStart: () => block.classList.add('is-dragging'),
    onMove: (point) => {
      const column = isResize
        ? block.parentElement
        : document.elementFromPoint(point.x, point.y)?.closest('.time-grid__column') ?? block.parentElement;
      if (isResize) {
        const end = Math.max(startMinutes + DRAG_SNAP_MINUTES, minutesAt(column, point.y));
        block.style.height = `${((end - startMinutes) / 60) * HOUR_HEIGHT_PX - 2}px`;
        result = { date: occurrence.date, time: event.time, endTime: minutesToTime(Math.min(end, 24 * 60 - 1)) };
      } else {
        if (column !== block.parentElement) column.append(block); // moved to another day
        const start = Math.max(0, Math.min(24 * 60 - length, minutesAt(column, point.y - grabOffset)));
        block.style.top = `${(start / 60) * HOUR_HEIGHT_PX}px`;
        result = { date: column.dataset.date, time: minutesToTime(start), endTime: minutesToTime(start + length) };
      }
      block.querySelector('.time-grid__event-time').textContent = `${formatClock(timeToMinutes(result.time))} – ${formatClock(timeToMinutes(result.endTime))}`;
    },
    onEnd: () => {
      block.classList.remove('is-dragging');
      if (result && (result.date !== occurrence.date || result.time !== event.time || result.endTime !== event.endTime)) {
        onMoveEvent(occurrence, result);
      } else {
        onMoveEvent(occurrence, null); // nothing changed: just redraw
      }
    },
    onCancel: () => onMoveEvent(occurrence, null),
  });
}

/** 1170 → '7:30pm' */
function formatClock(minutes) {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hours % 12 || 12}:${String(mins).padStart(2, '0')}${hours >= 12 ? 'pm' : 'am'}`;
}

/** 13 → '1pm' */
function hourLabel(hour) {
  const suffix = hour >= 12 ? 'pm' : 'am';
  return `${hour % 12 || 12}${suffix}`;
}

// ─── Agenda view ─────────────────────────────────────────────────────────────

/** Everything from `startDate` for `daysAhead` days, as a list grouped by day. */
export function renderAgendaView({ startDate, daysAhead, events, selectedEventId, onOpenEvent, getMember, currentUserId }) {
  const occurrences = occurrencesBetween(events, startDate, addDays(startDate, daysAhead));

  if (occurrences.length === 0) {
    return h('div', { class: 'agenda-view' }, h('p', { class: 'agenda-view__empty' }, 'Nothing scheduled.'));
  }

  const groups = [];
  for (const occurrence of occurrences) {
    const last = groups[groups.length - 1];
    if (last && last.date === occurrence.date) last.items.push(occurrence);
    else groups.push({ date: occurrence.date, items: [occurrence] });
  }

  return h('div', { class: 'agenda-view' }, groups.map(({ date, items }) => h('section', { class: 'agenda-view__day' },
    h('h2', { class: `agenda-view__date${date === todayKey() ? ' is-today' : ''}` },
      date === todayKey() ? `Today · ${formatShortDate(date)}` : formatLongDate(date)),
    items.map((occurrence) => {
      const { event, dayCount } = occurrence;
      // "with Anna, Tino": the other people going (you're implied).
      const attendees = event.attendeeIds
        .filter((id) => id !== currentUserId)
        .map(getMember).filter(Boolean).map((m) => m.name.split(' ')[0]);
      const meta = [
        dayCount > 1 ? timeRangeLabel(event) : '', // The full span, for multi-day events.
        event.location,
        attendees.length ? `with ${attendees.join(', ')}` : '',
      ].filter(Boolean).join(' · ');
      return h('button', {
        type: 'button',
        class: `agenda-view__event${event.id === selectedEventId ? ' is-selected' : ''}`,
        style: { '--event-color': colorValue(event.color) },
        onClick: () => onOpenEvent(occurrence),
      },
        h('span', { class: 'agenda-view__time' }, occurrenceTimeLabel(occurrence)),
        h('span', { class: 'agenda-view__text' },
          h('span', { class: 'agenda-view__title' }, eventMark(event), event.title, event.repeat !== 'none' ? ' ↻' : '', event._link ? [' ', sourceLabel(event._link)] : null),
          meta ? h('span', { class: 'agenda-view__meta' }, meta) : null,
        ),
      );
    }),
  )));
}
