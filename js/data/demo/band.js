// @ts-check
/**
 * band.js — "Porch Lights", a four-piece folk band Leo plays guitar in.
 *
 * Shows a hobby group with a public face:
 *   Home (public)   a photo feed and upcoming gigs anyone can see and RSVP to
 *   Band room       news, rehearsals and gigs on the calendar, the band chat
 *   The EP          a Gantt plan for recording, a vault of songs and set
 *                   lists, and a song board kept as a vault file
 * Band room and The EP are members-only.
 */

import { daysFromToday, hoursAgo, nextWeekday, touched, event, post, card } from './helpers.js';
import { demoPhoto, mixedShape } from '../demo-photos.js';

// People post a mix of upright, square, and wide photos: unless a shape is given, the photo's id picks one.
const photo = (id, scene, caption, shape = mixedShape(id)) => ({ id, kind: 'image', src: demoPhoto(scene, shape), caption });
const feedPost = (id, authorId, hours, text, media) => ({ id, authorId, createdAt: hoursAgo(hours), editedAt: null, text, media, attachments: [] });

const BAND_IDS = ['m-jamal', 'm-leo', 'm-iris', 'm-theo'];

export function createBand() {
  return {
    id: 'porchlights',
    groupType: 'Band',
    kind: 'group',
    name: 'Porch Lights',
    visibility: 'public', joining: 'admins', // a band: anyone can follow, only admins add members
    description: 'Four friends, two guitars, one upright bass, and a cajón. Rehearsals Wednesdays at Jamal’s.',
    memberIds: BAND_IDS,
    roles: { 'm-jamal': 'owner', 'm-leo': 'admin', 'm-iris': 'member', 'm-theo': 'member' },
    permissions: {},
    appearance: { font: 'typewriter', accent: '#ac6600', background: 'dusk', cover: { kind: 'preset', preset: 'sunrise', focus: 50, height: 'short' }, cards: 'flat', corners: 'rounded' },
    tabs: [
      { id: 'home', name: 'Home', visibility: 'public' },
      { id: 'band-tab-room', name: 'Band room' },
      { id: 'band-tab-ep', name: 'The EP' },
    ],
    modules: [
      // ─── Home (public) ───────────────────────────────────────────────────
      {
        id: 'band-photos', type: 'photofeed', title: 'Photos', span: 8, rows: 12,
        data: {
          events: [],
          posts: [
            // Pictures with a connected event under them (and a mix of upright, square, and wide shots).
            { ...feedPost('band-fp-0', 'm-jamal', 3, 'We’re playing the Juniper Street Fair! Main stage, 2 o’clock. Bring a blanket and a friend.', [
              photo('band-m-10', 'stage', 'Sound check', 'tall'), photo('band-m-11', 'porch', 'Last rehearsal before the fair', 'wide'), photo('band-m-12', 'choir', 'Harmonies, finally', 'square'), photo('band-m-13', 'sunset', 'Golden hour set', 'tall'),
            ]), attachments: [{ kind: 'event', eventId: 'band-ev-2' }] },
            // Two more the same afternoon: the Feed shows the three as one card ("Jamal, Theo, and 1 other posted 3 times").
            feedPost('band-fp-0b', 'm-theo', 4, 'Load-in plan: the van at noon, the porch crew at one.', [photo('band-m-14', 'skyline', 'The view from the stage', 'square')]),
            feedPost('band-fp-0c', 'm-iris', 5, 'Setlist draft for the fair. Thoughts?', [photo('band-m-15', 'leaves', 'Setlist on the porch', 'tall')]),
            feedPost('band-fp-1', 'm-jamal', 30, 'Wednesday rehearsal, porch edition. The new one is coming together.', [photo('band-m-1', 'porch', 'Rehearsal on Jamal’s porch')]),
            feedPost('band-fp-2', 'm-iris', 96, 'Three-part harmony practice. We’re getting there!', [photo('band-m-2', 'choir', 'Harmonies', 'tall'), photo('band-m-3', 'leaves', 'Juniper Lane in October')]),
            feedPost('band-fp-3', 'm-leo', 200, 'Our first gig: the Backroom open mic.', [photo('band-m-4', 'stage', 'The Backroom')]),
          ],
        },
      },
      { id: 'band-gigs', type: 'events', title: 'Upcoming gigs', span: 4, rows: 12, data: { events: [], ownEvents: false } },

      // ─── Band room (members only) ────────────────────────────────────────
      {
        id: 'band-announcements', type: 'announcements', title: 'Band news', span: 8, rows: 11, tabId: 'band-tab-room',
        data: {
          posts: [
            post('band-post-1', 'm-jamal', 'We’re booked at the Juniper Street Fair!', 'Saturday the 5th, 2pm slot, 40 minutes. Let’s pick the set at Wednesday’s rehearsal. Draft set list is in the vault under The EP.', {
              pinned: true, createdAt: hoursAgo(18), seenBy: ['m-iris'],
              comments: [{ id: 'band-post-1-c1', authorId: 'm-iris', body: 'Can we open with the new one? It’s a good porch song.', createdAt: hoursAgo(16) }],
            }),
          ],
        },
      },
      {
        id: 'band-calendar', type: 'calendar', title: 'Rehearsals & gigs', span: 4, rows: 11, tabId: 'band-tab-room',
        data: {
          events: [
            event('band-ev-1', 'Rehearsal', nextWeekday(3), { time: '19:30', endTime: '22:00', location: 'Jamal’s porch (garage if it rains)', color: 'orange', repeat: 'weekly', attendeeIds: BAND_IDS, createdBy: 'm-jamal' }),
            // Nobody is hosting this yet: Group settings → Health asks an organizer to (js/groups/health-tab.js).
            event('band-ev-merch', 'Merch table at the street fair', daysFromToday(23), { kind: 'event', visibility: 'group', time: '12:00', endTime: '17:00', location: 'Juniper & 5th, by the main stage', color: 'yellow', rsvps: { 'm-iris': 'maybe' }, inviteeIds: [], createdBy: '' }),
            // A public event (anyone can RSVP); rehearsals and recording days are just calendar entries.
            event('band-ev-2', 'Porch Lights at the Juniper Street Fair', daysFromToday(23), {
              kind: 'event', visibility: 'public', time: '14:00', endTime: '14:40', location: 'Main stage, Juniper & 5th',
              notes: 'Our first festival set! Forty minutes of porch songs, including two from the upcoming EP.', color: 'purple',
              // A cover photo (js/events/event-cover.js): on the event page, in the Feed, and on share cards.
              cover: { kind: 'image', image: demoPhoto('stage', 'panorama'), width: 1000, height: 420, x: 50, y: 50, zoom: 1 },
              // A customized page (js/events/event-page-layout.js): a schedule and links up top.
              page: {
                order: ['rsvp', 'b-sched', 'facts', 'about', 'b-links', 'guests', 'bring'],
                hidden: [],
                blocks: [
                  { id: 'b-sched', kind: 'schedule', title: 'The day', items: [{ time: '12:00', what: 'Fair opens' }, { time: '3:30', what: 'Porch Lights on the Main Stage' }, { time: '4:10', what: 'Merch table by the fountain' }] },
                  { id: 'b-links', kind: 'links', title: 'Before you come', links: [{ label: 'Street fair map', url: 'https://example.com/fair-map' }, { label: 'Our songs on Bandcamp', url: 'https://example.com/porchlights' }] },
                ],
              },
              attendeeIds: BAND_IDS, createdBy: 'm-jamal', inviteeIds: [], capacity: null,
              rsvps: { 'm-jamal': 'going', 'm-leo': 'going', 'm-iris': 'going', 'm-theo': 'going', 'm-maya': 'going', 'm-nora': 'maybe' },
            }),
            event('band-ev-4', 'Load in for the street fair', daysFromToday(23), { time: '13:15', endTime: '13:45', location: 'Behind the main stage', notes: 'Bring the long cables.', color: 'orange', attendeeIds: BAND_IDS, createdBy: 'm-jamal' }),
            event('band-ev-3', 'Recording day 1', daysFromToday(16), { allDay: true, location: 'Basement Tapes studio', notes: 'Drums and bass first.', color: 'red', attendeeIds: BAND_IDS, createdBy: 'm-leo' }),
          ],
        },
      },
      { id: 'band-chat', type: 'chat', title: 'Band chat', span: 12, rows: 10, tabId: 'band-tab-room', data: { conversationId: 'conv-porch' } },
      {
        id: 'band-merch', type: 'sheet', title: 'Merch table', span: 6, rows: 12, tabId: 'band-tab-room',
        data: {
          cols: 6, rows: 20, header: true,
          cells: {
            A1: 'Item', B1: 'Price', C1: 'Made', D1: 'Sold', E1: 'Left', F1: 'Taken in',
            A2: 'T-shirt (black)', B2: '20', C2: '40', D2: '27', E2: '=C2-D2', F2: '=B2*D2',
            A3: 'Tote bag', B3: '12', C3: '30', D3: '11', E3: '=C3-D3', F3: '=B3*D3',
            A4: 'EP on cassette', B4: '8', C4: '50', D4: '32', E4: '=C4-D4', F4: '=B4*D4',
            A5: 'Sticker pack', B5: '3', C5: '100', D5: '64', E5: '=C5-D5', F5: '=B5*D5',
            A7: 'Total', D7: '=SUM(D2:D5)', E7: '=SUM(E2:E5)', F7: '=SUM(F2:F5)',
          },
        },
      },

      // ─── The EP ───────────────────────────────────────────────────────────
      {
        id: 'band-gantt', type: 'gantt', title: 'Recording the EP', span: 12, rows: 11, tabId: 'band-tab-ep',
        data: {
          tasks: [
            { id: 'bg-1', name: 'Finish writing the last song', start: daysFromToday(-14), end: daysFromToday(-2), progress: 100, color: 'purple', assigneeIds: ['m-jamal', 'm-leo'], notes: '' },
            { id: 'bg-2', name: 'Arrange and rehearse all five', start: daysFromToday(-7), end: daysFromToday(14), progress: 45, color: 'orange', assigneeIds: BAND_IDS, notes: 'Two run-throughs per rehearsal.' },
            { id: 'bg-3', name: 'Recording day 1', start: daysFromToday(16), end: daysFromToday(16), milestone: true, color: 'red', assigneeIds: BAND_IDS, notes: '' },
            { id: 'bg-4', name: 'Overdubs and vocals', start: daysFromToday(17), end: daysFromToday(24), progress: 0, color: 'blue', assigneeIds: ['m-jamal', 'm-iris'], notes: '' },
            { id: 'bg-5', name: 'Mixing', start: daysFromToday(25), end: daysFromToday(38), progress: 0, color: 'green', assigneeIds: ['m-leo'], notes: 'Leo’s friend at the studio will help.' },
            { id: 'bg-6', name: 'Release show', start: daysFromToday(45), end: daysFromToday(45), milestone: true, color: 'purple', assigneeIds: BAND_IDS, notes: '' },
          ],
        },
      },
      {
        id: 'band-vault', type: 'vault', title: 'Songs & set lists', span: 6, rows: 13, tabId: 'band-tab-ep',
        data: {
          items: [
            { id: 'band-folder-songs', kind: 'folder', name: 'Songs', parentId: null, ...touched('m-jamal', 40) },
            {
              id: 'band-setlist', kind: 'note', name: 'Street fair set list (draft)', parentId: null, ...touched('m-jamal', 18),
              html: '<h3>Street fair: 40 minutes</h3><ol><li>Juniper Morning (new)</li><li>Two Bus Transfers</li><li>The Radiator Song</li><li>Slow Porch Waltz</li><li>Last Light (singalong)</li></ol><p>Spare if we have time: Rent Day Blues.</p>',
            },
            {
              id: 'band-song-radiator', kind: 'note', name: 'The Radiator Song: chords', parentId: 'band-folder-songs', ...touched('m-leo', 40),
              html: '<p><b>Capo 2.</b> Verse: G – C – G – D. Chorus: C – G – Em – D. Bridge drops to just bass and cajón.</p>',
            },
            {
              id: 'band-songboard', kind: 'module', moduleType: 'kanban', name: 'Song status', parentId: null, ...touched('m-leo', 20),
              data: {
                columns: [{ id: 'sb-c1', title: 'Writing' }, { id: 'sb-c2', title: 'Arranging' }, { id: 'sb-c3', title: 'Ready to record' }],
                cards: [
                  card('sb-k1', 'sb-c1', 'Rent Day Blues', { assigneeIds: ['m-jamal'], createdAt: hoursAgo(30) }),
                  card('sb-k2', 'sb-c2', 'Juniper Morning', { description: 'Needs a harmony on the last chorus.', assigneeIds: ['m-iris', 'm-leo'], color: 'orange', createdAt: hoursAgo(28) }),
                  card('sb-k3', 'sb-c2', 'Slow Porch Waltz', { assigneeIds: ['m-theo'], createdAt: hoursAgo(26) }),
                  card('sb-k4', 'sb-c3', 'The Radiator Song', { color: 'green', createdAt: hoursAgo(80) }),
                  card('sb-k5', 'sb-c3', 'Two Bus Transfers', { color: 'green', createdAt: hoursAgo(90) }),
                ],
              },
            },
            { id: 'band-demo-link', kind: 'link', name: 'Rehearsal recordings (example link)', parentId: null, ...touched('m-theo', 60), url: 'https://example.org/porch-lights-demos' },
          ],
        },
      },
      {
        id: 'band-songboard-view', type: 'vaultfile', title: 'Song status', span: 6, rows: 13, tabId: 'band-tab-ep',
        data: { vaultModuleId: 'band-vault', itemId: 'band-songboard' },
      },
    ],
  };
}
