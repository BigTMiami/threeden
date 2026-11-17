/**
 * steps.js — the Get started steps for each way of arriving.
 *
 * Every step ticks itself: `isDone(me, record)` looks at the data (did they
 * RSVP? send a message?), or at record.done for things only noticed while
 * they happen (markStep in onboarding-state.js). A step can also be left out
 * when it doesn't apply (`applies`), and can carry a link or a button.
 *
 *   pathFor(me, record)   → { title, steps: [{ id, label, isDone, href?, action? }] }
 *
 * At most four steps per path: one next step at a time, not a checklist of
 * everything 3den can do.
 */

import { getSpace, getPersonalSpace, getBlogOf, getState, getMember } from '../state/store.js';
import { isFollowing } from '../state/follows.js';
import { findEvent } from '../state/events.js';
import { getConversationsFor } from '../state/messages.js';
import { getFriendIds, outgoingRequests } from '../state/friends.js';
import { normalizeEvent, rsvpOf, isEvent } from '../modules/calendar/calendar-data.js';
import { eventHref } from '../events/event-details.js';
import { spaceHref, settingsHref } from '../router.js';
import { showToast } from '../ui/toast.js';
import { markStep } from './onboarding-state.js';
import { requestModuleFocus } from '../editor/module-context.js';

const FEED_TYPES = ['photofeed', 'textfeed', 'generalfeed'];

// ─── Small questions about the data ──────────────────────────────────────────

const hasBio = (me) => Boolean(me.bio?.trim());
const did = (record, id) => (record.done ?? []).includes(id);

/** Anything they wrote in a group: a chat message, an announcement, a thread, a reply. */
function hasSpokenIn(space, me) {
  const inChat = getConversationsFor(me.id).some((c) => c.spaceId === space.id && c.messages.some((m) => m.authorId === me.id));
  const inModules = space.modules.some((module) => {
    const data = module.data ?? {};
    return (data.posts ?? []).some((p) => p.authorId === me.id || (p.comments ?? []).some((c) => c.authorId === me.id))
      || (data.threads ?? []).some((t) => t.authorId === me.id || (t.replies ?? []).some((r) => r.authorId === me.id));
  });
  return inChat || inModules;
}

function groupEvents(space) {
  return space.modules.flatMap((m) => (m.data?.events ?? []).map(normalizeEvent)).filter(isEvent);
}

function personalModules(type) {
  return getPersonalSpace()?.modules.filter((m) => m.type === type) ?? [];
}

const aboutYou = {
  id: 'about', label: 'Tell people who you are', href: '#account',
  isDone: (me) => hasBio(me),
};

const findPeople = {
  id: 'find', label: 'Find people you know', href: '#feed-friends',
  isDone: (me, record) => did(record, 'find') || getFriendIds(me.id).length > 0 || outgoingRequests(me.id).length > 0,
};

// ─── The paths ───────────────────────────────────────────────────────────────

function eventPath(me, record) {
  const found = findEvent(record.itemId);
  const event = found?.event;
  const title = event ? `Getting ready for “${event.title}”` : 'Getting started with 3den';
  const link = event ? `${window.location.href.split('#')[0]}${eventHref(event.id)}` : '';
  return {
    title,
    steps: [
      { id: 'rsvp', label: event ? `Answer “${event.title}”` : 'Answer the event', href: event ? eventHref(event.id) : null, isDone: () => Boolean(event && rsvpOf(event, me.id)) },
      { id: 'calendar', label: 'Find it on your calendar', isDone: () => did(record, 'calendar'), action: { label: 'Show me', run: () => openPersonal('calendar') } },
      aboutYou,
      {
        id: 'share', label: 'Bring a friend', applies: () => event?.visibility === 'public',
        isDone: () => did(record, 'share'),
        action: { label: 'Copy the event’s link', run: () => copy(link, 'Link copied. Send it to a friend.', 'share') },
      },
    ],
  };
}

/** Came to plan an event of their own. */
function hostPath(me) {
  const myEvents = () => getState().spaces.flatMap((s) => s.modules.flatMap((m) => (m.data?.events ?? []).map(normalizeEvent)))
    .filter((e) => isEvent(e) && e.createdBy === me.id);
  return {
    title: 'Planning your event',
    steps: [
      { id: 'make-event', label: 'Make your event', isDone: () => myEvents().length > 0, href: '#new-event' }, // the step-by-step planner (js/events/new-event-page.js)
      {
        id: 'invite-event', label: 'Invite people (or make it public)',
        href: myEvents()[0] ? eventHref(myEvents()[0].id) : null,
        isDone: () => myEvents().some((e) => e.visibility === 'public' || e.inviteeIds.length > 0),
      },
      aboutYou,
      findPeople,
    ],
  };
}

function groupPath(me, record) {
  const space = getSpace(record.spaceId);
  if (!space) return directPath(me, record);
  const joined = space.memberIds.includes(me.id);
  return {
    title: `Getting started in ${space.name}`,
    steps: [
      { id: 'join', label: `Join ${space.name}`, href: spaceHref(space.id), isDone: () => joined },
      { id: 'hello', label: 'Say hi to the group', href: spaceHref(space.id), isDone: () => hasSpokenIn(space, me) },
      {
        id: 'group-event', label: `Answer one of ${space.name}’s events`, href: spaceHref(space.id),
        applies: () => groupEvents(space).length > 0,
        isDone: () => groupEvents(space).some((e) => rsvpOf(e, me.id)),
      },
      aboutYou,
    ],
  };
}

