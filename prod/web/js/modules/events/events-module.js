// @ts-check
/**
 * events-module.js — the Upcoming events module: calendar events as a
 * list, with RSVPs. Works on group homepages, your own homepage, and
 * blogs, e.g. a band's upcoming gigs (visitors can RSVP, only the owner edits).
 *
 * Files in this folder:
 *   events-module.js   ← this file: the module definition
 *   events-source.js   which events it shows: its space's Calendar, or its own
 *   events-list.js     the event row and date block, shared by card and page
 *   events-card.js     the homepage card
 *   events-page.js     the full page with filters and a details panel
 *
 * Data shape: { events: [ …calendar events… ], ownEvents: false }
 *   `events` is only used when the space has no Calendar module (or when
 *   `ownEvents` is true); otherwise it shows the Calendar's events.
 */

import { renderEventsCard } from './events-card.js';
import { renderEventsPage } from './events-page.js';

export const eventsModule = {
  type: 'events',
  label: 'Upcoming events',
  description: 'Events as a list, with RSVPs (same events as the calendar)',
  icon: 'calendar',
  defaultSpan: 4,
  defaultRows: 14,
  available: true,
  spaceKinds: ['group', 'personal', 'blog'], // a band's blog can list its gigs

  createInitialData() {
    return { events: [], ownEvents: false };
  },

  render: renderEventsCard,
  renderFullPage: renderEventsPage,

  // Same rules as the calendar: events you're going or invited to also show
  // on your own homepage.
  assignments: {
    items: (data) => data.events ?? [],
    isAssignedTo: (event, memberId) => (event.attendeeIds ?? []).includes(memberId)
      || (event.inviteeIds ?? []).includes(memberId)
      || ['going', 'maybe'].includes(event.rsvps?.[memberId]),
    includeOutsideGroups: true,
    sourceTypes: ['calendar', 'events'],
  },
};
