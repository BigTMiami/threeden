/**
 * calendar-editor.js — the side panel for creating or editing a calendar
 * entry or an event (see KINDS in calendar-data.js).
 *
 *   ┌ New event ─────────────── × ┐
 *   │ [Calendar entry | Event]     │  ← which kind (entries skip everything about guests)
 *   │ [Title                     ] │
 *   │ ☐ All day                    │
 *   │ Starts [Nov 14 ] [7:00pm]    │
 *   │ Ends   [Nov 16 ] [11:00am]   │
 *   │ Location [                 ] │
 *   │ Who can see it ○ Group members ○ Invite only ○ Public │   (events)
 *   │ Invite [Leo][Maya]… [@username] │                          (events)
 *   │ Who's involved [Leo][Maya]   │                             (entries)
 *   │ Notes [                    ] │
 *   │ [+ Add ▾] Cover photo · Repeat · Tags · Limit · Which time works?
 *   │ Delete            Cancel Save│
 *   └──────────────────────────────┘
 *
 * Everything else is behind "+ Add" (Nov 15): a field shows once it's added,
 * or straight away when it already has something in it (editing an event
 * that repeats, has a photo, tags, or a limit). No patterns for covers, no
 * colors, and no Area field: an event without a photo has no banner, its
 * color comes from its calendar, and its area for Explore is still guessed
 * from what's typed in Location.
 *
 * Changes are only saved when you press Save, so a half-filled event never
 * shows up on the calendar.
 *
 * Moving the start (date or time) moves the end with it, keeping the
 * event's length, like most calendar apps. Change the end directly to make
 * the event longer or shorter. An event can end on a later day.
 */

import { guessPlace } from '../../utils/places.js';
import { tagPicker } from '../../events/event-tags.js';
import { coverPicker } from '../../events/event-cover.js';
import { h, appendChildren, replaceChildren } from '../../ui/dom.js';
import { pollAttacher } from '../../ui/poll-view.js';
import { icon } from '../../ui/icons.js';
import { memberToggles } from '../../ui/member-toggles.js';
import { addDays, daysBetween } from '../../utils/dates.js';
import {
  REPEAT_OPTIONS, VISIBILITY, KINDS, addMinutesToTime, timeToMinutes, minutesToTime, DEFAULT_EVENT_LENGTH_MINUTES,
} from './calendar-data.js';
import { getAccounts, findAccountByLogin } from '../../state/accounts.js';
import { avatar } from '../../ui/avatar.js';

const MINUTES_PER_DAY = 24 * 60;

/**
 * @param {object}   options
 * @param {object}   options.event       the event to edit (a draft, for new events)
 * @param {boolean}  options.isNew
 * @param {object[]} options.members     people who can be invited
 * @param {boolean}  options.showAttendees  false on a personal calendar (it's just you)
 * @param {object}   options.me            the person editing (the host of new events)
 * @param {function} options.onSave      called with the edited fields
 * @param {function} options.onCancel
 * @param {function} options.onDelete    (existing events only)
 * @param {string[]} options.kinds       which kinds can be chosen (Upcoming events only makes events)
 */
