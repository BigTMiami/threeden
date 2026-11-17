/**
 * calendar-card.js — the calendar as it appears on the homepage.
 *
 * A compact month grid (days with events get a dot), the selected day's
 * events, and the next few coming up. The "+" button in the top row opens
 * a small form for adding an event; that row stays pinned while the card
 * scrolls, so it's always within reach. Week and day views, repeating
 * events, attendees and full editing live in the full page,
 * calendar-page.js.
 *
 * The month being shown and the selected day are view settings, not saved.
 *
 * On a personal homepage, group events you're attending show here too,
 * labeled with their group (see js/editor/linked-items.js). Clicking one
 * opens it in the group's calendar.
 */

import { onSwipe, slideIn } from '../../ui/swipe.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { toDateKey, todayKey, monthName, formatShortDate, addDays } from '../../utils/dates.js';
import {
  NEW_EVENT, normalizeEvent, createEvent, canSeeEvent, occurrencesBetween, occurrencesOn, occurrenceTimeLabel, colorValue,
  addMinutesToTime, DEFAULT_EVENT_LENGTH_MINUTES,
} from './calendar-data.js';
import { sourceLabel } from '../../ui/source-tag.js';
import { applyRsvp } from './calendar-data.js';
import { updateEvent, findEvent } from '../../state/events.js';
import { openEventOverlay } from '../../ui/item-overlay.js';
import { rsvpButtons } from '../../events/rsvp.js';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const UPCOMING_LIMIT = 4;
const UPCOMING_LOOKAHEAD_DAYS = 90;

