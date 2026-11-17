// @ts-check
/**
 * thread-view.js — one conversation's messages and the box to write in.
 *
 * Used in two places that show the same conversation: the Messages page
 * and a group's Chat module (js/modules/chat/).
 *
 *   ──────────────── Today ────────────────
 *   (AA) Anna A  9:14am
 *        Who's around Saturday?
 *        Bring snacks 🎉 1                     ← reactions
 *   (LL) Leo L  9:20am                     [👍 ❤️ 😂 🎉 Edit Delete] on hover
 *        Me!
 *   ┌──────────────────────────────────────────┐
 *   │ [+] Write a message…              [Send] │   Enter sends, Shift+Enter = new line
 *   └──────────────────────────────────────────┘
 *    "+" adds an event, a photo or video, or someone's blog (attachments.js)
 *   ⏱ at the top: disappearing messages (off, 5 minutes … 4 weeks), for everyone in it
 *   🎙 next to Send: record a voice note (voice.js)
 *
 * On hover (or focus) each message has: reactions, ↩ Reply (quotes it above
 * yours), 💬 Thread (replies go in a side panel, and the message shows
 * "3 replies"), 📌 Pin (pinned messages sit in a bar at the top), Edit, and
 * Delete. In a direct conversation with someone either of you blocked
 * (blocks.js), the box is replaced by a note.
 *
 *   const thread = createThreadView(conversationId, { compact });
 *   container.append(thread.element);
 *   …later: thread.destroy();   // stops listening for new messages
 *
 * It redraws itself whenever a message changes (the store's 'messages'
 * event), and marks the conversation as read only while it's actually on
 * screen (so a Chat module scrolled out of view doesn't clear your unread
 * count).
 */

