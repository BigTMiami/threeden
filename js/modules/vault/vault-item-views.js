/**
 * vault-item-views.js — what you see after opening an item in the vault.
 *
 *   renderNoteView  → a full editor for a note
 *   renderFileView  → a preview of an uploaded file
 *
 * (Folders open in the list view, and links open in a new browser tab, so
 * they don't need a view here.)
 */

import { h } from '../../ui/dom.js';
import { openPhotoEditor } from '../../ui/photo-editor.js';
import { icon } from '../../ui/icons.js';
import { createRichTextEditor } from '../../ui/rich-text-editor.js';
import { sanitizeHtml } from '../../utils/sanitize.js';
import { timeAgo } from '../../utils/dates.js';
import { describeItem, textFromDataUrl, MAX_STORED_FILE_BYTES, formatBytes } from './vault-data.js';

/** The "← Back to <folder>" link at the top of an open item. */
function backLink(folderName, onBack) {
  return h('button', { type: 'button', class: 'link-button vault__back', onClick: onBack },
    icon('arrowLeft', 14), ` Back to ${folderName}`);
}

/**
 * @param {object}   item
 * @param {object}   options
 * @param {string}   options.folderName     shown in the back link
 * @param {function} options.onBack
 * @param {function} options.onRename       called with the new name
 * @param {function} options.onSaveHtml     called with the new HTML
 * @param {function} options.getMember
 * @param {object}   [options.mentions]     { getCandidates, excludeId } for mentions
 * @param {object}   [options.toArticle]    "Turn into an article": targets, draft, writers, onTurn, onOpenDraft
 * @param {Element}  [options.shareButton]  the Sharing button (js/ui/document-sharing.js), beside "Last edited"
 * @param {string}   [options.access]       'edit' (the editor), or 'comment' / 'view' (read-only, set by its maker)
 * @param {Element}  [options.comments]     comments under a read-only note ('comment')
 */
export function renderNoteView(item, { folderName, onBack, onRename, onSaveHtml, getMember, mentions = null, toArticle = null, shareButton = null, access = 'edit', comments = null }) {
  const lastEdited = h('p', { class: 'vault-note__meta' });

  function drawLastEdited(memberId, timestamp) {
    lastEdited.textContent = `Last edited by ${getMember(memberId)?.name ?? 'someone'} · ${timeAgo(timestamp)}`;
  }

  const editor = createRichTextEditor({
    html: item.html,
    label: `${item.name} text`,
    mentions,
    onChange: (html) => {
      const savedBy = onSaveHtml(html);
      drawLastEdited(savedBy, Date.now());
    },
  });

  drawLastEdited(item.updatedBy, item.updatedAt);
  const readOnly = access === 'comment' || access === 'view';

  return h('div', { class: 'vault-note' },
    backLink(folderName, onBack),
    h('label', { class: 'visually-hidden', for: `note-title-${item.id}` }, item.article ? 'Headline' : 'Note title'),
    item.article ? h('p', { class: 'vault-note__kind' }, icon('newspaper', 13), ' Article draft') : null,
    h('input', {
      id: `note-title-${item.id}`,
      class: 'vault-note__title',
      type: 'text',
      placeholder: item.article ? 'Headline' : '',
      value: item.name,
      disabled: readOnly,
      onChange: (event) => onRename(event.target.value),
    }),
    h('div', { class: 'vault-note__meta-row' }, lastEdited, shareButton),
    toArticle && !readOnly ? renderToArticle(toArticle, Boolean(item.article)) : null,
    readOnly ? [
      h('p', { class: 'file-access__note' }, icon(access === 'comment' ? 'chat' : 'eye', 12), access === 'comment' ? ' You can read and comment on this. Whoever made it chose who can edit.' : ' You can read this. Whoever made it chose who can edit.'),
      h('div', { class: 'rich-text__content vault-note__read', html: sanitizeHtml(item.html ?? '') }),
      comments,
    ] : [editor.toolbar, editor.content, editor.statusBar],
  );
}

/**
 * "Turn into an article": write together here, then make it an article draft
 * that everyone who wrote in the note co-authors. Once done, a link to the draft.
 */
/** "Maya", "Maya and Iris", "Maya, Iris, and 2 more". */
const listNames = (names) => (names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : names.length === 3 ? `${names[0]}, ${names[1]}, and ${names[2]}` : `${names.slice(0, 2).join(', ')}, and ${names.length - 2} more`);

