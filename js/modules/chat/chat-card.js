// @ts-check
/**
 * chat-card.js — the Chat module's card and its expanded page (Nov 20: channels).
 *
 * Card (on the group's page):
 *   [# general] [# supplies •2] [# events] [+]      ← channels; + for admins
 *   (the channel's conversation: thread-view.js)
 *
 * Expanded (the module's expand button; stays in the group, not Messages):
 *   ┌ Channels ──────┐┌ # supplies ───────── Also in Messages ↗ [⋯] ┐
 *   │ # general      ││                                              │
 *   │ # supplies  2  ││   the conversation                           │
 *   │ # events       ││                                              │
 *   │ + New channel  ││                                              │
 *   └────────────────┘└──────────────────────────────────────────────┘
 *   (on a phone, the channel list is a row of chips above the chat)
 *
 * Each channel is a group chat with everyone in the group, also in
 * Messages (chat-data.js). Admins and the owner add channels, and rename or
 * delete them (not # general). The card remembers which channel is open,
 * and expanding opens that one (module-context.js expandTargetOf).
 */

import { h, replaceChildren, makeId } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { moreMenu } from '../../ui/more-menu.js';
import { getModule, getCurrentUser, subscribe } from '../../state/store.js';
import { getConversation, createModuleConversation, renameConversation, deleteConversation } from '../../state/messages.js';
import { createThreadView } from '../../messages/thread-view.js';
import { messagesHref } from '../../messages/messages-page.js';
import { channelsOf, cleanChannelName, channelUnread, canManageChannels, GENERAL } from './chat-data.js';