function organizerPath(me, record) {
  const space = getSpace(record.spaceId);
  if (!space) {
    return {
      title: 'Setting up your group',
      steps: [{ id: 'create', label: 'Create your group', href: '#new-group', isDone: () => false }],
    };
  }
  const myPosts = () => space.modules.some((m) => (m.data?.posts ?? []).some((p) => p.authorId === me.id)
    || (m.data?.events ?? []).some((e) => e.createdBy === me.id));
  return {
    title: `Setting up ${space.name}`,
    steps: [
      { id: 'create', label: `Create ${space.name}`, isDone: () => true },
      {
        id: 'invite', label: 'Invite people', href: settingsHref(space.id, 'members'),
        isDone: () => did(record, 'invite') || space.memberIds.length > 1 || (space.invites ?? []).length > 0,
      },
      { id: 'first-post', label: 'Post a first announcement or event', href: spaceHref(space.id), isDone: myPosts },
      {
        id: 'public-tab', label: 'Make a tab public, so people can find you', href: spaceHref(space.id),
        applies: () => ['club', 'organizing', 'news'].includes(space.template),
        isDone: () => (space.tabs ?? []).some((t) => t.visibility === 'public'),
      },
    ],
  };
}

function blogPath(me) {
  const likedOrCommented = () => Object.values(getState().reactions ?? {})
    .some((r) => r.likes?.includes(me.id) || r.comments?.some((c) => c.authorId === me.id));
  return {
    title: 'Getting started with friends',
    steps: [
      { id: 'friend', label: 'Add a friend', href: '#feed-friends', isDone: () => getFriendIds(me.id).length > 0 || outgoingRequests(me.id).length > 0 },
      { id: 'react', label: 'Like or comment on a post', href: '#feed', isDone: likedOrCommented },
      findPeople,
      postStep(me),
    ],
  };
}

function messagePath(me) {
  return {
    title: 'Getting started with 3den',
    steps: [
      { id: 'reply', label: 'Reply to a message', href: '#messages', isDone: () => getConversationsFor(me.id).some((c) => c.messages.some((m) => m.authorId === me.id)) },
      aboutYou,
      findPeople,
    ],
  };
}

function directPath(me) {
  return {
    title: 'Getting started with 3den',
    steps: [
      { id: 'task', label: 'Add your first task', isDone: () => personalModules('todo').some((m) => (m.data?.tasks ?? []).length > 0), action: { label: 'Show me', run: () => openPersonal('todo') } },
      { id: 'calendar-item', label: 'Put something on your calendar', isDone: () => personalModules('calendar').some((m) => (m.data?.events ?? []).length > 0), action: { label: 'Show me', run: () => openPersonal('calendar') } },
      { id: 'group', label: 'Join or create a group', href: '#groups', isDone: () => getState().spaces.some((s) => s.kind === 'group' && s.memberIds.includes(me.id)) },
      aboutYou,
    ],
  };
}

/** "Post your first photo": only for people who said yes to their blog. */
function postStep(me) {
  return {
    id: 'post', label: 'Post your first photo or update', href: '#blog-me',
    applies: () => Boolean(getBlogOf(me.id)),
    isDone: () => getBlogOf(me.id)?.modules.some((m) => FEED_TYPES.includes(m.type) && (m.data?.posts ?? []).some((p) => p.authorId === me.id)),
  };
}

/** Came to follow a blog or a group's public page. */
function followPath(me, record) {
  const target = record.spaceId ? { kind: 'space', id: record.spaceId } : { kind: 'person', id: record.itemId };
  const name = record.spaceId ? getSpace(record.spaceId)?.name : getMember(record.itemId)?.name;
  return {
    title: name ? `Keeping up with ${name}` : 'Getting started with 3den',
    steps: [
      { id: 'follow', label: name ? `Follow ${name}` : 'Follow someone', isDone: () => isFollowing(me.id, target) },
      { id: 'feed', label: 'See their posts in your Feed', href: '#feed', isDone: () => did(record, 'feed') },
      findPeople,
      aboutYou,
    ],
  };
}

const PATHS = {
  follow: followPath,
  event: eventPath,
  host: hostPath,
  group: groupPath,
  organizer: organizerPath,
  blog: blogPath,
  message: messagePath,
  organized: directPath,
  direct: directPath,
};

/** The title and the steps that apply, for this person's path. */
export function pathFor(me, record) {
  const path = (PATHS[record.source] ?? directPath)(me, record);
  let steps = path.steps.filter((step) => !step.applies || step.applies());
  // Said yes to their blog: add its steps (Find people, first post) if missing.
  if (record.blogWelcome === 'yes') {
    for (const extra of [findPeople, postStep(me)]) {
      if (!steps.some((s) => s.id === extra.id) && (!extra.applies || extra.applies())) steps.push(extra);
    }
  }
  steps = steps.slice(0, 4).map((step) => ({ ...step, done: Boolean(step.isDone(me, record)) }));
  // My blog's link needs the real username.
  for (const step of steps) if (step.href === '#blog-me') step.href = `#blog-${me.username}`;
  return { title: path.title, steps };
}

// ─── Step actions ────────────────────────────────────────────────────────────

/**
 * Open a module on their own homepage full page (marks "calendar" when
 * it's the calendar). `focus` opens it at an item, e.g. 'new-event'.
 */
function openPersonal(type, focus = null) {
  const module = personalModules(type)[0] ?? (type === 'calendar' ? personalModules('events')[0] : null)
    ?? (type === 'events' ? personalModules('calendar')[0] : null);
  if (type === 'calendar') markStep('calendar');
  if (!module) { showToast('Add one from the module library: Edit homepage → Modules.'); return; }
  if (focus) requestModuleFocus(module.id, focus);
  window.location.hash = `#module-${module.id}`;
}

function copy(text, message, stepId) {
  navigator.clipboard?.writeText(text).then(() => showToast(message), () => showToast(text));
  markStep(stepId);
}
