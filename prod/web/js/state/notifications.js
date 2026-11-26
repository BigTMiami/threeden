// @ts-check
/**
 * notifications.js — what the bell in the top bar shows.
 *
 * You get a notification when someone else:
 *   - mentions you (@username) in a forum post, reply, announcement,
 *     comment or document in one of your groups, or on a blog → notifyMentions()
 *   - assigns you something: a to-do, a kanban card, a Gantt task…
 *   - adds you to a calendar event or invites you to one
 *                                                     → watchAssignments()
 *   - posts an announcement, or adds an event (with RSVPs, not a plain
 *     calendar entry) in one of your groups          → watchGroupNews()
 *
 * Group news can be muted per group (the bell button in the group's
 * header; saved as member.mutedSpaceIds). Muting quiets announcements,
 * new events and new forum threads, but never mentions, assignments
 * or invitations: those are about you.
 *
 * Assignments are noticed automatically: whenever module data is saved,
 * the people assigned to each item before and after are compared, using
 * the module type's `assignments` (the same rules that put items on your
 * homepage; see linked-items.js). So a new module type that can assign
 * people gets notifications for free.
 *
 * State: state.notifications = [{
 *   id, recipientId, actorId,
 *   kind: 'mention' | 'assigned' | 'declined' | 'invited' | 'news' | 'thread' | …,
 *   answer: 'accepted' | 'declined'      ← an 'assigned' one, once answered with ✓ or ✕ (answerAssignment)
 *   text: 'Anna A invited you to “Steering committee dinner”',
 *   spaceId, moduleId, itemId,     ← where to go when it's clicked
 *   href,                          ← or a link (an event's page)
 *   anonymous: true,               ← (optional) don't show who did it
 *   createdAt, read,
 * }]
 */

import { changeState, getState, getMember, getModule, getSpaceOfModule, getCurrentUser, onModuleDataChange, updateModuleData } from './store.js';
import { getModuleType } from '../modules/registry.js';
import { newlyMentionedIds } from '../ui/mentions.js';
import { makeId } from '../ui/dom.js';
import { emailsNow } from './delivery.js';

/** Keep each person's newest notifications only. */
const MAX_PER_PERSON = 100;

/** Kinds of notification that muting a group silences. */
const MUTABLE_KINDS = ['news', 'thread'];

// ─── Muting a group ─────────────────────────────────────────────────────────

export function isGroupMuted(memberId, spaceId) {
  return (getMember(memberId)?.mutedSpaceIds ?? []).includes(spaceId);
}