// Which channel each chat has open, while the app is open (card and page share it).
const openChannel = new Map();

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

  findOrCreateConversation(context);
  const me = getCurrentUser();
  const canManage = () => !context.isVisitor && canManageChannels(context.spaceId, me?.id);
  // The expanded page opens on the channel the card had open (or a notification's).
  const asked = compact ? null : context.takeFocusRequest?.();
  if (asked) openChannel.set(context.moduleId, asked);

  let thread = null;
  let threadFor = null;
  let adding = false;
  let renamingId = null;

  const channels = () => channelsOf(context.getData());
  const current = () => channels().find((c) => c.id === openChannel.get(context.moduleId)) ?? channels()[0];

  const switcher = h('div', { class: `chat-channels${compact ? ' chat-channels--chips' : ''}`, role: 'tablist', 'aria-label': 'Channels' });
  const header = h('div', { class: 'chat-module__header' });
  const threadSlot = h('div', { class: 'chat-module__thread' });

  function select(channelId) {
    openChannel.set(context.moduleId, channelId);
    adding = false;
    draw();
  }

  function draw() {
    const channel = current();
    context.setExpandTarget?.(channel.id === GENERAL ? null : channel.id);
    drawSwitcher(channel);
    drawHeader(channel);
    if (threadFor !== channel.conversationId) {
      thread?.destroy();
      thread = createThreadView(channel.conversationId, { compact, placeholder: `Message #${channel.name}` });
      threadFor = channel.conversationId;
      replaceChildren(threadSlot, thread.element);
    }
  }

  function drawSwitcher(channel) {
    const list = channels().map((c) => {
      const unread = c.id === channel.id ? 0 : channelUnread(c, me?.id);
      if (renamingId === c.id) return renameForm(c);
      return h('button', {
        type: 'button', role: 'tab', class: `chat-channel${c.id === channel.id ? ' is-active' : ''}`,
        'aria-selected': String(c.id === channel.id), 'data-channel': c.name,
        onClick: () => select(c.id),
      }, h('span', { class: 'chat-channel__hash', 'aria-hidden': 'true' }, '#'), h('span', { class: 'chat-channel__name' }, c.name),
      unread ? h('span', { class: 'chat-channel__unread', 'aria-label': `${unread} unread` }, String(unread)) : null);
    });
    replaceChildren(switcher,
      compact ? null : h('h2', { class: 'chat-channels__title' }, 'Channels'),
      list,
      canManage() ? (adding ? newChannelForm() : h('button', {
        type: 'button', class: `chat-channel chat-channel--new${compact ? ' icon-only' : ''}`,
        'aria-label': 'New channel', title: 'New channel',
        onClick: () => { adding = true; drawSwitcher(current()); switcher.querySelector('input')?.focus(); },
      }, icon('plus', 14), compact ? null : ' New channel')) : null);
  }

  function newChannelForm() {
    const input = h('input', { class: 'input input--compact', placeholder: 'e.g. supplies', 'aria-label': 'Channel name', maxlength: 40 });
    const error = h('span', { class: 'form-error', role: 'alert' });
    return h('form', {
      class: 'chat-channels__form',
      onSubmit: (e) => {
        e.preventDefault();
        const name = cleanChannelName(input.value);
        if (!name) { error.textContent = 'Give it a name.'; return; }
        if (channels().some((c) => c.name === name)) { error.textContent = `There’s already a #${name}.`; return; }
        const conversation = createModuleConversation({ spaceId: context.spaceId, moduleId: context.moduleId, name });
        const channel = { id: makeId('ch'), name, conversationId: conversation.id, createdBy: me.id, createdAt: Date.now() };
        context.saveData({ ...context.getData(), channels: [...(context.getData().channels ?? []), channel] });
        showToast(`Made #${name}. Everyone in the group is in it, and it’s in their Messages too.`);
        select(channel.id);
      },
      onKeydown: (e) => { if (e.key === 'Escape') { adding = false; drawSwitcher(current()); } },
    }, h('span', { class: 'chat-channel__hash', 'aria-hidden': 'true' }, '#'), input,
    h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Add'),
    h('button', { type: 'button', class: 'button button--small', onClick: () => { adding = false; drawSwitcher(current()); } }, 'Cancel'),
    error);
  }

  function renameForm(channel) {
    const input = h('input', { class: 'input input--compact', value: channel.name, 'aria-label': `Rename #${channel.name}`, maxlength: 40 });
    requestAnimationFrame(() => { input.focus(); input.select(); });
    return h('form', {
      class: 'chat-channels__form',
      onSubmit: (e) => {
        e.preventDefault();
        const name = cleanChannelName(input.value);
        renamingId = null;
        if (name && name !== channel.name && !channels().some((c) => c.name === name)) {
          context.saveData({ ...context.getData(), channels: (context.getData().channels ?? []).map((c) => (c.id === channel.id ? { ...c, name } : c)) });
          renameConversation(channel.conversationId, name);
          showToast(`Renamed to #${name}.`);
        }
        draw();
      },
      onKeydown: (e) => { if (e.key === 'Escape') { renamingId = null; draw(); } },
    }, h('span', { class: 'chat-channel__hash', 'aria-hidden': 'true' }, '#'), input,
    h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Save'));
  }

  function drawHeader(channel) {
    if (compact) { replaceChildren(header); return; }
    const manage = canManage() && channel.id !== GENERAL;
    replaceChildren(header,
      h('h3', { class: 'chat-module__channel' }, h('span', { 'aria-hidden': 'true' }, '#'), channel.name),
      h('a', { class: 'link-button chat-module__messages-link', href: messagesHref(channel.conversationId) }, icon('link', 12), ' Also in Messages'),
      manage ? moreMenu({
        label: `More for #${channel.name}`,
        items: [
          { label: 'Rename', icon: 'pencil', onSelect: () => { renamingId = channel.id; draw(); } },
          { label: 'Delete', icon: 'trash', danger: true, onSelect: () => removeChannel(channel) },
        ],
      }) : null);
  }

  function removeChannel(channel) {
    if (!window.confirm(`Delete #${channel.name} and its messages for everyone?`)) return;
    context.saveData({ ...context.getData(), channels: (context.getData().channels ?? []).filter((c) => c.id !== channel.id) });
    deleteConversation(channel.conversationId);
    openChannel.set(context.moduleId, GENERAL);
    showToast(`Deleted #${channel.name}.`);
    draw();
  }

  container.append(h('div', { class: `chat-module${compact ? '' : ' chat-module--page'}` },
    switcher,
    h('div', { class: 'chat-module__main' }, header, threadSlot)));
  draw();

  // New messages in other channels: their unread counts.
  const stop = subscribe('messages', () => { if (container.isConnected && !adding && !renamingId) drawSwitcher(current()); });
  return () => { stop(); thread?.destroy(); context.setExpandTarget?.(null); };
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
