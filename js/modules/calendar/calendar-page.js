/**
 * calendar-page.js — the calendar as a full page, working like the
 * calendar apps people already know.
 *
 *   [Today] [‹] [›]  November 2026   [Search…] [Month|Week|Day|Agenda] [+ Entry] [+ Event]
 *   ┌ mini month ┐ ┌ view (month / week / day / agenda) ──────────┐ ┌ side panel ─┐
 *   │ S M T W T F│ │                                              │ │ event details│
 *   │ …          │ │                                              │ │ or the editor│
 *   │ Shortcuts  │ └──────────────────────────────────────────────┘ └──────────────┘
 *   └────────────┘
 *
 * - Click an event to see its details (when, where, host, RSVPs, guests);
 *   Edit, Duplicate and Delete are there. Double-click opens the editor.
 * - Click empty space on a day or time slot to start a new event there; in
 *   week and day view, drag down a column to pick its start and end.
 * - Drag an event to move it (to another time or day); drag its bottom
 *   edge to change when it ends. In month view, drag it to another day.
 * - On a phone: swipe sideways for the next or previous month, week, or
 *   day, and tap an event to open its page.
 * - Keyboard: T today, ← → (or J K) back and forward, M W D A switch
 *   views, N new event, / search, Esc closes the side panel, ? shortcuts.
 * - Invite-only events only show to their host and the people invited.
 *
 * The views are drawn by calendar-views.js, the editor by
 * calendar-editor.js, and event details by js/events/event-details.js;
 * this file keeps track of what's showing and saves changes.
 */

import { parseIcs, toIcs } from './calendar-import.js';
import { linkedNote } from '../../ui/source-tag.js';
import { h, replaceChildren, debounce } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import {
  todayKey, addDays, addMonths, startOfWeek, startOfMonth, fromDateKey, monthName, formatLongDate, formatShortDate, weekdayName, formatTime,
} from '../../utils/dates.js';
import {
  NEW_EVENT, normalizeEvent, isHostOf, createEvent, addMinutesToTime, canSeeEvent, applyRsvp, occurrencesBetween, DEFAULT_EVENT_LENGTH_MINUTES,
} from './calendar-data.js';
import { renderMonthView, renderTimeGrid, renderAgendaView } from './calendar-views.js';
import { renderEventEditor } from './calendar-editor.js';
import { renderEventDetails } from '../../events/event-details.js';
import { otherCalendarLinks } from '../../editor/linked-items.js';
import { getSpace, getModule, getSpaceOfModule, updateModuleData } from '../../state/store.js';
import { onSwipe, slideIn, isPhone } from '../../ui/swipe.js';
import { eventHref } from '../../events/event-details.js';

const VIEWS = [
  { id: 'month', label: 'Month', key: 'm' },
  { id: 'week', label: 'Week', key: 'w' },
  { id: 'day', label: 'Day', key: 'd' },
  { id: 'agenda', label: 'Agenda', key: 'a' },
];

const SHORTCUTS = [
  ['T', 'Go to today'],
  ['← → or J K', 'Back / forward'],
  ['M W D A', 'Month, week, day, agenda'],
  ['N', 'New calendar entry'],
  ['E', 'New event'],
  ['/', 'Search'],
  ['Esc', 'Close the side panel'],
];

const AGENDA_DAYS_AHEAD = 60;
const SEARCH_DELAY_MS = 200;
const NOW_LINE_REFRESH_MS = 60 * 1000;