export function renderCalendarCard(container, context) {
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth(); // 0 = January
  let selectedDate = todayKey();

  const monthHeader = h('div', { class: 'calendar__month-header' });
  const monthGrid = h('div', { class: 'calendar__grid', role: 'grid' });
  onSwipe(monthGrid, { onNext: () => { changeMonth(+1); slideIn(monthGrid, 1); }, onPrevious: () => { changeMonth(-1); slideIn(monthGrid, -1); } });
  const eventList = h('div', { class: 'calendar__events' });
  // Visiting a group's public tab: only its public events, and no adding.
  // Outsiders on a public tab see public events only (not members looking at a shared calendar).
  const publicOnly = context.isVisitor && context.spaceKind === 'group' && !context.sharedFrom;

  // Your events, plus (personal homepage) group events you're attending.
  const events = () => [
    ...context.getData().events.map(normalizeEvent).filter((event) => canSeeEvent(event, context.currentUser.id, { publicOnly })),
    ...context.getLinkedItems().map((link) => ({ ...normalizeEvent(link.item), _link: link })),
  ];

  function update(changeFn) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    redraw();
  }

  function redraw() {
    drawMonthHeader();
    drawMonthGrid();
    drawEventList();
  }

  // ─── Month navigation ──────────────────────────────────────────────────────

  function changeMonth(step) {
    viewMonth += step;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    redraw();
  }

  //   ‹  November 2026  ›                      [+]
  function drawMonthHeader() {
    replaceChildren(monthHeader,
      h('div', { class: 'calendar__month-nav' },
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Previous month', onClick: () => changeMonth(-1) }, icon('chevronLeft', 16)),
        h('span', { class: 'calendar__month-name' }, `${monthName(viewMonth)} ${viewYear}`),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Next month', onClick: () => changeMonth(+1) }, icon('chevronRight', 16)),
      ),
      context.isVisitor ? null : addButton,
    );
  }

  // ─── Month grid ────────────────────────────────────────────────────────────

  function drawMonthGrid() {
    const firstOfMonth = toDateKey(new Date(viewYear, viewMonth, 1));
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const lastOfMonth = addDays(firstOfMonth, daysInMonth - 1);
    const datesWithEvents = new Set(occurrencesBetween(events(), firstOfMonth, lastOfMonth).map((o) => o.date));
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();

    const cells = WEEKDAY_LABELS.map((label) => h('span', { class: 'calendar__weekday', 'aria-hidden': 'true' }, label));

    // Blank cells before the 1st, so it lands on the right weekday.
    for (let i = 0; i < firstWeekday; i++) cells.push(h('span', {}));

    for (let day = 1; day <= daysInMonth; day++) {
      const key = addDays(firstOfMonth, day - 1);
      const hasEvents = datesWithEvents.has(key);
      const classes = ['calendar__day'];
      if (key === todayKey()) classes.push('is-today');
      if (key === selectedDate) classes.push('is-selected');
      if (hasEvents) classes.push('has-events');

      cells.push(h('button', {
        type: 'button',
        class: classes.join(' '),
        'aria-label': `${monthName(viewMonth)} ${day}${hasEvents ? ', has events' : ''}`,
        'aria-pressed': String(key === selectedDate),
        onClick: () => {
          selectedDate = key;
          dateInput.value = key;
          redraw();
        },
      }, String(day)));
    }

    replaceChildren(monthGrid, cells);
  }

  // ─── Event list ────────────────────────────────────────────────────────────

  function drawEventList() {
    const all = events();
    const onSelectedDay = occurrencesOn(all, selectedDate);
    // "Coming up" lists each event once, on the day it starts.
    const upcoming = occurrencesBetween(all, addDays(selectedDate, 1), addDays(selectedDate, UPCOMING_LOOKAHEAD_DAYS))
      .filter((occurrence) => occurrence.dayNumber === 1)
      .slice(0, UPCOMING_LIMIT);

    replaceChildren(eventList,
      h('h3', { class: 'calendar__list-title' }, formatShortDate(selectedDate)),
      onSelectedDay.length
        ? onSelectedDay.map(renderOccurrence)
        : h('p', { class: 'module-empty' }, 'No events this day.'),
      upcoming.length ? h('h3', { class: 'calendar__list-title' }, 'Coming up') : null,
      upcoming.map((occurrence) => renderOccurrence(occurrence, { withRsvp: true })),
    );
  }

  function renderOccurrence(occurrence, { withRsvp = false } = {}) {
    const { event, date } = occurrence;
    const details = [occurrenceTimeLabel(occurrence), event.location].filter(Boolean).join(' · ');
    // Clicking an event opens it over the page: details, RSVP, and a way to
    // the full calendar (a group's, for a linked event). item-overlay.js
    const me = context.currentUser;
    const open = () => openEventOverlay(event, {
      getEvent: () => findEvent(event.id)?.event ?? event,
      me, getMember: context.getMember, date,
      onRsvp: (answer) => { updateEvent(event.id, (saved) => applyRsvp(saved, me.id, answer)); if (answer === 'going') showToast(`You're going to "${event.title}".`); redraw(); },
      onEdit: !event._link && !context.isVisitor ? () => context.openFullPage(event.id) : null,
      onOpenFull: event._link ? () => context.openLinkedItem(event._link) : () => context.openFullPage(event.id),
      where: event._link ? event._link.spaceName : 'the full calendar',
    });
    const row = h('button', { type: 'button', class: 'calendar-event', title: 'Open this event', onClick: open },
      h('span', { class: 'calendar-event__date' },
        h('span', { class: 'calendar-event__dot', style: { background: colorValue(event.color) }, 'aria-hidden': 'true' }),
        formatShortDate(date)),
      h('span', { class: 'calendar-event__text' },
        h('span', { class: 'calendar-event__title' }, event.kind === 'event' ? h('span', { class: 'event-mark', title: 'Event with RSVPs' }, icon('ticket', 11)) : null, event.title, event.repeat !== 'none' ? h('span', { class: 'calendar-event__repeat', title: 'Repeats' }, ' ↻') : null),
        details ? h('span', { class: 'calendar-event__details' }, details) : null,
        event._link ? sourceLabel(event._link) : null,
      ),
    );
    // Events (not plain entries) get Going / Maybe / Can't go right here,
    // so answering doesn't take a trip to the event page.
    if (!withRsvp || event.kind !== 'event') return row;
    return h('div', { class: 'calendar-event-wrap' },
      row,
      rsvpButtons(event, me.id, (answer) => {
        updateEvent(event.id, (saved) => applyRsvp(saved, me.id, answer));
        if (answer === 'going') showToast(`You're going to "${event.title}".`);
        redraw();
      }, { compact: true }));
  }

  // ─── Quick add form ────────────────────────────────────────────────────────

  const titleInput = h('input', { type: 'text', class: 'input', placeholder: 'What is it?', 'aria-label': 'Name' });
  const dateInput = h('input', { type: 'date', class: 'input input--compact', value: selectedDate, 'aria-label': 'Date' });
  const timeInput = h('input', { type: 'time', class: 'input input--compact', 'aria-label': 'Time (leave empty for all day)', title: 'Leave empty for an all-day event' });
  const locationInput = h('input', { type: 'text', class: 'input', placeholder: 'Location (optional)', 'aria-label': 'Location' });
  const errorText = h('p', { class: 'form-error', role: 'alert' });

  const addButton = h('button', {
    type: 'button',
    class: 'calendar__add-button',
    'aria-label': 'Add to the calendar',
    'aria-expanded': 'false',
    title: 'Add to the calendar',
    onClick: () => setFormOpen(form.hidden),
  }, icon('plus', 16));

  function setFormOpen(isOpen) {
    form.hidden = !isOpen;
    addButton.setAttribute('aria-expanded', String(isOpen));
    addButton.classList.toggle('is-active', isOpen);
    errorText.textContent = '';
    if (isOpen) {
      dateInput.value = selectedDate; // Start on the day that's selected in the grid.
      titleInput.focus();
    }
  }

  function resetForm() {
    titleInput.value = '';
    locationInput.value = '';
    timeInput.value = '';
    errorText.textContent = '';
  }

  // The small form that drops down under the top row.
  const form = h('form', {
    class: 'calendar__add-form',
    hidden: true,
    onSubmit: (submitEvent) => {
      submitEvent.preventDefault();
      const title = titleInput.value.trim();
      if (!title || !dateInput.value) {
        errorText.textContent = title ? 'Pick a date first.' : 'Give it a name first.';
        (title ? dateInput : titleInput).focus();
        return;
      }
      const time = timeInput.value;
      update((data) => {
        data.events.push(createEvent({
          kind: 'entry',
          title,
          date: dateInput.value,
          allDay: !time,
          time,
          endTime: time ? addMinutesToTime(time, DEFAULT_EVENT_LENGTH_MINUTES) : '',
          location: locationInput.value.trim(),
          createdBy: context.currentUser.id,
        }));
      });
      showToast(`Added "${title}".`);
      resetForm();
      setFormOpen(false);
      addButton.focus();
    },
    onKeydown: (event) => {
      if (event.key === 'Escape') {
        setFormOpen(false);
        addButton.focus();
      }
    },
  },
    titleInput,
    h('div', { class: 'form-row' }, dateInput, timeInput),
    locationInput,
    errorText,
    h('div', { class: 'form-row calendar__add-actions' },
      // Gatherings with RSVPs and guests are made on the full page.
      context.isVisitor ? null : h('button', { type: 'button', class: 'link-button calendar__make-event', onClick: () => context.openFullPage(NEW_EVENT) }, 'Make an event with RSVPs →'),
      // On your own homepage, the step-by-step planner too (js/events/new-event-page.js).
      context.spaceKind === 'personal' ? h('a', { class: 'link-button calendar__make-event', href: '#new-event' }, 'Plan one step by step') : null,
      h('span', { class: 'calendar__add-spacer' }),
      h('button', { type: 'button', class: 'button button--quiet button--small', onClick: () => { resetForm(); setFormOpen(false); } }, 'Cancel'),
      h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Add'),
    ),
  );

  titleInput.addEventListener('input', () => { errorText.textContent = ''; });

  // Top row + dropdown form, pinned to the top of the card while it scrolls.
  const top = h('div', { class: 'calendar__top' }, monthHeader, form);

  container.append(top, monthGrid, eventList);
  redraw();
}
