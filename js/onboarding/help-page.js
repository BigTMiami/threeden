/**
 * help-page.js — the help center (#help, #help-<topic>): short answers,
 * written the way 3den talks, with a link to the place each one is about.
 *
 *   Help                                   [ Search help ]
 *   Getting started · Groups · Events · Sign-ups and shifts · Feed ·
 *   Messages · Privacy and safety · Spreadsheets
 *
 *   ▸ How do I start a group?
 *     Groups → Start a group. Two steps…           [Start a group]
 *
 * Each topic is a list of questions; search looks through all of them.
 * Anyone can read Help, signed in or not.
 */

import { replayTour } from './tutorial.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getCurrentUser } from '../state/store.js';
import { startTour } from './demo-tour.js';

/**
 * Where 3den's source code lives. The AGPL (LICENSE) asks that people who
 * use 3den over the network can get its source: set this when the
 * repository is public, and Help and the front page link to it.
 */
export const SOURCE_CODE_URL = '';

/** [topic id, title, icon, [[question, answer, link?: [label, href]]]] */
export const HELP_TOPICS = [
  ['start', 'Getting started', 'compass', [
    ['What is 3den?', 'A home for the groups you’re part of: a tenant union, a band, a mutual aid network, a household. Each group has a page of modules (news, a calendar, sign-ups, a chat) and your homepage pulls together what’s yours.', ['Read the front page', '#welcome']],
    ['How do I start a group?', 'Groups → Start a group. Give it a name, and say whether it should have a searchable, public page. Then pick what goes on its page, and a few tips show you how to arrange it.', ['Start a group', '#new-group']],
    ['Can I see the tour again?', 'Yes. The tour new accounts get walks through your homepage, bringing your people, and what to do next. Start it again any time.', ['Replay the tour', 'replay']],
    ['Is 3den open source?', 'Yes. Anyone can read, use, change, and share 3den’s code under the GNU Affero General Public License, version 3 or later. If someone runs a changed version as a service, they have to share their changes with its users too. That’s also how you can check that 3den does what it says with your data.', SOURCE_CODE_URL ? ['See the code', SOURCE_CODE_URL] : null],
    ['Can I see it working first?', 'Yes. The organizer demo walks through a tenants union, the Feed, an event, your dashboard, and more, using sample data.', ['Start the demo', 'tour']],
    ['How do I write an article?', 'Add the Articles module to your blog or a group (Edit → Modules). Write an article gives you a section, a headline, a summary, a picture with a caption, and the story. Save a draft only you can see, or Publish: it’s laid out like a news story and shows in people’s Feeds.'],
    ['What do the words mean?', 'A homepage is a page of modules: yours, or a group’s. A module is one box on it, like a to-do list, a calendar, or a chat. Tabs are extra pages on a homepage (Home is the first). Your blog is your public page, and the Feed is the newest from your groups, friends, and the blogs you follow.'],
    ['How do I get around quickly?', 'Press Ctrl+K (⌘K on a Mac) anywhere and type a few letters of a group, a page, a person, or an event. On a phone, type in the search box: places come up first, under “Go to”.'],
    ['Are there keyboard shortcuts?', 'Yes. Press ? anywhere you’re not typing to see them all, or open Keyboard shortcuts in the account menu.'],
    ['What’s on my homepage?', 'Your dashboard: events you’re hosting, going to, or invited to, and the tasks and shifts that are yours. Add or move modules with Edit.', ['Go to your homepage', '#space-me']],
  ]],
  ['groups', 'Groups', 'people', [
    ['Who can see my group?', 'You choose when you make it, and can change it in Group settings → General. A private group is only for members. A public group shows only the tabs you make public.'],
    ['How do people join?', 'By invite link, by username, by asking to join (you say yes or no), or openly, depending on the group’s setting. You can also import a member list.'],
    ['What do new members see?', 'A short “Welcome” checklist for their first three weeks: read the latest news, say hello, answer the next event, add a photo, and pick notifications.'],
    ['Where’s the member list?', 'Click the member count under the group’s name. The directory shows each person’s intro, and lets you message them.'],
    ['What can admins do?', 'Change settings, manage members and roles, and see reports in Group settings → Moderation. Roles & permissions decides who can do what.'],
  ]],
  ['events', 'Events', 'calendar', [
    ['Can 3den tell me if I’m free?', 'Yes. Connect your other calendars in Account → Calendars (Google, Apple, Outlook, or an .ics file). Event cards then say “You’re free” or what it clashes with. Only you see your calendars.', ['Connect a calendar', '#account-calendars']],
    ['Can I see my 3den events in Google or Apple Calendar?', 'Yes. Account → Calendars → See 3den in your other calendar, then Add to Google Calendar, Apple Calendar, or Outlook. Events you’re going to or hosting show up there and update when plans change.', ['Set it up', '#account-calendars']],
    ['How do RSVPs work?', 'Going, Maybe, or Can’t go. Tap your answer again to take it back. Going puts it on your calendar and sets a reminder for the day before (change it under “Remind me”).'],
    ['What happens when an event is full?', 'Going turns into “Join the waitlist”. When someone stops going, the first person waiting moves up and is told right away.'],
    ['Can someone help me host?', 'Yes. On the event’s page, Host tools → Co-hosts. Co-hosts can invite people, edit the event, and see host tools.'],
    ['What about weekly events?', 'A repeating event has a series page (“See every date”). Going covers every date; skip the ones you’ll miss.'],
    ['What’s a recap?', 'After an event, the host and the people who went can post photos and a caption in one tap, with the next date attached.'],
  ]],
  ['signups', 'Sign-ups and shifts', 'hand2', [
    ['How do I ask who’s coming, or who’ll bring what?', 'In an announcement, add RSVP or Sign-ups before posting. People answer right in the post, or from the top of their Feed.'],
    ['How do shifts work?', 'Add the Shifts module to a group. Anyone takes a shift with one tap, and it goes on their calendar. Click a shift to see its notes; Edit changes it, and Repeat makes it every week, every 2 weeks, or every month. If someone drops a shift in the next two days, the organizers are told. “Copy to next week” repeats a week’s shifts.'],
    ['Where do my shifts show up?', 'On your dashboard under “Coming up”, and with “Mine” in the shifts module.'],
  ]],
  ['feed', 'Feed', 'globe', [
    ['What’s at the top of my Feed?', '“From groups”: RSVPs, polls, open tasks, and sign-ups, each with the button to answer right there. “Not for me” hides one.'],
    ['Why does my Feed end?', 'Once you’ve seen what’s new, a line says you’re caught up. Older posts are below it, but there’s no endless scroll.'],
    ['Can I save something for later?', 'Use … on a post or event → Save for later. Find it under Home → Saved.', ['Open Saved', '#saved']],
    ['What are #tags?', 'Write #something in a post to tag it. Click a tag to see everything with it. Follow a tag to see public posts with it in your Feed.'],
    ['Can I post my photos on Instagram?', 'On your own photo post, … → Make an Instagram card. It makes a picture sized for Instagram and copies your caption. 3den doesn’t post for you.'],
  ]],
  ['messages', 'Messages', 'chat', [
    ['Are my messages private?', 'Direct messages are end-to-end encrypted: only you and the person you write to can read them. Compare safety numbers with the lock at the top of a conversation.'],
    ['How do I reply to one message?', 'Hover a message: ↩ quotes it in your reply, 💬 starts a thread beside the conversation, and 📌 pins it to the top for everyone.'],
    ['Can I send a voice note or a file?', 'Yes. The microphone next to Send records a voice note. The + menu sends photos, videos, files up to 2 MB, events, and blogs.'],
    ['Can messages disappear?', 'Yes, from 5 minutes to 4 weeks, set at the top of the conversation. Everyone in it sees the setting.'],
  ]],
  ['privacy', 'Privacy and safety', 'shield', [
    ['What does 3den do with my data?', 'Nothing beyond running 3den. No ads, no data brokers, no selling or sharing what you do here.'],
    ['What can strangers see about me?', 'Account → Privacy checkup lists it, and “View my blog as a stranger” shows your blog the way someone signed out sees it.', ['Open the checkup', '#account-privacy']],
    ['How do I get my friends on 3den?', 'Account menu → Bring your people. Pick your phone’s contacts file to see who’s already here and text the rest an invitation, send one link to a whole group chat, or share your invite link: whoever joins with it becomes your friend.', ['Bring your people', '#bring']],
    ['How do I block or mute someone?', 'Use … on one of their posts or on their blog. Muting hides their posts from your Feed. Blocking also stops messages between you. They aren’t told either way.', ['Blocked and muted', '#account-blocked']],
    ['How do I report something?', '… → Report on a post. In a group, its moderators see why it was reported, never who reported it.'],
  ]],
  ['sheets', 'Spreadsheets', 'table', [
    ['What formulas work?', 'SUM, AVERAGE, MIN, MAX, COUNT, ROUND, IF, and arithmetic with cell names, like =B2*C2 or =SUM(F2:F5).'],
    ['How do I fill a column?', 'Select cells by dragging (or Shift+click). Ctrl+D fills down from the top cell, Ctrl+R fills right. Formulas adjust: B2 becomes B3.'],
    ['Can I sort or format a column?', 'Pick a cell in the column, then A→Z or Z→A (the header row stays). The format menu shows numbers as currency, percent, or whole numbers.'],
  ]],
];

