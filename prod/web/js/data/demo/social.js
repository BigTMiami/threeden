// @ts-check
/**
 * social.js — Leo's friends, messages and notifications.
 */

import { hoursAgo, message } from './helpers.js';

/**
 * Leo is friends with Jamal, Grace, Priya and his cousin Nora; his
 * housemate Maya has asked to be his friend. A few friendships between
 * others fill out their Feeds.
 */
export function createDemoFriendships() {
  const friends = (id, from, to, hours) => ({ id, from, to, status: 'accepted', createdAt: hoursAgo(hours), respondedAt: hoursAgo(hours - 2) });
  return [
    friends('friend-1', 'm-jamal', 'm-leo', 600),
    friends('friend-2', 'm-leo', 'm-grace', 300),
    friends('friend-3', 'm-priya', 'm-leo', 250),
    friends('friend-4', 'm-nora', 'm-leo', 900),
    { id: 'friend-5', from: 'm-maya', to: 'm-leo', status: 'pending', createdAt: hoursAgo(5), respondedAt: null },
    friends('friend-6', 'm-grace', 'm-priya', 700),
    friends('friend-7', 'm-jamal', 'm-iris', 800),
  ];
}

/** What's waiting in Leo's bell. */
export function createDemoNotifications() {
  const note = (id, actorId, kind, text, spaceId, moduleId, itemId, href, hours, read = false) => ({
    id, recipientId: 'm-leo', actorId, kind, text, spaceId, moduleId, itemId, href, createdAt: hoursAgo(hours), read,
  });
  return [
    note('note-demo-0', 'm-iris', 'invited', 'Iris Novak invited you to join Juniper Supper Club', 'supper', null, null, '#groups', 6),
    note('note-demo-1', 'm-ingrid', 'invited', 'Ingrid Larsen invited you to the event “Thanksgiving dinner” (Larsen Family)', 'larsen', 'larsen-calendar', 'larsen-ev-dinner', '#event-larsen-ev-dinner', 2),
    note('note-demo-2', 'm-priya', 'invited', 'Priya Nair invited you to the event “Organizing committee dinner” (Juniper Tenants Union)', 'tenants', 'tenants-calendar', 'tenants-ev-3', '#event-tenants-ev-3', 6),
    note('note-demo-3', 'm-maya', 'mention', 'Maya Chen mentioned you in a reply in “Heat log: post your apartment temperatures” (Juniper Tenants Union)', 'tenants', 'tenants-forum', 'tenants-t1', null, 9),
    note('note-demo-4', 'm-grace', 'assigned', 'Grace Okafor assigned you the card “Fix a flat on a delivery bike” (Eastside Mutual Aid)', 'mutualaid', 'aid-requests', 'aid-req-3', null, 30, true),
  ];
}

/**
 * Leo's conversations (see js/state/messages.js). Some have messages he
 * hasn't read yet, so Messages shows an unread count. The house, band and
 * family chats belong to those groups' Chat modules.
 */
