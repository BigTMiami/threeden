// @ts-check
/**
 * year-model.js — a year of 3den with a few hundred regular users.
 *
 * 300 people start the year using 3den in place of the tools they had:
 * Instagram and Facebook for keeping up with friends, Google Calendar,
 * Word and Google Docs, Excel and Google Sheets, Partiful and Evite for
 * invitations, WhatsApp and GroupMe for group chats, Slack and Discord for
 * organizing, Splitwise and Venmo requests for shared costs, and Trello or
 * Notion for to-dos. Every day of the year, each of them may open 3den, do
 * a few things that fit who they are, run into something that annoys or
 * delights them, tell us about it, invite people, or drift away. The people
 * they invite join the simulation and do the same.
 *
 * What it models:
 *   - personas (organizers, creators, students, households, socializers,
 *     volunteers, small publishers), each with the tools they replace and
 *     what they do on 3den
 *   - a social graph: friends on 3den make it more useful (the feed isn't
 *     quiet, invitations get answered), and its absence is the top reason
 *     people leave
 *   - groups that meet on a schedule, where members bring friends
 *   - invitations from events, groups, articles, shared pages, and QR codes
 *     at meetings; discovery from Explore and search
 *   - satisfaction that rises with good moments and falls with friction;
 *     it drives how often people open the app, how much they invite, and
 *     whether they leave
 *   - seasons: the holidays, the January slump, summer, back to school
 *   - feedback: when someone hits friction (or loves something), they may
 *     say so; each theme has the fix people asked for
 *
 * The frictions are the product's real gaps as of Nov 2026 (no push
 * notifications or native app, no two-way calendar sync, one-at-a-time
 * docs, simple spreadsheets…), so the feedback points at real work.
 *
 * No imports: it runs in the browser (js/data/demo/year.js builds sample
 * data from it) and in Node (the report's numbers).
 *
 *   simulateYear({ seed, people, days }) → { users, groups, monthly, cohorts, feedback, … }
 */

export const YEAR_SEED = 2026;

/** The tools 3den stands in for. */
export const TOOLS = {
  social: 'Instagram or Facebook',
  calendar: 'Google Calendar',
  docs: 'Word or Google Docs',
  sheets: 'Excel or Google Sheets',
  invites: 'Partiful or Evite',
  groupchat: 'WhatsApp or GroupMe',
  workspace: 'Slack or Discord',
  money: 'Splitwise or Venmo requests',
  tasks: 'Trello or Notion',
};

/** What each feature replaces, for "did they stop using the old tool?". */
export const FEATURE_TOOL = {
  feed: 'social', blog: 'social', photos: 'social',
  calendar: 'calendar',
  docs: 'docs', articles: 'docs',
  sheets: 'sheets', budget: 'money',
  events: 'invites',
  chat: 'groupchat', messages: 'groupchat',
  forum: 'workspace', announcements: 'workspace',
  tasks: 'tasks', shifts: 'sheets', chores: 'tasks',
};

export const FEATURE_LABELS = {
  feed: 'Feed', blog: 'Blog', photos: 'Photos', calendar: 'Calendar', docs: 'Notes and documents', articles: 'Articles',
  sheets: 'Spreadsheets', budget: 'Budget and shared costs', events: 'Events and RSVPs', chat: 'Group chat', messages: 'Direct messages',
  forum: 'Forum', announcements: 'Board', tasks: 'To-do lists', shifts: 'Volunteer shifts', chores: 'Chore wheel',
};

/**
 * Personas. `share` of the starting 300; `open` = chance of opening 3den on
 * a given day when happy; `use` = how often each feature comes up when they
 * do; `tools` = what they moved off; `hosts` = chance per active day of
 * starting an event that invites people; `group` = the kind of group they run.
 */
export const PERSONAS = {
  organizer: {
    label: 'Organizers', share: 0.16, open: 0.62, hosts: 0.02, starts: 0.006, group: 'organizing',
    tools: ['groupchat', 'workspace', 'docs', 'calendar', 'invites'],
    use: { announcements: 5, forum: 4, events: 5, chat: 4, docs: 3, tasks: 3, calendar: 3, sheets: 2, feed: 1, messages: 2, shifts: 1 },
  },
  creator: {
    label: 'Musicians and creators', share: 0.12, open: 0.55, hosts: 0.018, starts: 0.003, group: 'club',
    tools: ['social', 'invites', 'calendar'],
    use: { blog: 5, photos: 5, feed: 4, events: 4, messages: 2, calendar: 2, articles: 1, chat: 1 },
  },
  student: {
    label: 'Students', share: 0.18, open: 0.5, hosts: 0.006, starts: 0.004, group: 'class',
    tools: ['docs', 'calendar', 'groupchat', 'tasks', 'sheets'],
    use: { docs: 5, tasks: 4, calendar: 4, chat: 3, forum: 2, sheets: 2, feed: 2, events: 1, messages: 2 },
  },
  household: {
    label: 'Households and families', share: 0.16, open: 0.48, hosts: 0.004, starts: 0.002, group: 'house',
    tools: ['calendar', 'money', 'tasks', 'groupchat', 'sheets'],
    use: { calendar: 5, chores: 3, budget: 3, tasks: 4, chat: 3, announcements: 2, sheets: 2, docs: 1, events: 1 },
  },
  socializer: {
    label: 'Keeping up with friends', share: 0.2, open: 0.58, hosts: 0.012, starts: 0.0015, group: 'club',
    tools: ['social', 'invites', 'groupchat'],
    use: { feed: 5, blog: 3, photos: 4, events: 4, messages: 4, chat: 2, calendar: 1 },
  },
  volunteer: {
    label: 'Volunteers', share: 0.1, open: 0.45, hosts: 0.005, starts: 0.002, group: 'organizing',
    tools: ['groupchat', 'calendar', 'sheets'],
    use: { shifts: 5, events: 3, announcements: 3, chat: 3, calendar: 3, forum: 1, messages: 1, feed: 1 },
  },
  publisher: {
    label: 'Newsletters and small outlets', share: 0.08, open: 0.52, hosts: 0.008, starts: 0.003, group: 'news',
    tools: ['docs', 'social', 'invites'],
    use: { articles: 5, feed: 3, events: 3, blog: 2, docs: 2, announcements: 2, messages: 1 },
  },
};

