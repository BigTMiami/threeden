// @ts-check
/**
 * tenants.js — "Juniper Tenants Union", a neighborhood housing group.
 *
 * Shows organizing tools: public and invite-only events with RSVPs, an
 * Upcoming events list, a forum, and a second tab ("Campaign") with a
 * relationship map of who decides and a door-knocking board. Its General
 * feed ("Shared with the union") carries documents from members' vaults:
 * a note, a spreadsheet, a text file, and a checklist, which open as
 * previews in the Feed.
 */

import { createTenantsBudget } from './budgets.js';
import { daysFromToday, hoursAgo, post, card, thread, reply, task } from './helpers.js';

/** A post in the union's General feed (see js/modules/blog-feeds/feed-data.js). */
// A drawn picture of the buildings (an SVG), so the demo article has a hero image.
const BUILDINGS_SVG = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#dfe8f1"/><rect y="520" width="1200" height="155" fill="#b9c6d3"/><g fill="#7d8fa3"><rect x="120" y="190" width="260" height="330"/><rect x="470" y="120" width="300" height="400"/><rect x="860" y="230" width="230" height="290"/></g><g fill="#f4d58d">' + Array.from({ length: 42 }, (_, i) => `<rect x="${(i % 3) * 70 + [150, 520, 890][Math.floor(i / 15)]}" y="${Math.floor((i % 15) / 3) * 60 + [220, 160, 260][Math.floor(i / 15)]}" width="36" height="34"/>`).join('') + '</g></svg>')}`;

const TENANTS_ARTICLES = [
  {
    id: 'tenants-art-1', authorId: 'm-priya', kicker: 'Rent',
    headline: 'Crestline wants 9% more. Here’s what the numbers say',
    dek: 'We went through the rent increase letters, the city’s tax records, and two years of repair requests. The increase doesn’t add up.',
    hero: { src: BUILDINGS_SVG, caption: 'Buildings A, B, and C on Juniper Street.', credit: 'Drawing: Iris' },
    html: '<p>Every household in Buildings A through C got the same letter in October: rent goes up 9% in January, “due to rising property taxes and operating costs.”</p><p>We checked. The city’s records show Crestline’s tax bill for the three buildings went up 2.1% this year. Its insurance went up, too, but by less than the cost of one month’s rent across the buildings.</p><blockquote>“They’re asking us to pay for repairs they still haven’t made.”</blockquote><p>Meanwhile, the repair log tells a different story. Since last November, tenants filed 61 repair requests. Twenty-three are still open, including the heat in Building C, where it was 59°F on the third floor last week.</p><h2>What we’re asking for</h2><p>At the meeting with Crestline on the 21st, we’ll ask for three things: no increase above 3% until the open repairs are done, a working boiler in Building C before December, and a written schedule for the rest.</p><p>Come to the know your rights workshop first. Bring your letter.</p>',
    status: 'published', createdAt: hoursAgo(30), publishedAt: hoursAgo(26), updatedAt: hoursAgo(26),
    views: 214, readers: 131, viewerIds: [],
  },
  {
    id: 'tenants-art-2', authorId: 'm-maya', kicker: 'Repairs',
    headline: 'One week of heat logs, building by building',
    dek: 'Forty-one readings from nineteen apartments. Building C was below the legal minimum on five of seven nights.',
    hero: null,
    html: '<p>Thank you to everyone who wrote down a temperature this week. Here’s what we found, and what happens next with it.</p><p>Building C was below 62°F at night on five of seven nights. Buildings A and B were fine except for two apartments on the top floor of A.</p><p>We’re sending the log to the city’s housing inspector on Monday, and bringing a copy to Crestline.</p>',
    status: 'published', createdAt: hoursAgo(80), publishedAt: hoursAgo(76), updatedAt: hoursAgo(76),
    views: 96, readers: 58, viewerIds: [],
  },
  {
    // A draft Priya and Leo are writing together (co-authored articles).
    id: 'tenants-art-3', authorId: 'm-priya', coauthorIds: ['m-leo'], kicker: 'Meeting',
    headline: 'What we’ll ask Crestline for on the 3rd',
    dek: 'Three asks, in order: heat fixed for good, the rent increase paused, and a repair log both sides can see.',
    hero: null,
    html: '<p>On the 3rd, six of us sit down with Crestline’s regional manager. We have twenty minutes, so we’re going in with three asks, in this order.</p><h2>1. Heat, fixed for good</h2><p>[Leo: add the numbers from the heat log here, building by building.]</p><h2>2. The increase, paused</h2><p>Until the repairs are done, no new rent.</p><h2>3. One repair log</h2><p>A shared list of every request and when it was closed.</p>',
    status: 'draft', createdAt: hoursAgo(20), updatedAt: hoursAgo(5), publishedAt: null,
    editedBy: { 'm-priya': hoursAgo(5), 'm-leo': hoursAgo(18) }, lastEditedBy: 'm-priya',
    fromNote: { moduleId: 'tenants-vault', itemId: 'tenants-note-asks', name: 'Meeting prep: our asks' },
  },
];

