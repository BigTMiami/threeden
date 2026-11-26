// @ts-check
/**
 * league.js — a rec league and two of its teams, to show modules shared
 * across groups (js/state/shared-modules.js): the league's game calendar
 * lives in Riverside Rec League and shows on both teams' homepages.
 *
 *   Riverside Rec League   Marcus runs it; Leo helps (admin). Has the calendar.
 *   River Foxes            Leo's team (he's its admin). The calendar: to look at.
 *   Thunder FC             Erik's team. The calendar: they can add events too.
 */

import { daysFromToday, hoursAgo } from './helpers.js';

const game = (id, title, days, time, location, extra = {}) => ({
  id, kind: 'event', title, date: daysFromToday(days), allDay: false, time, endTime: addHours(time, 1.5), location, notes: '',
  color: 'green', createdBy: 'm-marcus', repeat: 'none', visibility: 'group', capacity: null, inviteeIds: [], rsvps: {}, attendeeIds: [],
  area: 'riverside', tags: ['sports', 'outdoors'], ...extra,
});

function addHours(time, hours) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + hours * 60;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const announce = (id, authorId, title, body, hours) => ({ id, authorId, title, body, pinned: false, createdAt: hoursAgo(hours), seenBy: [], comments: [] });

function group(id, name, groupType, description, roles, modules) {
  return {
    id, kind: 'group', name, visibility: 'private', joining: 'request', description, groupType,
    memberIds: Object.keys(roles), roles, permissions: {}, appearance: {}, joinRequests: [], modules,
  };
}

/** Two reports on Erik's post, for the moderation queue (js/groups/moderation-tab.js). */
export function createLeagueReports() {
  const base = { key: 'announcement:league-post-spam', kind: 'announcement', spaceId: 'league', moduleId: 'league-announcements', itemId: 'league-post-spam', authorId: 'm-erik', reason: 'spam' };
  return [
    { id: 'rep-demo-1', ...base, memberId: 'm-iris', note: 'Third time this month.', at: hoursAgo(5) },
    { id: 'rep-demo-2', ...base, memberId: 'm-owen', note: '', at: hoursAgo(4) },
  ];
}

export function createLeague() {
  const share = (spaceId, canEdit, linkId) => ({ spaceId, canEdit, linkId });
  const linked = (linkId, spaceId) => ({
    id: linkId, type: 'calendar', title: 'League schedule', span: 12, rows: 14, data: { events: [] }, // shows the league's data
    linkedFrom: { moduleId: 'league-calendar', spaceId: 'league' },
  });
  return [
    group('league', 'Riverside Rec League', 'Sports league', 'Adult coed soccer, six teams, fall season. Games Saturdays at Riverside Park.',
      { 'm-marcus': 'owner', 'm-leo': 'admin', 'm-erik': 'member', 'm-iris': 'member', 'm-owen': 'member', 'm-theo': 'member' }, [
        {
          id: 'league-announcements', type: 'announcements', title: 'League news', span: 12, rows: 9,
          data: { posts: [
            announce('league-post-1', 'm-marcus', 'Playoff schedule is up', 'It’s on the League schedule, which is on every team’s page too. Ties go to penalty kicks.', 20),
            // Reported twice (see createLeagueReports): Group settings → Moderation.
            announce('league-post-spam', 'm-erik', 'CHEAP CLEATS 70% OFF', 'Best prices on cleats and jerseys!!! Message me for the link, cash only, today only.', 6),
          ] },
        },
        {
          // Shared with both teams: one schedule, three homepages.
          id: 'league-calendar', type: 'calendar', title: 'League schedule', span: 12, rows: 14,
          sharedWith: [share('team-foxes', false, 'foxes-schedule'), share('team-thunder', true, 'thunder-schedule')],
          data: {
            events: [
              game('league-g-1', 'Foxes vs. Thunder', 2, '10:00', 'Riverside Park, north field'),
              game('league-g-2', 'Foxes vs. Pirates', 9, '11:30', 'Riverside Park, south field'),
              game('league-g-3', 'Thunder vs. Comets', 9, '10:00', 'Riverside Park, north field'),
              game('league-g-4', 'Semifinals', 16, '10:00', 'Riverside Park, north field'),
              game('league-g-5', 'Final and potluck', 23, '12:00', 'Riverside Park, pavilion', { notes: 'Every team brings a dish.' }),
              { ...game('thunder-practice', 'Thunder practice', 5, '18:30', 'Lincoln Elementary field'), createdBy: 'm-erik', color: 'purple' },
            ],
          },
        },
      ]),
    group('team-foxes', 'River Foxes', 'Sports team', 'The best-dressed team in the Riverside Rec League.',
      { 'm-leo': 'owner', 'm-iris': 'member', 'm-owen': 'member' }, [
        {
          id: 'foxes-announcements', type: 'announcements', title: 'Team news', span: 12, rows: 8,
          data: { posts: [announce('foxes-post-1', 'm-leo', 'Saturday: Thunder', 'Big one. Wear orange. Iris is bringing oranges (the fruit).', 6)] },
        },
        linked('foxes-schedule', 'team-foxes'),
      ]),
    group('team-thunder', 'Thunder FC', 'Sports team', 'Purple shirts. Loud.',
      { 'm-erik': 'owner', 'm-theo': 'member', 'm-marcus': 'member' }, [
        linked('thunder-schedule', 'team-thunder'),
      ]),
  ];
}
