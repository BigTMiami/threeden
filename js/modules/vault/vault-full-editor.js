// @ts-check
/**
 * vault-full-editor.js — a vault file in its full editor (Nov 18).
 *
 *   ← Back to the vault                        [Sharing ▾]  […]
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  the full editor for the file's type:                    │
 *   │   Document, Article → the Note module's full page (every │
 *   │     tool, the paper, Contents); an article also gets     │
 *   │     "Publish to Articles"                                │
 *   │   Spreadsheet, Presentation, Tasks, List, Gantt, map,    │
 *   │     Survey → that module type's own full page            │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Opened from the vault card's expand button (module-context.js
 * expandTargetOf) or from a file on the vault's full page; the tree and
 * toolbar step aside so the editor has the room. Uploaded files and links
 * aren't edited here: they keep their usual view.
 *
 *   renderFullEditor(item, { context, actions, onBack, folderName, toolbar }) → element
 */

import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { getModuleType } from '../registry.js';
import { getSpace } from '../../state/store.js';
import { can } from '../../state/permissions.js';
import { documentAccess } from '../../ui/file-access.js';
import { renderModuleFileView } from './vault-module-files.js';
import { labelForItem, iconForItem } from './vault-data.js';

/** Can this file open in a full editor? Documents, articles, and module files can. */
export const hasFullEditor = (item) => item?.kind === 'note' || item?.kind === 'module';

/**
 * A module `context` for a vault document, shaped like the Note module's
 * data ({ title, html, lastEditedBy, lastEditedAt }), so the Note module's
 * full page edits it. Saving writes the vault item.
 */
function documentContext(item, context, actions) {
  const live = () => context.getData().items.find((i) => i.id === item.id) ?? item;
  const me = context.currentUser;
  const level = context.isVisitor ? 'view' : documentAccess(context.moduleId, live(), me);
  const readOnly = context.isVisitor || level === 'comment' || level === 'view';
  const space = getSpace(context.spaceId);
  return {
    moduleId: `${context.moduleId}:${item.id}`,
    spaceId: context.spaceId,
    // The Note module shows a blog byline on blogs; a vault document never wants it.
    spaceKind: context.spaceKind === 'blog' ? 'personal' : context.spaceKind,
    getData: () => {
      const doc = live();
      return { title: doc.name, html: doc.html ?? '<p></p>', lastEditedBy: doc.updatedBy, lastEditedAt: doc.updatedAt, updatedAt: doc.updatedAt };
    },
    saveData: (data) => {
      if (readOnly) return;
      const doc = live();
      // Everyone who writes in a document is remembered (co-authors if it becomes an article).
      const editorIds = [...new Set([...(doc.editorIds ?? [doc.createdBy].filter(Boolean)), me.id])];
      actions.saveQuietly(item.id, { name: (data.title ?? '').trim() || doc.name, html: data.html, editorIds });
    },
    members: context.members,
    currentUser: me,
    getMember: context.getMember,
    can: (permissionId) => !readOnly && Boolean(space) && can(space, me?.id, permissionId),
    role: context.role,
    isVisitor: readOnly,
    openFullPage: () => {},
    takeFocusRequest: () => null,
    getLinkedItems: () => [],
    updateLinkedItem: () => {},
    openLinkedItem: () => {},
  };
}

/**
 * @param {any} item
 * @param {{ context: any, actions: any, onBack: () => void, folderName: string, extras?: (Element | null)[], aboveEditor?: (Element | null)[] }} options
 *   extras: beside the back link (the Sharing button, a … menu); aboveEditor: e.g. "Publish to Articles"
 */
export function renderFullEditor(item, { context, actions, onBack, folderName, extras = [], aboveEditor = [] }) {
  let cleanup = () => {};
  const back = h('button', {
    type: 'button', class: 'link-button vault-editor__back',
    onClick: () => { cleanup(); onBack(); },
  }, icon('arrowLeft', 14), ` Back to ${folderName === 'Vault' ? 'the vault' : folderName}`);
  const bar = h('div', { class: 'vault-editor__bar' },
    back,
    h('span', { class: 'vault-editor__kind' }, icon(iconForItem(item), 14), ` ${labelForItem(item)}`),
    h('span', { class: 'vault-editor__extras' }, extras));

  const body = h('div', { class: `vault-editor__body vault-editor__body--${item.kind === 'module' ? item.moduleType : item.article ? 'article' : 'document'}` });
  if (item.kind === 'note') {
    const noteType = getModuleType('note');
    cleanup = noteType.renderFullPage(body, documentContext(item, context, actions)) || (() => {});
  } else {
    const view = renderModuleFileView(item, {
      vaultModuleId: context.moduleId,
      folderName,
      onBack,
      onRename: (name) => { if (name.trim()) actions.saveQuietly(item.id, { name: name.trim() }); },
      bare: true,
    });
    cleanup = view.cleanup;
    body.append(view.element);
  }
  return h('div', { class: 'vault-editor' }, bar, aboveEditor, body);
}
