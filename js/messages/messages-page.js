// @ts-check
/**
 * messages-page.js — Messages (#messages, or #messages-<id> for one conversation).
 *
 *   Messages                                              [ + New message ]
 *   ┌ conversations ───────────────┐ ┌ Anna A ──────────────────────────────┐
 *   │ [ Search ]                   │ │                                      │
 *   │ (AA) Anna A          9:14am  │ │  (the conversation: thread-view.js)  │
 *   │      Who's around Sat…   (2) │ │                                      │
 *   │ [237] 237 Hart Street · Chat │ │                                      │
 *   │      Leo: I'll bring…        │ │                                      │
 *   └──────────────────────────────┘ └──────────────────────────────────────┘
 *
 * Group chats that belong to a group's Chat module are listed here too:
 * they're the same conversation (see js/state/messages.js). Their header
 * links to the group's homepage.
 *
 * On a phone, the list and the conversation take turns filling the screen.
 */

import { canMessage, parentsOf, childrenOf } from '../state/children.js';
import { openMessage } from '../state/e2ee.js';
import { h, replaceChildren, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar, avatarStack } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { memberToggles } from '../ui/member-toggles.js';
import { timeAgo } from '../utils/dates.js';
import { groupInitials } from '../utils/initials.js';
import { getCurrentUser, getMember, getSpace, getVisibleSpaces, subscribe } from '../state/store.js';
import {
  getConversation, getConversationsFor, conversationTitle, conversationMemberIds, lastMessage, messagePreview, unreadCount,
  openDirectConversation, createGroupConversation, renameConversation, leaveConversation,
} from '../state/messages.js';
import { createThreadView } from './thread-view.js';
import { goTo, spaceHref, blogHref } from '../router.js';
import { usesSocial } from '../state/friends.js';

const SEARCH_DELAY_MS = 150;

/** The page keeps one thread open at a time; closing the page stops it listening. */
let openThread = null;
let stopListening = null;

export function messagesHref(conversationId = null) {
  return conversationId ? `#messages-${conversationId}` : '#messages';
}

export function clearMessagesPage() {
  openThread?.destroy();
  openThread = null;
  stopListening?.();
  stopListening = null;
}

/**
 * @param {HTMLElement} container
 * @param {string|null} conversationId  the open conversation, or null
 * @param {boolean}     isComposing     true for "New message"
 */
export function renderMessagesPage(container, conversationId, isComposing = false) {
  clearMessagesPage();
  const me = getCurrentUser();
  let search = '';

  // A conversation you're not in (or that's gone) shows the list only.
  const conversation = conversationId ? getConversation(conversationId) : null;
  const isOpen = Boolean(conversation && conversationMemberIds(conversation).includes(me.id));

  const listElement = h('ul', { class: 'conversations__list' });

  function drawList() {
    const query = search.trim().toLowerCase();
    const conversations = getConversationsFor(me.id)
      .filter((c) => !query || conversationTitle(c, me.id).toLowerCase().includes(query)
        || c.messages.some((m) => (openMessage(m)?.body ?? '').toLowerCase().includes(query)));

    replaceChildren(listElement, conversations.length
      ? conversations.map((c) => renderConversationRow(c, me, c.id === conversationId))
      : h('li', { class: 'module-empty conversations__empty' }, query ? 'No conversations match.' : 'No conversations yet.'));
  }

  const sidebar = h('aside', { class: 'conversations', 'aria-label': 'Conversations' },
    h('label', { class: 'page-search conversations__search' }, icon('search', 16), h('input', {
      type: 'search',
      class: 'input page-search__input',
      placeholder: 'Search messages',
      'aria-label': 'Search messages',
      onInput: debounce((event) => { search = event.target.value; drawList(); }, SEARCH_DELAY_MS),
    })),
    listElement,
  );

  const main = h('section', { class: 'messages-page__main' });
  if (isComposing) {
    main.append(renderNewConversation(me));
  } else if (isOpen) {
    openThread = createThreadView(conversation.id);
    main.append(renderThreadHeader(conversation, me, () => renderMessagesPage(container, conversationId)), openThread.element);
  } else {
    main.append(h('div', { class: 'messages-page__placeholder' },
      icon('forum', 32),
      h('p', {}, 'Pick a conversation, or start a new one.'),
      h('a', { class: 'button button--primary', href: '#messages-new' }, icon('plus', 14), ' New message')));
  }

  replaceChildren(container,
    h('header', { class: 'messages-page__header' },
      h('h1', { class: 'messages-page__title' }, 'Messages'),
      h('a', { class: 'button button--primary', href: '#messages-new' }, icon('plus', 14), ' New message'),
    ),
    h('div', { class: `messages-page${isOpen || isComposing ? ' has-open-thread' : ''}` }, sidebar, main),
  );

  drawList();
  // Keep the list's unread counts and order fresh as messages come and go.
  stopListening = subscribe('messages', () => { if (container.isConnected) drawList(); });
  if (isOpen) requestAnimationFrame(() => openThread?.focus());
}

