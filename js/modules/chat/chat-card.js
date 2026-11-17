// @ts-check
/**
 * chat-card.js — the Chat module's homepage card and full page.
 *
 *   Same chat as in Messages · Open in Messages ↗
 *   (the conversation: thread-view.js)
 *
 * Both views show the group's conversation from Messages. If the module
 * doesn't have one yet (it was just added), it's made here.
 */

import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { getModule } from '../../state/store.js';
import { getConversation, createModuleConversation } from '../../state/messages.js';
import { createThreadView } from '../../messages/thread-view.js';
import { messagesHref } from '../../messages/messages-page.js';

export function renderChatCard(container, context) {
  return renderChat(container, context, { compact: true });
}

export function renderChatPage(container, context) {
  return renderChat(container, context, { compact: false });
}

function renderChat(container, context, { compact }) {
  // A chat belongs to a group; on a personal homepage, point to Messages.
  if (context.spaceKind !== 'group') {
    container.append(h('p', { class: 'module-empty' },
      'Chats belong to groups. Your own conversations are in ',
      h('a', { href: messagesHref() }, 'Messages'), '.'));
    return undefined;
  }

  const conversation = findOrCreateConversation(context);
  const thread = createThreadView(conversation.id, { compact, placeholder: 'Message the group' });

  container.append(h('div', { class: `chat-module${compact ? '' : ' chat-module--page'}` },
    h('p', { class: 'chat-module__note' },
      icon('link', 12), ' Same chat as in Messages · ',
      h('a', { href: messagesHref(conversation.id) }, 'Open in Messages')),
    thread.element,
  ));

  return thread.destroy; // stop listening when the module goes away
}

function findOrCreateConversation(context) {
  const { conversationId } = context.getData();
  const existing = conversationId ? getConversation(conversationId) : null;
  if (existing) return existing;

  // Name it after the module, unless it still has the default title.
  const title = getModule(context.moduleId)?.title ?? '';
  const conversation = createModuleConversation({
    spaceId: context.spaceId,
    moduleId: context.moduleId,
    name: title && title !== 'Chat' ? title : '',
  });
  context.saveData({ ...context.getData(), conversationId: conversation.id });
  return conversation;
}
