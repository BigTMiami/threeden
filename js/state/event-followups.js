// @ts-check
/**
 * event-followups.js — reasons to come back after an event.
 *
 * The growth model's main finding: guests who answer one party and hear
 * nothing more leave within weeks. So:
 *
 *   watchRsvpFollows()        Answering Going or Maybe to an event from a public
 *                             group, or one someone else hosts, follows that group
 *                             or person, so you hear about their next events. A
 *                             toast says so, with Undo. (Friends are skipped: you
 *                             already see what they post.)
 *   checkEventFollowups(me)   After an event you went to (in the last two weeks),
 *                             one notification: "How was it? Next from them: …"
 *                             Hosts get one asking them to share photos. Once per
 *                             event per person (member.followedUp). People with
 *                             texts turned on get it by text too (notify()).
 *   addEventPhotos(eventId, photos, me)  photos on the event's page; everyone else who
 *                             went is told
 *   whatsNext(found, memberId)  upcoming events from the same group or host
 *   followTargetOf(found, memberId)  what answering would follow, or null
 */

import { changeState, getCurrentUser, getMember, getState, getSpaces, onModuleDataChange } from './store.js';
import { isFollowing, toggleFollow } from './follows.js';
import { getFriendIds } from './friends.js';
import { isPublicGroup } from './group-access.js';
import { notify } from './notifications.js';
import { findEvent, updateEvent, canViewEvent } from './events.js';
import { normalizeEvent, isEvent, rsvpOf } from '../modules/calendar/calendar-data.js';
import { upcomingEventsIn } from '../modules/dashboard/dashboard-data.js';
import { makeId } from '../ui/dom.js';
import { autoRemind, setEventReminder } from './reminders.js';
import { showToast } from '../ui/toast.js';
import { todayKey, addDays, formatShortDate } from '../utils/dates.js';

const FOLLOW_UP_DAYS = 14;
const ANSWERS_THAT_FOLLOW = ['going', 'maybe'];

/** The group or person answering this event would follow, as { target, name }, or null. */
export function followTargetOf({ event, space }, memberId) {
  if (space.kind === 'group') {
    if (space.memberIds.includes(memberId) || !isPublicGroup(space)) return null;
    const target = { kind: 'space', id: space.id };
    return isFollowing(memberId, target) ? null : { target, name: space.name };
  }
  const hostId = event.createdBy;
  if (!hostId || hostId === memberId || getFriendIds(memberId).includes(hostId)) return null;
  const target = { kind: 'person', id: hostId };
  return isFollowing(memberId, target) ? null : { target, name: getMember(hostId)?.name ?? 'the host' };
}

export function watchRsvpFollows() {
  onModuleDataChange((module, before, after) => {
    const me = getCurrentUser();
    if (!me || me.isGuest || !Array.isArray(after?.events)) return;
    const old = new Map((before?.events ?? []).map((e) => [e.id, e]));
    for (const raw of after.events) {
      const answer = raw.rsvps?.[me.id];
      const was = old.get(raw.id)?.rsvps?.[me.id];
      // Going now (and not before): a reminder the day before (js/state/reminders.js).
      if (answer === 'going' && was !== 'going') autoRemind(me.id, normalizeEvent(raw));
      if (answer === 'no' && was && was !== 'no') setEventReminder(me.id, normalizeEvent(raw), null);
      if (!ANSWERS_THAT_FOLLOW.includes(answer) || ANSWERS_THAT_FOLLOW.includes(was)) continue;
      const found = findEvent(raw.id);
      const follow = found && followTargetOf(found, me.id);
      if (!follow) continue;
      toggleFollow(me.id, follow.target);
      showToast(`You’re following ${follow.name}, so you’ll hear about their next events.`, {
        actionLabel: 'Undo',
        onAction: () => { if (isFollowing(me.id, follow.target)) toggleFollow(me.id, follow.target); },
      });
    }
  });
}

/**
 * When someone moves up from a waitlist to Going (applyRsvp lets the first
 * person in when a spot opens), tell them. Also tells new co-hosts.
 */
export function watchWaitlists() {
  onModuleDataChange((module, before, after) => {
    if (!Array.isArray(after?.events)) return;
    const old = new Map((before?.events ?? []).map((e) => [e.id, e]));
    for (const raw of after.events) {
      const was = old.get(raw.id);
      if (!was) continue;
      const movedUp = (was.waitlist ?? []).filter((id) => raw.rsvps?.[id] === 'going' && !(raw.waitlist ?? []).includes(id));
      if (movedUp.length) {
        notify({ recipientIds: movedUp, actorId: null, kind: 'waitlist', moduleId: module.id, itemId: raw.id, href: `#event-${raw.id}`, text: `A spot opened up: you’re going to “${raw.title}”. Can’t make it after all? Change your answer so the next person gets in.` });
      }
      const newCohosts = (raw.cohostIds ?? []).filter((id) => !(was.cohostIds ?? []).includes(id));
      if (newCohosts.length) {
        const by = getCurrentUser();
        notify({ recipientIds: newCohosts, actorId: by?.id ?? null, kind: 'cohost', moduleId: module.id, itemId: raw.id, href: `#event-${raw.id}`, text: `${by?.name ?? 'Someone'} made you a co-host of “${raw.title}”. You can invite people, edit it, and post updates.` });
      }
    }
  });
}

