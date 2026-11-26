// @ts-check
/**
 * chat-data.js — a group chat's channels (Nov 20).
 *
 * A Chat module starts with one conversation, shown as **# general**. The
 * group's admins and owner can add channels: each is its own group chat
 * with everyone in the group, also listed in everyone's Messages (as
 * "14 Juniper Lane · supplies").
 *
 * Data shape (chat-module.js):
 *   { conversationId: 'conv-…',          ← # general
 *     channels: [{ id, name, conversationId, createdBy, createdAt }] }
 *
 *   channelsOf(data)                   → [{ id: 'general', name: 'general', conversationId }, …the rest]
 *   cleanChannelName('Supplies & food') → 'supplies-food'
 *   channelUnread(channel, memberId), chatUnreadTotal(data, memberId)
 *   canManageChannels(spaceId, memberId)  admins and the owner
 */

import { getSpace } from '../../state/store.js';
import { canManageRoles } from '../../state/permissions.js';
import { getConversation, unreadCount } from '../../state/messages.js';

export const GENERAL = 'general';

/** Every channel, # general first. */
export function channelsOf(data) {
  const general = { id: GENERAL, name: GENERAL, conversationId: data?.conversationId ?? null, createdBy: null, createdAt: 0 };
  return [general, ...(data?.channels ?? [])];
}

/** "Supplies & food!" → "supplies-food": lower case, words joined with dashes, up to 32 characters. */
export function cleanChannelName(text) {
  return String(text ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

export function channelUnread(channel, memberId) {
  const conversation = channel?.conversationId ? getConversation(channel.conversationId) : null;
  return conversation && memberId ? unreadCount(conversation, memberId) : 0;
}

/** Unread messages across all of a chat's channels (the phone's Chat chip, the widget). */
export function chatUnreadTotal(data, memberId) {
  return channelsOf(data).reduce((sum, channel) => sum + channelUnread(channel, memberId), 0);
}

/** Admins and the owner add, rename, and delete channels. */
export function canManageChannels(spaceId, memberId) {
  const space = getSpace(spaceId);
  return Boolean(space && memberId && canManageRoles(space, memberId));
}
