// @ts-check
/**
 * event-details.js — an event at a glance: when, where, who's hosting,
 * the RSVP buttons and the guest list. Shown in the calendar's side panel
 * when you click an event, and as the body of an event's own page.
 *
 *   ┌───────────────────────────── × ┐
 *   ▌ Potluck in the backyard         │
 *   │ 📅 Saturday, November 21 · 6:00 – 9:00pm
 *   │ 📍 237 Hart St backyard
 *   │ (AA) Hosted by Anna · Public
 *   │ [👍 Going · 5] [🤔 Maybe · 2] [😢 Can't go]
 *   │ Going (5) (LL)(AA)…
 *   │ Bring a dish to share!
 *   │ Event page · Edit · Duplicate · Delete
 *   └────────────────────────────────┘
 */

import { renderEventTags } from './event-tags.js';
import { placeById } from '../utils/places.js';
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { renderText } from '../ui/text.js';
import { formatLongDate } from '../utils/dates.js';
import {
  VISIBILITY, REPEAT_OPTIONS, timeRangeLabel, isMultiDay, colorValue, timeToMinutes, addMinutesToTime, DEFAULT_EVENT_LENGTH_MINUTES,
} from '../modules/calendar/calendar-data.js';
import { renderPoll } from '../ui/poll-view.js';
import { chooseOption } from '../utils/polls.js';
import { findEvent, updateEvent } from '../state/events.js';
import { rsvpButtons, guestList, rsvpSummary } from './rsvp.js';
import { eventCoverBanner } from './event-cover.js';
import { openEventShare } from './event-share.js';
import { availabilityChip } from '../ui/availability-chip.js';

export function eventHref(eventId) {
  return `#event-${eventId}`;
}

/** "Saturday, November 21 · 6:00 – 9:00pm" or "Nov 21 – Nov 23" */
export function whenLabel(event) {
  if (isMultiDay(event)) return timeRangeLabel(event);
  return `${formatLongDate(event.date)} · ${timeRangeLabel(event)}`;
}

/** A link that searches a map for the place (opens in a new tab). */
export function mapLink(location) {
  return h('a', {
    href: `https://www.openstreetmap.org/search?query=${encodeURIComponent(location)}`,
    target: '_blank',
    rel: 'noopener noreferrer',
  }, location);
}

/**
 * @param {object} event
 * @param {object} options {
 *   me, getMember,
 *   onRsvp(answer),                       ← RSVP buttons (omit to hide them)
 *   onEdit, onDuplicate, onDelete, onClose, ← omit any you don't offer
 *   showPageLink,                         ← link to the event's own page
 *   note,                                 ← an extra line at the top (e.g. "From 237 Hart Street")
 *   onChanged,                            ← called after a vote moves the event (to redraw)
 * }
 */
/**
 * "Directions": opens the phone's own maps app with the event as the
 * destination (Apple Maps on iPhones, iPads and Macs; Google Maps
 * elsewhere), which does the routing. No map service or API key needed.
 */
const IS_APPLE = /iPhone|iPad|Macintosh/.test(navigator.userAgent);

export function directionsUrl(event) {
  const destination = [event.location, placeById(event.area)?.name].filter(Boolean).join(', ');
  if (!destination) return null;
  const query = encodeURIComponent(destination);
  return IS_APPLE ? `https://maps.apple.com/?daddr=${query}` : `https://www.google.com/maps/dir/?api=1&destination=${query}`;
}

export function directionsButton(event, { small = true } = {}) {
  const url = directionsUrl(event);
  if (!url) return null;
  return h('a', {
    class: `button${small ? ' button--small' : ''} directions-button`,
    href: url, target: '_blank', rel: 'noopener noreferrer',
    title: IS_APPLE ? 'Open in Apple Maps' : 'Open in Google Maps',
  }, icon('pin', 14), ' Directions');
}

/** " · Eastside" after the location (or the area alone). */
export function areaLabel(event) {
  const place = placeById(event.area);
  if (!place) return null;
  return h('span', { class: 'event-details__muted' }, event.location ? ` · ${place.name}` : place.name);
}