/** Upcoming events from the same group (or the same host's own pages), that you can open. */
export function whatsNext({ event, space }, memberId, limit = 3) {
  const fromSpace = upcomingEventsIn(space).filter((o) => o.event.id !== event.id);
  // A host's other events on their homepage or blog.
  const fromHost = space.kind === 'group' ? [] : getSpaces()
    .filter((s) => s.id !== space.id && (s.kind === 'blog' || s.kind === 'group') && s.memberIds.includes(event.createdBy))
    .flatMap(upcomingEventsIn)
    .filter((o) => o.event.createdBy === event.createdBy);
  return [...fromSpace, ...fromHost]
    .filter((o) => canViewEvent({ event: o.event, space: o.space }, memberId))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

/** Has the event (its last day) already happened? */
export const hasHappened = (event) => (event.endDate ?? event.date) < todayKey();
/** Has it started (photos can go up from the first day)? */
export const hasStarted = (event) => event.date <= todayKey();

export function checkEventFollowups(me = getCurrentUser()) {
  if (!me || me.isGuest) return;
  const done = new Set(getMember(me.id)?.followedUp ?? []);
  const since = addDays(todayKey(), -FOLLOW_UP_DAYS);
  const marked = [];
  for (const space of getSpaces()) {
    for (const module of space.modules) {
      for (const raw of module.data?.events ?? []) {
        const event = normalizeEvent(raw);
        if (!isEvent(event) || event.repeat !== 'none' || done.has(event.id)) continue;
        if (!hasHappened(event) || (event.endDate ?? event.date) < since) continue;
        const isHost = event.createdBy === me.id;
        if (!isHost && !ANSWERS_THAT_FOLLOW.includes(rsvpOf(event, me.id))) continue;
        marked.push(event.id);
        if (isHost) {
          const going = Object.values(event.rsvps ?? {}).filter((a) => a === 'going').length - 1;
          if (going > 0) {
            notify({
              recipientIds: [me.id], actorId: null, kind: 'recap', itemId: event.id, href: `#event-${event.id}`,
              text: `Share photos from “${event.title}” with the ${going} ${going === 1 ? 'person' : 'people'} who came`,
            });
          }
          continue;
        }
        const next = whatsNext({ event, space }, me.id, 1)[0];
        const who = space.kind === 'group' ? space.name : getMember(event.createdBy)?.name.split(' ')[0] ?? 'them';
        notify({
          recipientIds: [me.id], actorId: event.createdBy === me.id ? null : event.createdBy, kind: 'followup', itemId: event.id,
          href: `#event-${event.id}`, spaceId: space.kind === 'group' ? space.id : null,
          text: next
            ? `How was “${event.title}”? Next from ${who}: “${next.event.title}”, ${formatShortDate(next.date)}`
            : `How was “${event.title}”? Post a recap, or see the photos`,
        });
      }
    }
  }
  if (marked.length) {
    changeState((state) => {
      const member = state.members.find((m) => m.id === me.id);
      member.followedUp = [...(member.followedUp ?? []), ...marked].slice(-200);
    });
  }
}

/** Put photos on the event's page, and tell everyone else who went. */
export function addEventPhotos(eventId, photos, me) {
  const found = findEvent(eventId);
  if (!found || photos.length === 0) return;
  updateEvent(eventId, (event) => {
    event.photos = [...(event.photos ?? []), ...photos.map((p) => ({ id: makeId('ph'), src: p.src, width: p.width, height: p.height, by: me.id, at: Date.now() }))];
  });
  const event = found.event;
  const others = [event.createdBy, ...Object.entries(event.rsvps ?? {}).filter(([, a]) => a === 'going').map(([id]) => id)];
  notify({
    recipientIds: others, actorId: me.id, kind: 'photos', itemId: event.id, href: `#event-${event.id}`,
    text: `${me.name} added ${photos.length === 1 ? 'a photo' : `${photos.length} photos`} from “${event.title}”`,
  });
}

/** For tests and demos: forget which events have been followed up. */
export function resetFollowups(memberId) {
  changeState((state) => { delete state.members.find((m) => m.id === memberId).followedUp; });
  return getState();
}
