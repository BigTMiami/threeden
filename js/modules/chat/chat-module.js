// @ts-check
/**
 * chat-module.js — the Chat module: a group chat on the group's homepage.
 *
 * The chat IS a conversation in Messages (js/state/messages.js): the
 * module saves only that conversation's id, and both places draw it with
 * the same thread view (js/messages/thread-view.js). Everyone in the group
 * is in the chat, including people who join later.
 *
 * The conversation is made the first time the module is shown, so adding
 * a Chat module also adds the chat to every member's Messages. Removing
 * the module leaves the conversation (and its history) in Messages.
 *
 * Channels (Nov 20): admins and the owner add channels; each is another
 * group chat with everyone in the group (chat-data.js). Expanding the
 * module opens its own page with the channels beside the chat, inside the
 * group (not Messages).
 *
 * Files in this folder:
 *   chat-module.js  ← this file: the module definition
 *   chat-card.js    the card (channel chips) and the expanded page (channel list)
 *   chat-data.js    channels: the list, names, unread counts, who can manage them
 *
 * Data shape: { conversationId: 'conv-…' | null,   ← # general
 *               channels: [{ id, name, conversationId, createdBy, createdAt }] }
 */

import { renderChatCard, renderChatPage } from './chat-card.js';

export const chatModule = {
  type: 'chat',
  label: 'Chat',
  description: 'Good for full conversations, mirrored in messages. Has channels.',
  icon: 'chat',
  defaultSpan: 5,
  defaultRows: 13,
  available: true,

  createInitialData() {
    return { conversationId: null, channels: [] }; // made on first render, see chat-card.js
  },

  render: renderChatCard,
  renderFullPage: renderChatPage,
};
