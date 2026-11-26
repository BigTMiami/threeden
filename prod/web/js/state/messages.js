// @ts-check
/**
 * messages.js — conversations: direct messages, group chats, and the chats
 * that belong to a group's Chat module.
 *
 * Saved in `state.conversations`:
 *
 *   {
 *     id,
 *     kind: 'direct' | 'group',
 *     name: 'Saturday ride',        ← group chats only ('' = list the people)
 *     memberIds: ['m-leo', …],      ← who's in it (not used when spaceId is set)
 *     spaceId: 'juniper' | null,       ← a group's chat: its members ARE the group's members
 *     moduleId: 'mod-chat' | null,  ← the Chat module showing it on that group's homepage
 *     createdAt,
 *     messages: [ {
 *       id, authorId, body, createdAt,
 *       editedAt: null,
 *       deleted: false,             ← deleted messages stay as "Message deleted"
 *       reactions: { '👍': ['m-maya'] },
 *       attachment: null | {        ← from the composer's "+" menu (js/messages/attachments.js)
 *         kind: 'photo', src, width, height
 *         kind: 'video', src, name
 *         kind: 'event', eventId    ← the event lives in a calendar; the message shows it with RSVPs
 *         kind: 'blog', memberId    ← someone's blog, shared
 *       },
 *     } ],
 *     readAt: { [memberId]: timestamp },   ← when each person last read it
 *     disappearAfter: 0,            ← disappearing messages: how long new messages last (ms), 0 = keep
 *   }
 *   A message sent while disappearing is on carries expiresAt; it's removed
 *   for everyone once that passes (purgeExpiredMessages, run every 30 s).
 *   Turning it on or off leaves a notice in the chat: { system: true, body }.
 *
 * A group's Chat module and its conversation in Messages are the same
 * thing: the module only stores the conversation's id (see
 * js/modules/chat/), so a message sent in either place shows in both.
 * Because a group chat's members come from the group, adding someone to
 * the group adds them to the chat too.
 */

import { mySecurity, DISAPPEAR_MS } from './security.js';
import { changeState, getState, getSpace, getMember } from './store.js';
import { makeId } from '../ui/dom.js';
import { sealOutgoing, openMessage } from './e2ee.js';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉'];

const HOUR = 60 * 60 * 1000;
/** How long messages can last, for "Disappearing messages". */
export const DISAPPEAR_OPTIONS = [
  { ms: 0, label: 'Off' },
  { ms: 5 * 60 * 1000, label: '5 minutes' },
  { ms: HOUR, label: '1 hour' },
  { ms: 8 * HOUR, label: '8 hours' },
  { ms: 24 * HOUR, label: '1 day' },
  { ms: 7 * 24 * HOUR, label: '1 week' },
  { ms: 30 * 24 * HOUR, label: '4 weeks' },
];

export const disappearLabel = (ms) => DISAPPEAR_OPTIONS.find((o) => o.ms === ms)?.label ?? 'Off';

// ─── Reading ─────────────────────────────────────────────────────────────────

function allConversations() {
  return getState().conversations ?? [];
}

export function getConversation(conversationId) {
  return allConversations().find((c) => c.id === conversationId) ?? null;
}

/** Everyone in a conversation (a group chat follows its group's members). */
export function conversationMemberIds(conversation) {
  if (conversation.spaceId) return getSpace(conversation.spaceId)?.memberIds ?? [];
  return conversation.memberIds;
}

export function isInConversation(conversation, memberId) {
  return conversationMemberIds(conversation).includes(memberId);
}

/** A member's conversations, the one with the newest message first. */
export function getConversationsFor(memberId) {
  return allConversations()
    .filter((c) => isInConversation(c, memberId))
    .sort((a, b) => lastActivity(b) - lastActivity(a));
}

export function lastMessage(conversation) {
  return conversation.messages[conversation.messages.length - 1] ?? null;
}

/** A message as one line of text, for lists: its text, or what it carries ("📷 Photo"). */
export function messagePreview(message) {
  if (message.deleted) return 'Message deleted';
  const open = openMessage(message);
  if (!open) return '🔒 Encrypted message';
  if (open.body) return open.body;
  return { photo: '📷 Photo', video: '🎬 Video', event: '📅 Event', blog: '🔗 A blog', post: '↗ A post', voice: '🎙 Voice note', file: '📎 File' }[open.attachment?.kind] ?? '';
}

function lastActivity(conversation) {
  return lastMessage(conversation)?.createdAt ?? conversation.createdAt;
}

/**
 * What to call a conversation, from `memberId`'s point of view:
 *   direct → the other person's name
 *   group  → its name, its group's name, or the people in it
 */
