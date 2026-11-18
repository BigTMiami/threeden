// @ts-check
/**
 * dashboard-data.js — gathers what the Dashboard shows. Nothing here is
 * saved: it's read fresh from your groups, blogs, messages and
 * notifications each time the dashboard draws.
 *
 *   needsYou(me)       → things waiting on you: invitations, RSVPs, join
 *                        requests, unread messages and notifications
 *   groupUpdates(me)   → per group: what's new since your last visit,
 *                        the latest announcement and the next event
 *   friendUpdates(me)  → the newest posts on your friends' blogs, and
 *                        their upcoming public events (the Feed uses it; the Dashboard doesn't)
 *   myUpcoming(me)     → events in the next month you're hosting, going to, or invited to
 *   myTasks(me)        → to-dos assigned to you, and your own list's
 */

import { getLastVisit, getGroupsByRecentVisit, getBlogOf, getSpaces } from '../../state/store.js';
import { normalizeTask } from '../todo/todo-data.js';
import { can } from '../../state/permissions.js';
import { getInvitesFor } from '../../state/groups.js';
import { unreadCount as unreadNotifications } from '../../state/notifications.js';
import { totalUnread, getConversationsFor, unreadCount as unreadInConversation } from '../../state/messages.js';
import { getFriendIds } from '../../state/friends.js';
import { followedPeopleIds } from '../../state/follows.js';
import { normalizeEvent, isEvent, rsvpOf, occurrencesBetween, isHostOf } from '../calendar/calendar-data.js';
import { answeredThisVisit } from '../../events/rsvp.js';
import { sortedPosts } from '../blog-feeds/feed-data.js';
import { todayKey, addDays } from '../../utils/dates.js';

/** How far ahead "coming up" looks. */
const LOOKAHEAD_DAYS = 30;
const FEED_TYPES = ['textfeed', 'generalfeed', 'carousel'];

/** Each event in a space once, on the day it starts, from today on: [{ event, date, moduleId, space }]. */
export function upcomingEventsIn(space) {
  const start = todayKey();
  const results = [];
  for (const module of space.modules) {
    if (!Array.isArray(module.data?.events)) continue;
    const events = module.data.events.map(normalizeEvent).filter(isEvent);
    for (const occurrence of occurrencesBetween(events, start, addDays(start, LOOKAHEAD_DAYS))) {
      if (occurrence.dayNumber !== 1 || results.some((r) => r.event.id === occurrence.event.id)) continue;
      results.push({ ...occurrence, moduleId: module.id, space });
    }
  }
  return results.sort((a, b) => a.date.localeCompare(b.date) || (a.event.time ?? '').localeCompare(b.event.time ?? ''));
}

