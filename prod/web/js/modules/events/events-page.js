// @ts-check
/**
 * events-page.js — Upcoming events as a full page: every event as a list,
 * with details and RSVPs in a side panel.
 *
 *   [Upcoming | Going | Hosting | Past]  [Search…]            [+ New event]
 *   ┌ list, by month ─────────────────────────────┐ ┌ details / editor ─┐
 *   │ NOVEMBER 2026                               │ │ Fall potluck      │
 *   │ [NOV 14] Fall potluck   [Public]            │ │ Sat, Nov 14 …     │
 *   │ …                                           │ │ [Going][Maybe]…   │
 *   └─────────────────────────────────────────────┘ └───────────────────┘
 *
 * It's the same events as the Calendar (see events-source.js), so the
 * editor is the calendar's editor and details are the shared event details.
 */

import { h, replaceChildren, debounce } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { linkedNote } from '../../ui/source-tag.js';
import { todayKey, addDays, addMonths, startOfMonth, startOfWeek, fromDateKey, formatLongDate } from '../../utils/dates.js';
import { createEvent, applyRsvp, rsvpOf, isHostOf, DEFAULT_EVENT_LENGTH_MINUTES, addMinutesToTime, occurrencesBetween } from '../calendar/calendar-data.js';
import { renderEventEditor } from '../calendar/calendar-editor.js';
import { renderEventDetails } from '../../events/event-details.js';
import { eventsSource } from './events-source.js';
import { canEditEvent } from '../../state/events.js';
import { listOccurrences, monthLabel, renderEventRow } from './events-list.js';
import { NEW_EVENT } from './events-card.js';

const FILTERS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'going', label: 'Going' },
  { id: 'hosting', label: 'Hosting' },
  { id: 'past', label: 'Past' },
];

const SEARCH_DELAY_MS = 200;
const DEFAULT_START_TIME = '19:00';