/**
 * Friction and delight per feature: the chance that using it once goes
 * badly (`friction`) or especially well (`delight`). Friction is higher for
 * the product's known gaps; see FEEDBACK for what people say about each.
 */
export const FEATURE_EXPERIENCE = {
  feed: { friction: 0.03, delight: 0.05 }, blog: { friction: 0.025, delight: 0.04 }, photos: { friction: 0.035, delight: 0.04 },
  calendar: { friction: 0.05, delight: 0.04 }, docs: { friction: 0.05, delight: 0.03 }, articles: { friction: 0.04, delight: 0.05 },
  sheets: { friction: 0.07, delight: 0.02 }, budget: { friction: 0.05, delight: 0.03 }, events: { friction: 0.035, delight: 0.06 },
  chat: { friction: 0.04, delight: 0.03 }, messages: { friction: 0.03, delight: 0.02 }, forum: { friction: 0.03, delight: 0.04 },
  announcements: { friction: 0.025, delight: 0.04 }, tasks: { friction: 0.025, delight: 0.04 }, shifts: { friction: 0.025, delight: 0.06 },
  chores: { friction: 0.03, delight: 0.04 },
};

/**
 * What people tell us. Each theme: the feature it's about (or 'any'), the
 * kind (problem, missing, confusing, praise), when it comes up (`weight`,
 * given the person and the world), and what they ask for (`ask`). `status`
 * says whether 3den already does it ('shipped', with when) or not ('open').
 */