export function conversationTitle(conversation, memberId) {
  if (conversation.kind === 'direct') {
    const otherId = conversation.memberIds.find((id) => id !== memberId) ?? memberId;
    return getMember(otherId)?.name ?? 'Former member';
  }
  if (conversation.spaceId) {
    const space = getSpace(conversation.spaceId);
    return conversation.name ? `${space?.name ?? 'Group'} · ${conversation.name}` : space?.name ?? 'Group chat';
  }
  if (conversation.name) return conversation.name;
  const names = conversationMemberIds(conversation)
    .filter((id) => id !== memberId)
    .map((id) => getMember(id)?.name.split(' ')[0] ?? 'someone');
  return names.join(', ') || 'Just you';
}

/** How many messages from other people arrived since `memberId` last read it. */
export function unreadCount(conversation, memberId) {
  const readAt = conversation.readAt?.[memberId] ?? 0;
  return conversation.messages.filter((m) => m.authorId !== memberId && !m.deleted && m.createdAt > readAt).length;
}

export function totalUnread(memberId) {
  return getConversationsFor(memberId).reduce((sum, c) => sum + unreadCount(c, memberId), 0);
}

/** The direct conversation between two people, if they have one. */
export function findDirectConversation(memberA, memberB) {
  return allConversations().find((c) => c.kind === 'direct'
    && c.memberIds.includes(memberA) && c.memberIds.includes(memberB)
    && (memberA !== memberB || c.memberIds.length === 1)) ?? null;
}

// ─── Starting conversations ──────────────────────────────────────────────────

function newConversation(fields) {
  return {
    id: makeId('conv'),
    kind: 'group',
    name: '',
    memberIds: [],
    spaceId: null,
    moduleId: null,
    createdAt: Date.now(),
    messages: [],
    readAt: {},
    ...fields,
  };
}

/** Open (or start) a direct conversation with someone. Returns it. */
export function openDirectConversation(meId, otherId) {
  const existing = findDirectConversation(meId, otherId);
  if (existing) return existing;
  // Your default for new conversations (Account settings → Security → Messages).
  const conversation = newConversation({ kind: 'direct', memberIds: [...new Set([meId, otherId])], disappearAfter: DISAPPEAR_MS[mySecurity(meId).disappearing] ?? 0 });
  changeState((state) => { state.conversations = [...(state.conversations ?? []), conversation]; }, 'messages');
  return conversation;
}

/** Start a group conversation (not tied to a group's homepage). Returns it. */
export function createGroupConversation({ name = '', memberIds }) {
  const conversation = newConversation({ name: name.trim(), memberIds: [...new Set(memberIds)] });
  changeState((state) => { state.conversations = [...(state.conversations ?? []), conversation]; }, 'messages');
  return conversation;
}

/**
 * The conversation behind a Chat module, made the first time the module
 * is shown. Its members are always the group's members.
 */
export function createModuleConversation({ spaceId, moduleId, name }) {
  const conversation = newConversation({ spaceId, moduleId, name });
  changeState((state) => { state.conversations = [...(state.conversations ?? []), conversation]; }, 'messages');
  return conversation;
}

// ─── Messages ────────────────────────────────────────────────────────────────

/** Change one conversation in place, then save and announce it. */
function updateConversation(conversationId, changeFn) {
  changeState(() => {
    const conversation = getConversation(conversationId);
    if (conversation) changeFn(conversation);
  }, 'messages');
}

/**
 * Send a message. `attachment` is optional (see the shape above); with one, the text can be empty.
 * `extra`: { replyToId } quotes an earlier message; { threadOf } puts it in that message's thread
 * (shown in the thread panel, not the main list).
 */
export function sendMessage(conversationId, authorId, body, attachment = null, extra = {}) {
  const text = body.trim();
  if (!text && !attachment) return null;
  const message = { id: makeId('msg'), authorId, body: text, createdAt: Date.now(), editedAt: null, deleted: false, reactions: {}, attachment };
  if (extra.replyToId) message.replyToId = extra.replyToId;
  if (extra.threadOf) message.threadOf = extra.threadOf;
  const after = getConversation(conversationId)?.disappearAfter ?? 0;
  if (after) message.expiresAt = message.createdAt + after;
  updateConversation(conversationId, (c) => {
    c.messages.push(message);
    c.readAt = { ...c.readAt, [authorId]: message.createdAt }; // you've read your own message
  });
  sealOutgoing(conversationId, message.id); // direct messages are end-to-end encrypted (e2ee.js)
  return message;
}

export function editMessage(conversationId, messageId, body) {
  const text = body.trim();
  if (!text) return;
  updateConversation(conversationId, (c) => {
    Object.assign(c.messages.find((m) => m.id === messageId), { body: text, editedAt: Date.now() });
  });
  sealOutgoing(conversationId, messageId);
}

export function deleteMessage(conversationId, messageId) {
  const before = getConversation(conversationId)?.messages.find((m) => m.id === messageId);
  const copy = before ? structuredClone(before) : null;
  updateConversation(conversationId, (c) => {
    const message = c.messages.find((m) => m.id === messageId);
    Object.assign(message, { body: '', deleted: true, reactions: {}, attachment: null });
    delete message.sealed;
  });
  return copy;
}