export function renderCalendarPage(container, context) {
  // View settings (not saved).
  const view = {
    mode: 'month',
    anchorDate: todayKey(), // The day the view is centered on.
    miniMonth: startOfMonth(todayKey()),
    search: '',
    /**
     * The side panel:
     *   null                              closed
     *   { mode: 'details', eventId }      an event's details
     *   { mode: 'edit', eventId }         editing an event
     *   { mode: 'new', draft }            a new event
     */
    panel: null,
    showShortcuts: false,
    hiddenSources: new Set(),  // calendars ticked off in "Calendars" (by space id; 'here' = this one)
    showOthers: false,         // a group's calendar: "Show my other calendars" is open
    shownOthers: new Set(),    // …and which of them are laid over this one
  };

  const me = context.currentUser;
  const isSolo = context.members.length <= 1;

  const isPersonal = context.spaceKind === 'personal';
  const fromLink = (link) => ({ ...normalizeEvent(link.item), _link: link });

  // This calendar's items, plus (personal homepage) group events and entries
  // you're going to, invited to or involved in. A linked item carries its
  // link in `_link`. On a group's calendar, "Show my other calendars" can
  // lay your other calendars over it.
  const allEvents = () => [
    ...context.getData().events.map(normalizeEvent).filter((event) => canSeeEvent(event, me.id, { publicOnly: context.isVisitor && context.spaceKind === 'group' && !context.sharedFrom })),
    ...context.getLinkedItems().map(fromLink),
    ...overlayLinks().map(fromLink),
  ];
  const findEvent = (eventId) => allEvents().find((e) => e.id === eventId) ?? null;

  /** Your other calendars' items, on a group's calendar, if you chose to show them. */
  function overlayLinks() {
    if (isPersonal || !view.showOthers) return [];
    return otherCalendarLinks(me.id, context.spaceId).filter((link) => view.shownOthers.has(link.spaceId));
  }

  /** Which calendar an item comes from: 'here', or the space it's linked from. */
  const sourceOf = (event) => event._link?.spaceId ?? 'here';

  /** Items from the calendars that are ticked, matching the search box (title, location or notes). */
  function visibleEvents() {
    const query = view.search.trim().toLowerCase();
    return allEvents().filter((event) => !view.hiddenSources.has(sourceOf(event))
      && (!query || `${event.title} ${event.location} ${event.notes}`.toLowerCase().includes(query)));
  }

  /** Change one event, wherever it lives (here, or in a group for linked events). */
  function changeEvent(event, changeFn) {
    if (event._link) {
      context.updateLinkedItem(event._link, (saved) => changeFn(saved));
      return;
    }
    const data = structuredClone(context.getData());
    const index = data.events.findIndex((e) => e.id === event.id);
    const saved = normalizeEvent(data.events[index]);
    changeFn(saved);
    data.events[index] = saved;
    // Saved directly (not context.saveData) so a visitor's RSVP to a public
    // event goes through; editing is kept from visitors by canEditEvent().
    updateModuleData(context.moduleId, data);
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  function step(direction) {
    const { mode, anchorDate } = view;
    if (mode === 'month') view.anchorDate = addMonths(anchorDate, direction);
    else if (mode === 'week') view.anchorDate = addDays(anchorDate, 7 * direction);
    else if (mode === 'day') view.anchorDate = addDays(anchorDate, direction);
    else view.anchorDate = addDays(anchorDate, AGENDA_DAYS_AHEAD * direction);
    view.miniMonth = startOfMonth(view.anchorDate);
    drawAll();
    slideIn(viewElement, direction);
  }

  function goToDate(date, mode = view.mode) {
    view.anchorDate = date;
    view.miniMonth = startOfMonth(date);
    view.mode = mode;
    drawAll();
  }

  /** "November 2026", "Nov 9 – 15, 2026", "Thursday, November 14", … */
  function periodTitle() {
    const { mode, anchorDate } = view;
    const date = fromDateKey(anchorDate);
    if (mode === 'month') return `${monthName(date.getMonth())} ${date.getFullYear()}`;
    if (mode === 'day') return `${formatLongDate(anchorDate)}, ${date.getFullYear()}`;
    if (mode === 'week') {
      const start = startOfWeek(anchorDate);
      const end = addDays(start, 6);
      return `${formatShortDate(start)} – ${formatShortDate(end)}, ${fromDateKey(end).getFullYear()}`;
    }
    return `From ${formatShortDate(anchorDate)}, ${date.getFullYear()}`;
  }

  // ─── Opening, creating, editing ────────────────────────────────────────────

  function openPanel(panel) {
    view.panel = panel;
    drawView();
    drawPanel();
  }

  /** Open the editor for a new calendar entry (or event, with kind: 'event'). */
  function startNewEvent(date = view.anchorDate, time = '', endTime = '', kind = 'entry') {
    if (context.isVisitor) return; // visitors look; members add
    openPanel({
      mode: 'new',
      draft: createEvent({
        kind,
        title: '',
        date,
        allDay: !time,
        time,
        endTime: time ? endTime || addMinutesToTime(time, DEFAULT_EVENT_LENGTH_MINUTES) : '',
        attendeeIds: [me.id],
        createdBy: me.id,
      }),
    });
  }

  function handleSave(fields) {
    const isNew = view.panel.mode === 'new';
    const { _link: link, ...savedFields } = fields;
    if (link) {
      context.updateLinkedItem(link, (saved) => Object.assign(saved, savedFields));
      showToast(`Saved "${fields.title}" in ${link.spaceName}.`);
    } else {
      const data = structuredClone(context.getData());
      if (isNew) data.events.push(savedFields);
      else data.events[data.events.findIndex((e) => e.id === fields.id)] = savedFields;
      context.saveData(data);
      showToast(isNew ? `Added "${fields.title}".` : `Saved "${fields.title}".`);
    }
    if (view.mode !== 'agenda') view.anchorDate = fields.date; // show where it landed
    view.panel = { mode: 'details', eventId: fields.id };
    drawAll();
  }

  function handleDelete(event) {
    const before = structuredClone(context.getData());
    const data = structuredClone(before);
    data.events = data.events.filter((e) => e.id !== event.id);
    context.saveData(data);
    view.panel = null;
    drawAll();
    showToast(`Deleted "${event.title}".`, {
      actionLabel: 'Undo',
      onAction: () => { context.saveData(before); drawAll(); },
    });
  }

  function handleDuplicate(event) {
    const { id, _link, rsvps, ...fields } = event;
    const copy = createEvent({ ...fields, title: `${event.title} (copy)`, createdAt: Date.now(), createdBy: me.id, attendeeIds: [me.id], rsvps: {} });
    openPanel({ mode: 'new', draft: copy });
  }

  /** A drag ended in one of the views. `changes` is null when nothing moved. */
  function handleMove(occurrence, changes) {
    const { event } = occurrence;
    if (!changes || !canEditEvent(event)) { drawView(); return; }
    changeEvent(event, (saved) => {
      if ('dayDelta' in changes) {
        saved.date = addDays(saved.date, changes.dayDelta);
        saved.endDate = addDays(saved.endDate, changes.dayDelta);
      } else {
        const dayDelta = Math.round((fromDateKey(changes.date) - fromDateKey(occurrence.date)) / 86400000);
        saved.date = addDays(saved.date, dayDelta);
        saved.endDate = addDays(saved.endDate, dayDelta);
        saved.time = changes.time;
        saved.endTime = changes.endTime;
      }
    });
    const onlyEndChanged = !('dayDelta' in changes) && changes.date === occurrence.date && changes.time === event.time;
    showToast(onlyEndChanged ? `"${event.title}" now ends at ${formatTime(changes.endTime)}.` : `Moved "${event.title}".`, {
      actionLabel: 'Undo',
      onAction: () => { changeEvent(event, (saved) => Object.assign(saved, { date: event.date, endDate: event.endDate, time: event.time, endTime: event.endTime })); drawAll(); },
    });
    drawAll();
  }

  // ─── Toolbar ───────────────────────────────────────────────────────────────

  const toolbar = h('div', { class: 'calendar-page__toolbar' });

  const searchInput = h('input', {
    type: 'search',
    class: 'input calendar-page__search-input',
    placeholder: 'Search events',
    'aria-label': 'Search events',
    onInput: debounce((event) => { view.search = event.target.value; drawView(); }, SEARCH_DELAY_MS),
  });
  const searchBox = h('label', { class: 'calendar-page__search' }, icon('search', 16), searchInput);

  // Bring events in from another calendar app (.ics), or take this calendar out to one.
  const importInput = h('input', {
    type: 'file', accept: '.ics,text/calendar', class: 'visually-hidden', 'aria-label': 'A calendar file',
    onChange: (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const found = parseIcs(String(reader.result));
        if (!found.length) { showToast('No events were found in that file.'); return; }
        const before = structuredClone(context.getData());
        const data = structuredClone(before);
        const have = new Set(data.events.map((e) => `${e.title}|${e.date}|${e.time ?? ''}`));
        const fresh = found.filter((e) => !have.has(`${e.title}|${e.date}|${e.time}`));
        for (const fields of fresh) data.events.push(createEvent({ ...fields, kind: 'entry', createdBy: context.currentUser.id }));
        context.saveData(data);
        const skipped = found.length - fresh.length;
        showToast(`Brought in ${fresh.length} ${fresh.length === 1 ? 'entry' : 'entries'} from ${file.name}${skipped ? ` (${skipped} already here)` : ''}.`, {
          actionLabel: 'Undo', onAction: () => { context.saveData(before); drawAll(); },
        });
        if (fresh.length) view.anchorDate = [...fresh].sort((a, b) => a.date.localeCompare(b.date)).find((e) => e.date >= todayKey())?.date ?? fresh[0].date;
        drawAll();
      };
      reader.readAsText(file);
      event.target.value = '';
    },
  });
  function exportCalendar() {
    const events = (context.getData().events ?? []).map(normalizeEvent).filter((e) => canSeeEvent(e, context.currentUser?.id, { publicOnly: context.isVisitor && !context.sharedFrom }));
    const name = getModule(context.moduleId)?.title ?? 'Calendar';
    const link = h('a', { href: URL.createObjectURL(new Blob([toIcs(events, name)], { type: 'text/calendar' })), download: `${name}.ics` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function drawToolbar() {
    replaceChildren(toolbar,
      h('div', { class: 'calendar-page__nav' },
        h('button', { type: 'button', class: 'button button--small', title: 'Today (T)', onClick: () => goToDate(todayKey()) }, 'Today'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Previous', title: 'Previous (←)', onClick: () => step(-1) }, icon('chevronLeft', 16)),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Next', title: 'Next (→)', onClick: () => step(+1) }, icon('chevronRight', 16)),
        h('h2', { class: 'calendar-page__title', 'aria-live': 'polite' }, periodTitle()),
      ),
      h('div', { class: 'calendar-page__actions' },
        searchBox,
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'View' },
          VIEWS.map((option) => h('button', {
            type: 'button',
            class: `segmented__option${option.id === view.mode ? ' is-active' : ''}`,
            'aria-pressed': String(option.id === view.mode),
            title: `${option.label} (${option.key.toUpperCase()})`,
            onClick: () => { view.mode = option.id; drawAll(); },
          }, option.label)),
        ),
        context.isVisitor ? null : h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Import a calendar file', title: 'Import an .ics file from Google Calendar, Apple Calendar, or Outlook', onClick: () => importInput.click() }, icon('upload', 16)),
        context.isVisitor ? null : importInput,
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Download this calendar', title: 'Download as an .ics file for other calendar apps', onClick: exportCalendar }, icon('download', 16)),
        // Your own calendar: subscribe from Google or Apple Calendar (Account → Calendars).
        !context.isVisitor && getSpaceOfModule(context.moduleId)?.kind === 'personal' ? h('a', { class: 'icon-button', href: '#account-calendars', 'aria-label': 'Show in Google or Apple Calendar', title: 'Show your 3den events in Google Calendar, Apple Calendar, or Outlook' }, icon('link', 16)) : null,
        context.isVisitor ? null : h('button', { type: 'button', class: 'button button--small', title: 'New calendar entry (N): something to remember', onClick: () => startNewEvent() }, icon('plus', 14), ' Entry'),
        context.isVisitor ? null : h('button', { type: 'button', class: 'button button--primary button--small', title: 'New event (E): a gathering with RSVPs', onClick: () => startNewEvent(undefined, '', '', 'event') }, icon('plus', 14), ' Event'),
      ),
    );
  }

  // ─── Sidebar: mini month and shortcuts ─────────────────────────────────────

  const sidebar = h('aside', { class: 'calendar-page__sidebar', 'aria-label': 'Jump to a date' });

  function drawSidebar() {
    const monthStart = view.miniMonth;
    const gridStart = startOfWeek(monthStart);
    const monthIndex = fromDateKey(monthStart).getMonth();
    const busy = new Set(occurrencesBetween(allEvents(), gridStart, addDays(gridStart, 41)).map((o) => o.date));
    const inView = (date) => {
      if (view.mode === 'day') return date === view.anchorDate;
      if (view.mode === 'week') return startOfWeek(date) === startOfWeek(view.anchorDate);
      return false;
    };

    replaceChildren(sidebar,
      h('div', { class: 'mini-month' },
        h('div', { class: 'mini-month__header' },
          h('button', { type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': 'Previous month', onClick: () => { view.miniMonth = addMonths(view.miniMonth, -1); drawSidebar(); } }, icon('chevronLeft', 14)),
          h('span', { class: 'mini-month__title' }, `${monthName(monthIndex)} ${fromDateKey(monthStart).getFullYear()}`),
          h('button', { type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': 'Next month', onClick: () => { view.miniMonth = addMonths(view.miniMonth, 1); drawSidebar(); } }, icon('chevronRight', 14))),
        h('div', { class: 'mini-month__grid' },
          [0, 1, 2, 3, 4, 5, 6].map((d) => h('span', { class: 'mini-month__weekday' }, weekdayName(d, true).slice(0, 1))),
          Array.from({ length: 42 }, (_, i) => {
            const date = addDays(gridStart, i);
            return h('button', {
              type: 'button',
              class: [
                'mini-month__day',
                fromDateKey(date).getMonth() !== monthIndex ? 'is-other-month' : '',
                date === todayKey() ? 'is-today' : '',
                date === view.anchorDate ? 'is-anchor' : '',
                inView(date) ? 'is-in-view' : '',
                busy.has(date) ? 'has-events' : '',
              ].filter(Boolean).join(' '),
              'aria-label': formatLongDate(date),
              onClick: () => goToDate(date, view.mode === 'month' || view.mode === 'agenda' ? 'day' : view.mode),
            }, String(fromDateKey(date).getDate()));
          }))),
      renderCalendarSources(),
      h('button', {
        type: 'button',
        class: 'link-button calendar-page__shortcuts-toggle',
        'aria-expanded': String(view.showShortcuts),
        onClick: () => { view.showShortcuts = !view.showShortcuts; drawSidebar(); },
      }, 'Keyboard shortcuts'),
      view.showShortcuts ? h('dl', { class: 'calendar-page__shortcuts' },
        SHORTCUTS.map(([keys, action]) => [h('dt', {}, h('kbd', {}, keys)), h('dd', {}, action)])) : null,
    );
  }

  // ─── Calendars: filter by where things come from ───────────────────────────

  /**
   * Your homepage: every calendar that feeds it (My calendar, and each
   * group or blog with things you're in), to tick on and off, or "only".
   * A group's calendar: just this group, with "Show my other calendars"
   * folded underneath to lay yours over it.
   */
  function renderCalendarSources() {
    const count = (key) => allEvents().filter((e) => sourceOf(e) === key).length;
    const setHidden = (key, hidden) => { if (hidden) view.hiddenSources.add(key); else view.hiddenSources.delete(key); drawAll(); };
    const row = (key, label, { checked, onToggle, onOnly = null, locked = false, total = count(key) }) => h('li', { class: 'calendar-sources__row' },
      h('label', { class: 'calendar-sources__label' },
        h('input', { type: 'checkbox', checked, disabled: locked, onChange: (e) => onToggle(e.target.checked) }),
        h('span', {}, label), h('span', { class: 'calendar-sources__count' }, String(total || ''))),
      onOnly ? h('button', { type: 'button', class: 'link-button calendar-sources__only', title: `Show only ${label}`, onClick: onOnly }, 'only') : null);

    if (isPersonal) {
      const linked = new Map(context.getLinkedItems().map((link) => [link.spaceId, link.spaceName]));
      const sources = [['here', 'My calendar'], ...linked];
      const only = (key) => { view.hiddenSources = new Set(sources.map(([k]) => k).filter((k) => k !== key)); drawAll(); };
      return h('section', { class: 'calendar-sources' },
        h('h3', { class: 'calendar-sources__title' }, 'Calendars'),
        h('ul', { class: 'calendar-sources__list' }, sources.map(([key, label]) => row(key, label, {
          checked: !view.hiddenSources.has(key),
          onToggle: (on) => setHidden(key, !on),
          onOnly: sources.length > 1 ? () => only(key) : null,
        }))),
        view.hiddenSources.size ? h('button', { type: 'button', class: 'link-button calendar-sources__all', onClick: () => { view.hiddenSources.clear(); drawAll(); } }, 'Show all') : null,
        // One calendar for all your groups: every event in them, not only the ones you've answered.
        context.isVisitor ? null : h('label', { class: 'calendar-sources__label calendar-sources__all-groups' },
          h('input', {
            type: 'checkbox', checked: Boolean(context.getData()?.allGroups),
            onChange: (e) => { context.saveData({ ...context.getData(), allGroups: e.target.checked }); drawAll(); },
          }),
          h('span', {}, 'Every event in my groups, not only the ones I’m going to')));
    }

    const space = getSpace(context.spaceId);
    const otherLinks = otherCalendarLinks(me.id, context.spaceId);
    const others = new Map(otherLinks.map((link) => [link.spaceId, link.spaceName]));
    const details = h('details', { class: 'calendar-sources__others', open: view.showOthers },
      h('summary', {}, 'Show my other calendars'),
      others.size
        ? h('ul', { class: 'calendar-sources__list' }, [...others].map(([key, label]) => row(key, label, {
            checked: view.shownOthers.has(key) && !view.hiddenSources.has(key),
            total: otherLinks.filter((link) => link.spaceId === key).length,
            onToggle: (on) => { if (on) view.shownOthers.add(key); else view.shownOthers.delete(key); view.hiddenSources.delete(key); drawAll(); },
          })))
        : h('p', { class: 'calendar-sources__hint' }, 'Nothing on your other calendars.'),
      h('p', { class: 'calendar-sources__hint' }, 'Only you see these, to check for clashes. Nothing is added to this group’s calendar.'));
    details.addEventListener('toggle', () => { view.showOthers = details.open; drawView(); });
    return h('section', { class: 'calendar-sources' },
      h('h3', { class: 'calendar-sources__title' }, 'Calendars'),
      h('ul', { class: 'calendar-sources__list' }, row('here', space?.name ?? 'This calendar', { checked: true, onToggle: () => {}, locked: true })),
      details);
  }

  // ─── The view ──────────────────────────────────────────────────────────────

  const viewElement = h('div', { class: 'calendar-page__view' });
  // Swipe sideways to the next or previous month, week, or day.
  onSwipe(viewElement, { onNext: () => step(1), onPrevious: () => step(-1) });

  function drawView() {
    const selectedEventId = view.panel?.eventId ?? null;
    const shared = {
      events: visibleEvents(),
      selectedEventId,
      // On a phone, tapping an event opens its page; entries (no page) show their details.
      onOpenEvent: ({ event }) => (isPhone() && event.kind === 'event'
        ? (window.location.hash = eventHref(event.id))
        : openPanel({ mode: 'details', eventId: event.id })),
      onCreateAt: startNewEvent,
      onCreateRange: (date, time, endTime) => startNewEvent(date, time, endTime),
      onShowDay: (date) => goToDate(date, 'day'),
      onMoveEvent: handleMove,
      getMember: context.getMember,
      currentUserId: me.id,
    };

    let content;
    if (view.mode === 'month') {
      content = renderMonthView({ ...shared, anchorDate: view.anchorDate });
    } else if (view.mode === 'week') {
      const start = startOfWeek(view.anchorDate);
      content = renderTimeGrid({ ...shared, days: Array.from({ length: 7 }, (_, i) => addDays(start, i)) });
    } else if (view.mode === 'day') {
      content = renderTimeGrid({ ...shared, days: [view.anchorDate] });
    } else {
      content = renderAgendaView({ ...shared, startDate: view.anchorDate, daysAhead: AGENDA_DAYS_AHEAD });
    }

    // Double-click an event to go straight to editing it.
    content.addEventListener('dblclick', (event) => {
      if (view.panel?.mode === 'details' && event.target.closest('.event-chip, .time-grid__event, .agenda-view__event')) {
        openPanel({ mode: 'edit', eventId: view.panel.eventId });
      }
    });

    replaceChildren(viewElement,
      view.search ? h('p', { class: 'calendar-page__search-note' }, `Showing events matching "${view.search}".`) : null,
      content,
    );
  }

  // ─── Side panel: details or editor ─────────────────────────────────────────

  const panelElement = h('aside', { class: 'calendar-page__editor', 'aria-label': 'Event details' });

  function canEditEvent(event) {
    if (context.isVisitor) return false;
    if (event._link) return true; // edits go to the group (see linked items)
    return isHostOf(event, me.id) || event.visibility === 'group' || context.can('moderate') || !event.createdBy;
  }

  function drawPanel() {
    const { panel } = view;
    const event = panel && (panel.mode === 'new' ? panel.draft : findEvent(panel.eventId));
    panelElement.hidden = !event;
    layout.classList.toggle('has-editor', Boolean(event));
    if (!event) {
      view.panel = null;
      replaceChildren(panelElement);
      return;
    }

    const note = event._link ? linkedNote(event._link, context.openLinkedItem) : null;

    if (panel.mode === 'details') {
      replaceChildren(panelElement, renderEventDetails(event, {
        me,
        getMember: context.getMember,
        note,
        onRsvp: (answer) => {
          changeEvent(event, (saved) => applyRsvp(saved, me.id, answer));
          drawAll();
        },
        onEdit: canEditEvent(event) ? () => openPanel({ mode: 'edit', eventId: event.id }) : null,
        onDuplicate: context.isVisitor ? null : () => handleDuplicate(event),
        onDelete: !event._link && canEditEvent(event) ? () => handleDelete(event) : null,
        onClose: () => openPanel(null),
        onChanged: () => drawAll(),
      }));
      return;
    }

    replaceChildren(panelElement,
      note,
      renderEventEditor({
        event,
        isNew: panel.mode === 'new',
        members: context.members,
        showAttendees: !isSolo,
        me,
        onSave: handleSave,
        onCancel: () => openPanel(panel.mode === 'new' ? null : { mode: 'details', eventId: event.id }),
        // A group's event can only be deleted in the group.
        onDelete: event._link ? null : () => handleDelete(event),
      }));
  }

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────

  function handleKeydown(keyEvent) {
    if (!container.isConnected) return;
    const target = keyEvent.target;
    const isTyping = target.closest?.('input, textarea, select, [contenteditable="true"]');
    if (keyEvent.key === 'Escape') {
      if (isTyping && target === searchInput) { searchInput.blur(); return; }
      if (view.panel && !isTyping) openPanel(null);
      return;
    }
    if (isTyping || keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) return;

    const key = keyEvent.key.toLowerCase();
    const viewForKey = VIEWS.find((v) => v.key === key);
    if (key === 't') goToDate(todayKey());
    else if (key === 'arrowleft' || key === 'k') step(-1);
    else if (key === 'arrowright' || key === 'j') step(1);
    else if (viewForKey) { view.mode = viewForKey.id; drawAll(); }
    else if (key === 'n' || key === 'c') startNewEvent();
    else if (key === 'e') startNewEvent(undefined, '', '', 'event');
    else if (key === '/') searchInput.focus();
    else if (key === '?') { view.showShortcuts = !view.showShortcuts; drawSidebar(); }
    else return;
    keyEvent.preventDefault();
  }
  document.addEventListener('keydown', handleKeydown);

  // Keep the red "now" line in the right place.
  const nowTimer = setInterval(() => {
    if (container.isConnected && (view.mode === 'week' || view.mode === 'day')) drawView();
  }, NOW_LINE_REFRESH_MS);

  // ─── Layout ────────────────────────────────────────────────────────────────

  const layout = h('div', { class: 'calendar-page__layout' }, sidebar, viewElement, panelElement);

  function drawAll() {
    drawToolbar();
    drawSidebar();
    drawView();
    drawPanel();
  }

  // A card, an event page or a linked item asked for one event: show its
  // day and open it. The card's "Make it an event" asks for NEW_EVENT.
  const focusRequest = context.takeFocusRequest();
  const focused = focusRequest === NEW_EVENT ? null : findEvent(focusRequest);
  if (focused) {
    view.anchorDate = focused.date;
    view.miniMonth = startOfMonth(focused.date);
    view.panel = { mode: 'details', eventId: focused.id };
  }

  container.append(toolbar, layout, importInput);
  drawAll();
  if (focusRequest === NEW_EVENT) startNewEvent(undefined, '', '', 'event');

  return () => {
    document.removeEventListener('keydown', handleKeydown);
    clearInterval(nowTimer);
  };
}
