// @ts-check
/**
 * vault-parts.js — pieces of vault UI used by both the homepage card and
 * the full page: the "+ New" menu, the create form, and an open item.
 */

import { notifyMentions } from '../../state/notifications.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { getSpace } from '../../state/store.js';
import { icon } from '../../ui/icons.js';
import { normalizeUrl } from './vault-data.js';
import { renderNoteView, renderFileView, renderToArticle } from './vault-item-views.js';
import { renderFullEditor, hasFullEditor } from './vault-full-editor.js';
import { documentShareButton } from '../../ui/document-sharing.js';
import { documentAccess, renderFileComments } from '../../ui/file-access.js';
import { articleTargets, turnNoteIntoArticle, noteWriters, openNoteDraft } from '../articles/from-note.js';
import { initialFileData, renderModuleFileView, expandButton } from './vault-module-files.js';
import { getModuleType } from '../registry.js';
import { isRemovedModule, putBack } from '../../state/module-backups.js';
import { showToast } from '../../ui/toast.js';
import { timeAgo } from '../../utils/dates.js';

export const TOP_LEVEL_NAME = 'Vault';

/**
 * The "+ New" menu, in order. The first six are always shown; "More" opens
 * the rest. 'module:<type>' makes a module file (see vault-module-files.js).
 * Module files use a short description here instead of the library's.
 */
export const NEW_MENU_ENTRIES = [
  { action: 'note', label: 'Document', description: 'Write together, with headings, lists, and tables', icon: 'note' },
  { action: 'module:sheet', label: 'Spreadsheet', description: 'Rows, formulas, and charts', icon: 'table' },
  { action: 'module:presentation', label: 'Presentation', description: 'Slides to present full screen', icon: 'slides' },
  { action: 'article', label: 'Article', description: 'Write it here, then publish it to Articles', icon: 'newspaper' },
  { action: 'upload', label: 'Upload files', description: 'From your device', icon: 'upload' },
  { action: 'folder', label: 'Folder', description: 'Organize files', icon: 'folder' },
];

/** Behind "More". */
export const MORE_MENU_ENTRIES = [
  { action: 'module:todo', label: 'Tasks', description: 'Tasks for people, as a list or a board', icon: 'todo' },
  { action: 'module:relationship', label: 'Relationship map', description: 'Who is connected to whom', icon: 'relationship' },
  { action: 'module:gantt', label: 'Gantt chart', description: 'Plan phases over time', icon: 'gantt' },
  { action: 'module:survey', label: 'Survey', description: 'Ask questions, see the answers add up', icon: 'survey' },
  { action: 'link', label: 'Link', description: 'Save a web page for the group', icon: 'link' },
];

/**
 * The "+ New" choices. `onPick(action)` gets e.g. 'note' or 'module:sheet'.
 * `moreOpen` starts with "More" open (the menu remembers it while it's drawn).
 */
export function renderNewMenu(onPick, { moreOpen = false } = {}) {
  const entry = (item) => h('button', {
    type: 'button',
    role: 'menuitem',
    class: 'vault__menu-item',
    'data-action': item.action,
    onClick: () => onPick(item.action),
  },
    h('span', { class: 'vault__menu-icon' }, icon(item.icon, 16)),
    h('span', { class: 'vault__menu-text' },
      h('span', { class: 'vault__menu-label' }, item.label),
      h('span', { class: 'vault__menu-description' }, item.description),
    ),
  );
  const more = h('div', { class: 'vault__menu-more', hidden: !moreOpen }, MORE_MENU_ENTRIES.map(entry));
  const toggle = h('button', {
    type: 'button',
    class: 'vault__menu-more-toggle',
    'aria-expanded': String(moreOpen),
    onClick: () => {
      const open = more.hidden;
      more.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      replaceChildren(toggle, icon(open ? 'chevronUp' : 'chevronDown', 14), open ? ' Less' : ' More');
      if (open) more.querySelector('button')?.focus();
    },
  }, icon(moreOpen ? 'chevronUp' : 'chevronDown', 14), moreOpen ? ' Less' : ' More');
  return h('div', { class: 'vault__menu', role: 'menu', 'aria-label': 'Create new' },
    NEW_MENU_ENTRIES.map(entry),
    toggle,
    more,
  );
}