// ─── The conversation list ───────────────────────────────────────────────────

function renderConversationRow(conversation, me, isCurrent) {
  const last = lastMessage(conversation);
  const unread = unreadCount(conversation, me.id);
  const author = last ? getMember(last.authorId) : null;
  const preview = !last ? 'No messages yet'
    : last.deleted ? 'Message deleted'
      : `${last.authorId === me.id ? 'You' : author?.name.split(' ')[0] ?? 'Someone'}: ${messagePreview(last)}`;

  return h('li', {},
    h('a', {
      href: messagesHref(conversation.id),
      class: `conversation-row${isCurrent ? ' is-current' : ''}${unread ? ' is-unread' : ''}`,
      'aria-current': isCurrent ? 'page' : null,
    },
      conversationPicture(conversation, me),
      h('span', { class: 'conversation-row__text' },
        h('span', { class: 'conversation-row__title' }, conversationTitle(conversation, me.id)),
        h('span', { class: 'conversation-row__preview' }, preview)),
      h('span', { class: 'conversation-row__side' },
        last ? h('span', { class: 'conversation-row__time' }, timeAgo(last.createdAt)) : null,
        unread ? h('span', { class: 'unread-badge', 'aria-label': `${unread} unread` }, String(unread)) : null),
    ),
  );
}

/** A direct conversation shows the other person; a group chat its group's badge or its people. */
function conversationPicture(conversation, me) {
  if (conversation.kind === 'direct') {
    const otherId = conversation.memberIds.find((id) => id !== me.id) ?? me.id;
    return avatar(getMember(otherId), 36);
  }
  if (conversation.spaceId) {
    const space = getSpace(conversation.spaceId);
    return h('span', { class: 'conversation-row__badge', 'aria-hidden': 'true' }, groupInitials(space?.name ?? '?'));
  }
  const others = conversationMemberIds(conversation).filter((id) => id !== me.id).map(getMember).filter(Boolean);
  return h('span', { class: 'conversation-row__stack' }, avatarStack(others, 24, 2));
}

// ─── The open conversation's header ──────────────────────────────────────────

/**
 * In a direct conversation, the other person's name, underlined, links to
 * their blog (unless they've turned blogs off). Null for group conversations.
 */
function directTitle(conversation, me) {
  if (conversation.kind !== 'direct') return null;
  const other = conversationMemberIds(conversation).map(getMember).find((m) => m && m.id !== me.id);
  if (!other || !usesSocial(other.id)) return null;
  return h('a', { href: blogHref(other), class: 'thread-header__person', title: `Visit ${other.name.split(' ')[0]}’s blog` }, other.name);
}

