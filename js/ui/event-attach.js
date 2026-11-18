// @ts-check
/**
 * event-attach.js — "Event" on a Board post (Nov 18): a real calendar event
 * made with the post, so it's on the group's calendar, its Upcoming events,
 * and members' Dashboards, and the post carries its RSVP.
 *
 *   [Event]  →  ┌ An event ─────────────────────────── Remove ┐
 *               │ [Event name (the post's title if empty)  ] │
 *               │ [date] [time]  [Where (optional)         ] │
 *               └────────────────────────────────────────────┘
 *
 *   const ev = eventAttacher();
 *   form.append(ev.slot); row.append(ev.button);
 *   ev.read()  → null | { title, date, time, location }
 *   ev.reset()
 *
 *   addEventToSpace(spaceId, fields, { me, fallbackModuleId, visibility }) → the event
 *     saves it in the space's Calendar (or Upcoming events, or the fallback module)
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { todayKey } from '../utils/dates.js';
import { getSpace, getModule, updateModuleData } from '../state/store.js';
import { createEvent, addMinutesToTime } from '../modules/calendar/calendar-data.js';

const EVENT_LENGTH_MINUTES = 120;

export function eventAttacher() {
  let open = false;
  const title = h('input', { type: 'text', class: 'input', placeholder: 'Event name (the post’s title if empty)', 'aria-label': 'Event name' });
  const date = h('input', { type: 'date', class: 'input input--compact', value: todayKey(), 'aria-label': 'Event date' });
  const time = h('input', { type: 'time', class: 'input input--compact', value: '18:00', 'aria-label': 'Event time' });
  const location = h('input', { type: 'text', class: 'input', placeholder: 'Where (optional)', 'aria-label': 'Where' });
  const slot = h('div', { class: 'event-attach' });
  const button = h('button', {
    type: 'button', class: 'button button--small', title: 'Make a calendar event with this post: people RSVP from the post',
    onClick: () => { open = !open; draw(); if (open) requestAnimationFrame(() => title.focus()); },
  }, icon('calendar', 14), ' Event');

  function draw() {
    button.classList.toggle('is-active', open);
    replaceChildren(slot, open ? h('div', { class: 'asks-attacher__box event-attach__box' },
      h('div', { class: 'poll-attacher__top' }, h('strong', {}, 'An event'),
        h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { open = false; draw(); } }, 'Remove')),
      title,
      h('div', { class: 'form-row' }, date, time, location),
      h('span', { class: 'settings-field__hint' }, 'It goes on the calendar, and people RSVP right from the post.')) : null);
  }
  draw();

  return {
    button,
    slot,
    read: () => (open ? { title: title.value.trim(), date: date.value || todayKey(), time: time.value, location: location.value.trim() } : null),
    reset: () => { open = false; title.value = ''; location.value = ''; date.value = todayKey(); time.value = '18:00'; draw(); },
  };
}

/** Save a new event in a space: its Calendar, else its Upcoming events, else `fallbackModuleId`. */
export function addEventToSpace(spaceId, fields, { me, fallbackModuleId = null, visibility = 'group' }) {
  const event = createEvent({
    kind: 'event',
    ...fields,
    endTime: fields.time ? addMinutesToTime(fields.time, EVENT_LENGTH_MINUTES) : '',
    allDay: !fields.time,
    createdBy: me.id, visibility, attendeeIds: [me.id], rsvps: { [me.id]: 'going' },
  });
  const space = getSpace(spaceId);
  const home = space?.modules.find((m) => m.type === 'calendar') ?? space?.modules.find((m) => m.type === 'events') ?? (fallbackModuleId ? getModule(fallbackModuleId) : null);
  if (home) updateModuleData(home.id, { ...home.data, events: [...(home.data?.events ?? []), event] });
  return event;
}