export const FEEDBACK = [
  { id: 'friends-elsewhere', feature: 'any', kind: 'problem', area: 'retention', title: 'My friends aren’t on 3den yet',
    ask: 'Make it easier to bring my people: import contacts or Instagram follows, and invite a whole group chat at once.', status: 'open',
    weight: (u) => (u.friends < 3 ? 3 : u.friends < 8 ? 1 : 0.1),
    quotes: ['Love it, but half my friends are still on Instagram, so I end up checking both.', 'The feed is quiet. I need my people here.', 'I keep inviting people and they keep not making accounts.'] },
  { id: 'push', feature: 'any', kind: 'missing', area: 'retention', title: 'I miss things: no phone notifications',
    ask: 'Push notifications on my phone (an app), or at least an email digest I can turn on.', status: 'open',
    weight: (u) => (u.groups > 1 ? 2 : 1),
    quotes: ['I didn’t know rehearsal moved until I got there.', 'Group chat buzzes my phone. 3den doesn’t, so I forget to check.', 'Please send me a text or a push when someone mentions me.'] },
  { id: 'app', feature: 'any', kind: 'missing', area: 'retention', title: 'I want a real phone app',
    ask: 'An app in the App Store and Google Play, with notifications and the share sheet.', status: 'open',
    weight: (u) => (u.persona === 'socializer' || u.persona === 'creator' ? 2 : 1),
    quotes: ['Adding it to my home screen works, but it doesn’t feel like an app.', 'I want to share photos straight from my camera roll.'] },
  { id: 'calendar-out', feature: 'calendar', kind: 'missing', area: 'retention', title: 'My 3den events don’t show up in Google Calendar',
    ask: 'A calendar address to subscribe to from Google or Apple Calendar, kept up to date (two-way sync later).', status: 'open',
    weight: (u) => (u.tools.includes('calendar') ? 2.5 : 0.6),
    quotes: ['I still live in Google Calendar at work. I need 3den events there.', 'Connecting my calendar is great for clashes, but it only goes one way.'] },
  { id: 'calendar-in', feature: 'calendar', kind: 'missing', area: 'happiness', title: 'Show my other calendar inside My calendar',
    ask: 'Show the events from connected calendars on My calendar, greyed out.', status: 'open',
    weight: (u) => (u.calendarConnected ? 2 : 0.2),
    quotes: ['It tells me I’m busy, but I want to see the busy block on the calendar itself.'] },
  { id: 'free-busy', feature: 'events', kind: 'praise', area: 'happiness', title: '“You’re free” on invites is great',
    ask: '', status: 'shipped', weight: (u) => (u.calendarConnected ? 1.5 : 0),
    quotes: ['Knowing I’m free before I say yes saves me a trip to my calendar.', 'It caught a clash with my dentist appointment. Thank you.'] },
  { id: 'coedit', feature: 'docs', kind: 'missing', area: 'happiness', title: 'We can’t write in the same document at once',
    ask: 'Live co-editing with cursors, like Google Docs, and comments on the text.', status: 'open',
    weight: (u) => (u.groups > 0 ? 2 : 0.5),
    quotes: ['Two of us edited the agenda and one of our changes vanished.', 'I need comments on a draft, not a message about it.'] },
  { id: 'doc-export', feature: 'docs', kind: 'missing', area: 'happiness', title: 'Export documents to Word or PDF',
    ask: 'Download a note as .docx or PDF, and print it cleanly.', status: 'open',
    weight: (u) => (u.persona === 'student' || u.persona === 'organizer' ? 1.5 : 0.5),
    quotes: ['My professor wants a Word file.', 'We print the meeting agenda. It should look like an agenda.'] },
  { id: 'sheet-formulas', feature: 'sheets', kind: 'missing', area: 'happiness', title: 'The spreadsheet is too basic',
    ask: 'More formulas (VLOOKUP, COUNTIF, dates), charts, and importing an Excel or CSV file.', status: 'open',
    weight: () => 2,
    quotes: ['I tried to move our budget sheet over and half the formulas didn’t exist.', 'No charts, so I still make them in Excel.', 'Let me paste or upload a CSV.'] },
  { id: 'money', feature: 'budget', kind: 'missing', area: 'happiness', title: 'Settle up with Venmo or Cash App',
    ask: 'A “Pay back” button that opens Venmo, Cash App, or PayPal with the amount filled in.', status: 'open',
    weight: () => 1.5,
    quotes: ['The split is right, then we all go to Venmo anyway.'] },
  { id: 'where-to-post', feature: 'chat', kind: 'confusing', area: 'happiness', title: 'Chat, forum, or announcement? Where do I post?',
    ask: 'One place to write in a group, with “make it an announcement” and “start a thread” as options.', status: 'open',
    weight: (u) => (u.groups > 1 ? 2 : 0.8),
    quotes: ['Our group has a chat, a forum, and announcements. Nobody knows where anything is.', 'I posted in the wrong place and three people missed it.'] },
  { id: 'notif-noise', feature: 'any', kind: 'problem', area: 'retention', title: 'Too many notifications from busy groups',
    ask: 'A daily digest per group, and quiet hours.', status: 'open',
    weight: (u) => (u.groups >= 4 ? 2.5 : u.groups >= 2 ? 0.8 : 0),
    quotes: ['Grouping helps, but the tenant union alone is 20 a day.', 'I muted a group and then missed the one thing I needed.'] },
  { id: 'grouped', feature: 'any', kind: 'praise', area: 'happiness', title: 'Grouped notifications are much calmer',
    ask: '', status: 'shipped', weight: (u) => (u.groups >= 2 ? 0.8 : 0.2),
    quotes: ['“Maya and 6 others liked your post” is so much better than seven pings.'] },
  { id: 'quick-rsvp', feature: 'events', kind: 'praise', area: 'growth', title: 'Guests can RSVP with just a name and number',
    ask: '', status: 'shipped', weight: (u) => (u.hosted > 0 ? 1.5 : 0.3),
    quotes: ['My aunt RSVP’d without making an account. That’s the bar.', 'Answering with a name and phone number is why people actually answer.'] },
  { id: 'invite-design', feature: 'events', kind: 'missing', area: 'growth', title: 'Invitations could look more fun',
    ask: 'Themes, animated covers, and a custom link (3den.app/maya30) for parties.', status: 'open',
    weight: (u) => (u.persona === 'socializer' || u.persona === 'creator' ? 2 : 0.5),
    quotes: ['Partiful invites feel like a party. Ours feel like a calendar entry.', 'Let me pick a fun theme for my birthday.'] },
  { id: 'tickets', feature: 'events', kind: 'missing', area: 'growth', title: 'Sell tickets or take donations at the door',
    ask: 'Paid tickets and suggested donations, with the money going straight to the host.', status: 'open',
    weight: (u) => (u.persona === 'creator' || u.persona === 'publisher' ? 2 : u.persona === 'organizer' ? 1 : 0),
    quotes: ['Shows need a ticket link. Right now I send people to another site.', 'Our fundraiser needs a donate button on the event.'] },
  { id: 'feed-ends', feature: 'feed', kind: 'praise', area: 'happiness', title: 'I like that the feed ends',
    ask: '', status: 'shipped', weight: () => 1,
    quotes: ['“You’re caught up” is the best feature. I close the app and go live.', 'No ads, no algorithm games. It feels calm.'] },
  { id: 'find-groups', feature: 'any', kind: 'missing', area: 'growth', title: 'Help me find groups and events nearby',
    ask: 'Better Explore: by neighborhood and interest, with “friends are going” first.', status: 'open',
    weight: (u) => (u.persona === 'student' || u.persona === 'socializer' ? 1.5 : 0.7),
    quotes: ['I moved here in August. I want to find a run club, not just my friends’ stuff.'] },
  { id: 'search', feature: 'messages', kind: 'problem', area: 'happiness', title: 'I can’t find an old message or file',
    ask: 'Search inside messages, chats, and files, with filters by person and date.', status: 'open',
    weight: (u) => (u.months >= 3 ? 1.5 : 0.3),
    quotes: ['Somebody sent the door code in March. Good luck finding it.'] },
  { id: 'too-much', feature: 'any', kind: 'confusing', area: 'happiness', title: 'It does a lot. Where do I start?',
    ask: 'Simpler first weeks: hide modules until a group needs them, and say less on screen.', status: 'open',
    weight: (u) => (u.days < 14 ? 2.5 : 0.2),
    quotes: ['So many modules. I just wanted a group calendar.', 'There’s a lot of text explaining things. I skip it.'] },
  { id: 'templates', feature: 'any', kind: 'praise', area: 'happiness', title: 'Templates made setup easy',
    ask: '', status: 'shipped', weight: (u) => (u.startedGroup ? 1.5 : 0.2),
    quotes: ['Picked “Household” and we were running in five minutes.'] },
  { id: 'repeat-tasks', feature: 'tasks', kind: 'praise', area: 'happiness', title: 'Repeating tasks replaced my reminders app',
    ask: '', status: 'shipped', weight: (u) => (u.persona === 'household' ? 1.5 : 0.5),
    quotes: ['Recycling every Monday, rent on the first. Finally in one place.'] },
  { id: 'task-assign', feature: 'tasks', kind: 'missing', area: 'happiness', title: 'Tasks need reminders that reach my phone',
    ask: 'Due-date reminders by push or text, and “nudge” for the person it’s assigned to.', status: 'open',
    weight: (u) => (u.groups > 0 ? 1.2 : 0.4),
    quotes: ['My roommate never sees the chores he’s assigned.'] },
  { id: 'newsletter', feature: 'articles', kind: 'missing', area: 'growth', title: 'Send my articles as an email newsletter',
    ask: 'Email subscribers who aren’t on 3den, with a signup form for the public page.', status: 'open',
    weight: (u) => (u.persona === 'publisher' ? 3 : 0.4),
    quotes: ['Half my readers want it in their inbox, not another app.', 'I need a subscribe box people can use without an account.'] },
  { id: 'articles-love', feature: 'articles', kind: 'praise', area: 'happiness', title: 'Articles look like a real publication',
    ask: '', status: 'shipped', weight: (u) => (u.persona === 'publisher' ? 1.5 : 0.3),
    quotes: ['Our bulletin finally looks like a newspaper.', 'Scheduling the Sunday piece on Friday night is perfect.'] },
  { id: 'photos', feature: 'photos', kind: 'missing', area: 'happiness', title: 'Albums and full-quality photos',
    ask: 'Shared albums per event, full resolution, and video longer than a minute.', status: 'open',
    weight: () => 1.2,
    quotes: ['Photos get squished. I want the originals from the show.', 'One album per event that everyone can add to.'] },
  { id: 'shifts-love', feature: 'shifts', kind: 'praise', area: 'retention', title: 'Taking a shift in one tap works',
    ask: '', status: 'shipped', weight: () => 1.5,
    quotes: ['We stopped using the sign-up spreadsheet the first week.'] },
  { id: 'moderation', feature: 'forum', kind: 'missing', area: 'retention', title: 'Big groups need more moderation tools',
    ask: 'Slow mode, approving new members’ first posts, and more than one moderator queue view.', status: 'open',
    weight: (u) => (u.runsBigGroup ? 2.5 : 0.1),
    quotes: ['Once we passed 40 members the forum got heated, and I had one tool: delete.'] },
  { id: 'big-group-slow', feature: 'any', kind: 'problem', area: 'retention', title: 'Big groups get slow',
    ask: 'Faster loading for groups with hundreds of members and long histories.', status: 'open',
    weight: (u) => (u.runsBigGroup || u.inBigGroup ? 1.5 : 0),
    quotes: ['Our mutual aid group takes a while to open on my phone.'] },
  { id: 'privacy-love', feature: 'any', kind: 'praise', area: 'retention', title: 'No ads and nobody selling my data',
    ask: '', status: 'shipped', weight: () => 1,
    quotes: ['I trust it more than the apps it replaced.', 'Being open source matters to our organizers.'] },
  { id: 'import', feature: 'any', kind: 'missing', area: 'growth', title: 'Bring my old stuff over',
    ask: 'Import from WhatsApp, Google Calendar, Partiful guest lists, and a Facebook group.', status: 'open',
    weight: (u) => (u.days < 30 ? 1.8 : 0.3),
    quotes: ['I have five years of group photos in WhatsApp.', 'Let me import my Partiful guest list for the next party.'] },
  { id: 'qr', feature: 'events', kind: 'praise', area: 'growth', title: 'The QR code at meetings brings people in',
    ask: '', status: 'shipped', weight: (u) => (u.persona === 'organizer' || u.persona === 'volunteer' ? 1 : 0.1),
    quotes: ['We put the QR code on the sign-in table. Twelve people joined that night.'] },
  { id: 'accessibility', feature: 'any', kind: 'problem', area: 'happiness', title: 'Text size and contrast',
    ask: 'A larger-text setting and a high-contrast theme.', status: 'open',
    weight: (u) => (u.persona === 'household' || u.persona === 'volunteer' ? 0.4 : 0.15),
    quotes: ['My dad finds the small gray text hard to read.'] },
  { id: 'languages', feature: 'any', kind: 'missing', area: 'growth', title: 'Spanish and Chinese, please',
    ask: '3den in Spanish, Chinese, and other languages our members speak.', status: 'open',
    weight: (u) => (u.persona === 'organizer' || u.persona === 'volunteer' ? 1.5 : 0.3),
    quotes: ['Half our tenants union reads Spanish first.', 'Our pantry volunteers need Cantonese.'] },
];