const feedPost = (id, authorId, hours, text, attachments) => ({ id, authorId, createdAt: hoursAgo(hours), editedAt: null, text, media: [], attachments });

/** A copy of a vault file, as a post carries it (see snapshotVaultItem). */
const shared = (item) => ({ kind: 'file', item: { from: { vaultModuleId: null, itemId: item.id }, ...item } });

/** A small text file as a base64 data URL, the way uploads are stored. */
function textFile(id, name, mimeType, text) {
  const bytes = new TextEncoder().encode(text);
  return { id, kind: 'file', name, mimeType, size: bytes.length, dataUrl: `data:${mimeType};base64,${btoa(String.fromCharCode(...bytes))}` };
}

const RENT_LETTER_NOTE = `<h3>Got a rent increase letter? Read this first.</h3>
<p>Crestline sent letters to most of Building C last week. A letter is not a lease, and you don't have to answer it right away. Here is what we know, and what to do.</p>
<h3>1. Don't sign anything new</h3>
<p>Some letters come with a "lease renewal" attached. Signing it agrees to the new rent. If your lease hasn't run out, the old rent stands until it does.</p>
<h3>2. Check the dates</h3>
<p>The law gives you <b>30 days' notice</b> for an increase under 10%, and <b>60 days</b> for anything more. Write down the date the letter arrived, and keep the envelope.</p>
<h3>3. Bring it to office hours</h3>
<p>Legal aid is at the library on Mondays, 5 to 7. Bring the letter, your current lease, and any repair requests you've made. Unanswered repair requests matter: they can count against an increase.</p>
<h3>4. Tell the union</h3>
<p>Add your unit to the heat log (in the post below) and tell @priya or @maya. Every letter we know about makes the case at the meeting on the 3rd stronger.</p>
<h3>What to say if the office calls</h3>
<ul><li>"I got the letter and I'm reviewing it."</li><li>"Please put anything else in writing."</li><li>Nothing about whether you plan to stay.</li></ul>
<p>Questions? Post them in the forum. Nobody has to figure this out alone.</p>`;

const HEAT_LOG = `Date,Building,Unit,Low temp (°F),Called the office?,Fixed?
Oct 28,C,2B,58,Yes,No
Oct 28,C,4A,61,Yes,No
Oct 29,A,1C,63,No,No
Oct 30,C,3D,55,Yes,"Next day, then off again"
Oct 31,B,2A,60,Yes,No
Nov 1,C,2B,57,Yes,No
Nov 2,D,5B,62,No,No
Nov 3,C,1A,59,Yes,Yes
Nov 4,C,4A,56,Yes,No
Nov 5,A,3B,60,Yes,No
Nov 6,C,3D,54,Yes,No
Nov 7,B,4C,61,No,No
Nov 8,C,2B,58,Yes,No
`;

const MEETING_AGENDA = `GENERAL MEETING · Thursday, 7 pm · Building A community room

1. Welcome, and who's new (5 min)
2. Report back: the heat log (Maya, 10 min)
   - 112 complaints since October 1
   - Building C is the worst, by far
3. The meeting with Crestline on the 3rd (Priya, 20 min)
   - What we ask for, in order:
     a. Heat fixed in every unit by December 1
     b. A written repair schedule for Building C
     c. No increases until the heat is fixed
   - Who goes (5 tenants, one from each building, plus Priya)
4. Door knocking this Saturday (Iris, 10 min)
5. Anything else (10 min)

Childcare in the next room. Snacks from the Saturday pantry crew.
`;

