/**
 * rich-text-editor.js — a word-processor-style editor: a toolbar that
 * shows what's on, a status bar with the word count and whether it's
 * saved, and the shortcuts people know from Docs and Word.
 *
 * Used by the Shared note module, notes in the Vault, vault files shown
 * on a page, and blog documents.
 *
 *   const editor = createRichTextEditor({
 *     html: '<p>Hello</p>',
 *     onChange: (html) => save(html),   // called (debounced) after edits
 *     label: 'Note text',
 *     full: true,                       // every tool showing (full pages);
 *                                       // otherwise the less-used ones sit under "More"
 *   });
 *   container.append(editor.toolbar, editor.content, editor.statusBar);
 *
 * The toolbar, left to right:
 *
 *   ↶ ↷ | [Normal text ▾] | B I U | 🔗 | • 1. ☑ | ＋ Photo / Video | ⋯ More
 *   (＋ stays on the short toolbar on phones: it puts a photo or a video,
 *   recorded or picked, where the cursor is)
 *   More: S  highlight  code | ⇤ ⇥ | align left/center/right | quote  line  table | clear formatting
 *
 * Buttons light up for what's under the cursor (bold, a list, a heading…).
 *
 * Typing shortcuts at the start of a line, then a space:
 *   #  ##  ###   headings      -  or  *   bulleted list     1.  numbered list
 *   [] or [ ]    checklist     >          quote
 *
 * Keyboard: Ctrl/⌘ + B I U, K (link), Z / Shift+Z (undo/redo),
 * Shift+7 / 8 / 9 (numbered, bulleted, checklist), Alt+0–3 (normal, headings).
 *
 * Checklist items are ticked by clicking their box. Pasted text keeps its
 * basic formatting and nothing else (see js/utils/sanitize.js).
 *
 * Formatting uses the browser's built-in `document.execCommand`. It's
 * officially deprecated but still supported everywhere, keeps the
 * browser's undo history working, and is fine for a prototype. The real
 * editor (with live co-editing) will replace this file; because every
 * editor goes through here, that swap happens in one place.
 */

import { h, debounce } from './dom.js';
import { icon } from './icons.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { attachMentionPicker } from './mention-picker.js';
import { pickMedia } from './media-attach.js';

const SAVE_DELAY_MS = 600;
const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? '⌘' : 'Ctrl+';

/** The paragraph styles in the dropdown, and the tag each one uses. */
const BLOCK_STYLES = [
  { tag: 'p', label: 'Normal text', key: '0' },
  { tag: 'h2', label: 'Heading 1', key: '1' },
  { tag: 'h3', label: 'Heading 2', key: '2' },
  { tag: 'h4', label: 'Heading 3', key: '3' },
  { tag: 'blockquote', label: 'Quote' },
  { tag: 'pre', label: 'Code block' },
];