/** Bring a deleted message back (for Undo). */
export function restoreMessage(conversationId, copy) {
  if (!copy) return;
  updateConversation(conversationId, (c) => {
    const index = c.messages.findIndex((m) => m.id === copy.id);
    if (index >= 0) c.messages[index] = copy;
  });
}

/** Add your reaction, or take it back if it's already there. */
export function toggleReaction(conversationId, messageId, emoji, memberId) {
  updateConversation(conversationId, (c) => {
    const message = c.messages.find((m) => m.id === messageId);
    const people = message.reactions[emoji] ?? [];
    const next = people.includes(memberId) ? people.filter((id) => id !== memberId) : [...people, memberId];
    message.reactions = { ...message.reactions, [emoji]: next };
    if (next.length === 0) delete message.reactions[emoji];
  });
}

// ─── Pins and threads ──────────────────────────────────────────────────────

/** Pin a message to the top of the conversation, or unpin it. Pinned: conversation.pinnedIds, newest last. */
export function togglePin(conversationId, messageId, memberId) {
  const conversation = getConversation(conversationId);
  if (!conversation) return;
  const pinned = conversation.pinnedIds ?? [];
  const isPinned = pinned.includes(messageId);
  const who = getMember(memberId)?.name.split(' ')[0] ?? 'Someone';
  updateConversation(conversationId, (c) => {
    c.pinnedIds = isPinned ? pinned.filter((id) => id !== messageId) : [...pinned, messageId];
    if (!isPinned) {
      c.messages.push({
        id: makeId('msg'), authorId: memberId, system: true, kind: 'pin', createdAt: Date.now(), editedAt: null, deleted: false, reactions: {}, attachment: null,
        body: `${who} pinned a message.`,
      });
    }
  });
}

/** The pinned messages that still exist, newest pin first. */
export function pinnedMessages(conversation) {
  return (conversation.pinnedIds ?? []).map((id) => conversation.messages.find((m) => m.id === id)).filter((m) => m && !m.deleted).reverse();
}

/** The replies in a message's thread, oldest first. */
export function threadReplies(conversation, messageId) {
  return conversation.messages.filter((m) => m.threadOf === messageId);
}

/** Mark a conversation as read up to now (does nothing if already read). */
export function markRead(conversationId, memberId) {
  const conversation = getConversation(conversationId);
  if (!conversation || unreadCount(conversation, memberId) === 0) return;
  updateConversation(conversationId, (c) => { c.readAt = { ...c.readAt, [memberId]: Date.now() }; });
}

// ─── Disappearing messages ───────────────────────────────────────────────────

/** Turn disappearing messages on (for how long) or off, with a notice in the chat. */
export function setDisappearing(conversationId, memberId, ms) {
  const conversation = getConversation(conversationId);
  if (!conversation || (conversation.disappearAfter ?? 0) === ms) return;
  const who = getMember(memberId)?.name.split(' ')[0] ?? 'Someone';
  updateConversation(conversationId, (c) => {
    c.disappearAfter = ms;
    c.messages.push({
      id: makeId('msg'), authorId: memberId, system: true, createdAt: Date.now(), editedAt: null, deleted: false, reactions: {}, attachment: null,
      body: ms ? `${who} set messages to disappear after ${disappearLabel(ms)}.` : `${who} turned off disappearing messages.`,
    });
  });
}

/** Remove messages whose time is up. Returns how many went. */
export function purgeExpiredMessages(now = Date.now()) {
  const expired = allConversations().some((c) => c.messages.some((m) => m.expiresAt && m.expiresAt <= now));
  if (!expired) return 0;
  let count = 0;
  changeState((state) => {
    for (const c of state.conversations ?? []) {
      const before = c.messages.length;
      c.messages = c.messages.filter((m) => !(m.expiresAt && m.expiresAt <= now));
      count += before - c.messages.length;
    }
  }, 'messages');
  return count;
}

let purgeTimer = null;
/** Check for expired messages now and every 30 seconds (main.js starts it). */
export function startDisappearingTimer() {
  purgeExpiredMessages();
  if (!purgeTimer) purgeTimer = setInterval(() => purgeExpiredMessages(), 30 * 1000);
}

/** "disappears in 3h" for a message, or ''. */
export function timeLeftLabel(message, now = Date.now()) {
  if (!message.expiresAt) return '';
  const left = Math.max(0, message.expiresAt - now);
  const minutes = Math.ceil(left / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function renameConversation(conversationId, name) {
  updateConversation(conversationId, (c) => { c.name = name.trim(); });
}

/** Delete a conversation outright: a chat channel its group's admins deleted (chat-card.js). */
export function deleteConversation(conversationId) {
  changeState((state) => { state.conversations = (state.conversations ?? []).filter((c) => c.id !== conversationId); }, 'messages');
}

/** Leave a group conversation (not a group's chat: leave the group for that). */
export function leaveConversation(conversationId, memberId) {
  updateConversation(conversationId, (c) => { c.memberIds = c.memberIds.filter((id) => id !== memberId); });
}