export const TENANTS_SHARED_POSTS = [
  feedPost('tenants-fp-1', 'm-priya', 6, 'Lots of you got the rent increase letter this week. I wrote up what to do. Please read it before you call the office.',
    [shared({ id: 'tenants-doc-letter', kind: 'note', name: 'Rent increase letters: what to do', html: RENT_LETTER_NOTE })]),
  feedPost('tenants-fp-2', 'm-maya', 22, 'Here is the heat log so far. Add your unit if your apartment drops under 62°.',
    [shared(textFile('tenants-doc-heat', 'Heat log, October–November.csv', 'text/csv', HEAT_LOG))]),
  feedPost('tenants-fp-3', 'm-iris', 30, 'Agenda for Thursday, plus the checklist for the Crestline meeting. Edits welcome.',
    [
      shared(textFile('tenants-doc-agenda', 'General meeting agenda.txt', 'text/plain', MEETING_AGENDA)),
      shared({
        id: 'tenants-doc-prep', kind: 'module', moduleType: 'todo', name: 'Crestline meeting prep',
        data: {
          tasks: [
            task('tenants-prep-1', 'Print the heat log, five copies', { done: true, assigneeIds: ['m-maya'], createdAt: hoursAgo(40) }),
            task('tenants-prep-2', 'Pick one tenant from each building', { assigneeIds: ['m-priya'], due: daysFromToday(4), createdAt: hoursAgo(36) }),
            task('tenants-prep-3', 'Practice the three asks', { due: daysFromToday(6), createdAt: hoursAgo(30) }),
            task('tenants-prep-4', 'Photos of the broken radiators in 3D', { assigneeIds: ['m-iris'], createdAt: hoursAgo(28) }),
          ],
        },
      }),
    ]),
];

