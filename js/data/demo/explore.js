// @ts-check
/**
 * explore.js — groups Leo isn't in, to find on the Groups page's Explore
 * tab. Each has an announcement and a public event or two to RSVP to.
 */

import { daysFromToday, hoursAgo, nextWeekday } from './helpers.js';

function publicEvent(id, title, date, time, endTime, location, notes, createdBy, rsvps, fields = {}) {
  return {
    id, title, date, allDay: false, time, endTime, location, notes, color: 'blue', createdBy, repeat: 'none',
    visibility: 'public', capacity: null, inviteeIds: [], rsvps,
    attendeeIds: Object.keys(rsvps).filter((memberId) => rsvps[memberId] === 'going'), ...fields,
  };
}

const GROUP_TYPES = { soccer: 'Sports team', bookclub: 'Book club', parents: 'Parent group', supper: 'Supper club' };

function exploreGroup(id, name, [visibility, joining], description, roles, events, appearance = {}) {
  const ownerId = Object.keys(roles)[0];
  return {
    id, kind: 'group', name, visibility, joining, description, groupType: GROUP_TYPES[id] ?? '',
    memberIds: Object.keys(roles), roles, permissions: {}, appearance, joinRequests: [],
    modules: [
      {
        id: `${id}-announcements`, type: 'announcements', title: 'Announcements', span: 8, rows: 10,
        data: { posts: [{ id: `${id}-post-1`, authorId: ownerId, title: `Welcome to ${name}`, body: description, pinned: true, createdAt: hoursAgo(80), seenBy: [], comments: [] }] },
      },
      { id: `${id}-calendar`, type: 'calendar', title: 'Calendar', span: 4, rows: 10, data: { events } },
    ],
  };
}

export function createExploreGroups() {
  return [
    exploreGroup('soccer', 'Eastside Rec Soccer', ['public', 'open'],
      'Coed pickup soccer for adults, every skill level. Sundays at Riverside Park, all year unless there’s snow.',
      { 'm-marcus': 'owner', 'm-erik': 'member', 'm-iris': 'member' },
      [publicEvent('soccer-ev-1', 'Sunday pickup game', nextWeekday(0), '10:00', '12:00', 'Riverside Park, north field', 'Bring a light and a dark shirt. Spare cleats in the bin.', 'm-marcus', { 'm-marcus': 'going', 'm-iris': 'going', 'm-erik': 'maybe' }, { repeat: 'weekly', color: 'green' })],
      { accent: '#14866d', cover: { kind: 'preset', preset: 'meadow', focus: 50, height: 'short' } }),
    exploreGroup('bookclub', 'Second Tuesday Book Club', ['public', 'open'],
      'One book a month, chosen by vote. We meet at the Juniper Branch Library. Newcomers always welcome, even if you didn’t finish.',
      { 'm-elena': 'owner', 'm-bea': 'member', 'm-grace': 'member' },
      [publicEvent('bookclub-ev-1', 'November meeting', daysFromToday(5), '19:00', '20:30', 'Juniper Branch Library, room B', 'This month: a short novel picked by Grace. Tea provided.', 'm-elena', { 'm-elena': 'going', 'm-grace': 'going', 'm-bea': 'maybe' }, { color: 'purple', capacity: 20 })],
      { cover: { kind: 'preset', preset: 'sunrise', focus: 50, height: 'short' } }),
    exploreGroup('parents', 'Lincoln Elementary Parents', ['public', 'request'],
      'Parents and caregivers at Lincoln Elementary: carpools, the school garden, fundraisers, and the occasional homework SOS.',
      { 'm-marcus': 'owner', 'm-elena': 'admin', 'm-bea': 'member' },
      [publicEvent('parents-ev-1', 'Winter book fair', daysFromToday(15), '15:00', '18:00', 'Lincoln Elementary gym', 'Volunteers needed for the 3–4:30 shift. Proceeds go to the school library.', 'm-elena', { 'm-elena': 'going', 'm-marcus': 'going' }, { color: 'orange' })]),
    // Private and invite only: hidden from Explore and search. Iris has invited Leo
    // (he sees it on his Groups page), and there's an invite link.
    {
      ...exploreGroup('supper', 'Juniper Supper Club', ['private', 'invite'],
        'A dozen neighbors, one potluck a month, rotating houses. Bring a dish and a chair.',
        { 'm-iris': 'owner', 'm-jamal': 'member', 'm-maya': 'admin' },
        [publicEvent('supper-ev-1', 'December potluck at Iris’s', daysFromToday(19), '18:30', '21:30', 'Iris’s place', 'Theme: soups. Iris has bowls; bring a spoon.', 'm-iris', { 'm-iris': 'going', 'm-maya': 'going' }, { color: 'red', visibility: 'group' })],
        { font: 'book', accent: '#a23b2a' }),
      invites: [{ memberId: 'm-leo', invitedBy: 'm-iris', at: hoursAgo(6) }],
      inviteCode: 'supper24',
    },
  ];
}