export function renderEventsPage(container, context) {
  const me = context.currentUser;
  const isSolo = context.members.length <= 1;

  const view = {
    filter: 'upcoming',
    search: '',
    panel: null, // null | { mode: 'details' | 'edit', eventId } | { mode: 'new', draft }
    month: startOfMonth(todayKey()), // the month the calendar shows
    day: null, // a day picked on the calendar: the list shows just that day
  };

  const source = () => eventsSource(context);
  const findEvent = (eventId) => source().events().find((e) => e.id === eventId) ?? null;

  function matchingOccurrences() {
    const all = view.day
      ? occurrencesBetween(source().events(), view.day, view.day)
      : listOccurrences(source().events(), view.filter === 'past' ? 'past' : 'upcoming');
    const query = view.search.trim().toLowerCase();
    return all.filter(({ event }) => {
      if (view.filter === 'going' && rsvpOf(event, me.id) !== 'going') return false;
      if (view.filter === 'hosting' && event.createdBy !== me.id) return false;
      if (query && !`${event.title} ${event.location} ${event.notes}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  function startNewEvent() {
    view.panel = {
      mode: 'new',
      draft: createEvent({
        kind: 'event',
        title: '',
        date: todayKey(),
        allDay: false,
        time: DEFAULT_START_TIME,
        endTime: addMinutesToTime(DEFAULT_START_TIME, DEFAULT_EVENT_LENGTH_MINUTES * 2),
        attendeeIds: [me.id],
        createdBy: me.id,
        // Your own homepage: people you invite. A blog: anyone (it's public).
        visibility: { personal: 'invite', blog: 'public' }[context.spaceKind] ?? 'group',
      }),
    };
    drawAll();
  }

  function handleSave(fields) {
    const isNew = view.panel.mode === 'new';
    if (isNew) source().add(fields);
    else source().replace(fields);
    showToast(isNew ? `Added "${fields.title}".` : `Saved "${fields.title}".`);
    view.panel = { mode: 'details', eventId: fields.id };
    drawAll();
  }

  function handleDelete(event) {
    const before = source().snapshot();
    source().remove(event.id);
    view.panel = null;
    drawAll();
    showToast(`Deleted "${event.title}".`, {
      actionLabel: 'Undo',
      onAction: () => { source().restore(before); drawAll(); },
    });
  }

  function handleDuplicate(event) {
    const { id, _link, rsvps, ...fields } = event;
    view.panel = { mode: 'new', draft: createEvent({ ...fields, kind: 'event', title: `${event.title} (copy)`, createdAt: Date.now(), createdBy: me.id, attendeeIds: [me.id], rsvps: {} }) };
    drawAll();
  }

  const answer = (event, choice) => {
    source().change(event, (saved) => applyRsvp(saved, me.id, choice));
    drawAll();
  };

  const canEdit = (event) => !context.isVisitor
    && (Boolean(event._link) || isHostOf(event, me.id) || canEditEvent(event, me.id) || event.visibility === 'group' || context.can('moderate') || !event.createdBy);

  // ─── Toolbar ───────────────────────────────────────────────────────────────

  const toolbar = h('div', { class: 'upcoming-page__filters' });
  const searchInput = h('input', {
    type: 'search',
    class: 'input calendar-page__search-input',
    placeholder: 'Search events',
    'aria-label': 'Search events',
    onInput: debounce((e) => { view.search = e.target.value; drawList(); }, SEARCH_DELAY_MS),
  });

  function drawToolbar() {
    const calendar = source().calendar;
    replaceChildren(toolbar,
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Show' },
        FILTERS.map((option) => h('button', {
          type: 'button',
          class: `segmented__option${option.id === view.filter ? ' is-active' : ''}`,
          'aria-pressed': String(option.id === view.filter),
          onClick: () => { view.filter = option.id; drawAll(); },
        }, option.label))),
      h('label', { class: 'calendar-page__search' }, icon('search', 16), searchInput),
      h('span', { style: { flex: '1 1 auto' } }),
      calendar ? h('a', { href: `#module-${calendar.id}`, class: 'upcoming__meta' }, `Same events as “${calendar.title}” · Open the calendar`) : null,
      context.isVisitor ? null : h('button', { type: 'button', class: 'button button--primary button--small', onClick: startNewEvent }, icon('plus', 14), ' New event'),
    );
  }

  // ─── List ──────────────────────────────────────────────────────────────────

  const list = h('div', { class: 'upcoming upcoming-page__list' });

  function drawList() {
    const occurrences = matchingOccurrences();
    const selectedId = view.panel?.eventId ?? null;
    const emptyText = {
      upcoming: 'Nothing coming up. Add an event to get started.',
      going: 'You haven’t said you’re going to anything yet.',
      hosting: 'You aren’t hosting anything.',
      past: 'No past events.',
    }[view.filter];

    let lastMonth = null;
    replaceChildren(list,
      view.day ? h('div', { class: 'upcoming-page__day' },
        h('strong', {}, formatLongDate(view.day)),
        h('button', { type: 'button', class: 'link-button', onClick: () => { view.day = null; drawAll(); } }, 'Show all')) : null,
      occurrences.length === 0 ? h('p', { class: 'upcoming__empty' }, view.search ? `No events match "${view.search}".` : view.day ? 'Nothing on this day.' : emptyText) : null,
      occurrences.map((occurrence) => {
        const heading = monthLabel(occurrence.date);
        const showHeading = heading !== lastMonth && !view.day;
        lastMonth = heading;
        return [
          showHeading ? h('h3', { class: 'upcoming__month' }, heading) : null,
          renderEventRow(occurrence, {
            me,
            isSelected: occurrence.event.id === selectedId,
            onOpen: () => { view.panel = { mode: 'details', eventId: occurrence.event.id }; drawList(); drawPanel(); },
            onOpenLink: context.openLinkedItem,
            onRsvp: view.filter === 'past' ? null : (choice) => answer(occurrence.event, choice),
          }),
        ];
      }));
  }

  // ─── Your calendar ─────────────────────────────────────────────────────────

  const calendarBox = h('section', { class: 'upcoming-cal', 'aria-label': 'Your calendar' });

  function drawCalendar() {
    const first = view.month;
    const gridStart = startOfWeek(first);
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const occurrences = occurrencesBetween(source().events(), days[0], days[41]);
    const byDay = new Map();
    for (const o of occurrences) {
      const entry = byDay.get(o.date) ?? { count: 0, mine: false, titles: [] };
      entry.count += 1;
      entry.mine ||= rsvpOf(o.event, me.id) === 'going' || isHostOf(o.event, me.id);
      entry.titles.push(o.event.title);
      byDay.set(o.date, entry);
    }
    const monthIndex = fromDateKey(first).getMonth();
    const today = todayKey();
    const label = fromDateKey(first).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    replaceChildren(calendarBox,
      h('div', { class: 'upcoming-cal__head' },
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Previous month', onClick: () => { view.month = addMonths(view.month, -1); drawCalendar(); } }, icon('chevronLeft', 14)),
        h('strong', { class: 'upcoming-cal__month' }, label),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Next month', onClick: () => { view.month = addMonths(view.month, 1); drawCalendar(); } }, icon('chevronRight', 14))),
      h('div', { class: 'upcoming-cal__grid', role: 'grid' },
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => h('span', { class: 'upcoming-cal__weekday', 'aria-hidden': 'true' }, d)),
        days.map((key) => {
          const entry = byDay.get(key);
          const outside = fromDateKey(key).getMonth() !== monthIndex;
          return h('button', {
            type: 'button',
            class: `upcoming-cal__day${outside ? ' is-outside' : ''}${key === today ? ' is-today' : ''}${key === view.day ? ' is-picked' : ''}${entry ? ' has-events' : ''}`,
            'aria-pressed': String(key === view.day),
            'aria-label': `${formatLongDate(key)}${entry ? `: ${entry.titles.join(', ')}` : ''}`,
            title: entry ? entry.titles.join('\n') : null,
            onClick: () => { view.day = view.day === key ? null : key; drawAll(); },
          },
            h('span', {}, String(fromDateKey(key).getDate())),
            entry ? h('span', { class: `upcoming-cal__dot${entry.mine ? ' is-mine' : ''}` }) : null);
        })),
      h('p', { class: 'upcoming-cal__key' },
        h('span', { class: 'upcoming-cal__dot is-mine' }), ' You’re going or hosting ',
        h('span', { class: 'upcoming-cal__dot' }), ' Other events'));
  }

  // ─── Side panel ────────────────────────────────────────────────────────────

  const side = h('aside', { class: 'upcoming-page__side', 'aria-label': 'Event details' });

  function drawPanel() {
    const { panel } = view;
    const event = panel && (panel.mode === 'new' ? panel.draft : findEvent(panel.eventId));
    side.hidden = !event;
    if (!event) {
      view.panel = null;
      replaceChildren(side);
      return;
    }
    const note = event._link ? linkedNote(event._link, context.openLinkedItem) : null;

    if (panel.mode === 'details') {
      replaceChildren(side, renderEventDetails(event, {
        me,
        getMember: context.getMember,
        note,
        onRsvp: (choice) => answer(event, choice),
        onEdit: canEdit(event) ? () => { view.panel = { mode: 'edit', eventId: event.id }; drawPanel(); } : null,
        onDuplicate: context.isVisitor ? null : () => handleDuplicate(event),
        onDelete: !event._link && canEdit(event) ? () => handleDelete(event) : null,
        onClose: () => { view.panel = null; drawAll(); },
        onChanged: () => drawAll(),
      }));
      return;
    }

    replaceChildren(side, note, renderEventEditor({
      event,
      isNew: panel.mode === 'new',
      members: context.members,
      showAttendees: !isSolo,
      me,
      homeGroupId: context.spaceKind === 'group' ? context.spaceId : null,
      mineToggle: context.spaceKind === 'group' && !event._link && (panel.mode === 'new' || event.createdBy === me.id || (event.hiddenFrom ?? []).includes(me.id)),
      onSave: handleSave,
      onCancel: () => { view.panel = panel.mode === 'new' ? null : { mode: 'details', eventId: event.id }; drawAll(); },
      onDelete: event._link ? null : () => handleDelete(event),
      kinds: ['event'], // Upcoming events only has events; calendar entries go on the Calendar
    }));
  }

  function drawAll() {
    drawToolbar();
    drawCalendar();
    drawList();
    drawPanel();
  }

  // The card asked for one event, or for a new one.
  const request = context.takeFocusRequest();
  if (request === NEW_EVENT && !context.isVisitor) startNewEvent();
  else if (request && findEvent(request)) {
    view.panel = { mode: 'details', eventId: request };
    if (listOccurrences(source().events()).every((o) => o.event.id !== request)) view.filter = 'past';
  }

  container.append(toolbar, h('div', { class: 'upcoming-page__layout' }, list, h('div', { class: 'upcoming-page__aside' }, calendarBox, side)));
  if (!view.panel || view.panel.mode !== 'new') drawAll();
}