export function createDemoConversations() {
  const minutesAgo = (minutes) => Date.now() - minutes * 60 * 1000;
  const groupChat = (id, name, spaceId, moduleId) => ({ id, kind: 'group', name, memberIds: [], spaceId, moduleId, createdAt: minutesAgo(60 * 24 * 60) });
  const direct = (id, memberIds, days) => ({ id, kind: 'direct', name: '', memberIds, spaceId: null, moduleId: null, createdAt: minutesAgo(60 * 24 * days) });

  return [
    {
      ...groupChat('conv-juniper', 'House chat', 'juniper', 'house-chat'),
      messages: [
        message('jm-1', 'm-owen', 60 * 30, 'Plumber confirmed for Wednesday, 1 to 4. Water will be off.'),
        message('jm-2', 'm-leo', 60 * 29, 'Thanks for dealing with him 🙏', { '👍': ['m-owen', 'm-maya'] }),
        message('jm-3', 'm-theo', 60 * 5, 'Recycling goes out tonight btw'),
        message('jm-4', 'm-maya', 60 * 3, 'Dumplings for the meeting Sunday. Who’s around for Thanksgiving? Someone has to feed Biscuit.'),
        message('jm-5', 'm-owen', 40, 'I’m here all week, I’ve got the cat 🐈', { '❤️': ['m-maya'] }),
      ],
      readAt: { 'm-leo': minutesAgo(60 * 4), 'm-maya': minutesAgo(30), 'm-theo': minutesAgo(60 * 5), 'm-owen': minutesAgo(40) },
    },
    {
      ...groupChat('conv-larsen', 'Family chat', 'larsen', 'larsen-chat'),
      messages: [
        message('lm-1', 'm-bea', 60 * 50, 'Grandpa Walt’s call is Sunday at 6. I’ll send the link here.'),
        message('lm-2', 'm-erik', 60 * 26, 'Is it ok if I bring my partner to Thanksgiving?'),
        message('lm-3', 'm-ingrid', 60 * 25, 'Of course! The more the merrier. Put them on the RSVP.', { '❤️': ['m-erik', 'm-nora'] }),
        message('lm-4', 'm-joe', 60 * 2, 'Who’s bringing the pecan pie this year? Asking for a friend (me).'),
        message('lm-5', 'm-nora', 25, '@leo that’s you 🥧'),
      ],
      readAt: { 'm-leo': minutesAgo(60 * 20), 'm-ingrid': minutesAgo(60 * 24), 'm-joe': minutesAgo(60 * 2), 'm-nora': minutesAgo(25), 'm-bea': minutesAgo(60 * 40), 'm-erik': minutesAgo(60 * 25) },
    },
    {
      ...groupChat('conv-porch', 'Band chat', 'porchlights', 'band-chat'),
      messages: [
        message('pm-1', 'm-jamal', 60 * 20, 'Street fair set list draft is in the vault. Thoughts?'),
        message('pm-2', 'm-iris', 60 * 16, 'Open with Juniper Morning!', { '👍': ['m-jamal', 'm-theo'] }),
        message('pm-3', 'm-theo', 60 * 15, 'I can’t make next Wednesday, sorry. Can we do Thursday?'),
      ],
      readAt: { 'm-leo': minutesAgo(60 * 15), 'm-jamal': minutesAgo(60 * 15), 'm-iris': minutesAgo(60 * 15), 'm-theo': minutesAgo(60 * 15) },
    },
    {
      ...direct('conv-leo-priya', ['m-leo', 'm-priya'], 12),
      messages: [
        message('lp-1', 'm-priya', 60 * 40, 'Thanks for knocking on Building C doors last weekend!'),
        message('lp-2', 'm-leo', 60 * 39, 'Of course. 4C wasn’t home, I’ll try again.'),
        message('lp-3', 'm-priya', 12, 'Can you make the committee dinner? We need someone to present the heat numbers.'),
      ],
      readAt: { 'm-leo': minutesAgo(60 * 38), 'm-priya': minutesAgo(12) },
    },
    {
      ...direct('conv-leo-jamal', ['m-leo', 'm-jamal'], 30),
      messages: [
        message('lj-1', 'm-jamal', 60 * 50, 'Coming to my café set Friday?'),
        message('lj-2', 'm-leo', 60 * 49, 'Wouldn’t miss it. Want me to sit in on the last song?'),
        message('lj-3', 'm-jamal', 60 * 48, 'Yes!! Bring the capo.', { '🎸': ['m-leo'] }),
      ],
      readAt: { 'm-leo': minutesAgo(60 * 47), 'm-jamal': minutesAgo(60 * 48) },
    },
    {
      id: 'conv-pantry', kind: 'group', name: 'Saturday pantry crew', memberIds: ['m-leo', 'm-grace', 'm-theo', 'm-nora'], spaceId: null, moduleId: null,
      createdAt: minutesAgo(60 * 24 * 20),
      messages: [
        message('pc-1', 'm-grace', 60 * 70, 'Who can pick up the apples from the orchard Friday?'),
        message('pc-2', 'm-nora', 60 * 69, 'I’ve got the van, I’ll go.', { '🙌': ['m-grace', 'm-theo'] }),
        message('pc-3', 'm-theo', 60 * 68, 'I’ll meet you there to help load.'),
        // A thread on pc-1, a quoted reply, a pin, a voice note, and a file (thread-view.js, voice.js).
        { ...message('pc-3t1', 'm-grace', 60 * 67, 'Thank you both! Ask for Dale at the barn.'), threadOf: 'pc-1' },
        { ...message('pc-3t2', 'm-nora', 60 * 66, 'Got it. 20 crates?'), threadOf: 'pc-1' },
        { ...message('pc-3t3', 'm-grace', 60 * 65, 'Closer to 25. They had a good week.'), threadOf: 'pc-1' },
        message('pc-4', 'm-grace', 60 * 30, 'Saturday setup starts at 8:30. Doors at 10. Park on Fir St so the lot stays open for families.'),
        { ...message('pc-5', 'm-nora', 60 * 26, '', {}), attachment: { kind: 'voice', duration: 7, demo: true } },
        { ...message('pc-6', 'm-theo', 60 * 20, 'Does 8:30 work for the van too?'), replyToId: 'pc-4' },
        { ...message('pc-7', 'm-grace', 60 * 3, 'Here’s the shift sheet for this month.'), attachment: { kind: 'file', name: 'pantry-shifts-november.csv', size: 1843, type: 'text/csv', src: 'data:text/csv;charset=utf-8,Date%2CShift%2CWho%0ANov%2015%2CSetup%2CGrace%0ANov%2015%2CDoors%2CNora' } },
      ],
      pinnedIds: ['pc-4'],
      readAt: { 'm-leo': minutesAgo(60 * 60), 'm-grace': minutesAgo(60 * 68), 'm-theo': minutesAgo(60 * 68), 'm-nora': minutesAgo(60 * 68) },
    },
  ];
}