export function renderEventEditor({ event, isNew, members, showAttendees, me, onSave, onCancel, onDelete, kinds = ['entry', 'event'] }) {
  // A working copy; nothing is saved until "Save".
  const draft = structuredClone(event);
  if (!kinds.includes(draft.kind)) draft.kind = kinds[0];
  const noun = () => (draft.kind === 'event' ? 'event' : 'entry');

  const field = (labelText, control, extraClass = '') => h('label', { class: `event-editor__field ${extraClass}` },
    h('span', { class: 'event-editor__label' }, labelText), control);

  // ─── Inputs ────────────────────────────────────────────────────────────────

  const titleInput = h('input', {
    type: 'text',
    class: 'event-editor__title',
    placeholder: draft.kind === 'event' ? 'Event name' : 'What is it?',
    value: draft.title,
    'aria-label': 'Name',
    onInput: (e) => { draft.title = e.target.value; errorText.textContent = ''; },
  });

  // ─── Starts / Ends ─────────────────────────────────────────────────────────
  //
  // To keep the length when the start moves, times are compared as
  // "minutes since the start day's midnight", so 11:00am two days later is
  // 2 × 1440 + 660.

  /** Minutes from the start day's midnight to the end. */
  function lengthInMinutes() {
    return daysBetween(draft.date, draft.endDate) * MINUTES_PER_DAY
      + timeToMinutes(draft.endTime) - timeToMinutes(draft.time);
  }

  /** Put the end `minutes` after the start (may land on a later day). */
  function setEndFromLength(minutes) {
    const endTotal = timeToMinutes(draft.time) + minutes;
    draft.endDate = addDays(draft.date, Math.floor(endTotal / MINUTES_PER_DAY));
    draft.endTime = minutesToTime(endTotal % MINUTES_PER_DAY);
    endDateInput.value = draft.endDate;
    endTimeInput.value = draft.endTime;
  }

  /** Change the start, carrying the end along with it. */
  function moveStart(changes) {
    const days = daysBetween(draft.date, draft.endDate);
    const length = lengthInMinutes();
    Object.assign(draft, changes);
    if (draft.allDay) {
      draft.endDate = addDays(draft.date, days);
      endDateInput.value = draft.endDate;
    } else {
      setEndFromLength(length > 0 ? length : DEFAULT_EVENT_LENGTH_MINUTES);
    }
    errorText.textContent = '';
  }

  const startDateInput = h('input', {
    type: 'date', class: 'input', value: draft.date, 'aria-label': 'Start date',
    onChange: (e) => { if (e.target.value) moveStart({ date: e.target.value }); },
  });
  const startTimeInput = h('input', {
    type: 'time', class: 'input', value: draft.time, 'aria-label': 'Start time',
    onChange: (e) => { if (e.target.value) moveStart({ time: e.target.value }); },
  });
  const endDateInput = h('input', {
    type: 'date', class: 'input', value: draft.endDate, 'aria-label': 'End date',
    onChange: (e) => { draft.endDate = e.target.value; errorText.textContent = ''; },
  });
  const endTimeInput = h('input', {
    type: 'time', class: 'input', value: draft.endTime, 'aria-label': 'End time',
    onChange: (e) => { draft.endTime = e.target.value; errorText.textContent = ''; },
  });

  const whenRow = (labelText, dateControl, timeControl) => h('div', { class: 'event-editor__when-row' },
    h('span', { class: 'event-editor__label' }, labelText), dateControl, timeControl);

  const whenFields = h('div', { class: 'event-editor__when' },
    whenRow('Starts', startDateInput, startTimeInput),
    whenRow('Ends', endDateInput, endTimeInput),
  );

  /** All-day events only have dates; hide the time inputs. */
  function showTimes(isVisible) {
    startTimeInput.hidden = !isVisible;
    endTimeInput.hidden = !isVisible;
  }

  const allDayInput = h('input', {
    type: 'checkbox',
    checked: draft.allDay,
    onChange: (e) => {
      draft.allDay = e.target.checked;
      if (!draft.allDay && !draft.time) {
        draft.time = '09:00';
        startTimeInput.value = draft.time;
        draft.endTime = draft.endDate === draft.date ? addMinutesToTime(draft.time, DEFAULT_EVENT_LENGTH_MINUTES) : '17:00';
        endTimeInput.value = draft.endTime;
      }
      showTimes(!draft.allDay);
    },
  });
  showTimes(!draft.allDay);

  const repeatSelect = h('select', { class: 'input', onChange: (e) => { draft.repeat = e.target.value; } },
    REPEAT_OPTIONS.map((option) => h('option', { value: option.id, selected: option.id === draft.repeat }, option.label)));

  // The area (for Explore's "near you") is guessed from what's typed in Location; there's no field for it.
  const locationInput = h('input', {
    type: 'text', class: 'input', placeholder: 'Where?', value: draft.location,
    onInput: (e) => {
      draft.location = e.target.value;
      const guess = guessPlace(draft.location);
      if (guess) draft.area = guess.id;
    },
  });

  const tagsField = h('div', { class: 'event-editor__field' },
    h('span', { class: 'event-editor__label' }, 'Tags'),
    tagPicker(draft.tags ?? [], (tags) => { draft.tags = tags; }),
    h('span', { class: 'event-editor__hint' }, 'Up to three, so people looking for this kind of thing can find it.'));

  // A cover image for the event page, the Feed, and share cards (events only).
  const coverField = h('div', { class: 'event-editor__field' },
    h('span', { class: 'event-editor__label visually-hidden' }, 'Cover'),
    coverPicker(draft.cover, (cover) => { draft.cover = cover; }));

  const notesInput = h('textarea', {
    class: 'input', rows: '4', placeholder: 'Details, links, what to bring…',
    onInput: (e) => { draft.notes = e.target.value; },
  });
  notesInput.value = draft.notes;

  // ─── Who can see it, invitations, limit ────────────────────────────────────

  const visibilityChoices = h('div', { class: 'event-editor__visibility', role: 'radiogroup', 'aria-label': 'Who can see it' },
    VISIBILITY.filter((option) => showAttendees || option.id !== 'group').map((option) => h('label', { class: 'event-editor__visibility-choice', title: option.description },
      h('input', {
        type: 'radio',
        name: `visibility-${draft.id}`,
        value: option.id,
        checked: draft.visibility === option.id || (!showAttendees && draft.visibility === 'group' && option.id === 'invite'),
        onChange: () => { draft.visibility = option.id; drawGuests(); },
      }),
      h('span', {}, option.label))));
  if (!showAttendees && draft.visibility === 'group') draft.visibility = 'invite';

  // Entries: tick who's involved. Events: invite people (anyone with an
  // account), who then answer the RSVP themselves.
  const guestsSlot = h('div', { class: 'event-editor__field' });
  const inviteInput = h('input', { type: 'text', class: 'input input--compact', placeholder: '@username', list: `invite-list-${draft.id}`, 'aria-label': 'Invite someone by username' });
  const inviteError = h('span', { class: 'event-editor__hint' });

  function drawGuests() {
    guestsSlot.replaceChildren();
    if (draft.kind === 'entry') {
      if (!showAttendees) return;
      appendChildren(guestsSlot, [
        h('span', { class: 'event-editor__label' }, 'Who’s involved'),
        memberToggles(members, draft.attendeeIds, (ids) => { draft.attendeeIds = ids; }, 'Who’s involved'),
        h('span', { class: 'event-editor__hint' }, 'It shows on their own calendars too.')]);
      return;
    }
    const invited = draft.inviteeIds.map((id) => getAccounts().find((a) => a.id === id)).filter(Boolean);
    const others = getAccounts().filter((a) => a.id !== me?.id && !draft.inviteeIds.includes(a.id));
    appendChildren(guestsSlot, [
      h('span', { class: 'event-editor__label' }, { public: 'Invite people (anyone can still RSVP)', group: 'Invite people (everyone in the group can RSVP)' }[draft.visibility] ?? 'Invite people'),
      showAttendees ? memberToggles(members.filter((m) => m.id !== me?.id), draft.inviteeIds.filter((id) => members.some((m) => m.id === id)), (ids) => {
        // Keep invitees from outside the group; replace the group members part.
        const outside = draft.inviteeIds.filter((id) => !members.some((m) => m.id === id));
        draft.inviteeIds = [...ids, ...outside];
        drawGuests();
      }, 'Invite group members') : null,
      invited.filter((a) => !members.some((m) => m.id === a.id)).length ? h('div', { class: 'event-editor__invited' },
        invited.filter((a) => !members.some((m) => m.id === a.id)).map((account) => h('span', { class: 'chip' },
          avatar(account, 18), ` ${account.name} `,
          h('button', {
            type: 'button',
            class: 'icon-button icon-button--subtle',
            'aria-label': `Uninvite ${account.name}`,
            onClick: () => { draft.inviteeIds = draft.inviteeIds.filter((id) => id !== account.id); drawGuests(); },
          }, icon('close', 10))))) : null,
      h('div', { class: 'form-row' },
        inviteInput,
        h('button', {
          type: 'button',
          class: 'button button--small',
          onClick: () => {
            const account = findAccountByLogin(inviteInput.value);
            if (!account) { inviteError.textContent = 'No account with that username.'; return; }
            if (!draft.inviteeIds.includes(account.id) && account.id !== me?.id) draft.inviteeIds = [...draft.inviteeIds, account.id];
            inviteInput.value = '';
            drawGuests();
          },
        }, 'Invite')),
      h('datalist', { id: `invite-list-${draft.id}` }, others.map((a) => h('option', { value: `@${a.username}` }, a.name))),
      inviteError]);
  }
  drawGuests();

  // Just type a number (no spinner); anything else means no limit.
  const capacityInput = h('input', {
    type: 'text',
    inputmode: 'numeric',
    pattern: '[0-9]*',
    class: 'input input--compact event-editor__capacity',
    placeholder: 'No limit',
    value: draft.capacity ?? '',
    'aria-label': 'Most people who can come',
    onInput: (e) => {
      const digits = e.target.value.replace(/[^0-9]/g, '');
      if (digits !== e.target.value) e.target.value = digits;
      draft.capacity = digits ? Math.max(1, Number(digits)) : null;
    },
  });

  const errorText = h('p', { class: 'form-error', role: 'alert' });

  // ─── Events: "Which time works?" ───────────────────────────────────────────
  // Not sure when yet? The host offers a few times; guests vote on the event
  // page, and the host picks one ("Use this time"), which moves the event.

  const timePoll = pollAttacher({ me, kind: 'time' });
  timePoll.button.lastChild.textContent = ' Ask which time works';
  const timePollField = h('div', { class: 'event-editor__field event-editor__time-poll' });
  function drawTimePoll() {
    if (draft.timePoll) {
      replaceChildren(timePollField,
        h('span', { class: 'event-editor__label' }, 'Time poll'),
        h('p', { class: 'event-editor__hint' }, `“${draft.timePoll.question}”, ${draft.timePoll.options.length} times offered. Guests vote on the event page. `,
          h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { draft.timePoll = null; drawTimePoll(); } }, 'Remove poll')));
    } else {
      replaceChildren(timePollField, timePoll.button, timePoll.slot);
    }
  }
  drawTimePoll();

  // ─── Saving ────────────────────────────────────────────────────────────────

  function handleSave(submitEvent) {
    submitEvent.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      errorText.textContent = `Give the ${noun()} a name.`;
      titleInput.focus();
      return;
    }
    if (!draft.date || !draft.endDate) {
      errorText.textContent = 'Pick a start and end date.';
      return;
    }
    if (draft.endDate < draft.date) {
      errorText.textContent = 'The end date can’t be before the start date.';
      return;
    }
    if (!draft.allDay && lengthInMinutes() <= 0) {
      errorText.textContent = 'The end needs to be after the start.';
      return;
    }
    const { poll: newTimePoll, error: pollError } = draft.kind === 'event' && !draft.timePoll ? timePoll.read() : { poll: null };
    if (pollError) { errorText.textContent = pollError; return; }
    const guestFields = draft.kind === 'entry'
      ? { visibility: 'group', inviteeIds: [], rsvps: {}, capacity: null, timePoll: null }
      // A new event: the host is going.
      : { rsvps: isNew && me ? { [me.id]: 'going', ...draft.rsvps } : draft.rsvps, timePoll: newTimePoll ?? draft.timePoll ?? null };
    onSave({
      ...draft,
      ...guestFields,
      title,
      location: draft.location.trim(),
      area: draft.area ?? null,
      tags: draft.kind === 'event' ? draft.tags ?? [] : [],
      cover: draft.kind === 'event' ? draft.cover ?? null : null,
      time: draft.allDay ? '' : draft.time,
      endTime: draft.allDay ? '' : draft.endTime,
    });
  }

  requestAnimationFrame(() => { if (isNew) titleInput.focus(); });

  // ─── Calendar entry or event ───────────────────────────────────────────────

  const heading = h('span', { class: 'event-editor__heading' });
  const visibilityField = h('div', { class: 'event-editor__field' }, h('span', { class: 'event-editor__label' }, 'Who can see it'), visibilityChoices);
  const capacityField = h('label', { class: 'event-editor__field event-editor__field--inline' }, h('span', { class: 'event-editor__label' }, 'Limit'), capacityInput, h('span', { class: 'event-editor__hint' }, 'people (optional)'));
  const repeatField = field('Repeat', repeatSelect);

  // ─── "+ Add": the extras, shown once added (or when they already hold something) ───

  const OPTIONAL = [
    { id: 'cover', label: 'Cover photo', icon: 'image', kinds: ['event'], el: coverField, has: () => draft.cover?.kind === 'image' && Boolean(draft.cover.image) },
    { id: 'repeat', label: 'Repeat', icon: 'repeat', kinds: ['entry', 'event'], el: repeatField, has: () => Boolean(draft.repeat) && draft.repeat !== 'none' },
    { id: 'tags', label: 'Tags', icon: 'hash', kinds: ['event'], el: tagsField, has: () => (draft.tags ?? []).length > 0 },
    { id: 'capacity', label: 'A limit on how many can come', icon: 'people', kinds: ['event'], el: capacityField, has: () => draft.capacity != null },
    { id: 'timePoll', label: 'Ask which time works', icon: 'calendar', kinds: ['event'], el: timePollField, has: () => Boolean(draft.timePoll) },
  ];
  const added = new Set();
  const addSlot = h('div', { class: 'event-editor__add' });
  let addOpen = false;
  function drawOptional() {
    for (const option of OPTIONAL) option.el.hidden = !(option.kinds.includes(draft.kind) && (added.has(option.id) || option.has()));
    const left = OPTIONAL.filter((option) => option.kinds.includes(draft.kind) && option.el.hidden);
    if (!left.length) { replaceChildren(addSlot); return; }
    replaceChildren(addSlot,
      h('button', {
        type: 'button', class: 'button button--small event-editor__add-button', 'aria-expanded': String(addOpen),
        onClick: () => { addOpen = !addOpen; drawOptional(); },
      }, icon('plus', 14), ' Add'),
      addOpen ? h('div', { class: 'event-editor__add-list', role: 'group', 'aria-label': 'Add to this' }, left.map((option) => h('button', {
        type: 'button', class: 'chip event-editor__add-choice',
        onClick: () => {
          added.add(option.id);
          addOpen = false;
          drawOptional();
          if (option.id === 'timePoll') timePoll.button.click();
          option.el.querySelector('input, select, textarea, button')?.focus();
        },
      }, icon(option.icon, 13), ` ${option.label}`))) : null);
  }

  const deleteButton = isNew || !onDelete ? h('span') : h('button', { type: 'button', class: 'link-button link-button--danger', onClick: onDelete });
  const kindHint = h('p', { class: 'event-editor__hint event-editor__kind-hint' });

  const kindSwitch = kinds.length > 1 ? h('div', { class: 'segmented event-editor__kind', role: 'group', 'aria-label': 'Calendar entry or event' },
    KINDS.map((kind) => h('button', {
      type: 'button',
      class: 'segmented__option',
      'aria-pressed': String(draft.kind === kind.id),
      dataset: { kind: kind.id },
      onClick: () => { draft.kind = kind.id; drawKind(); },
    }, kind.label))) : null;

  /** Show the fields that go with the chosen kind. */
  function drawKind() {
    const isEventKind = draft.kind === 'event';
    heading.textContent = `${isNew ? 'New' : 'Edit'} ${isEventKind ? 'event' : 'calendar entry'}`;
    titleInput.placeholder = isEventKind ? 'Event name' : 'What is it?';
    visibilityField.hidden = !isEventKind;
    drawOptional();
    if (deleteButton.tagName === 'BUTTON') deleteButton.textContent = isEventKind ? 'Delete event' : 'Delete entry';
    kindHint.textContent = KINDS.find((k) => k.id === draft.kind).description;
    kindSwitch?.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.kind === draft.kind);
      b.setAttribute('aria-pressed', String(b.dataset.kind === draft.kind));
    });
    drawGuests();
  }

  const form = h('form', { class: 'event-editor', 'aria-label': isNew ? 'New calendar item' : 'Edit calendar item', onSubmit: handleSave },
    h('div', { class: 'event-editor__top' },
      heading,
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: onCancel }, icon('close', 16)),
    ),
    kindSwitch,
    kindSwitch ? kindHint : null,
    coverField, // first, big: an event's cover is what guests see first
    titleInput,
    h('label', { class: 'event-editor__all-day' }, allDayInput, ' All day'),
    whenFields,
    repeatField,
    field('Location', locationInput),
    visibilityField,
    tagsField,
    guestsSlot,
    capacityField,
    timePollField,
    field('Notes', notesInput),
    addSlot,
    draft.repeat !== 'none' && !isNew
      ? h('p', { class: 'event-editor__hint' }, 'This repeats. Changes apply to every time it happens.')
      : null,
    errorText,
    h('div', { class: 'event-editor__actions' },
      deleteButton,
      h('span', { class: 'event-editor__buttons' },
        h('button', { type: 'button', class: 'button button--quiet button--small', onClick: onCancel }, 'Cancel'),
        h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Save'),
      ),
    ),
  );
  drawKind();
  return form;
}