/** How a person found 3den. */
export const SOURCES = {
  starter: 'Already using it',
  event: 'Invited to an event',
  group: 'Invited to a group',
  friend: 'A friend’s invite or blog',
  article: 'An article or public page',
  qr: 'A QR code at a meeting',
  explore: 'Search or Explore',
};

export const YEAR_RATES = {
  people: 300,
  days: 365,
  // Each person's circle outside 3den (people they could invite); people who
  // were invited share much of their circle with whoever invited them.
  contacts: [25, 140], contactsInvited: [8, 45],
  // Of the people on an invitation, the share already on 3den: grows as 3den does.
  overlapBase: 0.2, overlapMax: 0.6, overlapHalf: 1500,
  // Of people invited who aren't on 3den (by source): opens the invite, then
  // makes an account they keep using (one-off guest RSVPs aren't counted).
  open: { event: 0.7, group: 0.8, friend: 0.45, article: 0.15, qr: 0.95 },
  join: { event: 0.07, group: 0.3, friend: 0.18, article: 0.04, qr: 0.25 },
  // Invitees per invite moment.
  eventSize: [6, 30], groupInvites: [2, 8], friendInvites: [1, 3],
  articleReach: [15, 120], qrPerMeeting: [0, 2],
  // Base chance a happy person invites a friend on a day they're active.
  inviteFriend: 0.004,
  // Reading an article or public page from outside, per published piece (reach) and per day of a public group.
  publicGroupVisitors: 0.3,
  // Daily chance someone who's left comes back on their own (a friend's invite brings them back more often).
  returnOnOwn: 0.002,
  // Leaving: daily hazard at satisfaction 0.5 with no friends or groups; friends and groups that meet lower it.
  leaveBase: 0.036,
  // In the first 30 days people leave much faster (quick accounts fastest); after that, slowly.
  earlyFull: 1.5, earlyQuick: 2.6, later: 0.2, starters: 0.3,
  // Say something (feedback) when friction happens, or when delighted.
  feedbackOnFriction: 0.16,
  feedbackOnDelight: 0.06,
  // Satisfaction moves.
  frictionHit: 0.035, delightLift: 0.02,
  // Groups that meet: every so many days by kind.
  meets: { organizing: 14, club: 7, class: 7, house: 7, news: 7 },
};

// ─── Small helpers ────────────────────────────────────────────────────────

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    // mulberry32
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seasons: how much more or less people use 3den on a day of the year (day 0 = the start date). */
function seasonOf(date) {
  const m = date.getMonth(), d = date.getDate();
  if ((m === 11 && d >= 22) || (m === 0 && d <= 2)) return 0.75; // holidays: away, offline
  if (m === 0) return 0.9; // January slump
  if (m === 6 || m === 7) return 0.88; // summer
  if (m === 8) return 1.12; // back to school, groups restart
  if (m === 10 || (m === 11 && d < 22)) return 1.08; // party season
  return 1;
}

// ─── The simulation ───────────────────────────────────────────────────────

/**
 * What-ifs: improvements that can be switched on to see what they'd change.
 * Each is the fix people asked for in FEEDBACK, modeled as its likely effect.
 */