export function createTenantsUnion() {
  return {
    id: 'tenants',
    groupType: 'Tenants union',
    kind: 'group',
    name: 'Juniper Tenants Union',
    visibility: 'public', joining: 'request',
    description: 'Tenants in the four Crestline buildings on Juniper Lane, organizing for heat, repairs, and fair rent. General meetings every first Thursday.',
    memberIds: ['m-priya', 'm-maya', 'm-leo', 'm-owen', 'm-iris'],
    roles: { 'm-priya': 'owner', 'm-maya': 'admin', 'm-leo': 'member', 'm-owen': 'member', 'm-iris': 'member' },
    permissions: {},
    appearance: { font: 'newspaper', accent: '#b32424', background: 'paper', cover: { kind: 'preset', preset: 'brick', focus: 50, height: 'short' }, cards: 'bordered', corners: 'square' },
    joinRequests: [],
    tabs: [{ id: 'home', name: 'Home' }, { id: 'tenants-tab-campaign', name: 'Campaign', visibility: 'public' }],
    modules: [
      // ─── Home ─────────────────────────────────────────────────────────────
      {
        id: 'tenants-announcements', type: 'announcements', title: 'Board', span: 8, rows: 11,
        data: {
          posts: [
            post('tenants-post-1', 'm-priya', 'We got a meeting with Crestline', 'After 112 heat complaints, their regional manager agreed to meet with the union on the 3rd. Come to the general meeting to help plan what we ask for.', {
              pinned: true, createdAt: hoursAgo(14), seenBy: ['m-maya', 'm-iris'],
              comments: [{ id: 'tenants-post-1-c1', authorId: 'm-iris', body: 'Huge! I can bring the heat log printouts.', createdAt: hoursAgo(12) }],
            }),
            // An announcement that asks who's coming and who'll bring what (js/ui/asks.js).
            post('tenants-post-3', 'm-priya', 'Flyering Saturday morning', 'Let’s get the meeting flyer under every door in Buildings A, B, and C before the 3rd. Meet in the Building B lobby.', {
              createdAt: hoursAgo(6), seenBy: ['m-maya'],
              rsvp: { when: 'Sat 10am · Building B lobby', answers: { 'm-priya': 'going', 'm-maya': 'going', 'm-iris': 'maybe' } },
              signups: [
                { id: 'tu-su-1', label: 'Print 300 flyers', spots: 1, memberIds: ['m-maya'] },
                { id: 'tu-su-2', label: 'Building A', spots: 2, memberIds: ['m-priya'] },
                { id: 'tu-su-3', label: 'Building C', spots: 2, memberIds: [] },
                { id: 'tu-su-4', label: 'Coffee and donuts', spots: 1, memberIds: [] },
              ],
            }),
            post('tenants-post-2', 'm-maya', 'Know your rights workshop', 'Legal aid is coming to explain what the rent increase letters can and can’t do. Free, interpretation in Spanish and Cantonese.', { createdAt: hoursAgo(60), seenBy: ['m-priya', 'm-leo'] }),
          ],
        },
      },
      {
        id: 'tenants-calendar', type: 'calendar', title: 'Calendar', span: 4, rows: 11,
        data: { events: createTenantsEvents() },
      },
      {
        id: 'tenants-forum', type: 'forum', title: 'Tenant forum', span: 8, rows: 14,
        data: {
          tags: ['General', 'Repairs', 'Rent', 'Meetings'],
          // Anonymous posts on, since some tenants worry about the landlord finding out; new threads show in members' Feeds.
          settings: { whoCanStart: 'everyone', downvotes: false, qa: false, anonymous: true, showInFeed: true, defaultSort: 'active', guidelines: 'This is a members-only space. Don’t post anyone’s unit number without asking them first. You can post anonymously: only the moderators will see it’s you.' },
          threads: [
            thread('tenants-t1', 'm-priya', 'Heat log: post your apartment temperatures', 'Every morning at 7, write down the temperature in your living room. Post it here or in the shared sheet. The city needs dates and numbers.', {
              tag: 'Repairs', pinned: true, createdAt: hoursAgo(200), votes: { 'm-priya': 1, 'm-maya': 1, 'm-iris': 1, 'm-leo': 1 }, followers: ['m-priya', 'm-leo'],
              replies: [
                reply('tenants-t1-r1', 'm-iris', 'Building C, 3rd floor: 59°F this morning. Again.', { createdAt: hoursAgo(30), votes: { 'm-priya': 1 } }),
                reply('tenants-t1-r2', 'm-owen', '61°F in 2B. The radiator only clanks.', { createdAt: hoursAgo(20) }),
                reply('tenants-t1-r3', 'm-maya', '@leo could you turn the log into a chart for the Crestline meeting? You’re good at that.', { createdAt: hoursAgo(9), votes: { 'm-priya': 1 } }),
              ],
            }),
            thread('tenants-t3', 'm-iris', 'Has anyone been told their lease won’t be renewed?', 'My neighbor got a letter saying they “may not renew” after she filed a heat complaint. Is that retaliation? I don’t want to post my name yet.', {
              tag: 'Rent', anonymous: true, createdAt: hoursAgo(16), votes: { 'm-iris': 1, 'm-owen': 1, 'm-priya': 1 },
              replies: [
                reply('tenants-t3-r1', 'm-priya', 'That can be illegal retaliation. Please bring the letter (or a photo) to the know your rights workshop, or message me privately.', { createdAt: hoursAgo(14), votes: { 'm-maya': 1 } }),
              ],
            }),
            thread('tenants-t2', 'm-owen', 'Did everyone get the rent increase letter?', 'Mine says 9% starting February. Is that even allowed?', {
              tag: 'Rent', createdAt: hoursAgo(70), votes: { 'm-owen': 1, 'm-iris': 1 },
              replies: [
                reply('tenants-t2-r1', 'm-priya', 'Same here. Don’t sign anything yet. That’s exactly what the workshop is for.', { createdAt: hoursAgo(66), votes: { 'm-owen': 1, 'm-maya': 1 } }),
              ],
            }),
          ],
        },
      },
      { id: 'tenants-events', type: 'events', title: 'Upcoming events', span: 4, rows: 14, data: { events: [], ownEvents: false } },
      // Documents shared from the vault: they open as previews in the Feed.
      { id: 'tenants-shared', type: 'generalfeed', title: 'Shared with the union', span: 12, rows: 22, data: { events: [], posts: TENANTS_SHARED_POSTS } },
      // Articles: the union's bulletin, laid out like a news site.
      { id: 'tenants-bulletin', type: 'articles', title: 'The Bulletin', span: 12, rows: 12, data: { articles: TENANTS_ARTICLES } },

      // ─── Campaign ─────────────────────────────────────────────────────────
      { ...createTenantsMap(), tabId: 'tenants-tab-campaign' },
      // The union's shared files: notes written together, which can become articles.
      {
        id: 'tenants-vault', type: 'vault', title: 'Union files', span: 6, rows: 12, tabId: 'tenants-tab-campaign',
        data: {
          items: [
            { id: 'tenants-folder-meeting', kind: 'folder', name: 'Crestline meeting', parentId: null, createdBy: 'm-priya', updatedBy: 'm-priya', updatedAt: hoursAgo(40) },
            {
              id: 'tenants-note-asks', kind: 'note', name: 'Meeting prep: our asks', parentId: 'tenants-folder-meeting', createdBy: 'm-priya', updatedBy: 'm-leo', updatedAt: hoursAgo(22), editorIds: ['m-priya', 'm-leo', 'm-jamal'],
              html: '<p>Three asks, in order. Twenty minutes total.</p><ul><li>Heat fixed for good (bring the heat log)</li><li>Pause the increase until repairs are done</li><li>A repair log both sides can see</li></ul><p>Jamal: who takes notes?</p>',
              articleDraft: { moduleId: 'tenants-bulletin', articleId: 'tenants-art-3' },
            },
            {
              id: 'tenants-note-flyer', kind: 'note', name: 'Flyer text: why join the union', parentId: null, createdBy: 'm-maya', updatedBy: 'm-iris', updatedAt: hoursAgo(9), editorIds: ['m-maya', 'm-iris'],
              html: '<p>Your neighbors are fixing the heat together. 112 complaints got Crestline to the table. Come to the general meeting, first Thursday, Building A community room.</p>',
            },
          ],
        },
      },
      createTenantsBudget(), // Budget: Organization, the year so far
      {
        id: 'tenants-doors', type: 'kanban', title: 'Door knocking: Building C', span: 12, rows: 12, tabId: 'tenants-tab-campaign',
        data: {
          columns: [
            { id: 'door-col-todo', title: 'Not reached yet' },
            { id: 'door-col-talked', title: 'Talked to' },
            { id: 'door-col-in', title: 'Signed on' },
            { id: 'door-col-leader', title: 'Building leaders' },
          ],
          cards: [
            card('door-1', 'door-col-todo', 'Unit 1A', { description: 'Night shift: try after 4pm.', createdAt: hoursAgo(40) }),
            card('door-2', 'door-col-todo', 'Unit 4C', { assigneeIds: ['m-leo'], due: daysFromToday(2), createdAt: hoursAgo(40) }),
            card('door-3', 'door-col-talked', 'Unit 2D', { description: 'Worried about retaliation. Follow up with the legal aid info.', assigneeIds: ['m-iris'], color: 'orange', createdAt: hoursAgo(36) }),
            card('door-4', 'door-col-in', 'Unit 3A', { description: 'Signed the petition and wants to come to the meeting.', color: 'green', createdAt: hoursAgo(50) }),
            card('door-5', 'door-col-in', 'Unit 3F', { color: 'green', createdAt: hoursAgo(48) }),
            card('door-6', 'door-col-leader', 'Unit 3B (Iris)', { assigneeIds: ['m-iris'], color: 'blue', createdAt: hoursAgo(300) }),
          ],
        },
      },
    ],
  };
}

