// @ts-check
/**
 * event-sheet.js — on a phone, a calendar item opens over the calendar,
 * full screen, with an × to go back to it (Nov 18).
 *
 *   ┌──────────────────────────────┐
 *   │ ×   Block party              │  ← back to the calendar (Back does it too)
 *   ├──────────────────────────────┤
 *   │  the event's own page:       │
 *   │  cover, when, where, RSVP,   │
 *   │  guests, host tools…         │
 *   └──────────────────────────────┘
 *
 *   openEventSheet(eventId)   an event: its page (event-page.js); an entry
 *                             (no page): its details, with Edit, which edits
 *                             it right in the sheet
 *   openNewItemSheet(opts)    a new entry or event (calendar-editor.js), e.g.
 *                             from a long press on a day (long-press.js)
 *
 * The sheet is a modal.js dialog, so it sits over the tab bar and takes the
 * focus. Opening it adds a history step, so the phone's Back closes it;
 * following a link inside it (a group, a profile) closes it too.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { getCurrentUser, getMember, getModule, updateModuleData } from '../state/store.js';
import { findEvent, updateEvent, canEditEvent } from '../state/events.js';
import { normalizeEvent } from '../modules/calendar/calendar-data.js';
import { renderEventEditor } from '../modules/calendar/calendar-editor.js';
import { renderEventDetails } from './event-details.js';
import { renderEventPage } from './event-page.js';

let current = null; // the sheet showing, if any

/**
 * The bare sheet: a bar with × and a title, and a body to fill.
 * @param {{ title: string, onClosed?: () => void }} options
 */
function openSheet({ title, onClosed = () => {} }) {
  current?.close({ fromHistory: false });
  const titleEl = h('span', { class: 'phone-sheet__title' }, title);
  const body = h('div', { class: 'phone-sheet__body' });
  let modal = null;
  let closed = false;
  let pushed = false;

  function close({ fromHistory = false } = {}) {
    if (closed) return;
    closed = true;
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('hashchange', onHash);
    modal.close();
    if (current === sheet) current = null;
    // Closed with the ×: take back the history step it added.
    if (pushed && !fromHistory && history.state?.phoneSheet) history.back();
    onClosed();
  }
  const onPop = () => close({ fromHistory: true });
  const onHash = () => close({ fromHistory: true });

  const bar = h('div', { class: 'phone-sheet__bar' },
    h('button', { type: 'button', class: 'icon-button phone-sheet__close', 'aria-label': 'Back to the calendar', title: 'Back to the calendar', onClick: () => close() }, icon('close', 20)),
    titleEl);
  modal = openModal(h('div', { class: 'phone-sheet__inner' }, bar, body), { label: title, className: 'phone-sheet', onDismiss: () => close() });

  try { history.pushState({ ...(history.state ?? {}), phoneSheet: true }, ''); pushed = true; } catch { /* some frames refuse: the × still works */ }
  window.addEventListener('popstate', onPop);
  window.addEventListener('hashchange', onHash);

  const sheet = { body, close, setTitle: (text) => { titleEl.textContent = text; } };
  current = sheet;
  return sheet;
}

/** Is a sheet open? (Tests and the calendar use it.) */
export const isSheetOpen = () => Boolean(current);

/**
 * Open a calendar item over the calendar.
 * @param {string} eventId
 * @param {{ onClosed?: () => void, canEdit?: boolean }} [options]
 */
export function openEventSheet(eventId, { onClosed = () => {}, canEdit = true } = {}) {
  const found = findEvent(eventId);
  if (!found) return null;
  const sheet = openSheet({ title: found.event.title, onClosed });
  const me = getCurrentUser();

  if (found.event.kind === 'event') {
    renderEventPage(sheet.body, eventId);
    return sheet;
  }

  // An entry: its details, and Edit in place.
  const showDetails = () => {
    const now = findEvent(eventId);
    if (!now) { sheet.close(); return; }
    sheet.setTitle(now.event.title);
    replaceChildren(sheet.body, renderEventDetails(now.event, {
      me, getMember,
      onEdit: canEdit && mayEdit(now) ? showEditor : null,
      onClose: null,
      showPageLink: false,
      onChanged: showDetails,
    }));
  };
  const showEditor = () => {
    const now = findEvent(eventId);
    if (!now) { sheet.close(); return; }
    const members = now.space.memberIds.map(getMember).filter(Boolean);
    replaceChildren(sheet.body, renderEventEditor({
      event: now.event, isNew: false, members, showAttendees: members.length > 1, me,
      homeGroupId: now.space.kind === 'group' ? now.space.id : null,
      mineToggle: now.space.kind === 'group',
      kinds: ['entry', 'event'],
      onSave: (fields) => {
        updateEvent(eventId, (saved) => Object.assign(saved, fields));
        showToast(`Saved "${fields.title}".`);
        if (fields.kind === 'event') { sheet.setTitle(fields.title); renderEventPage(sheet.body, eventId); } else showDetails();
      },
      onCancel: showDetails,
      onDelete: () => {
        const module = getModule(now.moduleId);
        updateModuleData(now.moduleId, { ...module.data, events: module.data.events.filter((e) => e.id !== eventId) });
        showToast(`Deleted "${now.event.title}".`);
        sheet.close();
      },
    }));
  };
  showDetails();
  return sheet;
}

/** Entries: anyone in the group (they're the group's); events: hosts, or anyone for group events. */
function mayEdit({ event, space }) {
  const me = getCurrentUser();
  if (!me || me.isGuest) return false;
  return canEditEvent(event, me.id) || (space.memberIds.includes(me.id) && (event.kind === 'entry' || event.visibility === 'group'));
}

/**
 * A new entry or event, in a sheet over the calendar.
 * @param {{ draft: object, members: object[], homeGroupId?: string | null, mineToggle?: boolean,
 *           kinds?: string[], onSave: (fields: object) => void, onClosed?: () => void }} options
 */
export function openNewItemSheet({ draft, members, homeGroupId = null, mineToggle = false, kinds = ['entry', 'event'], onSave, onClosed = () => {} }) {
  const sheet = openSheet({ title: 'New', onClosed });
  const me = getCurrentUser();
  sheet.body.append(renderEventEditor({
    event: normalizeEvent(draft), isNew: true, members, showAttendees: members.length > 1, me,
    homeGroupId, mineToggle, kinds,
    onSave: (fields) => { onSave(fields); sheet.close(); },
    onCancel: () => sheet.close(),
    onDelete: null,
  }));
  return sheet;
}