export function renderHelpPage(container, topicId = null) {
  const me = getCurrentUser();
  let query = '';
  const results = h('div', { class: 'help__results' });
  const search = h('input', { type: 'search', class: 'input help__search', placeholder: 'Search help', 'aria-label': 'Search help', onInput: (e) => { query = e.target.value; draw(); } });

  const link = ([label, href]) => (href === 'tour'
    ? h('button', { type: 'button', class: 'button button--small', onClick: () => startTour() }, label)
    : href === 'replay'
      ? h('button', { type: 'button', class: 'button button--small', onClick: () => replayTour() }, label)
      : h('a', { class: 'button button--small', href }, label));

  const qa = ([q, a, l], open) => h('details', { class: 'help__qa', open },
    h('summary', {}, q),
    h('p', {}, a),
    l && (me && !me.isGuest || ['#welcome', '#help', 'https://'].some((x) => l[1].startsWith(x))) ? link(l) : null);

  function draw() {
    const q = query.trim().toLowerCase();
    if (q) {
      const hits = HELP_TOPICS.flatMap(([id, title, , items]) => items.filter(([question, answer]) => `${question} ${answer}`.toLowerCase().includes(q)).map((item) => ({ id, title, item })));
      replaceChildren(results, hits.length
        ? [h('p', { class: 'help__count' }, `${hits.length} ${hits.length === 1 ? 'answer' : 'answers'}`), hits.map(({ title, item }) => h('div', {}, h('span', { class: 'help__from' }, title), qa(item, true)))]
        : h('div', { class: 'empty-state empty-state--compact' }, h('p', { class: 'empty-state__title' }, `Nothing about “${query}” yet.`), h('p', {}, 'Try another word, or ask in one of your groups.')));
      return;
    }
    const topic = HELP_TOPICS.find(([id]) => id === topicId);
    if (!topic) {
      replaceChildren(results, h('div', { class: 'help__topics' }, HELP_TOPICS.map(([id, title, iconName, items]) => h('a', { class: 'help__topic', href: `#help-${id}` },
        h('span', { class: 'help__topic-icon', 'aria-hidden': 'true' }, icon(iconName, 20)),
        h('strong', {}, title),
        h('span', { class: 'help__topic-count' }, `${items.length} answers`)))));
      return;
    }
    const [, title, iconName, items] = topic;
    replaceChildren(results,
      h('a', { class: 'link-button help__back', href: '#help' }, icon('arrowLeft', 13), ' All topics'),
      h('h2', { class: 'help__topic-title' }, icon(iconName, 20), ` ${title}`),
      items.map((item, i) => qa(item, i === 0)));
  }
  draw();
  replaceChildren(container, h('div', { class: 'help' },
    h('header', { class: 'settings-page__header help__header' },
      h('h1', { class: 'settings-page__title' }, 'Help'),
      search),
    results));
}
