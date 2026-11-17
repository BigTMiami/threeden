// @ts-check
/**
 * suggestions.js — more of 3den, offered only when someone's use shows a
 * need for it. Shown one at a time under the Get started card, at most one
 * per visit; "No thanks" means never again.
 *
 *   When this happens                    Suggest
 *   in two or more groups                 the Dashboard
 *   going to two or more events           My calendar
 *   someone gave them a task in a group   My tasks
 *   they have a friend, but no blog       starting their blog
 *   a week after joining                  making the homepage theirs (Customize)
 *   their group (organizers) has 5 people roles and permissions
 *   went to two events others hosted,     planning one of their own (the step-by-step
 *     and haven't hosted one              planner): newcomers who start things are
 *                                         what keeps 3den growing (the growth model)
 *   in a group someone else runs for two  starting a group of their own
 *     weeks, and run none
 *
 * Each suggestion: { id, when(me, record), text(me), acceptLabel, accept(me) }.
 */

import { openInstagramConnect } from '../account/instagram-connect.js';
import { getState, getPersonalSpace, getBlogOf, getSpace, changeState } from '../state/store.js';
import { getFriendIds } from '../state/friends.js';
import { normalizeEvent, rsvpOf } from '../modules/calendar/calendar-data.js';
import { settingsHref, goTo } from '../router.js';
import { makeId } from '../ui/dom.js';
import { showToast } from '../ui/toast.js';
import { addToList } from './onboarding-state.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ROLES_GROUP_SIZE = 5;

let handledThisVisit = false; // one suggestion per visit

const myGroups = (me) => getState().spaces.filter((s) => s.kind === 'group' && s.memberIds.includes(me.id));
const hasModule = (type) => getPersonalSpace()?.modules.some((m) => m.type === type);

function eventsGoingTo(me) {
  return getState().spaces.flatMap((s) => s.modules.flatMap((m) => (m.data?.events ?? []).map(normalizeEvent)))
    .filter((e) => rsvpOf(e, me.id) === 'going').length;
}

function hasGroupTask(me) {
  return myGroups(me).some((space) => space.modules.some((m) => m.type === 'todo'
    && (m.data?.tasks ?? []).some((t) => !t.done && (t.assigneeIds ?? []).includes(me.id))));
}

/** Put a module at the top of their homepage. */
function addToHomepage(type, title, span, rows, data) {
  const personal = getPersonalSpace();
  changeState((state) => {
    state.spaces.find((s) => s.id === personal.id).modules.unshift({ id: makeId('mod'), type, title, span, rows, data });
  }, 'layout');
  showToast(`Added ${title} to your homepage.`);
}

/** Events hosted by someone else that they said Going to; and ones they host. */
function eventsByOthers(me) {
  return getState().spaces.flatMap((s) => s.modules.flatMap((m) => (m.data?.events ?? []).map(normalizeEvent)))
    .filter((e) => e.kind === 'event' && e.createdBy && e.createdBy !== me.id && rsvpOf(e, me.id) === 'going').length;
}
function hostsAnything(me) {
  return getState().spaces.some((s) => s.modules.some((m) => (m.data?.events ?? []).some((e) => e.kind === 'event' && e.createdBy === me.id)));
}
const runsAGroup = (me) => myGroups(me).some((s) => s.roles?.[me.id] === 'owner');

const SUGGESTIONS = [
  {
    id: 'dashboard',
    when: (me) => myGroups(me).length >= 2 && !hasModule('dashboard'),
    text: (me) => `You’re in ${myGroups(me).length} groups now. Add a Dashboard to see what’s new in all of them?`,
    acceptLabel: 'Add it',
    accept: () => addToHomepage('dashboard', 'Dashboard', 12, 10, {}),
  },
  {
    id: 'calendar',
    when: (me) => eventsGoingTo(me) >= 2 && !hasModule('calendar'),
    text: () => 'You’re going to a few events. Add your calendar to see them by date?',
    acceptLabel: 'Add it',
    accept: () => addToHomepage('calendar', 'My calendar', 4, 12, { events: [] }),
  },
  {
    id: 'tasks',
    when: (me) => hasGroupTask(me) && !hasModule('todo'),
    text: () => 'Someone gave you a task in a group. Add My tasks to keep track of it?',
    acceptLabel: 'Add it',
    accept: () => addToHomepage('todo', 'My tasks', 8, 12, { tasks: [] }),
  },
  {
    id: 'blog',
    when: (me, record) => getFriendIds(me.id).length > 0 && !getBlogOf(me.id) && record.blogWelcome !== 'yes',
    text: () => 'You have a friend on 3den. Start your blog, so they can see what you post?',
    acceptLabel: 'Start my blog',
    accept: (me) => goTo(`#blog-${me.username}`),
  },
  {
    id: 'instagram',
    when: (me) => Boolean(getBlogOf(me.id)) && !me.instagram,
    text: () => 'On Instagram? Bring your posts to your blog, keep them in sync, and find people you know.',
    acceptLabel: 'Connect Instagram',
    accept: () => openInstagramConnect(),
  },
  {
    id: 'customize',
    when: (me, record) => Date.now() - record.startedAt > WEEK_MS,
    text: () => 'Make your homepage yours: pick a cover, colors, and a font.',
    acceptLabel: 'Customize',
    accept: () => goTo(settingsHref(getPersonalSpace().id, 'appearance')),
  },
  {
    id: 'start-event',
    when: (me) => eventsByOthers(me) >= 2 && !hostsAnything(me),
    text: () => 'You’ve been to a few things on 3den. Want to host one of your own? It takes a minute, step by step.',
    acceptLabel: 'Plan an event',
    accept: () => goTo('#new-event'),
  },
  {
    id: 'start-group',
    when: (me, record) => Date.now() - record.startedAt > 2 * WEEK_MS && myGroups(me).length > 0 && !runsAGroup(me),
    text: () => 'Got something you’d like to get going, like a book club, a team, or a band? Start a group. Templates do most of the setup.',
    acceptLabel: 'Start a group',
    accept: () => goTo('#new-group'),
  },
  {
    id: 'roles',
    when: (me, record) => record.source === 'organizer' && (getSpace(record.spaceId)?.memberIds.length ?? 0) >= ROLES_GROUP_SIZE,
    text: (me, record) => `${getSpace(record.spaceId).name} has ${ROLES_GROUP_SIZE} people now. Decide who can post, invite, and edit the homepage?`,
    acceptLabel: 'Roles & permissions',
    accept: (me, record) => goTo(settingsHref(record.spaceId, 'permissions')),
  },
];

/** The next suggestion to show, or null. */
export function nextSuggestion(me, record) {
  if (handledThisVisit) return null;
  const dismissed = record.suggestionsDismissed ?? [];
  const found = SUGGESTIONS.find((s) => !dismissed.includes(s.id) && s.when(me, record));
  if (!found) return null;
  return {
    id: found.id,
    text: found.text(me, record),
    acceptLabel: found.acceptLabel,
    accept: () => found.accept(me, record),
  };
}

/** Accepted or turned down: never show it again, and nothing more this visit. */
export function dismissSuggestion(id) {
  handledThisVisit = true;
  addToList('suggestionsDismissed', id);
}