function renderToArticle({ targets, draft, writers, onTurn, onOpenDraft }, isArticle = false) {
  if (draft) {
    return h('p', { class: 'vault-note__article' }, icon('newspaper', 13), isArticle ? ' Published to Articles as a draft. ' : ' This note became an article draft. ',
      h('button', { type: 'button', class: 'link-button', onClick: () => onOpenDraft(draft) }, 'Open the draft'));
  }
  if (!targets.length) {
    return h('p', { class: 'vault-note__article settings-field__hint' }, icon('newspaper', 13), ' To publish this, add Articles to this group or your blog (Edit → Modules).');
  }
  const names = writers.map((m) => m.name.split(' ')[0]);
  const pick = targets.length > 1 ? h('select', { class: 'input input--compact', 'aria-label': 'Where the article goes' }, targets.map((t) => h('option', { value: t.moduleId }, t.label))) : null;
  return h('div', { class: 'vault-note__article' },
    icon('newspaper', 13),
    h('span', {}, isArticle
      ? ` When it’s ready, publish it to Articles as a draft${names.length ? `, with ${listNames(names)} as ${names.length === 1 ? 'co-author' : 'co-authors'}` : ''}.`
      : ` Writing this together? Turn it into an article${names.length ? `, with ${listNames(names)} as ${names.length === 1 ? 'co-author' : 'co-authors'}` : ''}.`),
    pick,
    h('button', { type: 'button', class: 'button button--small', onClick: () => onTurn(pick ? pick.value : targets[0].moduleId) }, isArticle ? 'Publish to Articles' : 'Turn into an article'));
}

/**
 * @param {object}   item
 * @param {object}   options
 * @param {string}   options.folderName
 * @param {function} options.onBack
 * @param {object[]} options.items        all vault items (for the description)
 * @param {function} [options.onEditPhoto] (edited, {asCopy}) → saves; only passed when this person may edit the photo
 * @param {Element}  [options.shareButton]  the Sharing button (js/ui/document-sharing.js), beside the name
 */
export function renderFileView(item, { folderName, onBack, items, onEditPhoto = null, shareButton = null }) {
  const isPhoto = item.file?.dataUrl && item.file.mimeType?.startsWith('image/') && item.file.mimeType !== 'image/svg+xml';
  let asCopy = false;
  const editBar = onEditPhoto && isPhoto
    ? h('div', { class: 'vault-file__edit' },
      h('button', {
        type: 'button', class: 'button button--small',
        onClick: async () => {
          const edited = await openPhotoEditor(item.file.dataUrl, { title: `Edit ${item.name}`, doneLabel: asCopy ? 'Save copy' : 'Save' });
          if (edited && !edited.unchanged) onEditPhoto(edited, { asCopy });
        },
      }, icon('pencil', 14), ' Edit photo'),
      h('label', { class: 'checkbox-row' },
        h('input', { type: 'checkbox', onChange: (event) => { asCopy = event.target.checked; } }),
        ' Keep the original (save edits as a copy)'))
    : null;
  return h('div', { class: 'vault-file' },
    backLink(folderName, onBack),
    h('div', { class: 'vault-file__header' }, h('h3', { class: 'vault-file__name' }, item.name), shareButton),
    editBar,
    h('p', { class: 'vault-file__meta' }, describeItem(item, items)),
    renderPreview(item),
  );
}

function renderPreview(item) {
  const { mimeType, dataUrl, size } = item.file;

  if (!dataUrl) {
    return previewMessage(`This file is ${formatBytes(size)}. The prototype only stores files up to ${formatBytes(MAX_STORED_FILE_BYTES)}, so it's listed here without a preview.`);
  }
  if (mimeType.startsWith('image/')) {
    return h('img', { class: 'vault-file__image', src: dataUrl, alt: item.name });
  }
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return h('pre', { class: 'vault-file__text' }, textFromDataUrl(dataUrl));
  }
  if (mimeType === 'application/pdf') {
    return previewMessage('PDF previews (with page memory and highlights) are planned for a later phase.');
  }
  return previewMessage('No preview for this kind of file yet.');
}

function previewMessage(text) {
  return h('div', { class: 'vault-file__no-preview' }, icon('file', 28), h('p', {}, text));
}