import { h, replaceChildren } from '../ui/dom.js';
import { avatar } from '../ui/avatar.js';
import { getCurrentUser, getMember, subscribe } from '../state/store.js';
import {
  QUICK_REACTIONS, getConversation, isInConversation, sendMessage, editMessage, deleteMessage, restoreMessage, toggleReaction, markRead,
  DISAPPEAR_OPTIONS, disappearLabel, setDisappearing, timeLeftLabel, togglePin, pinnedMessages, threadReplies, messagePreview,
} from '../state/messages.js';
import { recordVoice, formatDuration, MAX_VOICE_SECONDS } from './voice.js';
import { isBlocked, blockedBy, setBlocked } from '../state/blocks.js';
import { showToast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { todayKey, toDateKey, addDays, formatLongDate, formatTime } from '../utils/dates.js';
import { renderText } from '../ui/text.js';
import { createAttachMenu, renderAttachment } from './attachments.js';
import { blogHref } from '../router.js';
import { usesSocial } from '../state/friends.js';
import { openMessage, isEncrypted, unsealConversation, verificationOf } from '../state/e2ee.js';
import { openSafetyNumber } from './safety-number.js';

/** Messages from the same person this close together share one header. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** If you're within this many px of the bottom, new messages scroll into view. */
const STICK_TO_BOTTOM_PX = 80;

export function createThreadView(conversationId, { compact = false, placeholder = 'Write a message' } = {}) {
  const me = getCurrentUser();
  let editingMessageId = null;
  let isOnScreen = false; // kept up to date by the IntersectionObserver below
  let replyToId = null; // the message the next one quotes (↩ Reply)
  let threadRootId = null; // the message whose thread is open in the side panel
  let pinIndex = 0; // which pinned message the bar shows
  let sideDraft = ''; // what's typed in the thread panel, kept across redraws

  const list = h('div', { class: 'thread__messages', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' });
  const composerInput = h('textarea', {
    class: 'input thread__input',
    rows: '1',
    placeholder,
    'aria-label': 'Message',
    onKeydown: (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        send();
      }
    },
    onInput: () => autoGrow(composerInput),
  });
  const attach = createAttachMenu({
    conversationId,
    me,
    onSend: (attachment, text) => {
      sendMessage(conversationId, me.id, text, attachment, takeReply());
      list.scrollTop = list.scrollHeight;
    },
  });

  // Voice notes: 🎙 starts recording; the box turns into  ● 0:07  [Cancel] [Send].
  let recorder = null;
  let recordTimer = null;
  const micButton = h('button', { type: 'button', class: 'icon-button thread__mic', 'aria-label': 'Record a voice note', title: 'Record a voice note', onClick: () => startRecording() }, icon('mic', 18));
  const recordingBar = h('div', { class: 'thread__recording', hidden: true, role: 'status' });
  async function startRecording() {
    recorder = recordVoice();
    try { await recorder.start(); } catch {
      recorder = null;
      showToast('No microphone available here. Check that this site may use your microphone.');
      return;
    }
    composer.classList.add('is-recording');
    recordingBar.hidden = false;
    const tick = () => {
      const t = recorder?.elapsed() ?? 0;
      replaceChildren(recordingBar,
        h('span', { class: 'thread__rec-dot', 'aria-hidden': 'true' }), ` Recording ${formatDuration(t)}`,
        h('button', { type: 'button', class: 'link-button', onClick: () => stopRecording(false) }, 'Cancel'),
        h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => stopRecording(true) }, icon('stop', 13), ' Send'));
      if (t >= MAX_VOICE_SECONDS) stopRecording(true);
    };
    tick();
    recordTimer = setInterval(tick, 500);
  }
  async function stopRecording(keep) {
    clearInterval(recordTimer);
    const done = await recorder?.stop(keep);
    recorder = null;
    composer.classList.remove('is-recording');
    recordingBar.hidden = true;
    if (done) sendMessage(conversationId, me.id, '', { kind: 'voice', src: done.src, duration: done.duration }, takeReply());
  }

  // ↩ Reply: a strip above the box saying what you're answering.
  const replyBar = h('div', { class: 'thread__reply-bar', hidden: true });
  function takeReply() {
    const extra = replyToId ? { replyToId } : {};
    replyToId = null;
    drawReplyBar();
    return extra;
  }
  function drawReplyBar() {
    const conversation = getConversation(conversationId);
    const target = replyToId ? conversation?.messages.find((m) => m.id === replyToId) : null;
    replyBar.hidden = !target;
    if (!target) { replaceChildren(replyBar); return; }
    replaceChildren(replyBar, icon('reply', 13),
      h('span', {}, 'Replying to ', h('strong', {}, getMember(target.authorId)?.name.split(' ')[0] ?? 'someone'), ': ', h('span', { class: 'thread__reply-text' }, messagePreview(target))),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Don’t reply to it', onClick: () => { replyToId = null; drawReplyBar(); } }, icon('close', 13)));
  }

  const composer = h('form', {
    class: 'thread__composer',
    onSubmit: (event) => { event.preventDefault(); send(); },
  }, attach.button, composerInput, recordingBar, micButton, h('button', { type: 'submit', class: 'button button--primary' }, 'Send'));
  // In a direct conversation with someone blocked: a note instead of the box.
  const blockedNote = h('div', { class: 'thread__blocked', hidden: true, role: 'note' });

  // Disappearing messages: a small bar at the top, and a menu to change it.
  const timerBar = h('div', { class: 'thread__timer' });
  // Pinned messages: one at a time, newest first; click to jump to it.
  const pinBar = h('div', { class: 'thread__pins', hidden: true });
  // A message's thread, in a panel over the right side.
  const side = h('aside', { class: 'thread__side', hidden: true, 'aria-label': 'Thread' });
  const element = h('div', { class: `thread${compact ? ' thread--compact' : ''}` }, timerBar, pinBar, list, attach.panel, replyBar, composer, blockedNote, side);

  function drawTimer(conversation) {
    const after = conversation.disappearAfter ?? 0;
    const select = h('select', {
      class: 'thread__timer-select', 'aria-label': 'Disappearing messages',
      onChange: (event) => setDisappearing(conversationId, me.id, Number(event.target.value)),
    }, DISAPPEAR_OPTIONS.map((o) => h('option', { value: String(o.ms), selected: o.ms === after }, o.ms ? `Disappear after ${o.label}` : 'Messages stay')));
    timerBar.classList.toggle('is-on', Boolean(after));
    const other = conversation.kind === 'direct' ? getMember(conversation.memberIds.find((id) => id !== me.id)) : null;
    const state = other ? verificationOf(conversation, other) : null;
    replaceChildren(timerBar,
      isEncrypted(conversation) && other ? h('button', {
        type: 'button', class: `thread__lock is-${state}`, title: 'End-to-end encrypted: only you and they can read these messages',
        onClick: () => openSafetyNumber(conversation, other),
      }, icon('lock', 12), state === 'verified' ? ' Encrypted · verified' : state === 'changed' ? ' Their safety number changed' : ' Encrypted') : null,
      icon('clock', 13),
      h('span', { class: 'thread__timer-text' }, after ? `New messages disappear after ${disappearLabel(after)}` : ''),
      select);
  }

  function send() {
    if (!composerInput.value.trim()) return;
    sendMessage(conversationId, me.id, composerInput.value, null, takeReply());
    composerInput.value = '';
    autoGrow(composerInput);
    list.scrollTop = list.scrollHeight;
    composerInput.focus();
  }

  // ─── Drawing ───────────────────────────────────────────────────────────────

  function draw() {
    const conversation = getConversation(conversationId);
    if (!conversation || !isInConversation(conversation, me.id)) {
      replaceChildren(list, h('p', { class: 'module-empty' }, 'This conversation isn’t available.'));
      composer.hidden = true;
      return;
    }
    const other = conversation.kind === 'direct' ? conversation.memberIds.find((id) => id !== me.id) : null;
    const blocked = other && isBlocked(me.id, other);
    composer.hidden = Boolean(blocked);
    blockedNote.hidden = !blocked;
    if (blocked) {
      const iBlocked = blockedBy(me.id).includes(other);
      replaceChildren(blockedNote, iBlocked
        ? ['You blocked ', h('strong', {}, getMember(other)?.name ?? 'them'), '. ', h('button', { type: 'button', class: 'link-button', onClick: () => { setBlocked(me.id, other, false); showToast('Unblocked.'); draw(); } }, 'Unblock')]
        : 'You can’t message this person.');
    }
    drawTimer(conversation);
    drawPins(conversation);

    const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < STICK_TO_BOTTOM_PX || list.scrollTop === 0;

    const rows = [];
    let previous = null;
    let lastDay = null;
    if (conversation.messages.some((m) => m.sealed && !openMessage(m))) unsealConversation(conversation);
    for (const message of conversation.messages) {
      if (message.threadOf) continue; // shown in its thread's panel
      const day = toDateKey(new Date(message.createdAt));
      if (day !== lastDay) {
        rows.push(h('div', { class: 'thread__day', role: 'separator' }, h('span', {}, dayLabel(day))));
        previous = null;
        lastDay = day;
      }
      if (message.system) {
        rows.push(h('div', { class: 'thread__notice', role: 'note' }, icon(message.kind === 'pin' ? 'pin' : 'clock', 12), ` ${message.body}`));
        previous = null;
        continue;
      }
      const startsGroup = !previous || previous.authorId !== message.authorId || message.createdAt - previous.createdAt > GROUP_WINDOW_MS;
      rows.push(renderMessage(message, startsGroup));
      previous = message;
    }

    replaceChildren(list, rows.length ? rows : h('p', { class: 'thread__empty' }, 'No messages yet. Say hello!'));
    if (wasNearBottom) list.scrollTop = list.scrollHeight;
    drawSide(conversation);
    drawReplyBar();

    // You can see it, so it's read.
    if (isOnScreen && !document.hidden) markRead(conversationId, me.id);
  }

  function renderMessage(message, startsGroup, { inThread = false } = {}) {
    const author = getMember(message.authorId);
    const isMine = message.authorId === me.id;
    const time = formatTime(new Date(message.createdAt).toTimeString().slice(0, 5));

    const open = message.deleted ? null : openMessage(message);
    const body = message.deleted
      ? h('p', { class: 'message__body message__body--deleted' }, 'Message deleted')
      : !open
        ? h('p', { class: 'message__body message__body--locked' }, icon('lock', 12), ' Unlocking…')
        : open.unreadable
          ? h('p', { class: 'message__body message__body--locked' }, icon('lock', 12), ' This message can’t be read on this device.')
          : message.id === editingMessageId
            ? renderEditor(message, open.body)
            : [
              open.body ? h('p', { class: 'message__body' }, renderText(open.body), message.editedAt ? h('span', { class: 'message__edited' }, ' (edited)') : null) : null,
              renderAttachment(open.attachment, { me, onChange: draw }),
            ];

    const reactions = Object.entries(message.reactions ?? {}).filter(([, people]) => people.length);
    const conversation = getConversation(conversationId);
    const quoted = message.replyToId ? conversation.messages.find((m) => m.id === message.replyToId) : null;
    const replies = inThread ? [] : threadReplies(conversation, message.id);
    const isPinned = (conversation.pinnedIds ?? []).includes(message.id);

    return h('article', {
      class: `message${startsGroup ? ' message--first' : ''}${isMine ? ' message--mine' : ''}`,
      dataset: { messageId: message.id },
    },
      h('div', { class: 'message__gutter' },
        startsGroup ? avatar(author, compact ? 28 : 34) : h('span', { class: 'message__time-hint' }, time)),
      h('div', { class: 'message__main' },
        startsGroup ? h('div', { class: 'message__meta' },
          author && usesSocial(author.id) ? h('a', { href: blogHref(author), class: 'message__author' }, h('strong', {}, author.name)) : h('strong', {}, author?.name ?? 'Former member'),
          h('span', { class: 'message__time', title: new Date(message.createdAt).toLocaleString() }, time),
          message.expiresAt ? h('span', { class: 'message__expires', title: `Disappears ${new Date(message.expiresAt).toLocaleString()}` }, icon('clock', 11), ` ${timeLeftLabel(message)}`) : null) : null,
        quoted ? h('button', {
          type: 'button', class: 'message__quote', title: 'Go to that message',
          onClick: () => jumpTo(quoted.id),
        }, h('strong', {}, getMember(quoted.authorId)?.name.split(' ')[0] ?? 'Someone'), ' ', messagePreview(quoted)) : null,
        body,
        isPinned && !inThread ? h('span', { class: 'message__pinned' }, icon('pin', 11), ' Pinned') : null,
        replies.length ? h('button', {
          type: 'button', class: 'message__replies', onClick: () => openThread(message.id),
        }, icon('chat', 12), ` ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`, h('span', { class: 'message__replies-last' }, ` · last ${formatTime(new Date(replies[replies.length - 1].createdAt).toTimeString().slice(0, 5))}`)) : null,
        reactions.length ? h('div', { class: 'message__reactions' }, reactions.map(([emoji, people]) => h('button', {
          type: 'button',
          class: `reaction${people.includes(me.id) ? ' is-mine' : ''}`,
          title: people.map((id) => getMember(id)?.name ?? 'Someone').join(', '),
          'aria-label': `${emoji} ${people.length}${people.includes(me.id) ? ', including you' : ''}`,
          onClick: () => toggleReaction(conversationId, message.id, emoji, me.id),
        }, `${emoji} ${people.length}`))) : null,
      ),
      message.deleted || message.id === editingMessageId ? null : h('div', { class: 'message__tools' },
        QUICK_REACTIONS.map((emoji) => h('button', {
          type: 'button',
          class: 'message__tool',
          'aria-label': `React with ${emoji}`,
          onClick: () => toggleReaction(conversationId, message.id, emoji, me.id),
        }, emoji)),
        inThread ? null : h('button', { type: 'button', class: 'message__tool', 'aria-label': 'Reply', title: 'Reply', onClick: () => { replyToId = message.id; drawReplyBar(); composerInput.focus(); } }, icon('reply', 14)),
        inThread ? null : h('button', { type: 'button', class: 'message__tool', 'aria-label': 'Reply in a thread', title: 'Reply in a thread', onClick: () => openThread(message.id) }, icon('chat', 14)),
        inThread ? null : h('button', { type: 'button', class: `message__tool${isPinned ? ' is-on' : ''}`, 'aria-label': isPinned ? 'Unpin' : 'Pin to the top', title: isPinned ? 'Unpin' : 'Pin to the top', 'aria-pressed': String(isPinned), onClick: () => { togglePin(conversationId, message.id, me.id); pinIndex = 0; } }, icon('pin', 14)),
        isMine && open?.body ? h('button', { type: 'button', class: 'message__tool message__tool--text', onClick: () => { editingMessageId = message.id; draw(); } }, 'Edit') : null,
        isMine ? h('button', { type: 'button', class: 'message__tool message__tool--text message__tool--danger', onClick: () => { const copy = deleteMessage(conversationId, message.id); showToast('Message deleted.', { actionLabel: 'Undo', onAction: () => restoreMessage(conversationId, copy) }); } }, 'Delete') : null,
      ),
    );
  }

  // ─── Pins, jumping, and threads ─────────────────────────────────────────

  function drawPins(conversation) {
    const pins = pinnedMessages(conversation);
    pinBar.hidden = !pins.length;
    if (!pins.length) { replaceChildren(pinBar); return; }
    pinIndex %= pins.length;
    const pin = pins[pinIndex];
    replaceChildren(pinBar,
      h('button', { type: 'button', class: 'thread__pin', onClick: () => jumpTo(pin.id), title: 'Go to the pinned message' },
        icon('pin', 13),
        h('span', { class: 'thread__pin-text' }, h('strong', {}, `${getMember(pin.authorId)?.name.split(' ')[0] ?? 'Someone'}: `), messagePreview(pin))),
      pins.length > 1 ? h('button', { type: 'button', class: 'link-button thread__pin-next', onClick: () => { pinIndex += 1; drawPins(getConversation(conversationId)); } }, `${pinIndex + 1} of ${pins.length} ›`) : null,
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Unpin this message', title: 'Unpin', onClick: () => togglePin(conversationId, pin.id, me.id) }, icon('close', 13)));
  }

  function jumpTo(messageId) {
    const target = list.querySelector(`[data-message-id="${messageId}"]`);
    if (!target) { openThreadFor(messageId); return; }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.remove('is-flash');
    void target.offsetWidth;
    target.classList.add('is-flash');
  }
  /** A quoted message that's in a thread: open the thread. */
  function openThreadFor(messageId) {
    const m = getConversation(conversationId)?.messages.find((x) => x.id === messageId);
    if (m?.threadOf) openThread(m.threadOf);
  }

  function openThread(messageId) {
    threadRootId = messageId;
    drawSide(getConversation(conversationId));
    requestAnimationFrame(() => side.querySelector('textarea')?.focus());
  }

  function drawSide(conversation) {
    const root = threadRootId ? conversation.messages.find((m) => m.id === threadRootId) : null;
    side.hidden = !root;
    element.classList.toggle('has-side', Boolean(root));
    if (!root) { replaceChildren(side); return; }
    const replies = threadReplies(conversation, root.id);
    const input = h('textarea', { class: 'input thread__input', rows: '1', placeholder: 'Reply in the thread', 'aria-label': 'Reply in the thread' });
    const sendReply = () => {
      if (!input.value.trim()) return;
      sideDraft = '';
      sendMessage(conversationId, me.id, input.value, null, { threadOf: root.id });
    };
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); sendReply(); } });
    input.value = sideDraft;
    input.addEventListener('input', () => { sideDraft = input.value; autoGrow(input); });
    const close = () => { threadRootId = null; sideDraft = ''; drawSide(getConversation(conversationId)); };
    side.onkeydown = (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    const hadFocus = side.contains(document.activeElement);
    replaceChildren(side,
      h('div', { class: 'thread__side-top' },
        h('strong', {}, 'Thread'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close the thread', onClick: close }, icon('close', 16))),
      h('div', { class: 'thread__side-list' },
        renderMessage(root, true, { inThread: true }),
        h('div', { class: 'thread__day thread__side-count', role: 'separator' }, h('span', {}, replies.length ? `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}` : 'No replies yet')),
        replies.map((m, i) => renderMessage(m, !i || replies[i - 1].authorId !== m.authorId, { inThread: true }))),
      composer.hidden ? null : h('form', { class: 'thread__composer thread__side-composer', onSubmit: (event) => { event.preventDefault(); sendReply(); } },
        input, h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Send')));
    const sideList = side.querySelector('.thread__side-list');
    sideList.scrollTop = sideList.scrollHeight;
    if (hadFocus) input.focus();
  }

  function renderEditor(message, currentText) {
    const input = h('textarea', { class: 'input', rows: '2', 'aria-label': 'Edit message' });
    input.value = currentText;
    const save = () => {
      editingMessageId = null;
      if (input.value.trim() && input.value.trim() !== currentText) editMessage(conversationId, message.id, input.value);
      else draw();
    };
    const cancel = () => { editingMessageId = null; draw(); };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save(); }
      if (event.key === 'Escape') cancel();
    });
    requestAnimationFrame(() => { input.focus(); autoGrow(input); });
    return h('div', { class: 'message__editor' },
      input,
      h('div', { class: 'form-row' },
        h('button', { type: 'button', class: 'button button--small button--primary', onClick: save }, 'Save'),
        h('button', { type: 'button', class: 'link-button', onClick: cancel }, 'Cancel'),
        h('span', { class: 'message__hint' }, 'Enter to save · Esc to cancel'),
      ),
    );
  }

  // ─── Live updates ──────────────────────────────────────────────────────────

  const stopListening = subscribe('messages', () => {
    if (!element.isConnected) return;
    // Don't throw away an edit in progress because someone reacted.
    if (editingMessageId && element.contains(document.activeElement)) return;
    draw();
  });

  // Read only what you can see: watch whether the messages are on screen.
  const visibility = new IntersectionObserver(([entry]) => {
    isOnScreen = entry.isIntersecting;
    if (isOnScreen && !document.hidden) markRead(conversationId, me.id);
  }, { threshold: 0.3 });
  visibility.observe(list);

  draw();
  // Once it's on the page: scroll to the newest message.
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });

  return {
    element,
    draw,
    focus: () => composerInput.focus(),
    destroy: () => {
      stopListening();
      visibility.disconnect();
    },
  };
}

/** "Today", "Yesterday", or "Thursday, November 14". */
function dayLabel(dayKey) {
  const today = todayKey();
  if (dayKey === today) return 'Today';
  if (dayKey === addDays(today, -1)) return 'Yesterday';
  return formatLongDate(dayKey);
}

/** Grow a textarea to fit its text, up to a limit. */
function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
}
