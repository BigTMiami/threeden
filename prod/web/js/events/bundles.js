// @ts-check
/**
 * bundles.js — regular work, set up in one step. A bundle fills in an
 * event and adds what usually comes with it:
 *
 *   🗣 Monthly meeting    every month · an agenda to start from
 *   🍲 Potluck            "bring a dish" notes
 *   🧤 Volunteer day      "what to wear" notes
 *   🎸 Weekly practice    every week
 *
 * (Nov 20: bundles no longer add sign-ups; event pages don't have them.)
 *
 * Everyone who answers Going gets a reminder the day before (reminders.js),
 * so the bundle doesn't need to set those up. Used by Plan an event
 * (new-event-page.js) and the + button (js/editor/quick-create.js).
 */

export const BUNDLES = [
  {
    id: 'meeting', emoji: '🗣️', label: 'Monthly meeting', hint: 'Repeats monthly, with an agenda to start from',
    fields: { title: 'Monthly meeting', time: '18:30', endTime: '20:00', repeat: 'monthly', color: 'green', notes: 'Agenda is on the event page. Add anything you want to talk about.' },
    agenda: '1. Welcome and introductions\n2. Updates since last time\n3. Decisions to make\n4. Who’s doing what\n5. Next meeting',
  },
  {
    id: 'potluck', emoji: '🍲', label: 'Potluck', hint: 'Everyone brings a dish',
    fields: { title: 'Potluck', time: '18:00', endTime: '21:00', repeat: 'none', color: 'orange', notes: 'Bring a dish to share. Label it if it has nuts.' },
  },
  {
    id: 'volunteer', emoji: '🧤', label: 'Volunteer day', hint: 'A morning of helping out, with what to wear',
    fields: { title: 'Volunteer day', time: '09:00', endTime: '13:00', repeat: 'none', color: 'green', notes: 'Wear clothes that can get dirty. Gloves and water are provided.' },
  },
  {
    id: 'practice', emoji: '🎸', label: 'Weekly practice', hint: 'Repeats weekly',
    fields: { title: 'Practice', time: '19:00', endTime: '21:00', repeat: 'weekly', color: 'blue', notes: '' },
  },
];

/** Add a bundle's extras to an event about to be created (changes `event`). */
export function applyBundle(event, bundle) {
  if (!bundle) return event;
  if (bundle.agenda) event.minutes = { ...event.minutes, [event.date]: { text: `Agenda\n${bundle.agenda}`, by: event.createdBy, at: Date.now() } };
  event.bundle = bundle.id;
  return event;
}