export const IMPROVEMENTS = {
  push: { label: 'Phone notifications (an app, or push from the web app)', themes: ['push', 'app', 'task-assign'] },
  calendarSync: { label: 'A calendar address for Google and Apple Calendar, and outside events shown on My calendar', themes: ['calendar-out', 'calendar-in'] },
  bringPeople: { label: 'Bring your people: contacts and Instagram import, invite a whole group chat', themes: ['friends-elsewhere', 'import'] },
  simpleStart: { label: 'A simpler first two weeks (fewer modules until needed, less text)', themes: ['too-much'] },
  digest: { label: 'A daily digest per group, and quiet hours', themes: ['notif-noise'] },
  discovery: { label: 'Explore by neighborhood and interest, friends first', themes: ['find-groups'] },
  publishers: { label: 'Email newsletters, paid tickets, and donations', themes: ['newsletter', 'tickets'] },
  oneComposer: { label: 'One place to write in a group (chat, thread, or announcement)', themes: ['where-to-post'] },
  coediting: { label: 'Live co-editing and comments in documents; a stronger spreadsheet', themes: ['coedit', 'sheet-formulas', 'doc-export'] },
  languages: { label: 'Spanish and Chinese', themes: ['languages'] },
};

export function simulateYear({ seed = YEAR_SEED, people = YEAR_RATES.people, days = YEAR_RATES.days, start = new Date(2025, 10, 14), rates = YEAR_RATES, improve = {} } = {}) {
  const imp = (key) => Boolean(improve[key]);
  // Themes nobody brings up any more, because the improvement is in.
  const solved = new Set(Object.keys(IMPROVEMENTS).filter(imp).flatMap((key) => IMPROVEMENTS[key].themes));
  const rand = rng(seed);
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const chance = (p) => rand() < p;
  const pickWeighted = (entries) => {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = rand() * total;
    for (const [key, w] of entries) { r -= w; if (r <= 0) return key; }
    return entries[entries.length - 1][0];
  };
  const personaKeys = Object.keys(PERSONAS);

  /** @type {any[]} */ const users = [];
  /** @type {any[]} */ const groups = [];
  const feedback = []; // { day, userId, theme, quote }
  const daily = []; // per day: active, total, joined, left
  const invitesByDay = [];

  function addUser({ day, persona, source, inviterId = null, groupId = null }) {
    const p = PERSONAS[persona];
    const user = {
      id: users.length + 1, persona, source, inviterId, joinedDay: day, leftDay: null, returns: 0,
      tools: p.tools.slice(), friendIds: new Set(), groupIds: new Set(), contacts: source === 'starter' ? between(...rates.contacts) : between(...rates.contactsInvited),
      satisfaction: source === 'starter' ? 0.68 + rand() * 0.2 : 0.52 + rand() * 0.2,
      activeDays: 0, lastActive: day, firstWeekActions: 0, hosted: 0, invited: 0, broughtIn: 0,
      featureUses: {}, frictions: 0, delights: 0, feedbackCount: 0,
      calendarConnected: p.tools.includes('calendar') && chance(0.35),
      startedGroup: false, quick: source === 'event' && chance(0.6),
      // When they stopped using each old tool (day), if they did.
      toolsDropped: {},
    };
    users.push(user);
    if (inviterId) {
      const inviter = users[inviterId - 1];
      // Invited by someone you know: friends on 3den from the start.
      user.friendIds.add(inviterId);
      inviter.friendIds.add(user.id);
      inviter.broughtIn += 1;
    }
    if (groupId) joinGroup(user, groups[groupId - 1], day);
    return user;
  }

  function startGroup(user, day) {
    const p = PERSONAS[user.persona];
    const group = { id: groups.length + 1, kind: p.group, ownerId: user.id, memberIds: new Set(), createdDay: day, public: chance(user.persona === 'organizer' || user.persona === 'publisher' || user.persona === 'creator' ? 0.6 : 0.15), meetings: 0, posts: 0, events: 0, threads: 0, articles: 0, lastMeeting: day, endedDay: null };
    groups.push(group);
    joinGroup(user, group, day);
    user.startedGroup = true;
    return group;
  }

  function joinGroup(user, group, day) {
    if (group.memberIds.has(user.id)) return;
    group.memberIds.add(user.id);
    user.groupIds.add(group.id);
    // People in the same small group become friends now and then.
    for (const otherId of group.memberIds) {
      if (otherId !== user.id && group.memberIds.size < 40 && chance(0.25)) { user.friendIds.add(otherId); users[otherId - 1].friendIds.add(user.id); }
    }
    if (day != null) group.lastJoin = day;
  }

  const isActive = (u) => u.leftDay === null;
  const activeFriends = (u) => [...u.friendIds].filter((id) => isActive(users[id - 1])).length;

  /** People join from outside: an invite turns into an account. */
  let activeCount = 0; // people on 3den, counted once a day
  function inviteOutsiders(inviter, source, count, day, groupId = null) {
    let joined = 0;
    const overlap = rates.overlapBase + rates.overlapMax * (activeCount / (activeCount + rates.overlapHalf));
    for (let i = 0; i < count; i++) {
      if (inviter.contacts <= 0) break;
      // Many invitees are already on 3den: they just come (and become friends now and then).
      if (chance(overlap)) {
        const ids = [...inviter.friendIds];
        if (ids.length && groupId && chance(0.3)) joinGroup(users[ids[Math.floor(rand() * ids.length)] - 1], groups[groupId - 1], day);
        continue;
      }
      // Someone who left can come back through an invite.
      if (chance(0.08)) {
        const gone = [...inviter.friendIds].map((id) => users[id - 1]).filter((u) => !isActive(u));
        if (gone.length) {
          const back = gone[Math.floor(rand() * gone.length)];
          if (chance(0.35)) { back.leftDay = null; back.returns += 1; back.satisfaction = Math.max(back.satisfaction, 0.55); back.lastActive = day; if (groupId) joinGroup(back, groups[groupId - 1], day); continue; }
        }
      }
      // The invitee's persona: often like the inviter, sometimes not.
      const persona = chance(0.55) ? inviter.persona : personaKeys[Math.floor(rand() * personaKeys.length)];
      // Network effect: more people on 3den → invitations look more trustworthy and land more often.
      const lift = 1 + Math.min(0.35, activeCount / 3000);
      const willOpen = chance(Math.min(0.98, rates.open[source] * lift));
      inviter.invited += 1;
      if (!willOpen) continue;
      const boost = (imp('bringPeople') && (source === 'friend' || source === 'group') ? 1.35 : 1)
        * (imp('publishers') && (source === 'article' || (source === 'event' && (inviter.persona === 'creator' || inviter.persona === 'publisher'))) ? 1.6 : 1)
        * (imp('languages') && (inviter.persona === 'organizer' || inviter.persona === 'volunteer') ? 1.15 : 1);
      if (!chance(Math.min(0.95, rates.join[source] * lift * boost * (0.75 + inviter.satisfaction * 0.5)))) continue;
      inviter.contacts -= 1;
      addUser({ day, persona, source: source === 'friend' ? 'friend' : source, inviterId: inviter.id, groupId });
      joined += 1;
    }
    invitesByDay[day] = (invitesByDay[day] ?? 0) + count;
    return joined;
  }

  // ── The starting 300 ──
  for (let i = 0; i < people; i++) {
    const persona = pickWeighted(personaKeys.map((k) => [k, PERSONAS[k].share]));
    addUser({ day: 0, persona, source: 'starter' });
  }
  // They already know each other: friendships, and the groups they run together.
  for (const u of users) {
    const n = between(1, 9);
    for (let k = 0; k < n; k++) {
      const other = users[Math.floor(rand() * users.length)];
      if (other.id !== u.id && (other.persona === u.persona || chance(0.4))) { u.friendIds.add(other.id); other.friendIds.add(u.id); }
    }
  }
  for (const u of users) if (chance(PERSONAS[u.persona].starts * 40)) startGroup(u, 0);
  for (const u of users) {
    const fit = groups.filter((g) => !g.memberIds.has(u.id) && (g.kind === PERSONAS[u.persona].group || chance(0.2)));
    for (let k = 0; k < between(0, 2) && fit.length; k++) joinGroup(u, fit[Math.floor(rand() * fit.length)], 0);
  }

  // ── Every day ──
  for (let day = 0; day < days; day++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day);
    const season = seasonOf(date);
    let active = 0, joined = 0, left = 0, events = 0;
    const before = users.length;
    activeCount = users.reduce((n, u) => n + (u.leftDay === null ? 1 : 0), 0);

    // Groups meet; members bring friends; organizers show the QR code.
    for (const g of groups) {
      if (g.endedDay !== null) continue;
      const live = [...g.memberIds].filter((id) => isActive(users[id - 1]));
      if (live.length === 0) { g.endedDay = day; continue; }
      if (day - g.lastMeeting >= rates.meets[g.kind]) {
        g.lastMeeting = day; g.meetings += 1; g.events += 1; events += 1;
        const owner = users[g.ownerId - 1];
        if (isActive(owner)) {
          // A QR code on the sign-in table (new in Nov 2026) and members bringing someone.
          if (g.kind === 'organizing' || g.kind === 'club' || g.kind === 'class') inviteOutsiders(owner, 'qr', between(...rates.qrPerMeeting) * (live.length > 10 ? 1 : 0), day, g.id);
          for (const id of live) if (chance(0.025)) inviteOutsiders(users[id - 1], 'group', 1, day, g.id);
        }
      }
      // Public groups get visitors from search and links.
      if (g.public && chance(rates.publicGroupVisitors * Math.min(1, live.length / 25) * (imp('discovery') ? 1.4 : 1))) {
        const owner = users[g.ownerId - 1];
        if (isActive(owner) && chance(0.08)) { addUser({ day, persona: PERSONAS[owner.persona] ? owner.persona : 'socializer', source: 'explore', groupId: g.id }); }
      }
    }

    for (const u of users.slice(0, before)) {
      if (!isActive(u)) {
        if (chance(rates.returnOnOwn)) { u.leftDay = null; u.returns += 1; u.satisfaction = 0.55; u.lastActive = day; }
        continue;
      }
      const p = PERSONAS[u.persona];
      const friends = activeFriends(u);
      const network = Math.min(1, friends / 10);
      const groupsMeeting = [...u.groupIds].filter((id) => groups[id - 1].endedDay === null).length;
      const openChance = p.open * season * (0.45 + 0.9 * u.satisfaction) * (0.75 + 0.35 * network + 0.12 * Math.min(groupsMeeting, 3))
        * (imp('push') ? (groupsMeeting > 0 ? 1.1 : 1.04) : 1);
      if (chance(Math.min(0.97, openChance))) {
        active += 1;
        u.activeDays += 1;
        u.lastActive = day;
        // A few things, by what they do.
        const usable = Object.entries(p.use).filter(([feature]) => {
          if (['forum', 'chat', 'announcements', 'tasks', 'shifts', 'chores', 'budget'].includes(feature)) return groupsMeeting > 0 || feature === 'tasks';
          return true;
        });
        const actions = between(1, 4);
        for (let a = 0; a < actions; a++) {
          const feature = pickWeighted(usable);
          u.featureUses[feature] = (u.featureUses[feature] ?? 0) + 1;
          if (day - u.joinedDay < 7) u.firstWeekActions += 1;
          // Using the feature regularly is what lets them drop the old tool.
          const tool = FEATURE_TOOL[feature];
          if (tool && u.tools.includes(tool) && u.toolsDropped[tool] == null && u.featureUses[feature] >= 12 && chance(0.06 + 0.1 * u.satisfaction)) u.toolsDropped[tool] = day;
          const exp = FEATURE_EXPERIENCE[feature];
          // A quiet feed is worse with few friends.
          const fixedBy = (feature === 'calendar' && imp('calendarSync')) || ((feature === 'docs' || feature === 'sheets') && imp('coediting'))
            || ((feature === 'chat' || feature === 'forum' || feature === 'announcements') && imp('oneComposer'));
          const friction = exp.friction * (feature === 'feed' || feature === 'blog' || feature === 'photos' ? (1.6 - network) : 1) * (fixedBy ? 0.5 : 1);
          if (chance(friction)) {
            u.frictions += 1;
            u.satisfaction = Math.max(0, u.satisfaction - rates.frictionHit);
            if (chance(rates.feedbackOnFriction)) say(u, day, feature, false);
          } else if (chance(exp.delight * (0.8 + network * 0.4))) {
            u.delights += 1;
            u.satisfaction = Math.min(1, u.satisfaction + rates.delightLift);
            if (chance(rates.feedbackOnDelight)) say(u, day, feature, true);
          }
        }
        // Network effects felt daily: friends here lift; an empty feed drags.
        u.satisfaction = Math.min(1, Math.max(0, u.satisfaction + (network - 0.35) * 0.004));
        // Hosting an event (parties, shows, meetings) invites people.
        if (chance(p.hosts * season)) {
          u.hosted += 1; events += 1;
          joined += inviteOutsiders(u, 'event', Math.round(between(...rates.eventSize) * 0.4), day);
        }
        // Starting a group.
        if (!u.startedGroup && chance(p.starts * (0.5 + u.satisfaction))) {
          const g = startGroup(u, day);
          joined += inviteOutsiders(u, 'group', between(...rates.groupInvites), day, g.id);
          // and friends on 3den join
          for (const id of u.friendIds) if (isActive(users[id - 1]) && chance(0.3)) joinGroup(users[id - 1], g, day);
        }
        // Publishing an article or a public page brings readers; a few sign up.
        if ((u.featureUses.articles ?? 0) > 0 && chance(0.05) && u.persona === 'publisher') {
          joined += inviteOutsiders(u, 'article', Math.round(between(...rates.articleReach) * 0.15), day);
        }
        // Inviting a friend because they like it.
        if (chance(rates.inviteFriend * (u.satisfaction > 0.65 ? 1.6 : 0.6) * (imp('bringPeople') ? 1.6 : 1))) {
          joined += inviteOutsiders(u, 'friend', between(...rates.friendInvites), day);
        }
        // Joining a group someone else runs (Explore, a friend's group).
        if (chance(imp('discovery') ? 0.01 : 0.006)) {
          const options = groups.filter((g) => g.endedDay === null && !g.memberIds.has(u.id) && (g.public || [...u.friendIds].some((id) => g.memberIds.has(id))));
          if (options.length) joinGroup(u, options[Math.floor(rand() * options.length)], day);
        }
      }

      // Leaving: lower with friends here and groups that meet; higher when unhappy.
      const tenure = day - u.joinedDay;
      const early = tenure < 30 ? (u.quick ? rates.earlyQuick : rates.earlyFull) : rates.later;
      const hazard = rates.leaveBase * early * (1.8 - 1.6 * u.satisfaction) * (1 - 0.55 * network) * (groupsMeeting > 0 ? 0.6 : 1) * (u.source === 'starter' ? rates.starters : 1)
        * (imp('push') ? 0.88 : 1)
        * (imp('calendarSync') && u.tools.includes('calendar') ? 0.92 : 1)
        * (imp('simpleStart') && tenure < 30 ? 0.82 : 1)
        * (imp('digest') && groupsMeeting >= 4 ? 0.85 : 1);
      if (chance(hazard)) {
        u.leftDay = day; left += 1;
        // Some say why on the way out.
        if (chance(0.35)) say(u, day, 'any', false, true);
      }
    }

    joined = users.length - before;
    daily.push({ day, date: date.toISOString().slice(0, 10), active, total: users.reduce((n, x) => n + (x.leftDay === null ? 1 : 0), 0), joined, left, events });
  }

  function say(u, day, feature, positive, leaving = false) {
    const ctx = {
      persona: u.persona, friends: activeFriends(u), groups: [...u.groupIds].filter((id) => groups[id - 1].endedDay === null).length,
      tools: u.tools, calendarConnected: u.calendarConnected, hosted: u.hosted, months: Math.floor((day - u.joinedDay) / 30),
      days: day - u.joinedDay, startedGroup: u.startedGroup,
      runsBigGroup: groups.some((g) => g.ownerId === u.id && g.memberIds.size > 30),
      inBigGroup: [...u.groupIds].some((id) => groups[id - 1].memberIds.size > 30),
    };
    // About the feature they were using, mostly; now and then about 3den as a whole.
    // People leaving talk about why they're going.
    const general = leaving || feature === 'any' || chance(0.3);
    const themes = FEEDBACK.filter((t) => (positive ? t.kind === 'praise' : t.kind !== 'praise')
      && (leaving ? t.area === 'retention' || t.feature === 'any' : general ? t.feature === 'any' : t.feature === feature))
      .filter((t) => !solved.has(t.id))
      .map((t) => /** @type {[any, number]} */ ([t, t.weight(ctx)])).filter(([, w]) => w > 0);
    if (!themes.length) return;
    const theme = pickWeighted(/** @type {any} */ (themes));
    const quote = theme.quotes[Math.floor(rand() * theme.quotes.length)];
    feedback.push({ day, userId: u.id, theme: theme.id, quote, leaving, persona: u.persona });
    u.feedbackCount += 1;
  }

  return summarize({ users, groups, feedback, daily, invitesByDay, days, start });
}

