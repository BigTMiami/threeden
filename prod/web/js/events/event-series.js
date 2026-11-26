// @ts-check
/**
 * event-series.js — a repeating event's page of dates (#series-<eventId>).
 *
 *   ← Open mic night
 *   Every week on Tuesdays · 7:00pm · Hosted by Jamal
 *   [👍 Going to all of them] [🤔 Maybe] [😢 Not for me]
 *
 *   Coming up                         Earlier
 *   Tue, Nov 17   9 going  [Skip]     Nov 10   7 went · 3 photos
 *   Tue, Nov 24   8 going  [Skip]     Nov 3    9 went
 *   …
 *
 * One event, many dates: Going carries over to every date, and you skip the
 * ones you'll miss (event.skips, as on the event page). Opened from "See
 * every date" on the event page.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { getCurrentUser, getMember, getSpace } from '../state/store.js';
import { goBack, backLabel } from '../router.js';
import { findEvent, updateEvent, canViewEvent } from '../state/events.js';
import { rsvpOf, occurrencesBetween, applyRsvp, hostIdsOf, colorValue } from '../modules/calendar/calendar-data.js';
import { todayKey, addDays, fromDateKey, weekdayName, formatShortDate, formatTime } from '../utils/dates.js';
import { rsvpButtons } from './rsvp.js';
import { eventHref } from './event-details.js';

const AHEAD_DAYS = 120;
const BEHIND_DAYS = 60;

/** "Every week on Tuesdays", "Every month on the 3rd", "Every day". */
export function repeatLabel(event) {
  const d = fromDateKey(event.date);
  if (event.repeat === 'weekly') return `Every week on ${weekdayName(d.getDay())}s`;
  if (event.repeat === 'monthly') {
    const n = d.getDate();
    const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
    return `Every month on the ${n}${suffix}`;
  }
  if (event.repeat === 'daily') return 'Every day';
  return 'Once';
}

const goingOn = (event, date) => Object.entries(event.rsvps ?? {}).filter(([id, a]) => a === 'going' && !(event.skips?.[id] ?? []).includes(date)).map(([id]) => id);

export function renderSeriesPage(container, eventId) {
  const me = getCurrentUser();
  const found = findEvent(eventId);
  const redraw = () => renderSeriesPage(container, eventId);
  if (!found || !canViewEvent(found, me.id) || found.event.repeat === 'none') {
    replaceChildren(container,
      h('a', { class: 'link-button module-page__back', href: found ? eventHref(eventId) : '#' }, icon('arrowLeft', 14), ' Back'),
      h('p', { class: 'module-empty' }, found && found.event.repeat === 'none' ? 'This event happens once, so it doesn’t have a series page.' : 'This event doesn’t exist, or you can’t see it.'));
    return;
  }
  const { event, space } = found;
  const start = todayKey();
  const dates = (from, to) => [...new Set(occurrencesBetween([event], from, to).filter((o) => o.dayNumber === 1).map((o) => o.date))];
  const upcoming = dates(start, addDays(start, AHEAD_DAYS)).slice(0, 10);
  const earlier = dates(addDays(start, -BEHIND_DAYS), addDays(start, -1)).filter((d) => d >= event.date).reverse().slice(0, 6);
  const mine = rsvpOf(event, me.id);
  const skipped = new Set(event.skips?.[me.id] ?? []);
  const hosts = hostIdsOf(event).map(getMember).filter(Boolean);

  const toggleSkip = (date) => {
    const was = skipped.has(date);
    updateEvent(event.id, (e) => {
      const set = new Set(e.skips?.[me.id] ?? []);
      if (set.has(date)) set.delete(date); else set.add(date);
      e.skips = { ...e.skips, [me.id]: [...set].filter((d) => d >= start) };
    });
    showToast(was ? `You’re back for ${formatShortDate(date)}.` : `Skipping ${formatShortDate(date)}.`);
    redraw();
  };
  const photosOn = (date) => (event.photos ?? []).filter((p) => p.at && new Date(p.at).toISOString().slice(0, 10) >= date && new Date(p.at).toISOString().slice(0, 10) <= addDays(date, 2)).length;

  replaceChildren(container,
    h('button', { type: 'button', class: 'link-button module-page__back', onClick: () => goBack(eventHref(event.id)) }, icon('arrowLeft', 14), ` ${backLabel(event.title, (id) => getSpace(id)?.name ?? null)}`),
    h('article', { class: 'series-page', style: { '--event-color': colorValue(event.color) } },
      h('header', { class: 'series-page__head' },
        h('p', { class: 'series-page__kicker' }, icon('repeat', 14), ' A series'),
        h('h1', { class: 'series-page__title' }, event.emoji ? `${event.emoji} ` : '', event.title),
        h('p', { class: 'series-page__when' }, [repeatLabel(event), event.time ? formatTime(event.time) : 'All day', event.location].filter(Boolean).join(' · ')),
        h('p', { class: 'series-page__hosts' }, h('span', { class: 'avatar-row' }, hosts.map((m) => avatar(m, 22))), ` Hosted by ${hosts.map((m) => (m.id === me.id ? 'you' : m.name.split(' ')[0])).join(', ')}`, space.kind === 'group' ? [' · ', h('a', { href: `#space-${space.id}` }, space.name)] : null)),
      h('section', { class: 'series-page__answer' },
        h('h2', { class: 'event-page__section-title' }, mine === 'going' ? 'You’re a regular' : 'Coming to these?'),
        rsvpButtons(event, me.id, (choice) => { updateEvent(event.id, (e) => applyRsvp(e, me.id, choice)); if (choice === 'going') showToast('You’re going to every date. Skip the ones you’ll miss.'); redraw(); }, { compact: true }),
        h('p', { class: 'event-details__muted' }, mine === 'going' ? 'Your Going covers every date. Skip any you’ll miss.' : 'Answer once for every date.')),
      h('div', { class: 'series-page__cols' },
        h('section', {},
          h('h2', { class: 'event-page__section-title' }, 'Coming up'),
          upcoming.length ? h('ul', { class: 'series-page__dates' }, upcoming.map((date, i) => {
            const going = goingOn(event, date);
            const isSkipped = skipped.has(date);
            return h('li', { class: `series-page__date${isSkipped ? ' is-skipped' : ''}${i === 0 ? ' is-next' : ''}` },
              h('span', { class: 'series-page__day' }, h('strong', {}, `${weekdayName(fromDateKey(date).getDay(), true)}, ${formatShortDate(date)}`), i === 0 ? h('span', { class: 'series-page__next' }, 'Next') : null),
              h('span', { class: 'event-details__muted' }, `${going.length} going`),
              mine === 'going' ? h('button', { type: 'button', class: 'button button--small', 'aria-pressed': String(isSkipped), onClick: () => toggleSkip(date) }, isSkipped ? 'Skipping · undo' : 'Skip') : null);
          })) : h('p', { class: 'event-details__muted' }, 'No more dates coming up.')),
        earlier.length ? h('section', {},
          h('h2', { class: 'event-page__section-title' }, 'Earlier'),
          h('ul', { class: 'series-page__dates series-page__dates--past' }, earlier.map((date) => {
            const photos = photosOn(date);
            return h('li', { class: 'series-page__date' },
              h('span', { class: 'series-page__day' }, formatShortDate(date)),
              h('span', { class: 'event-details__muted' }, [`${goingOn(event, date).length} went`, photos ? `${photos} ${photos === 1 ? 'photo' : 'photos'}` : null].filter(Boolean).join(' · ')));
          }))) : null)));
}