/** "# " at the start of a line → Heading 1, and so on. */
const MARKDOWN_SHORTCUTS = [
  { pattern: /^###$/, apply: (ed) => ed.setBlock('h4') },
  { pattern: /^##$/, apply: (ed) => ed.setBlock('h3') },
  { pattern: /^#$/, apply: (ed) => ed.setBlock('h2') },
  { pattern: /^[-*]$/, apply: (ed) => ed.toggleList('bullet') },
  { pattern: /^1[.)]$/, apply: (ed) => ed.toggleList('number') },
  { pattern: /^\[ ?\]$/, apply: (ed) => ed.toggleList('check') },
  { pattern: /^>$/, apply: (ed) => ed.setBlock('blockquote') },
];

const BLOCK_TAGS = new Set(['P', 'DIV', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE', 'LI']);

/**
 * @param {object}   options
 * @param {string}   options.html         starting content (sanitized before showing)
 * @param {function} options.onChange     called with the new, sanitized HTML
 * @param {string}   [options.label]      accessible name for the text area
 * @param {string}   [options.placeholder]
 * @param {object}   [options.mentions]   { getCandidates, excludeId }: typing "@" offers these
 *                                        people and inserts a mention chip (see mention-picker.js)
 * @param {boolean}  [options.full]       show every tool, not just the common ones
 * @returns {{ toolbar, content, statusBar, getHtml, focus }}
 */
export function createRichTextEditor({ html, onChange, label = 'Text', placeholder = 'Start writing…', mentions = null, full = false }) {
  const content = h('div', {
    class: 'rich-text__content',
    contenteditable: 'true',
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': label,
    'data-placeholder': placeholder,
    spellcheck: 'true',
    html: sanitizeHtml(html || ''),
  });

  // ─── Saving, and the status bar ────────────────────────────────────────────

  const wordCount = h('span', { class: 'rich-text__count' });
  const saveState = h('span', { class: 'rich-text__save-state', 'aria-live': 'polite' }, 'All changes saved');
  const statusBar = h('div', { class: 'rich-text__status' }, wordCount, saveState);

  const getHtml = () => sanitizeHtml(content.innerHTML);
  const save = debounce(() => {
    onChange(getHtml());
    saveState.textContent = 'All changes saved';
    saveState.classList.remove('is-saving');
  }, SAVE_DELAY_MS);

  function changed() {
    saveState.textContent = 'Saving…';
    saveState.classList.add('is-saving');
    drawWordCount();
    save();
  }

  function drawWordCount() {
    const text = content.innerText.trim();
    const words = text ? text.split(/\s+/).length : 0;
    wordCount.textContent = `${words} ${words === 1 ? 'word' : 'words'} · ${text.length} characters`;
  }

  // ─── Where the cursor is ───────────────────────────────────────────────────

  function selectionInside() {
    const selection = window.getSelection();
    return selection.rangeCount && content.contains(selection.anchorNode) ? selection : null;
  }

  /** The block (paragraph, heading, list item…) the cursor is in. */
  function currentBlock() {
    const selection = selectionInside();
    let node = selection?.anchorNode ?? null;
    while (node && node !== content) {
      if (node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.tagName)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function closest(selector) {
    const selection = selectionInside();
    const node = selection?.anchorNode;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const found = element?.closest(selector);
    return found && content.contains(found) ? found : null;
  }

  // ─── Commands ──────────────────────────────────────────────────────────────

  function run(command, value = null) {
    content.focus();
    document.execCommand(command, false, value);
    changed();
    drawToolbarState();
  }

  /** Make the current paragraph a heading, quote, code block or normal text. */
  function setBlock(tag) {
    content.focus();
    // Inside a list, leave the list first.
    const list = closest('ul, ol');
    if (list && tag !== 'p') document.execCommand(list.tagName === 'OL' ? 'insertOrderedList' : 'insertUnorderedList');
    document.execCommand('formatBlock', false, `<${tag}>`);
    changed();
    drawToolbarState();
  }

  /** Bulleted, numbered or checklist. Pressing the one you're in turns it off. */
  function toggleList(kind) {
    content.focus();
    const list = closest('ul, ol');
    const currentKind = !list ? null : list.tagName === 'OL' ? 'number' : list.classList.contains('checklist') ? 'check' : 'bullet';
    if (currentKind === kind) {
      document.execCommand(kind === 'number' ? 'insertOrderedList' : 'insertUnorderedList');
    } else if (currentKind && (kind === 'check' || currentKind === 'check') && kind !== 'number' && currentKind !== 'number') {
      // Bullets ↔ checklist: same <ul>, different look.
      list.classList.toggle('checklist', kind === 'check');
      if (kind !== 'check') list.querySelectorAll('li').forEach((li) => li.removeAttribute('data-checked'));
    } else {
      document.execCommand(kind === 'number' ? 'insertOrderedList' : 'insertUnorderedList');
      const made = closest('ul, ol');
      const item = closest('li');
      if (made?.tagName === 'UL' && item) {
        const wantCheck = kind === 'check';
        // The browser joins a new list onto a list right above it. If that
        // one is the other kind (bullets vs checklist), split this item off.
        if (made.classList.contains('checklist') !== wantCheck && made.children.length > 1) splitOff(item, wantCheck);
        else made.classList.toggle('checklist', wantCheck);
      }
    }
    changed();
    drawToolbarState();
  }

  /** Move one list item into a list of its own (bullets or checklist), keeping the cursor in it. */
  function splitOff(item, asChecklist) {
    const list = item.parentElement;
    const after = [...list.children].slice([...list.children].indexOf(item) + 1);
    const own = document.createElement('ul');
    if (asChecklist) own.className = 'checklist';
    list.after(own);
    own.append(item);
    if (after.length) {
      const rest = list.cloneNode(false);
      rest.append(...after);
      own.after(rest);
    }
    if (!list.children.length) list.remove();
    const range = document.createRange();
    range.selectNodeContents(item);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }

  /** Wrap the selection in <mark>, or take the highlight off. */
  function toggleHighlight() {
    const mark = closest('mark');
    if (mark) {
      mark.replaceWith(...mark.childNodes);
      changed();
      drawToolbarState();
      return;
    }
    const selection = selectionInside();
    if (!selection || selection.isCollapsed) return;
    const holder = document.createElement('div');
    holder.append(selection.getRangeAt(0).cloneContents());
    run('insertHTML', `<mark>${holder.innerHTML}</mark>`);
  }

  /** Inline code: the selection in a monospace font. */
  function toggleCode() {
    const code = closest('code');
    if (code && !closest('pre')) {
      code.replaceWith(...code.childNodes);
      changed();
      return;
    }
    const selection = selectionInside();
    if (!selection || selection.isCollapsed) return;
    run('insertHTML', `<code>${escapeHtml(selection.toString())}</code>`);
  }

  function insertTable() {
    const cell = (tag) => `<${tag}><br></${tag}>`;
    const row = (tag) => `<tr>${cell(tag)}${cell(tag)}${cell(tag)}</tr>`;
    run('insertHTML', `<table><thead>${row('th')}</thead><tbody>${row('td')}${row('td')}</tbody></table><p><br></p>`);
  }

  // ─── Photos and videos ─────────────────────────────────────────────────────

  /** Put photos or a video where the cursor was (the picker takes the focus away). */
  function insertMedia(kind) {
    const selection = selectionInside();
    const range = selection ? selection.getRangeAt(0).cloneRange() : null;
    pickMedia(kind, (media) => {
      content.focus();
      if (range) {
        const current = window.getSelection();
        current.removeAllRanges();
        current.addRange(range);
      }
      const html = media.map((item) => (item.kind === 'video'
        ? `<figure class="rt-media"><video controls preload="metadata" src="${item.src}"></video></figure>`
        : `<figure class="rt-media"><img alt="" src="${item.src}"></figure>`)).join('');
      run('insertHTML', `${html}<p><br></p>`);
    });
  }

  const mediaMenu = h('span', { class: 'rich-text__media-menu', role: 'menu', hidden: true });
  function toggleMediaMenu(open = mediaMenu.hidden) {
    mediaMenu.hidden = !open;
    mediaButton.setAttribute('aria-expanded', String(open));
  }

  function clearFormatting() {
    content.focus();
    document.execCommand('removeFormat');
    const block = currentBlock();
    if (block && block.tagName !== 'LI' && block.tagName !== 'P') document.execCommand('formatBlock', false, '<p>');
    changed();
    drawToolbarState();
  }

  // ─── Links ─────────────────────────────────────────────────────────────────
  // A small bar under the toolbar (the sandbox blocks prompt() dialogs).

  let savedRange = null;
  const linkInput = h('input', { type: 'text', inputmode: 'url', autocomplete: 'off', class: 'input input--compact rich-text__link-input', placeholder: 'https://… or someone@example.com', 'aria-label': 'Link address' });
  const linkError = h('span', { class: 'form-error rich-text__link-error', role: 'alert' });
  const removeLinkButton = h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { restoreSelection(); run('unlink'); closeLinkBar(); } }, 'Remove link');
  const linkBar = h('form', {
    class: 'rich-text__link-bar',
    hidden: true,
    onSubmit: (event) => {
      event.preventDefault();
      let url = linkInput.value.trim();
      if (!url) { linkError.textContent = 'Type or paste an address.'; return; }
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) url = `mailto:${url}`;
      else if (!/^(https?:\/\/|mailto:)/i.test(url)) url = `https://${url}`;
      restoreSelection();
      const selection = selectionInside();
      if (selection?.isCollapsed) run('insertHTML', `<a href="${escapeHtml(url)}">${escapeHtml(url.replace(/^mailto:/, ''))}</a>`);
      else run('createLink', url);
      closeLinkBar();
    },
    onKeydown: (event) => { if (event.key === 'Escape') { event.preventDefault(); closeLinkBar(); restoreSelection(); } },
  },
    icon('link', 14), linkInput,
    h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Apply'),
    removeLinkButton,
    h('button', { type: 'button', class: 'button button--quiet button--small', onClick: () => { closeLinkBar(); restoreSelection(); } }, 'Cancel'),
    linkError);

  function openLinkBar() {
    const selection = selectionInside();
    savedRange = selection ? selection.getRangeAt(0).cloneRange() : null;
    const existing = closest('a');
    linkInput.value = existing?.getAttribute('href')?.replace(/^mailto:/, '') ?? '';
    removeLinkButton.hidden = !existing;
    linkError.textContent = '';
    linkBar.hidden = false;
    linkInput.focus();
  }

  function closeLinkBar() {
    linkBar.hidden = true;
  }

  function restoreSelection() {
    content.focus();
    if (!savedRange) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }

  // ─── The toolbar ───────────────────────────────────────────────────────────

  const toggles = []; // { button, isOn: () => boolean }

  /** A toolbar button. `isOn` makes it a toggle that lights up. */
  function tool({ name, keys = '', iconName = null, text = null, className = '', onClick, isOn = null }) {
    const button = h('button', {
      type: 'button',
      class: `rich-text__tool ${className}`,
      'aria-label': name,
      title: keys ? `${name} (${keys})` : name,
      'aria-pressed': isOn ? 'false' : null,
      // mousedown + preventDefault keeps the text selection in the editor.
      onMousedown: (event) => event.preventDefault(),
      onClick,
    }, iconName ? icon(iconName, 16) : null, text);
    if (isOn) toggles.push({ button, isOn });
    return button;
  }

  const styleSelect = h('select', {
    class: 'rich-text__style',
    'aria-label': 'Paragraph style',
    title: `Paragraph style (${MOD}Alt+0–3)`,
    onChange: (event) => setBlock(event.target.value),
  }, BLOCK_STYLES.map((style) => h('option', { value: style.tag }, style.label)));

  const queryState = (command) => () => { try { return document.queryCommandState(command); } catch { return false; } };
  const inList = (kind) => () => {
    const list = closest('ul, ol');
    if (!list) return false;
    if (kind === 'number') return list.tagName === 'OL';
    return list.tagName === 'UL' && list.classList.contains('checklist') === (kind === 'check');
  };
  const aligned = (side) => () => {
    const block = currentBlock();
    const value = block?.style.textAlign || 'left';
    return value === side || (side === 'left' && value === 'start');
  };

  const group = (...buttons) => h('span', { class: 'rich-text__group' }, buttons);

  const moreGroup = h('span', { class: 'rich-text__more' },
    group(
      tool({ name: 'Strikethrough', keys: `${MOD}Shift+X`, iconName: 'strike', onClick: () => run('strikeThrough'), isOn: queryState('strikeThrough') }),
      tool({ name: 'Highlight', iconName: 'highlight', onClick: toggleHighlight, isOn: () => Boolean(closest('mark')) }),
      tool({ name: 'Inline code', iconName: 'code', onClick: toggleCode, isOn: () => Boolean(closest('code')) && !closest('pre') })),
    group(
      tool({ name: 'Decrease indent', keys: 'Shift+Tab in a list', iconName: 'outdent', onClick: () => run('outdent') }),
      tool({ name: 'Increase indent', keys: 'Tab in a list', iconName: 'indent', onClick: () => run('indent') })),
    group(
      tool({ name: 'Align left', iconName: 'alignLeft', onClick: () => run('justifyLeft'), isOn: aligned('left') }),
      tool({ name: 'Align center', iconName: 'alignCenter', onClick: () => run('justifyCenter'), isOn: aligned('center') }),
      tool({ name: 'Align right', iconName: 'alignRight', onClick: () => run('justifyRight'), isOn: aligned('right') })),
    group(
      tool({ name: 'Horizontal line', iconName: 'rule', onClick: () => run('insertHorizontalRule') }),
      tool({ name: 'Insert table', iconName: 'table', onClick: insertTable })),
    group(
      tool({ name: 'Clear formatting', keys: `${MOD}\\`, iconName: 'clearFormat', onClick: clearFormatting })));

  const mediaButton = tool({ name: 'Add a photo or video', iconName: 'plus', className: 'rich-text__media-button', onClick: () => toggleMediaMenu() });
  mediaButton.setAttribute('aria-haspopup', 'true');
  mediaButton.setAttribute('aria-expanded', 'false');
  const mediaChoice = (kind, iconName, label) => h('button', {
    type: 'button', role: 'menuitem', class: 'rich-text__media-choice',
    onMousedown: (event) => event.preventDefault(),
    onClick: () => { toggleMediaMenu(false); insertMedia(kind); },
  }, icon(iconName, 15), ` ${label}`);
  mediaMenu.append(mediaChoice('image', 'image', 'Photo'), mediaChoice('video', 'video', 'Video'));

  const moreButton = tool({
    name: 'More formatting',
    iconName: 'more',
    className: 'rich-text__more-button',
    onClick: () => {
      const open = toolbar.classList.toggle('is-expanded');
      moreButton.setAttribute('aria-expanded', String(open));
    },
  });
  moreButton.setAttribute('aria-expanded', 'false');

  const toolbar = h('div', { class: `rich-text__toolbar${full ? ' is-full' : ''}`, role: 'toolbar', 'aria-label': 'Formatting' },
    h('div', { class: 'rich-text__tools' },
      group(
        tool({ name: 'Undo', keys: `${MOD}Z`, iconName: 'undo', onClick: () => run('undo') }),
        tool({ name: 'Redo', keys: IS_MAC ? '⌘Shift+Z' : 'Ctrl+Y', iconName: 'redo', onClick: () => run('redo') })),
      group(styleSelect),
      group(
        tool({ name: 'Bold', keys: `${MOD}B`, text: 'B', className: 'is-bold', onClick: () => run('bold'), isOn: queryState('bold') }),
        tool({ name: 'Italic', keys: `${MOD}I`, text: 'I', className: 'is-italic', onClick: () => run('italic'), isOn: queryState('italic') }),
        tool({ name: 'Underline', keys: `${MOD}U`, text: 'U', className: 'is-underline', onClick: () => run('underline'), isOn: queryState('underline') }),
        tool({ name: 'Link', keys: `${MOD}K`, iconName: 'link', onClick: openLinkBar, isOn: () => Boolean(closest('a')) })),
      group(
        tool({ name: 'Bulleted list', keys: `${MOD}Shift+8`, iconName: 'listBullet', onClick: () => toggleList('bullet'), isOn: inList('bullet') }),
        tool({ name: 'Numbered list', keys: `${MOD}Shift+7`, iconName: 'listNumber', onClick: () => toggleList('number'), isOn: inList('number') }),
        tool({ name: 'Checklist', keys: `${MOD}Shift+9`, iconName: 'checklist', onClick: () => toggleList('check'), isOn: inList('check') })),
      h('span', { class: 'rich-text__group rich-text__media' }, mediaButton, mediaMenu),
      full ? null : moreButton,
      moreGroup),
    linkBar);

  /** Light up the buttons for what's under the cursor, and show its paragraph style. */
  function drawToolbarState() {
    if (!selectionInside()) return;
    for (const { button, isOn } of toggles) button.setAttribute('aria-pressed', String(Boolean(isOn())));
    const block = currentBlock();
    const tag = block?.tagName === 'LI' ? 'p' : (block?.tagName ?? 'P').toLowerCase();
    styleSelect.value = BLOCK_STYLES.some((s) => s.tag === tag) ? tag : 'p';
  }

  // ─── Typing ────────────────────────────────────────────────────────────────

  const shortcutTarget = { setBlock, toggleList };

  /** "## " at the start of a line becomes a heading, and so on. */
  function tryMarkdownShortcut() {
    const selection = selectionInside();
    if (!selection?.isCollapsed) return false;
    const block = currentBlock() ?? content;
    const before = document.createRange();
    before.selectNodeContents(block);
    before.setEnd(selection.anchorNode, selection.anchorOffset);
    const typed = before.toString();
    const shortcut = MARKDOWN_SHORTCUTS.find((s) => s.pattern.test(typed));
    if (!shortcut || closest('pre')) return false;
    selection.removeAllRanges();
    selection.addRange(before);
    document.execCommand('delete');
    shortcut.apply(shortcutTarget);
    return true;
  }

  content.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (event.key === ' ' && !mod && tryMarkdownShortcut()) { event.preventDefault(); return; }
    if (event.key === 'Tab' && closest('li')) { event.preventDefault(); run(event.shiftKey ? 'outdent' : 'indent'); return; }
    if (!mod) return;

    if (key === 'k') { event.preventDefault(); openLinkBar(); return; }
    if (key === '\\') { event.preventDefault(); clearFormatting(); return; }
    if (event.shiftKey && key === 'x') { event.preventDefault(); run('strikeThrough'); return; }
    // Shift+7 / 8 / 9 (event.code, since Shift changes the character).
    if (event.shiftKey && ['Digit7', 'Digit8', 'Digit9'].includes(event.code)) {
      event.preventDefault();
      toggleList({ Digit7: 'number', Digit8: 'bullet', Digit9: 'check' }[event.code]);
      return;
    }
    if (event.altKey && /^Digit[0-3]$/.test(event.code)) {
      event.preventDefault();
      setBlock(BLOCK_STYLES.find((s) => s.key === event.code.slice(-1)).tag);
    }
  });

  // Ticking a checklist item: a click on its box (the space before the text).
  content.addEventListener('click', (event) => {
    const item = event.target.closest?.('ul.checklist > li');
    if (!item || !content.contains(item)) return;
    if (event.clientX - item.getBoundingClientRect().left > 24) return;
    event.preventDefault();
    item.toggleAttribute('data-checked', !item.hasAttribute('data-checked'));
    if (item.hasAttribute('data-checked')) item.setAttribute('data-checked', 'true');
    changed();
  });

  // Paste keeps simple formatting only, cleaned like everything else.
  content.addEventListener('paste', (event) => {
    const pastedHtml = event.clipboardData?.getData('text/html');
    const pastedText = event.clipboardData?.getData('text/plain');
    if (!pastedHtml && !pastedText) return;
    event.preventDefault();
    const clean = pastedHtml ? sanitizeHtml(pastedHtml) : escapeHtml(pastedText).replace(/\n/g, '<br>');
    run('insertHTML', clean);
  });

  content.addEventListener('input', changed);
  content.addEventListener('keyup', drawToolbarState);
  content.addEventListener('mouseup', drawToolbarState);
  content.addEventListener('focus', () => {
    // New lines are <p>s, not <div>s.
    document.execCommand('defaultParagraphSeparator', false, 'p');
    drawToolbarState();
  });
  // Selection changes from the keyboard (arrows, Shift+arrows) too. The
  // listener removes itself once the editor is gone from the page.
  const onSelectionChange = () => {
    if (!content.isConnected) { document.removeEventListener('selectionchange', onSelectionChange); return; }
    drawToolbarState();
  };
  document.addEventListener('selectionchange', onSelectionChange);

  if (mentions) attachMentionPicker(content, mentions);
  drawWordCount();

  return { toolbar, content, statusBar, getHtml, focus: () => content.focus() };
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