export function setGroupMuted(memberId, spaceId, muted) {
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    if (!member) return;
    const others = (member.mutedSpaceIds ?? []).filter((id) => id !== spaceId);
    member.mutedSpaceIds = muted ? [...others, spaceId] : others;
  }, 'notifications');
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/** Someone's notifications, newest first. */
export function getNotifications(memberId) {
  return (getState().notifications ?? [])
    .filter((n) => n.recipientId === memberId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function unreadCount(memberId) {
  return getNotifications(memberId).filter((n) => !n.read).length;
}

// ─── Changing ────────────────────────────────────────────────────────────────

export function markRead(notificationId) {
  changeState((state) => {
    const notification = state.notifications.find((n) => n.id === notificationId);
    if (notification) notification.read = true;
  }, 'notifications');
}

export function markAllRead(memberId) {
  changeState((state) => {
    for (const n of state.notifications) if (n.recipientId === memberId) n.read = true;
  }, 'notifications');
}

/**
 * Add notifications. People never get notified about what they did
 * themselves, and the same thing isn't announced twice while unread.
 */
export function notify({ recipientIds, actorId, kind, text, spaceId = null, moduleId = null, itemId = null, href = null, anonymous = false }) {
  spaceId = spaceId ?? (moduleId ? getSpaceOfModule(moduleId)?.id ?? null : null);
  const recipients = [...new Set(recipientIds)]
    .filter((id) => id && id !== actorId)
    .filter((id) => !(MUTABLE_KINDS.includes(kind) && spaceId && isGroupMuted(id, spaceId)));
  if (recipients.length === 0) return;

  changeState((state) => {
    state.notifications = state.notifications ?? [];
    for (const recipientId of recipients) {
      const duplicate = state.notifications.some((n) => !n.read && n.recipientId === recipientId && n.text === text && n.itemId === itemId);
      if (duplicate) continue;
      state.notifications.push({
        id: makeId('note'), recipientId, actorId, kind, text, spaceId, moduleId, itemId, href, createdAt: Date.now(), read: false,
        ...(anonymous ? { anonymous: true } : {}),
        // People who opted in to texts (a phone number) get it by text too. (Prototype: marked, not sent.)
        ...(state.members.find((m) => m.id === recipientId)?.textNotifications ? { texted: true } : {}),
        // And people who asked for email as it happens (delivery.js). Also marked, not sent.
        ...(emailsNow(state.members.find((m) => m.id === recipientId), kind) ? { emailed: true } : {}),
      });
    }
    // Drop the oldest beyond the limit, per person.
    const counts = {};
    state.notifications = state.notifications
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((n) => { counts[n.recipientId] = (counts[n.recipientId] ?? 0) + 1; return counts[n.recipientId] <= MAX_PER_PERSON; });
  }, 'notifications');
}

/**
 * Tell people newly @mentioned in something just written or edited.
 * Only people in the module's group are told (others can't see it).
 *
 *   notifyMentions({ moduleId, itemId: thread.id, before: '', after: thread.body, where: `the thread “${thread.title}”` });
 *
 * With `anonymous: true` (an anonymous forum post) it says "Someone"
 * instead of the writer's name. `writer` is who wrote it: you, unless a
 * moderator is approving someone else's post.
 */
export function notifyMentions({ moduleId, itemId = null, before = '', after = '', where, anonymous = false, writer = getCurrentUser() }) {
  const space = getSpaceOfModule(moduleId);
  if (!space || space.kind === 'personal' || !writer) return;
  // A blog is public, so anyone mentioned there can be told; in a group, only its members.
  const recipients = newlyMentionedIds(before, after).filter((id) => space.kind === 'blog' || space.memberIds.includes(id));
  notify({
    recipientIds: recipients,
    actorId: writer.id,
    kind: 'mention',
    text: `${anonymous ? 'Someone' : writer.name} mentioned you in ${where} (${space.name})`,
    spaceId: space.id,
    moduleId,
    itemId,
    anonymous,
  });
}

// ─── Assignments ─────────────────────────────────────────────────────────────

/** "the to-do “Fix the sink”" etc. */
function describeItem(moduleType, item) {
  const name = item.title ?? item.name ?? item.text ?? 'something';
  if ((moduleType === 'calendar' || moduleType === 'events') && item.kind === 'entry') return `the calendar entry “${name}”`;
  const what = {
    todo: 'the to-do',
    kanban: 'the card',
    gantt: 'the task',
    relationship: 'the contact',
    calendar: 'the event',
    events: 'the event',
  }[moduleType] ?? 'the item';
  return `${what} “${name}”`;
}

const isEventModule = (type) => type === 'calendar' || type === 'events';

/**
 * Start noticing assignments. Called once from main.js. Compares who's
 * assigned to each item before and after every save in a group.
 */
export function watchAssignments() {
  onModuleDataChange((module, before, after) => {
    const space = getSpaceOfModule(module.id);
    const me = getCurrentUser();
    const { assignments } = getModuleType(module.type);
    if (!assignments || !space || !me || before === after) return;
    // "(14 Juniper Lane)" after the item; nothing for someone's own homepage.
    const where = space.kind === 'personal' ? '' : ` (${space.name})`;

    const beforeItems = new Map(assignments.items(before ?? {}).map((item) => [item.id, item]));
    for (const item of assignments.items(after ?? {})) {
      const previous = beforeItems.get(item.id);
      const newlyAssigned = space.memberIds.concat(item.inviteeIds ?? [])
        .filter((id, i, all) => all.indexOf(id) === i)
        .filter((id) => assignments.isAssignedTo(item, id) && !(previous && assignments.isAssignedTo(previous, id)));
      if (newlyAssigned.length === 0) continue;

      // Events: being invited reads differently from being added.
      const invited = isEventModule(module.type) ? newlyAssigned.filter((id) => (item.inviteeIds ?? []).includes(id)) : [];
      const added = newlyAssigned.filter((id) => !invited.includes(id));
      const common = { actorId: me.id, spaceId: space.id, moduleId: module.id, itemId: item.id, href: isEventModule(module.type) ? `#event-${item.id}` : null };

      if (invited.length) {
        notify({ ...common, recipientIds: invited, kind: 'invited', text: `${me.name} invited you to ${describeItem(module.type, item)}${where}` });
      }
      if (added.length) {
        const verb = isEventModule(module.type) ? 'added you to' : 'assigned you';
        notify({ ...common, recipientIds: added, kind: 'assigned', text: `${me.name} ${verb} ${describeItem(module.type, item)}${where}` });
      }
    }
  });
}

/**
 * Can this "assigned you" notification be answered with ✓ / ✕? Tasks and
 * cards (items with assigneeIds) that still list you; not calendar events,
 * which have RSVPs.
 */
export function canAnswerAssignment(notification) {
  if (notification.kind !== 'assigned' || notification.answer || !notification.moduleId) return false;
  const item = assignedItem(notification.moduleId, notification.itemId)?.item;
  return Boolean(item && Array.isArray(item.assigneeIds) && item.assigneeIds.includes(notification.recipientId));
}

/** The task or card a notification is about, in a copy of its module's data. */
function assignedItem(moduleId, itemId, data = null) {
  const module = getModule(moduleId);
  const assignments = module ? getModuleType(module.type).assignments : null;
  if (!module || !assignments || isEventModule(module.type)) return null;
  const copy = data ?? structuredClone(module.data ?? {});
  const item = assignments.items(copy).find((i) => i.id === itemId);
  return item ? { module, data: copy, item } : null;
}

/**
 * ✓ or ✕ on an "assigned you" notification. Accepting keeps you on it and
 * marks you as having said yes (item.acceptedIds). Declining takes you off
 * it and tells whoever put you there. Either way you stay listed until you decline.
 */
export function answerAssignment(notificationId, answer) {
  const me = getCurrentUser();
  const notification = (getState().notifications ?? []).find((n) => n.id === notificationId);
  if (!me || !notification || notification.recipientId !== me.id) return false;
  const found = assignedItem(notification.moduleId, notification.itemId);
  if (found) {
    const { module, data, item } = found;
    const accepted = item.acceptedIds ?? (item.assigneeIds ?? []).filter((id) => id !== me.id);
    if (answer === 'accept') item.acceptedIds = [...new Set([...accepted, me.id])];
    else {
      item.assigneeIds = (item.assigneeIds ?? []).filter((id) => id !== me.id);
      delete item.assigneeId;
      item.acceptedIds = accepted.filter((id) => id !== me.id);
    }
    updateModuleData(module.id, data);
    if (answer !== 'accept') {
      const space = getSpaceOfModule(module.id);
      const where = space && space.kind !== 'personal' ? ` (${space.name})` : '';
      notify({
        recipientIds: [notification.actorId], actorId: me.id, kind: 'declined', moduleId: module.id, itemId: item.id,
        text: `${me.name} passed on ${describeItem(module.type, item)}${where} and is off it now`,
      });
    }
  }
  changeState((state) => {
    const saved = (state.notifications ?? []).find((n) => n.id === notificationId);
    if (saved) Object.assign(saved, { answer: answer === 'accept' ? 'accepted' : 'declined', read: true });
  }, 'notifications');
  return true;
}

/**
 * Start telling group members about new announcements and new events.
 * Called once from main.js. Like watchAssignments(), it compares a
 * module's data before and after each save, so it works no matter which
 * screen the post or event was made on.
 *
 * Who hears about a new event: everyone in the group for a group or
 * public event, minus people who were invited or added (they already
 * get an "invited you" notice). Invite-only events aren't announced.
 */
export function watchGroupNews() {
  onModuleDataChange((module, before, after) => {
    const space = getSpaceOfModule(module.id);
    const me = getCurrentUser();
    if (!space || space.kind !== 'group' || !me || !after || before === after) return;
    const common = { actorId: me.id, spaceId: space.id, moduleId: module.id, kind: 'news' };

    if (module.type === 'announcements') {
      const oldIds = new Set((before?.posts ?? []).map((p) => p.id));
      for (const post of after.posts ?? []) {
        if (oldIds.has(post.id)) continue;
        notify({ ...common, recipientIds: space.memberIds, itemId: post.id, text: `${me.name} posted “${post.title}” in ${space.name}` });
      }
    }

    if (isEventModule(module.type)) {
      const oldIds = new Set((before?.events ?? []).map((e) => e.id));
      for (const event of after.events ?? []) {
        if (oldIds.has(event.id) || event.kind === 'entry' || event.visibility === 'invite') continue;
        const alreadyTold = new Set([...(event.inviteeIds ?? []), ...(event.attendeeIds ?? [])]);
        notify({
          ...common,
          recipientIds: space.memberIds.filter((id) => !alreadyTold.has(id)),
          itemId: event.id,
          href: `#event-${event.id}`,
          text: `${me.name} added the event “${event.title}” in ${space.name}`,
        });
      }
    }
  });
}

/** Who did it, for showing an avatar. */
export function actorOf(notification) {
  return notification.anonymous ? null : getMember(notification.actorId);
}