/**
 * The union's events: two public ones anyone can RSVP to, and an
 * invite-only planning dinner Leo hasn't answered yet (so it shows on his
 * own calendar and in his bell).
 */
function createTenantsEvents() {
  const rsvpEvent = (id, title, days, time, endTime, location, notes, fields) => ({
    id, title, date: daysFromToday(days), allDay: false, time, endTime, location, notes, repeat: 'none', createdBy: 'm-priya',
    visibility: 'public', capacity: null, inviteeIds: [], attendeeIds: ['m-priya'], rsvps: { 'm-priya': 'going' }, ...fields,
  });
  return [
    rsvpEvent('tenants-ev-1', 'General meeting', 6, '18:30', '20:00', 'Building A community room', 'Planning for the Crestline meeting. Childcare and interpretation available. Bring your heat log!', {
      color: 'red', cohostIds: ['m-maya'], attendeeIds: ['m-priya', 'm-maya'], rsvps: { 'm-priya': 'going', 'm-maya': 'going', 'm-iris': 'going', 'm-owen': 'maybe' },
    }),
    rsvpEvent('tenants-ev-2', 'Know your rights workshop', 13, '11:00', '12:30', 'Juniper Branch Library', 'Legal aid explains rent increases, repairs, and retaliation. Free and open to any tenant.', {
      color: 'blue', createdBy: 'm-maya', capacity: 50, attendeeIds: ['m-maya'], rsvps: { 'm-maya': 'going', 'm-priya': 'going', 'm-grace': 'maybe' },
    }),
    rsvpEvent('tenants-ev-3', 'Organizing committee dinner', 9, '19:00', '21:00', 'Priya’s place (Building B, 5C)', 'Prep for the Crestline meeting: our three asks and who speaks. I’m making biryani.', {
      // Full, with a waitlist (rsvp.js): Leo sees "Join the waitlist".
      color: 'purple', visibility: 'invite', capacity: 6, inviteeIds: ['m-leo', 'm-maya', 'm-iris', 'm-owen', 'm-nora', 'm-theo', 'm-jamal'],
      attendeeIds: ['m-priya', 'm-maya', 'm-iris', 'm-owen', 'm-nora', 'm-theo'],
      rsvps: { 'm-priya': 'going', 'm-maya': 'going', 'm-iris': 'going', 'm-owen': 'going', 'm-nora': 'going', 'm-theo': 'going' }, waitlist: ['m-jamal'],
    }),
  ];
}

