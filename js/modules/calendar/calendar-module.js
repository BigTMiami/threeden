// @ts-check
/**
 * calendar-module.js — the Calendar module: events for a group or for you.
 *
 * Files in this folder:
 *   calendar-module.js   ← this file: the module definition
 *   calendar-card.js     the compact homepage card (month grid + coming up)
 *   calendar-page.js     the full page: toolbar, views, editing
 *   calendar-views.js    month, week, day and agenda views
 *   calendar-editor.js   the side panel for creating and editing events
 *   calendar-data.js     event shape, repeats, time math, overlap layout
 *
 * Data shape: { events: [ …see calendar-data.js… ] }
 */

import { renderCalendarCard } from './calendar-card.js';
import { renderCalendarPage } from './calendar-page.js';

export const calendarModule = {
  type: 'calendar',
  label: 'Calendar',
  description: 'Events, dates, and reminders',
  icon: 'calendar',
  defaultSpan: 4,
  defaultRows: 15,
  available: true,

  createInitialData() {
    return { events: [] };
  },

  render: renderCalendarCard,
  renderFullPage: renderCalendarPage,

  // Events you're going to, invited to, or said "maybe" to also show in your
  // own calendar, even from groups you're not in (see linked-items.js).
  assignments: {
    items: (data) => data.events,
    isAssignedTo: (event, memberId) => (event.attendeeIds ?? []).includes(memberId)
      || (event.inviteeIds ?? []).includes(memberId)
      || ['going', 'maybe'].includes(event.rsvps?.[memberId]),
    includeOutsideGroups: true,
    // Events saved in an Upcoming events module count too (js/modules/events/).
    sourceTypes: ['calendar', 'events'],
  },
};