/** Events you can see but haven't answered: invitations, and gatherings in your groups. */
function unansweredEvents(me, groups) {
  return groups
    .flatMap(upcomingEventsIn)
    .filter(({ event }) => event.visibility !== 'invite' || event.inviteeIds.includes(me.id))
    // Unanswered, or answered during this visit (its buttons stay on screen until you leave; rsvp.js).
    .filter(({ event }) => event.createdBy !== me.id && (!rsvpOf(event, me.id) || answeredThisVisit(event.id)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function needsYou(me) {
  const groups = getGroupsByRecentVisit();
  const joinRequests = groups
    .filter((space) => can(space, me.id, 'manageMembers') && (space.joinRequests ?? []).length)
    .map((space) => ({ space, count: space.joinRequests.length }));
  return {
    invites: getInvitesFor(me.id),
    rsvps: unansweredEvents(me, groups),
    joinRequests,
    unreadMessages: totalUnread(me.id),
    unreadNotifications: unreadNotifications(me.id),
  };
}

/**
 * For each of your groups (most recently visited first):
 *   { space, lastVisit, newPosts, newThreads, unreadChat, latestPost, nextEvent }
 * "New" means since you last opened the group.
 */
export function groupUpdates(me) {
  const conversations = getConversationsFor(me.id);
  return getGroupsByRecentVisit().map((space) => {
    const lastVisit = getLastVisit(space.id) ?? 0;
    const posts = space.modules
      .filter((m) => m.type === 'announcements')
      .flatMap((m) => (m.data?.posts ?? []).map((post) => ({ post, moduleId: m.id })))
      .sort((a, b) => b.post.createdAt - a.post.createdAt);
    const threads = space.modules
      .filter((m) => m.type === 'forum')
      .flatMap((m) => (m.data?.threads ?? []).filter((t) => !t.pending));
    const feedPosts = space.modules.filter((m) => FEED_TYPES.includes(m.type)).flatMap((m) => m.data?.posts ?? []);
    return {
      space,
      lastVisit: getLastVisit(space.id),
      newPosts: posts.filter(({ post }) => post.createdAt > lastVisit && post.authorId !== me.id).length,
      newThreads: threads.filter((t) => t.createdAt > lastVisit && t.authorId !== me.id).length,
      newFeedPosts: feedPosts.filter((p) => p.createdAt > lastVisit && p.authorId !== me.id).length,
      unreadChat: conversations.filter((c) => c.spaceId === space.id).reduce((sum, c) => sum + unreadInConversation(c, me.id), 0),
      latestPost: posts[0] ?? null,
      nextEvent: upcomingEventsIn(space)[0] ?? null,
    };
  });
}

/** The newest posts on friends' (and followed people's) blogs, and their public events coming up. */
export function friendUpdates(me) {
  const people = [...new Set([...getFriendIds(me.id), ...followedPeopleIds(me.id)])];
  const blogs = people.map(getBlogOf).filter(Boolean);
  const posts = blogs
    .flatMap((blog) => blog.modules
      .filter((m) => FEED_TYPES.includes(m.type))
      .flatMap((m) => sortedPosts(m.data ?? {}).map((post) => ({ post, moduleId: m.id, blog }))))
    .sort((a, b) => b.post.createdAt - a.post.createdAt);
  const events = blogs.flatMap(upcomingEventsIn).filter(({ event }) => event.visibility === 'public');
  return { posts, events, friendCount: blogs.length };
}

// ─── Coming up, and your tasks ───────────────────────────────────────────────

/**
 * Events in the next `days` you're part of: hosting, going, maybe, or
 * invited to (whether or not you've answered), from your groups, your own
 * calendar, blogs, and events people invited you to.
 *   [{ event, date, space, moduleId, role: 'mine' (your own calendar) | 'host' | 'going' | 'maybe' | 'invited' | 'shift' (a volunteer shift you took) }]
 */
export function myUpcoming(me, days = 30) {
  const start = todayKey();
  const results = [];
  const seen = new Set();
  for (const space of getSpaces()) {
    const mine = space.memberIds.includes(me.id);
    for (const module of space.modules) {
      if (!Array.isArray(module.data?.events)) continue;
      const events = module.data.events.map(normalizeEvent).filter((event) => {
        if (isHostOf(event, me.id) && (mine || space.kind !== 'group')) return true;
        const answer = rsvpOf(event, me.id);
        if (answer === 'going' || answer === 'maybe') return true;
        if (event.inviteeIds.includes(me.id) && answer !== 'no') return true;
        // Your own homepage's calendar: everything on it is yours.
        return space.kind === 'personal' && mine;
      });
      for (const occurrence of occurrencesBetween(events, start, addDays(start, days))) {
        if (occurrence.dayNumber !== 1) continue;
        const key = `${occurrence.event.id}:${occurrence.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { event } = occurrence;
        const answer = rsvpOf(event, me.id);
        const role = space.kind === 'personal' ? 'mine' : isHostOf(event, me.id) ? 'host' : answer === 'going' || answer === 'maybe' ? answer : 'invited';
        results.push({ ...occurrence, space, moduleId: module.id, role });
      }
    }
  }
  // Volunteer shifts you've taken (shifts module), as rows like events.
  for (const space of getSpaces()) {
    if (!space.memberIds.includes(me.id)) continue;
    for (const module of space.modules) {
      if (module.type !== 'shifts') continue;
      for (const shift of module.data?.shifts ?? []) {
        if (!(shift.memberIds ?? []).includes(me.id) || shift.date < start || shift.date > addDays(start, days)) continue;
        results.push({
          date: shift.date, dayNumber: 1, dayCount: 1, space, moduleId: module.id, role: 'shift',
          event: { id: shift.id, title: `${shift.role} shift`, time: shift.start, endTime: shift.end, allDay: false, date: shift.date, endDate: shift.date, color: 'green', location: shift.location, repeat: 'none' },
        });
      }
    }
  }
  return results.sort((a, b) => a.date.localeCompare(b.date) || (a.event.time ?? '').localeCompare(b.event.time ?? ''));
}

/**
 * Tasks that are yours and not done: assigned to you in your groups' to-do
 * lists, and on your own homepage's list. Overdue and soonest first, then
 * ones with no due date.
 *   [{ task, space, moduleId }]
 */
export function myTasks(me) {
  const results = [];
  for (const space of getSpaces()) {
    if (!space.memberIds.includes(me.id) || space.kind === 'blog') continue;
    for (const module of space.modules) {
      if (module.type !== 'todo') continue;
      for (const raw of module.data?.tasks ?? []) {
        const task = normalizeTask(raw);
        if (task.done) continue;
        if (space.kind === 'personal' || task.assigneeIds.includes(me.id)) results.push({ task, space, moduleId: module.id });
      }
    }
  }
  return results.sort((a, b) => (a.task.due || '9999').localeCompare(b.task.due || '9999'));
}
