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
 * Files in this folder:
 *   chat-module.js  ← this file: the module definition
 *   chat-card.js    the homepage card and the full page (they're the same, bigger)
 *
 * Data shape: { conversationId: 'conv-…' | null }
 */

import { renderChatCard, renderChatPage } from './chat-card.js';

export const chatModule = {
  type: 'chat',
  label: 'Chat',
  description: 'A group chat, also in everyone’s Messages',
  icon: 'chat',
  defaultSpan: 5,
  defaultRows: 13,
  available: true,

  createInitialData() {
    return { conversationId: null }; // made on first render, see chat-card.js
  },

  render: renderChatCard,
  renderFullPage: renderChatPage,
};