// ─── Summaries for the report and the demo ───────────────────────────────

function summarize({ users, groups, feedback, daily, invitesByDay, days, start }) {
  const monthOf = (day) => Math.floor(day / 30.44);
  const months = Math.ceil(days / 30.44);

  // Monthly: active users (opened at least once that month), new, left, end-of-month total.
  const monthly = Array.from({ length: months }, (_, m) => {
    const span = daily.filter((d) => monthOf(d.day) === m);
    const first = span[0], last = span[span.length - 1];
    const label = new Date(start.getFullYear(), start.getMonth() + m, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const activeIds = users.filter((u) => u.joinedDay <= last.day && (u.leftDay === null || u.leftDay >= first.day)).length;
    return {
      month: m, label,
      users: last.total, // on 3den at the end of the month (not left)
      dau: Math.round(span.reduce((s, d) => s + d.active, 0) / span.length),
      joined: span.reduce((s, d) => s + d.joined, 0),
      left: span.reduce((s, d) => s + d.left, 0),
      touched: activeIds,
      events: span.reduce((s, d) => s + d.events, 0),
      invites: span.reduce((s, d) => s + (invitesByDay[d.day] ?? 0), 0),
    };
  });

  // Cohorts: of those who joined in a month, the share still on 3den 30, 90, and 180 days later.
  const cohorts = Array.from({ length: months }, (_, m) => {
    const group = users.filter((u) => u.source !== 'starter' && monthOf(u.joinedDay) === m);
    const still = (after) => {
      const eligible = group.filter((u) => u.joinedDay + after < days);
      if (!eligible.length) return null;
      return eligible.filter((u) => u.leftDay === null || u.leftDay > u.joinedDay + after).length / eligible.length;
    };
    return { month: m, joined: group.length, d30: still(30), d90: still(90), d180: still(180) };
  });

  // Feedback by theme.
  const byTheme = FEEDBACK.map((t) => {
    const items = feedback.filter((f) => f.theme === t.id);
    const people = new Set(items.map((f) => f.userId)).size;
    const personas = {};
    for (const f of items) personas[f.persona] = (personas[f.persona] ?? 0) + 1;
    return { id: t.id, title: t.title, kind: t.kind, area: t.area, feature: t.feature, ask: t.ask, status: t.status, count: items.length, people, leaving: items.filter((f) => f.leaving).length, personas, quotes: [...new Set(items.map((f) => f.quote))].slice(0, 3) };
  }).filter((t) => t.count > 0).sort((a, b) => b.count - a.count);

  // What kept people: retention by attribute (still on 3den at the end, of those who joined at least 90 days before the end).
  const settled = users.filter((u) => u.joinedDay <= days - 90);
  const stayRate = (list) => (list.length ? list.filter((u) => u.leftDay === null).length / list.length : null);
  const friendsAt = (u) => u.friendIds.size;
  const predictors = [
    ['Friends on 3den: 0–2', settled.filter((u) => friendsAt(u) <= 2)],
    ['Friends on 3den: 3–7', settled.filter((u) => friendsAt(u) >= 3 && friendsAt(u) <= 7)],
    ['Friends on 3den: 8 or more', settled.filter((u) => friendsAt(u) >= 8)],
    ['In no group', settled.filter((u) => u.groupIds.size === 0)],
    ['In a group that meets', settled.filter((u) => u.groupIds.size > 0)],
    ['First week: 0–4 actions', settled.filter((u) => u.source !== 'starter' && u.firstWeekActions <= 4)],
    ['First week: 5 or more actions', settled.filter((u) => u.source !== 'starter' && u.firstWeekActions >= 5)],
    ['Answered one invitation (quick account)', settled.filter((u) => u.quick)],
    ['Made a full account', settled.filter((u) => !u.quick && u.source !== 'starter')],
    ['Connected an outside calendar', settled.filter((u) => u.calendarConnected)],
    ['Started a group', settled.filter((u) => u.startedGroup)],
  ].map(([label, list]) => ({ label, people: list.length, stay: stayRate(list) }));

  // Personas: how many, retention, satisfaction, and invites brought in.
  const personas = Object.keys(PERSONAS).map((key) => {
    const list = users.filter((u) => u.persona === key);
    const stayed = list.filter((u) => u.leftDay === null);
    return {
      key, label: PERSONAS[key].label, people: list.length, onNow: stayed.length,
      stay: stayRate(list.filter((u) => u.joinedDay <= days - 90)),
      satisfaction: stayed.length ? stayed.reduce((s, u) => s + u.satisfaction, 0) / stayed.length : 0,
      broughtIn: list.reduce((s, u) => s + u.broughtIn, 0) / Math.max(1, list.length),
    };
  });

  // Features: share of people on 3den at the end who used each one in their last 90 days (approximated by any use),
  // and how many of those who had the old tool stopped using it.
  const onNow = users.filter((u) => u.leftDay === null);
  const features = Object.keys(FEATURE_LABELS).map((f) => {
    const used = onNow.filter((u) => (u.featureUses[f] ?? 0) >= 3);
    const tool = FEATURE_TOOL[f];
    const hadTool = used.filter((u) => u.tools.includes(tool));
    const dropped = hadTool.filter((u) => u.toolsDropped[tool] != null);
    return { feature: f, label: FEATURE_LABELS[f], tool: TOOLS[tool], adoption: used.length / Math.max(1, onNow.length), replaced: hadTool.length ? dropped.length / hadTool.length : null };
  }).sort((a, b) => b.adoption - a.adoption);

  // Tools: of everyone (on 3den now) who came off a tool, the share who stopped using it altogether.
  const tools = Object.keys(TOOLS).map((t) => {
    const had = onNow.filter((u) => u.tools.includes(t));
    return { tool: t, label: TOOLS[t], had: had.length, dropped: had.length ? had.filter((u) => u.toolsDropped[t] != null).length / had.length : 0 };
  }).sort((a, b) => b.dropped - a.dropped);

  // Sources: who came from where, and how they stayed.
  const sources = Object.keys(SOURCES).map((s) => {
    const list = users.filter((u) => u.source === s);
    return { source: s, label: SOURCES[s], people: list.length, stay: stayRate(list.filter((u) => u.joinedDay <= days - 90)) };
  }).filter((s) => s.people > 0);

  // A satisfaction score by month (0–10, like a "how likely to recommend") from everyone on 3den then.
  // Approximated from the people active at month end.
  const score = (list) => (list.length ? (list.reduce((s, u) => s + u.satisfaction, 0) / list.length) * 10 : null);

  // Growth rate: new users per active user per month (a viral coefficient-ish number).
  const kFactor = monthly.map((m, i) => ({ label: m.label, k: i === 0 ? null : m.joined / Math.max(1, monthly[i - 1].users) }));

  const totals = {
    startPeople: users.filter((u) => u.source === 'starter').length,
    everJoined: users.length,
    onNow: onNow.length,
    left: users.filter((u) => u.leftDay !== null).length,
    groups: groups.length,
    groupsActive: groups.filter((g) => g.endedDay === null).length,
    feedback: feedback.length,
    feedbackPeople: new Set(feedback.map((f) => f.userId)).size,
    leavingFeedback: feedback.filter((f) => f.leaving).length,
    satisfactionNow: score(onNow),
    dauNow: daily[daily.length - 1] ? Math.round(daily.slice(-30).reduce((s, d) => s + d.active, 0) / 30) : 0,
  };

  return { users, groups, feedback, daily, monthly, cohorts, byTheme, predictors, personas, features, tools, sources, kFactor, totals, start: start.toISOString().slice(0, 10), days };
}
