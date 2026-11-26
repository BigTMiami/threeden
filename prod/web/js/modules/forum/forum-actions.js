// @ts-check
/**
 * forum-actions.js — what happens around a post, shared by the forum card
 * and the forum page: who can see a thread, and who gets told about it.
 *
 *   visibleThreads(context)       threads you may see (pending ones only
 *                                 for their author and the moderators)
 *   announceThread(context, t)    after posting: tell the moderators if it
 *                                 waits for approval, otherwise tell anyone
 *                                 @mentioned and, if the forum says so,
 *                                 every member
 *   notifyApproved / notifyDeclined   tell the author what a moderator decided
 *   authorLabel(thread, me)       "Leo L" or "Someone" (anonymous posts)
 */

import { getSpace } from '../../state/store.js';
import { can } from '../../state/permissions.js';
import { notify, notifyMentions } from '../../state/notifications.js';
import { normalizeThread, settingsOf, isVisibleTo } from './forum-data.js';

/** The threads `context.currentUser` may see. */
export function visibleThreads(context) {
  const me = context.currentUser;
  const isModerator = context.can('moderate');
  return context.getData().threads.map(normalizeThread).filter((thread) => isVisibleTo(thread, me.id, isModerator));
}

/** Members allowed to moderate this forum's group. */
function moderatorIds(context) {
  const space = getSpace(context.spaceId);
  return context.members.filter((member) => can(space, member.id, 'moderate')).map((member) => member.id);
}

/** "Tenant forum (Juniper Tenants Union)" */
function forumName(context) {
  const space = getSpace(context.spaceId);
  const module = space?.modules.find((m) => m.id === context.moduleId);
  return `${module?.title ?? 'the forum'}${space ? ` (${space.name})` : ''}`;
}

/** How a post's author is named in notifications. */
export function authorLabel(post, me) {
  return post.anonymous ? 'Someone' : me.name;
}

/** Call right after saving a new thread written by the current user. */
export function announceThread(context, thread) {
  const me = context.currentUser;
  const common = { actorId: me.id, moduleId: context.moduleId, itemId: thread.id, anonymous: thread.anonymous };

  if (thread.pending) {
    notify({ ...common, recipientIds: moderatorIds(context), kind: 'approval', text: `${authorLabel(thread, me)} posted “${thread.title}” in ${forumName(context)}. It’s waiting for your approval.` });
    return;
  }
  announceToMembers(context, thread, me);
}

/** Tell people about a thread that's now visible to everyone. */
function announceToMembers(context, thread, author) {
  notifyMentions({ moduleId: context.moduleId, itemId: thread.id, after: thread.body, where: `the thread “${thread.title}”`, anonymous: thread.anonymous, writer: author });
  if (settingsOf(context.getData()).notifyNewThreads) {
    notify({
      recipientIds: context.members.map((m) => m.id).filter((id) => id !== thread.authorId),
      actorId: author.id,
      kind: 'thread',
      text: `${thread.anonymous ? 'Someone' : author.name} started “${thread.title}”`,
      moduleId: context.moduleId,
      itemId: thread.id,
      anonymous: thread.anonymous,
    });
  }
}

/** A moderator approved `thread`: tell its author, then everyone else as if it were just posted. */
export function notifyApproved(context, thread) {
  const me = context.currentUser;
  notify({ recipientIds: [thread.authorId], actorId: me.id, kind: 'approval', text: `${me.name} approved your thread “${thread.title}”`, moduleId: context.moduleId, itemId: thread.id });
  const author = context.getMember(thread.authorId) ?? { id: thread.authorId, name: 'Someone' };
  announceToMembers(context, thread, author);
}

export function notifyDeclined(context, thread) {
  const me = context.currentUser;
  notify({ recipientIds: [thread.authorId], actorId: me.id, kind: 'approval', text: `${me.name} didn’t approve your thread “${thread.title}”`, moduleId: context.moduleId });
}
