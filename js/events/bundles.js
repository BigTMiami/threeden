// @ts-check
/**
 * bundles.js — regular work, set up in one step. A bundle fills in an
 * event and adds what usually comes with it:
 *
 *   🗣 Monthly meeting    every month · an agenda to start from · sign-ups:
 *                         Facilitator, Note-taker, Snacks
 *   🍲 Potluck            sign-ups: Mains, Sides, Desserts, Drinks, Plates and cups
 *   🧤 Volunteer day      sign-ups: Setup, Check-in, Cleanup · "what to bring" notes
 *   🎸 Weekly practice    every week · sign-up: Bring snacks
 *
 * Everyone who answers Going gets a reminder the day before (reminders.js),
 * so the bundle doesn't need to set those up. Used by Plan an event
 * (new-event-page.js) and the + button (js/editor/quick-create.js).
 */

import { makeId } from '../ui/dom.js';

export const BUNDLES = [
  {
    id: 'meeting', emoji: '🗣️', label: 'Monthly meeting', hint: 'Repeats monthly, with an agenda and roles',
    fields: { title: 'Monthly meeting', time: '18:30', endTime: '20:00', repeat: 'monthly', color: 'green', notes: 'Agenda is on the event page. Add anything you want to talk about.' },
    signups: [['Facilitator', 1], ['Note-taker', 1], ['Snacks', 2]],
    agenda: '1. Welcome and introductions\n2. Updates since last time\n3. Decisions to make\n4. Who’s doing what\n5. Next meeting',
  },
  {
    id: 'potluck', emoji: '🍲', label: 'Potluck', hint: 'Who’s bringing what',
    fields: { title: 'Potluck', time: '18:00', endTime: '21:00', repeat: 'none', color: 'orange', notes: 'Bring a dish to share. Label it if it has nuts.' },
    signups: [['Mains', 3], ['Sides', 3], ['Desserts', 2], ['Drinks', 2], ['Plates and cups', 1]],
  },
  {
    id: 'volunteer', emoji: '🧤', label: 'Volunteer day', hint: 'Setup, check-in, and cleanup sign-ups',
    fields: { title: 'Volunteer day', time: '09:00', endTime: '13:00', repeat: 'none', color: 'green', notes: 'Wear clothes that can get dirty. Gloves and water are provided.' },
    signups: [['Setup', 3], ['Check-in table', 2], ['Cleanup', 3]],
  },
  {
    id: 'practice', emoji: '🎸', label: 'Weekly practice', hint: 'Repeats weekly',
    fields: { title: 'Practice', time: '19:00', endTime: '21:00', repeat: 'weekly', color: 'blue', notes: '' },
    signups: [['Bring snacks', 1]],
  },
];

/** Add a bundle's extras to an event about to be created (changes `event`). */
export function applyBundle(event, bundle) {
  if (!bundle) return event;
  event.signups = [...(event.signups ?? []), ...bundle.signups.map(([label, spots]) => ({ id: makeId('su'), label, spots, memberIds: [] }))];
  if (bundle.agenda) event.minutes = { ...event.minutes, [event.date]: { text: `Agenda\n${bundle.agenda}`, by: event.createdBy, at: Date.now() } };
  event.bundle = bundle.id;
  return event;
}