/** A hidden <input type="file"> to open the device's file picker with. */
export function createFilePicker(onFiles) {
  return h('input', {
    type: 'file',
    multiple: true,
    class: 'visually-hidden',
    tabindex: '-1',
    'aria-hidden': 'true',
    onChange: (event) => onFiles([...event.target.files]),
  });
}

/**
 * The small form for making a folder, note or link.
 * `onCreate(fields)` gets e.g. { kind: 'link', name, url }.
 */
export function renderCreateForm(kind, { onCreate, onCancel }) {
  // 'module:kanban' → a module file of that type.
  const moduleTypeId = kind.startsWith('module:') ? kind.slice('module:'.length) : null;
  const moduleType = moduleTypeId ? getModuleType(moduleTypeId) : null;
  const nameInput = h('input', {
    type: 'text',
    class: 'input',
    placeholder: moduleType ? `Name for the ${moduleType.label.toLowerCase()}` : kind === 'folder' ? 'Folder name' : kind === 'note' ? 'Document title' : kind === 'article' ? 'Headline' : 'Link name',
    'aria-label': 'Name',
  });
  const urlInput = kind === 'link'
    ? h('input', { type: 'text', class: 'input', placeholder: 'https://…', 'aria-label': 'Web address' })
    : null;
  const errorText = h('p', { class: 'form-error', role: 'alert' });

  const form = h('form', {
    class: 'vault__create-form',
    onSubmit: (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const url = urlInput ? normalizeUrl(urlInput.value) : '';
      if (!name) {
        errorText.textContent = 'Give it a name first.';
        nameInput.focus();
        return;
      }
      if (urlInput && !url) {
        errorText.textContent = 'Add the web address.';
        urlInput.focus();
        return;
      }
      onCreate(moduleType ? { kind: 'module', moduleType: moduleTypeId, name, data: initialFileData(moduleTypeId) }
        : kind === 'note' ? { kind, name, html: '<p></p>' }
          : kind === 'article' ? { kind: 'note', article: true, name, html: '<p></p>' }
          : kind === 'link' ? { kind, name, url }
            : { kind, name });
    },
  },
    h('span', { class: 'vault__create-label' }, icon(moduleType?.icon ?? (kind === 'article' ? 'newspaper' : kind), 16), ` New ${moduleType ? moduleType.label.toLowerCase() : kind}`),
    nameInput,
    urlInput,
    errorText,
    h('div', { class: 'form-row form-row--end' },
      h('button', { type: 'button', class: 'button button--small button--quiet', onClick: onCancel }, 'Cancel'),
      h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Create'),
    ),
  );

  nameInput.addEventListener('input', () => { errorText.textContent = ''; });
  requestAnimationFrame(() => nameInput.focus());
  return form;
}

/**
 * An open note (the editor) or file (a preview), with a way back.
 * Note edits save quietly as you type (see vault-actions.js).
 */
export function renderOpenItem(item, options) {
  const view = renderOpenItemView(item, options);
  const { context, onBack } = options;
  // A module that came off the page (js/state/module-backups.js): put it back from here.
  if (!isRemovedModule(item) || context.isVisitor || !context.spaceId) return view;
  const bar = h('div', { class: 'vault-removed-bar' },
    icon('undo', 14),
    h('span', {}, ` Removed from the page ${timeAgo(item.removed.at)}. Everything in it is kept here.`),
    h('button', {
      type: 'button', class: 'button button--small',
      onClick: () => {
        const back = putBack({ where: 'vault', spaceId: context.spaceId, vaultId: context.moduleId, itemId: item.id });
        if (back) { showToast(`Put “${back.title}” back on the page.`); onBack(); }
      },
    }, 'Put back on the page'));
  view.prepend(bar);
  return view;
}

