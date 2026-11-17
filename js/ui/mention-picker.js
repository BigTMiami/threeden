/**
 * mention-picker.js — the little list that pops up when you type "@".
 *
 *   Thanks @an▌
 *          ┌──────────────────────┐
 *          │ (AA) Anna A   @anna  │  ← ↑ ↓ to move, Enter or Tab to pick,
 *          │ (DK) Dev K    @dev   │    Esc to close, or keep typing
 *          └──────────────────────┘
 *
 * Works on a <textarea>/<input> (inserts "@anna ") and on a rich-text
 * editor (inserts a mention chip that's deleted as one piece).
 *
 *   attachMentionPicker(textarea, { getCandidates: () => context.members });
 *
 * Only people from getCandidates() are offered, usually the people in the
 * group, so you can't mention someone who can't see the post. Typing a
 * username by hand still works (see mentions.js).
 */

import { h, replaceChildren } from './dom.js';
import { avatar } from './avatar.js';

const MAX_SUGGESTIONS = 6;
/** "@" at the start or after a non-word character, then what's been typed of the name. */
const TYPING_MENTION = /(?:^|[^\w@.])@([a-z0-9_.]{0,20})$/i;

/**
 * @param {HTMLElement} field                textarea, input, or a contenteditable element
 * @param {object}      options
 * @param {function}    options.getCandidates  () → members who can be mentioned
 * @param {string}      [options.excludeId]    leave this person out (usually you)
 */
export function attachMentionPicker(field, { getCandidates, excludeId = null }) {
  const isRich = field.isContentEditable || field.getAttribute('contenteditable') === 'true';
  const list = h('ul', { class: 'mention-picker', role: 'listbox', 'aria-label': 'People to mention' });
  let matches = [];
  let activeIndex = 0;
  let query = null; // what's been typed after "@", or null when the list is closed

  // ─── What's being typed ────────────────────────────────────────────────────

  /** The text before the caret, or null if the caret isn't in plain text. */
  function textBeforeCaret() {
    if (!isRich) {
      if (field.selectionStart !== field.selectionEnd) return null;
      return field.value.slice(0, field.selectionStart);
    }
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) return null;
    const { startContainer, startOffset } = selection.getRangeAt(0);
    if (startContainer.nodeType !== Node.TEXT_NODE || !field.contains(startContainer)) return null;
    return startContainer.textContent.slice(0, startOffset);
  }

  function update() {
    const before = textBeforeCaret();
    const match = before === null ? null : before.match(TYPING_MENTION);
    if (!match) { close(); return; }

    query = match[1].toLowerCase();
    matches = getCandidates()
      .filter((m) => m.id !== excludeId && m.username)
      .filter((m) => m.username.startsWith(query) || m.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(query)))
      .slice(0, MAX_SUGGESTIONS);
    if (matches.length === 0) { close(); return; }
    activeIndex = Math.min(activeIndex, matches.length - 1);
    draw();
  }

  // ─── The list ──────────────────────────────────────────────────────────────

  function draw() {
    replaceChildren(list, matches.map((member, index) => h('li', {
      role: 'option',
      class: `mention-picker__option${index === activeIndex ? ' is-active' : ''}`,
      'aria-selected': String(index === activeIndex),
      // mousedown, not click, so the field keeps focus and the caret.
      onMousedown: (event) => { event.preventDefault(); pick(member); },
      onMouseenter: () => { activeIndex = index; draw(); },
    },
      avatar(member, 20),
      h('span', { class: 'mention-picker__name' }, member.name),
      h('span', { class: 'mention-picker__username' }, `@${member.username}`))));

    if (!list.isConnected) {
      document.body.append(list);
      document.addEventListener('keydown', handleKeydown, true); // before the field's own Enter handling
    }
    position();
  }

  function position() {
    const point = caretPoint();
    const width = 260;
    list.style.left = `${Math.max(8, Math.min(point.x, window.innerWidth - width - 8))}px`;
    list.style.top = `${point.y + 4}px`;
  }

  function close() {
    query = null;
    activeIndex = 0;
    list.remove();
    document.removeEventListener('keydown', handleKeydown, true);
  }

  function handleKeydown(event) {
    if (query === null || event.target !== field) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      draw();
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      pick(matches[activeIndex]);
    } else if (event.key === 'Escape') {
      close();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  // ─── Putting the mention in ────────────────────────────────────────────────

  function pick(member) {
    const typedLength = query.length + 1; // "@" plus what was typed
    if (isRich) insertChip(member, typedLength);
    else insertText(member, typedLength);
    close();
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertText(member, typedLength) {
    const caret = field.selectionStart;
    const start = caret - typedLength;
    const inserted = `@${member.username} `;
    field.value = field.value.slice(0, start) + inserted + field.value.slice(caret);
    const newCaret = start + inserted.length;
    field.setSelectionRange(newCaret, newCaret);
  }

  function insertChip(member, typedLength) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    range.setStart(range.startContainer, range.startOffset - typedLength);
    range.deleteContents();

    const chip = h('span', { class: 'mention', 'data-username': member.username, contenteditable: 'false' }, `@${member.username}`);
    const space = document.createTextNode(' ');
    range.insertNode(space);
    range.insertNode(chip);

    const after = document.createRange();
    after.setStart(space, 1);
    after.collapse(true);
    selection.removeAllRanges();
    selection.addRange(after);
  }

  // ─── Where the caret is on screen ──────────────────────────────────────────

  function caretPoint() {
    if (isRich) {
      const range = window.getSelection().getRangeAt(0).cloneRange();
      const rect = range.getClientRects()[0] ?? field.getBoundingClientRect();
      return { x: rect.left, y: rect.bottom };
    }
    return textareaCaretPoint(field);
  }

  field.addEventListener('input', update);
  field.addEventListener('click', update);
  field.addEventListener('keyup', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') update();
  });
  field.addEventListener('blur', close);
}

/**
 * Where the caret is in a textarea, on screen. Textareas don't say, so this
 * copies the text up to the caret into an invisible box styled the same
 * way and measures where it ends.
 */
function textareaCaretPoint(field) {
  const style = getComputedStyle(field);
  const mirror = document.createElement('div');
  for (const property of ['font', 'letterSpacing', 'lineHeight', 'padding', 'border', 'boxSizing', 'whiteSpace', 'wordWrap', 'textTransform']) {
    mirror.style[property] = style[property];
  }
  Object.assign(mirror.style, {
    position: 'fixed', visibility: 'hidden', top: '0', left: '0',
    width: `${field.offsetWidth}px`, whiteSpace: field.tagName === 'INPUT' ? 'pre' : 'pre-wrap', overflowWrap: 'break-word',
  });
  mirror.textContent = field.value.slice(0, field.selectionStart);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.append(marker);
  document.body.append(mirror);

  const fieldRect = field.getBoundingClientRect();
  const x = fieldRect.left + marker.offsetLeft - field.scrollLeft;
  const y = fieldRect.top + marker.offsetTop + marker.offsetHeight - field.scrollTop;
  mirror.remove();
  return { x, y: Math.min(y, fieldRect.bottom) };
}