/** Who can get the heat fixed, and how they're connected. */
function createTenantsMap() {
  const node = (id, name, kind, description, x, y, extra = {}) => ({ id, name, kind, description, x, y, size: 'medium', color: 'gray', contactId: '', url: '', notes: '', ...extra });
  const edge = (id, from, to, label, extra = {}) => ({ id, from, to, label, arrow: 'forward', dashed: false, notes: '', ...extra });
  return {
    id: 'tenants-relmap', type: 'relationship', title: 'Who can get the heat fixed', span: 12, rows: 16,
    data: {
      description: 'Goal: working heat in all four buildings before January, and no rent increase until repairs are done.',
      nodes: [
        node('tn-1', 'Crestline Property Management', 'organization', 'Owns all four buildings', 0, -60, { size: 'large', color: 'red', contactId: 'm-priya', notes: 'Regional manager agreed to meet on the 3rd.\nNext step: agree on our three asks.' }),
        node('tn-2', 'Mr. Alvarez', 'person', 'Building super', -360, -170, { size: 'small', color: 'orange', contactId: 'm-owen', notes: 'Sympathetic. Says he’s asked for a new boiler twice.' }),
        node('tn-3', 'City housing inspectors', 'organization', 'Can issue violations', 330, -190, { color: 'gray', contactId: 'm-maya', notes: '112 complaints filed. Two inspections so far.' }),
        node('tn-4', 'Council member Ortiz', 'person', 'District 4', 360, 110, { size: 'large', color: 'green', contactId: 'm-priya', notes: 'Spoke at our rally in October.\nNext step: ask her to attend the Crestline meeting.' }),
        node('tn-5', 'Eastside Legal Aid', 'organization', 'Free tenant lawyers', -340, 150, { color: 'green', contactId: 'm-maya', notes: 'Running the know your rights workshop.' }),
        node('tn-6', 'Juniper Tenants Union', 'organization', 'Us: 64 households signed on', 0, 260, { size: 'large', color: 'blue' }),
        node('tn-7', 'Local news reporter', 'person', 'Covers housing', 330, 330, { size: 'small', contactId: 'm-leo', notes: 'Interested if the meeting goes badly.' }),
      ],
      edges: [
        edge('te-1', 'tn-2', 'tn-1', 'works for'),
        edge('te-2', 'tn-3', 'tn-1', 'can fine'),
        edge('te-3', 'tn-4', 'tn-3', 'oversees the budget of', { dashed: true }),
        edge('te-4', 'tn-6', 'tn-1', 'demanding repairs from'),
        edge('te-5', 'tn-5', 'tn-6', 'advises'),
        edge('te-6', 'tn-6', 'tn-3', 'filed complaints with'),
        edge('te-7', 'tn-7', 'tn-1', 'could cover', { dashed: true }),
      ],
      captions: [{ id: 'tcap-1', text: 'Crestline meeting is on the 3rd:\nbring numbers, not stories', x: -150, y: -230 }],
    },
  };
}