function renderOpenItemView(item, { items, folderName, onBack, context, actions, compact = false, onExpand = null, full = false, menu = null }) {
  // Every file gets the Sharing button (Nov 17): who can open it, where it's shared, and where it's published.
  const me = context.currentUser;
  const access = context.isVisitor ? 'edit' : documentAccess(context.moduleId, item, me);
  const targets = context.isVisitor ? [] : articleTargets(getSpace(context.spaceId), me);
  const onTurn = (targetModuleId) => turnNoteIntoArticle(context.getData().items.find((i) => i.id === item.id) ?? item, { vaultModuleId: context.moduleId, targetModuleId, me });
  const shareButton = context.isVisitor || !me || me.isGuest ? null
    : documentShareButton({ vaultModuleId: context.moduleId, itemId: item.id });
  // The vault's full page: documents, articles, and module files open in their full editor (vault-full-editor.js).
  if (full && hasFullEditor(item)) {
    return renderFullEditor(item, {
      context, actions, onBack, folderName,
      extras: [shareButton, menu],
      aboveEditor: item.kind === 'note' && !context.isVisitor && access === 'edit' && (item.article || targets.length || item.articleDraft)
        ? [renderToArticle({ targets, draft: item.articleDraft ?? null, onTurn, onOpenDraft: openNoteDraft, writers: noteWriters(item).filter((id) => id !== context.currentUser.id).map(context.getMember).filter(Boolean) }, Boolean(item.article))]
        : [],
    });
  }
  if (item.kind === 'module') {
    return renderModuleFileView(item, {
      vaultModuleId: context.moduleId,
      folderName,
      onBack,
      onRename: (name) => { if (name.trim()) actions.saveQuietly(item.id, { name: name.trim() }); },
      shareButton,
      compact,
      onExpand,
    }).element;
  }
  if (item.kind === 'note') {
    return renderNoteView(item, {
      folderName,
      onBack,
      getMember: context.getMember,
      onRename: (name) => { if (name.trim()) actions.saveQuietly(item.id, { name: name.trim() }); },
      mentions: { getCandidates: () => context.members, excludeId: context.currentUser.id },
      // "Turn into an article" (js/modules/articles/from-note.js).
      toArticle: context.isVisitor ? null : {
        targets,
        draft: item.articleDraft ?? null,
        writers: noteWriters(item).filter((id) => id !== context.currentUser.id).map(context.getMember).filter(Boolean),
        onTurn,
        onOpenDraft: openNoteDraft,
      },
      shareButton,
      expand: onExpand ? expandButton(onExpand) : null,
      access,
      comments: access === 'comment' ? renderFileComments({ vaultModuleId: context.moduleId, itemId: item.id, canComment: true }) : null,
      onSaveHtml: (html) => {
        const saved = context.getData().items.find((i) => i.id === item.id);
        const before = saved?.html ?? '';
        // Everyone who writes in a note is remembered (co-authors if it becomes an article).
        const editorIds = [...new Set([...(saved?.editorIds ?? [saved?.createdBy].filter(Boolean)), context.currentUser.id])];
        actions.saveQuietly(item.id, { html, editorIds });
        notifyMentions({ moduleId: context.moduleId, itemId: item.id, before, after: html, where: `the document “${item.name}”` });
        return context.currentUser.id;
      },
    });
  }
  // Photos can be edited by whoever added them, or by people who can moderate this vault.
  const mayEdit = !context.isVisitor && (item.createdBy === context.currentUser?.id || context.can('moderate'));
  const onEditPhoto = mayEdit ? (edited, { asCopy }) => {
    const file = { mimeType: 'image/jpeg', size: Math.round(edited.src.length * 0.75), dataUrl: edited.src };
    if (asCopy) {
      const base = item.name.replace(/\.[^.]+$/, '');
      actions.createItem({ kind: 'file', name: `${base} (edited).jpg`, file }, item.parentId);
    } else {
      actions.saveItem(item.id, { file });
    }
  } : null;
  return renderFileView(item, { folderName, onBack, items, onEditPhoto, shareButton });
}