function renderThreadHeader(conversation, me, redraw) {
  const members = conversationMemberIds(conversation).map(getMember).filter(Boolean);
  const space = conversation.spaceId ? getSpace(conversation.spaceId) : null;

  const details = conversation.kind === 'direct'
    ? `@${members.find((m) => m.id !== me.id)?.username ?? me.username}`
    : space
      ? `Everyone in ${space.name} · ${members.length} people`
      : `${members.length} people`;

  return h('header', { class: 'thread-header' },
    h('a', { class: 'link-button thread-header__back', href: messagesHref() }, icon('arrowLeft', 14), ' All messages'),
    h('div', { class: 'thread-header__title-row' },
      h('h2', { class: 'thread-header__title' }, directTitle(conversation, me) ?? conversationTitle(conversation, me.id)),
      conversation.kind === 'direct' ? null : avatarStack(members, 24, 6),
    ),
    h('p', { class: 'thread-header__details' },
      details,
      space ? [' · ', h('a', { href: spaceHref(space.id) }, 'Open the group’s homepage')] : null,
      conversation.kind === 'group' && !space ? [
        ' · ',
        h('button', {
          type: 'button',
          class: 'link-button',
          onClick: () => {
            const input = h('input', { type: 'text', class: 'input input--compact', value: conversation.name, placeholder: 'Name this conversation', 'aria-label': 'Conversation name' });
            const form = h('form', {
              class: 'thread-header__rename',
              onSubmit: (event) => {
                event.preventDefault();
                renameConversation(conversation.id, input.value);
                redraw();
              },
            }, input, h('button', { type: 'submit', class: 'button button--small' }, 'Save'));
            document.querySelector('.thread-header__details')?.replaceWith(form);
            input.focus();
          },
        }, 'Rename'),
        ' · ',
        h('button', {
          type: 'button',
          class: 'link-button link-button--danger',
          onClick: () => {
            leaveConversation(conversation.id, me.id);
            goTo(messagesHref());
            showToast('You left the conversation.');
          },
        }, 'Leave'),
      ] : null,
    ),
  );
}

// ─── New message ─────────────────────────────────────────────────────────────

/** Pick one person for a direct message, or several for a group conversation. */
function renderNewConversation(me) {
  // People you share a group with, A–Z.
  const knownIds = new Set(getVisibleSpaces().filter((s) => s.kind === 'group').flatMap((s) => s.memberIds));
  // Parents and their children can always write to each other (children.js).
  for (const id of [...parentsOf(me.id), ...childrenOf(me.id).map((c) => c.id)]) knownIds.add(id);
  knownIds.delete(me.id);
  const people = [...knownIds].map(getMember).filter(Boolean).filter((m) => canMessage(me.id, m.id)).sort((a, b) => a.name.localeCompare(b.name)); // child accounts: see children.js
  let chosen = [];

  const nameField = h('label', { class: 'settings-field', hidden: true },
    h('span', { class: 'settings-field__label' }, 'Name (optional)'),
    h('input', { type: 'text', class: 'input', placeholder: 'e.g. Saturday ride', 'aria-label': 'Conversation name' }));
  const error = h('p', { class: 'form-error', role: 'alert' });

  const form = h('form', {
    class: 'new-conversation',
    onSubmit: (event) => {
      event.preventDefault();
      if (chosen.length === 0) {
        error.textContent = 'Choose at least one person.';
        return;
      }
      const conversation = chosen.length === 1
        ? openDirectConversation(me.id, chosen[0])
        : createGroupConversation({ name: nameField.querySelector('input').value, memberIds: [me.id, ...chosen] });
      goTo(messagesHref(conversation.id));
    },
  },
    h('h2', { class: 'thread-header__title' }, 'New message'),
    h('div', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'To'),
      people.length
        ? memberToggles(people, [], (ids) => {
            chosen = ids;
            nameField.hidden = chosen.length < 2;
            error.textContent = '';
          }, 'People to message')
        : h('p', { class: 'module-empty' }, 'Join a group to message its members.'),
      h('span', { class: 'settings-field__hint' }, 'One person starts a direct message; two or more start a group conversation.')),
    nameField,
    error,
    h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--primary' }, 'Start conversation'),
      h('a', { class: 'button button--quiet', href: messagesHref() }, 'Cancel')),
  );
  return form;
}