export function renderEventDetails(event, options) {
  if (event.kind === 'entry') return renderEntryDetails(event, options);
  const { me, getMember, onRsvp, onEdit, onDuplicate, onDelete, onClose, showPageLink = true, note = null } = options;
  const host = getMember(event.createdBy);
  const visibility = VISIBILITY.find((v) => v.id === event.visibility);
  const repeat = event.repeat !== 'none' ? REPEAT_OPTIONS.find((r) => r.id === event.repeat)?.label : null;
  const showRsvp = Boolean(onRsvp);

  const found = me && !me.isGuest ? findEvent(event.id) : null;

  return h('div', { class: 'event-details', style: { '--event-color': colorValue(event.color) } },
    onClose ? h('button', { type: 'button', class: 'icon-button event-details__close', 'aria-label': 'Close', onClick: onClose }, icon('close', 16)) : null,
    eventCoverBanner(event, 'event-details__cover'),
    note,
    h('h2', { class: 'event-details__title' }, event.title),
    renderEventTags(event),
    h('p', { class: 'event-details__row' }, icon('calendar', 14), ` ${whenLabel(event)}`, repeat ? h('span', { class: 'event-details__muted' }, ` · ${repeat}`) : null),
    event.location || event.area ? h('p', { class: 'event-details__row' }, icon('pin', 14), ' ',
      event.location ? mapLink(event.location) : null, areaLabel(event), ' ', directionsButton(event)) : null,
    h('p', { class: 'event-details__row event-details__host' },
      host ? [avatar(host, 22), ` Hosted by ${host.id === me.id ? 'you' : host.name}`] : 'Host unknown',
      h('span', { class: `event-badge event-badge--${event.visibility}` }, visibility?.label ?? 'Group event')),
    event.timePoll ? renderTimePoll(event, me, options.onChanged) : null,
    showRsvp ? h('div', { class: 'event-details__rsvp' },
      rsvpButtons(event, me.id, onRsvp, { compact: true }),
      h('p', { class: 'event-details__muted' }, rsvpSummary(event)),
      availabilityChip(event, { date: options.date ?? event.date })) : null,
    event.notes ? h('p', { class: 'event-details__notes' }, renderText(event.notes)) : null,
    h('div', { class: 'event-details__guests' }, guestList(event, getMember)),
    h('div', { class: 'event-details__actions' },
      showPageLink ? h('a', { href: eventHref(event.id) }, 'Event page') : null,
      found ? h('button', { type: 'button', class: 'link-button', onClick: () => openEventShare(found, me) }, 'Share') : null,
      onEdit ? h('button', { type: 'button', class: 'link-button', onClick: onEdit }, 'Edit') : null,
      onDuplicate ? h('button', { type: 'button', class: 'link-button', onClick: onDuplicate }, 'Duplicate') : null,
      onDelete ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: onDelete }, 'Delete') : null,
    ),
  );
}

/**
 * A calendar entry (not an event): when, where, notes and who's involved.
 * No host, RSVPs or event page.
 */
function renderEntryDetails(entry, { me, getMember, onEdit, onDuplicate, onDelete, onClose, note = null }) {
  const addedBy = getMember(entry.createdBy);
  const involved = entry.attendeeIds.map(getMember).filter(Boolean);
  const repeat = entry.repeat !== 'none' ? REPEAT_OPTIONS.find((r) => r.id === entry.repeat)?.label : null;
  return h('div', { class: 'event-details', style: { '--event-color': colorValue(entry.color) } },
    onClose ? h('button', { type: 'button', class: 'icon-button event-details__close', 'aria-label': 'Close', onClick: onClose }, icon('close', 16)) : null,
    note,
    h('h2', { class: 'event-details__title' }, entry.title),
    h('p', { class: 'event-details__row' }, icon('calendar', 14), ` ${whenLabel(entry)}`, repeat ? h('span', { class: 'event-details__muted' }, ` · ${repeat}`) : null),
    entry.location ? h('p', { class: 'event-details__row' }, icon('pin', 14), ' ', mapLink(entry.location)) : null,
    involved.length ? h('p', { class: 'event-details__row event-details__involved' },
      h('span', { class: 'event-details__muted' }, 'Involved: '),
      involved.map((member) => h('span', { class: 'chip' }, avatar(member, 18), ` ${member.id === me.id ? 'You' : member.name.split(' ')[0]}`))) : null,
    entry.notes ? h('p', { class: 'event-details__notes' }, renderText(entry.notes)) : null,
    h('p', { class: 'event-details__muted' }, 'Calendar entry', addedBy ? ` · added by ${addedBy.id === me.id ? 'you' : addedBy.name}` : ''),
    h('div', { class: 'event-details__actions' },
      onEdit ? h('button', { type: 'button', class: 'link-button', onClick: onEdit }, 'Edit') : null,
      onDuplicate ? h('button', { type: 'button', class: 'link-button', onClick: onDuplicate }, 'Duplicate') : null,
      onDelete ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: onDelete }, 'Delete') : null,
    ),
  );
}

/**
 * An event's "Which time works?" poll. Guests vote; the host picks a time
 * ("Use this time"), which moves the event there and closes the poll.
 * Saved on the event wherever it lives (js/state/events.js).
 */
export function renderTimePoll(event, me, onChanged = null) {
  const isHost = event.createdBy === me.id;
  return h('div', { class: 'event-details__time-poll' },
    renderPoll({
      getPoll: () => findEvent(event.id)?.event.timePoll ?? null,
      savePoll: (poll) => updateEvent(event.id, (saved) => { saved.timePoll = poll; }),
      me,
      canVote: true,
      canManage: isHost,
      onChoose: (option) => {
        updateEvent(event.id, (saved) => {
          const length = saved.allDay ? 0 : timeToMinutes(saved.endTime) - timeToMinutes(saved.time);
          saved.date = option.when.date;
          saved.endDate = option.when.date;
          saved.allDay = !option.when.time;
          saved.time = option.when.time;
          saved.endTime = option.when.time ? addMinutesToTime(option.when.time, length > 0 ? length : DEFAULT_EVENT_LENGTH_MINUTES) : '';
          saved.timePoll = chooseOption(saved.timePoll, option.id);
        });
        onChanged?.();
      },
    }));
}
