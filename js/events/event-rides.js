// @ts-check
/**
 * event-rides.js — getting there together, on an event's page.
 *
 *   Rides
 *   🚗 Theo can drive 3 · 1 seat left · Grace, Leo   [Ride with Theo]
 *   🙋 Iris needs a ride
 *   [I can drive ▾ 3 seats]  [I need a ride]
 *
 * Anyone going (or maybe) can offer seats or ask for a ride. Asking for a
 * ride puts you on the list; drivers see who's asking and the rider picks
 * a car ("Ride with Theo"), which tells the driver. Saved on the event:
 *
 *   event.rides = { drivers: { [memberId]: seats }, riders: { [memberId]: driverId | null } }
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { getMember } from '../state/store.js';
import { updateEvent } from '../state/events.js';
import { notify } from '../state/notifications.js';
import { rsvpOf } from '../modules/calendar/calendar-data.js';
import { hasHappened } from '../state/event-followups.js';

const first = (id) => getMember(id)?.name.split(' ')[0] ?? 'Someone';

export function ridesOf(event) {
  return { drivers: { ...(event.rides?.drivers ?? {}) }, riders: { ...(event.rides?.riders ?? {}) } };
}

const seatsLeft = (rides, driverId) => (rides.drivers[driverId] ?? 0) - Object.values(rides.riders).filter((d) => d === driverId).length;

export function renderRides(event, me, redraw) {
  if (!me || me.isGuest || event.kind === 'task' || hasHappened(event)) return null;
  const answer = rsvpOf(event, me.id);
  const isIn = answer === 'going' || answer === 'maybe' || event.createdBy === me.id;
  const rides = ridesOf(event);
  const driverIds = Object.keys(rides.drivers);
  const waiting = Object.entries(rides.riders).filter(([, d]) => !d).map(([id]) => id);
  if (!isIn && !driverIds.length && !waiting.length) return null;

  const change = (fn, message) => {
    updateEvent(event.id, (e) => { const r = ridesOf(e); fn(r); e.rides = r; });
    if (message) showToast(message);
    redraw();
  };
  const iDrive = me.id in rides.drivers;
  const myRide = rides.riders[me.id];
  const asking = me.id in rides.riders;

  const seats = h('select', { class: 'input input--compact', 'aria-label': 'Seats you can offer' },
    [1, 2, 3, 4, 5, 6].map((n) => h('option', { value: String(n), selected: n === (rides.drivers[me.id] ?? 3) }, `${n} ${n === 1 ? 'seat' : 'seats'}`)));

  return h('section', { class: 'event-page__rides' },
    h('h2', { class: 'event-page__section-title' }, 'Rides'),
    driverIds.length || waiting.length ? h('ul', { class: 'event-rides' },
      driverIds.map((id) => {
        const left = seatsLeft(rides, id);
        const passengers = Object.entries(rides.riders).filter(([, d]) => d === id).map(([r]) => first(r));
        return h('li', { class: 'event-rides__row' },
          h('span', { class: 'event-rides__icon', 'aria-hidden': 'true' }, '🚗'),
          h('span', { class: 'event-rides__text' },
            h('strong', {}, id === me.id ? 'You' : first(id)), ` can drive ${rides.drivers[id]} · ${left > 0 ? `${left} ${left === 1 ? 'seat' : 'seats'} left` : 'full'}`,
            passengers.length ? h('span', { class: 'event-details__muted' }, ` · ${passengers.join(', ')}`) : null),
          id !== me.id && isIn && !iDrive && myRide !== id && left > 0
            ? h('button', {
              type: 'button', class: 'button button--small',
              onClick: () => {
                change((r) => { r.riders[me.id] = id; }, `You’re riding with ${first(id)}. They’ve been told.`);
                notify({ recipientIds: [id], actorId: me.id, kind: 'ride', text: `${me.name} is riding with you to “${event.title}”`, href: `#event-${event.id}` });
              },
            }, `Ride with ${first(id)}`)
            : myRide === id ? h('button', { type: 'button', class: 'link-button', onClick: () => change((r) => { r.riders[me.id] = null; }, 'Okay, you’re back on the list for a ride.') }, 'Not riding') : null);
      }),
      waiting.map((id) => h('li', { class: 'event-rides__row' },
        h('span', { class: 'event-rides__icon', 'aria-hidden': 'true' }, '🙋'),
        h('span', { class: 'event-rides__text' }, h('strong', {}, id === me.id ? 'You' : first(id)), id === me.id ? ' need a ride' : ' needs a ride')))) : null,
    isIn ? h('div', { class: 'form-row event-rides__actions' },
      iDrive
        ? [h('span', { class: 'event-details__muted' }, `You’re driving (${rides.drivers[me.id]} seats).`),
          h('button', { type: 'button', class: 'link-button', onClick: () => change((r) => { delete r.drivers[me.id]; for (const [rid, d] of Object.entries(r.riders)) if (d === me.id) r.riders[rid] = null; }, 'You’re not driving. Anyone riding with you is back on the list.') }, 'I can’t drive after all')]
        : asking ? null : [seats, h('button', {
          type: 'button', class: 'button button--small', onClick: () => change((r) => { r.drivers[me.id] = Number(seats.value); delete r.riders[me.id]; }, 'Thanks! People who need a ride can pick your car.'),
        }, icon('plus', 13), ' I can drive')],
      !iDrive && !asking ? h('button', { type: 'button', class: 'button button--small', onClick: () => change((r) => { r.riders[me.id] = null; }, 'You’re on the list. Drivers can see you need a ride.') }, 'I need a ride') : null,
      asking && !myRide ? h('button', { type: 'button', class: 'link-button', onClick: () => change((r) => { delete r.riders[me.id]; }, 'Okay, off the list.') }, 'I found a ride') : null) : null);
}
