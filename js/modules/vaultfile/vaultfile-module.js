// @ts-check
/**
 * vaultfile-module.js — File from vault: a file from a vault, shown on a page.
 *
 * Since Nov 17 this is how documents, spreadsheets, and presentations go on
 * a page: "File from vault" in the module list opens your vault
 * (js/editor/vault-file-picker.js), and the file you choose becomes one of
 * these modules. Dragged onto the page instead, it starts empty with
 * "Choose a file". It's a live link, not a copy:
 *
 *   module data: { vaultModuleId, itemId, access, listId? }  (listId: a List file with several lists opens on that one)
 *
 * `access` (js/ui/file-access.js) is what people who see it here can do
 * beyond the vault's own members: 'view' (the default), 'comment' (comments
 * under it), or 'edit' (documents and module files: anyone signed in who
 * sees it can change it). People who can edit the page set it under the file.
 *
 *   note          → the Document module itself (js/modules/note.js), reading and
 *                   writing the note in its vault: same look, editor, and title
 *   module file   → that module's card: a spreadsheet, a presentation, tasks…
 *                   with ↗ opening its full page
 *   image         → the picture;  other files → name, size, download
 *   link          → the link;     folder → what's in it
 *
 * Who can change what follows the vault the file lives in (see
 * createItemContext in vault-module-files.js), so a file from your
 * personal vault on your public blog is read-only for visitors.
 */

import { accessPicker, accessNote, effectiveAccess, renderFileComments } from '../../ui/file-access.js';
import { h, appendChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { getModule, getSpaceOfModule, getCurrentUser, updateModuleData, renameModule } from '../../state/store.js';
import { noteModule } from '../note.js';
import { openVaultFilePicker } from '../../editor/vault-file-picker.js';
import { getModuleType } from '../registry.js';
import { createItemContext } from '../vault/vault-module-files.js';
import { describeItem, iconForItem, formatBytes } from '../vault/vault-data.js';
import { requestModuleFocus } from '../../editor/module-context.js';
import { openModulePage } from '../../router.js';

export const vaultFileModule = {
  type: 'vaultfile',
  label: 'File from vault',
  description: 'A document, spreadsheet, presentation, or any file you made in your vault',
  icon: 'vault',
  defaultSpan: 6,
  defaultRows: 12,
  available: true,
  spaceKinds: ['group', 'personal', 'blog'],

  // The header icon follows the file: a document, a spreadsheet, a picture…
  iconFor: (module) => {
    const found = findLinkedFile(module.data);
    return found ? iconForItem(found.item) : 'vault';
  },
  createInitialData: () => ({ vaultModuleId: null, itemId: null }),
  render: (container, context) => renderVaultFile(container, context, false),
  renderFullPage: (container, context) => renderVaultFile(container, context, true),
};

/** The vault item a vault-file module points at, with its vault, or null. */
export function findLinkedFile(data) {
  const vault = data?.vaultModuleId ? getModule(data.vaultModuleId) : null;
  const item = vault?.data.items.find((i) => i.id === data.itemId);
  return item ? { vault, item, space: getSpaceOfModule(vault.id) } : null;
}

function renderVaultFile(container, context, isFullPage) {
  // Skips the parts that are null (no access row, no comments), unlike append().
  const add = (...parts) => appendChildren(container, parts);
  const data = context.getData() ?? {};
  const found = findLinkedFile(data);
  if (!found) {
    const canChoose = !context.isVisitor && context.can('editHomepage');
    if (!data.itemId) {
      // Dragged on from the module list: no file chosen yet.
      add(h('div', { class: 'vaultfile__choose' },
        h('p', { class: 'module-empty' }, canChoose ? 'Choose a file from your vault to show here.' : 'No file chosen yet.'),
        canChoose ? h('button', {
          type: 'button', class: 'button button--small',
          onClick: () => openVaultFilePicker({
            space: getSpaceOfModule(context.moduleId),
            onPick: ({ vaultModuleId, itemId, listId, name }) => {
              context.saveData({ ...data, vaultModuleId, itemId, ...(listId ? { listId } : {}) });
              renameModule(context.moduleId, name);
              container.replaceChildren();
              renderVaultFile(container, context, isFullPage);
            },
          }),
        }, icon('vault', 14), ' Choose a file') : null));
      return null;
    }
    add(h('p', { class: 'module-empty' }, 'This file was moved or deleted from its vault.'));
    return null;
  }
  const { vault, item, space } = found;
  const access = effectiveAccess(item, context.getData().access ?? 'view');
  const itemContext = createItemContext(vault.id, item.id, { openFullPage: () => context.openFullPage(), access });
  // A list put on the page from a vault opens on that list (grocery-lists.js).
  if (context.getData().listId) Object.assign(itemContext, { defaultListId: context.getData().listId, listTitle: item.name });
  const me = getCurrentUser();
  const isVaultMember = Boolean(space?.memberIds.includes(me?.id));
  // Under the file: who can do what (for people who can edit the page), and comments when allowed.
  const accessRow = !context.isVisitor && context.can('editHomepage')
    ? h('p', { class: 'vaultfile__access' }, 'People who see it here: ', accessPicker(context.getData().access ?? 'view', (value) => context.saveData({ ...context.getData(), access: value })))
    : (!isVaultMember ? accessNote(access) : null);
  const comments = access !== 'view' ? renderFileComments({ vaultModuleId: vault.id, itemId: item.id, canComment: Boolean(me) && !me.isGuest }) : null;
  const source = h('p', { class: 'vaultfile__source' },
    icon(iconForItem(item), 12), ` ${describeItem(item, vault.data.items)} · from “${vault.title}”${space?.kind === 'personal' ? ' (your homepage)' : space ? ` in ${space.name}` : ''}`,
    itemContext.isVisitor ? null : [' · ', h('button', {
      type: 'button',
      class: 'link-button',
      onClick: () => { requestModuleFocus(vault.id, item.id); openModulePage(vault.id); },
    }, 'Open in the vault')]);

  if (item.kind === 'module') {
    const moduleType = getModuleType(item.moduleType);
    const body = h('div', { class: 'vaultfile__module' });
    const render = isFullPage ? (moduleType.renderFullPage ?? moduleType.render) : moduleType.render;
    const cleanup = render(body, itemContext);
    add(body, source, accessRow, comments);
    return cleanup;
  }

  if (item.kind === 'note') {
    // The Document module draws it, with a context that reads and writes the note in its vault.
    const body = h('div', { class: 'vaultfile__module vaultfile__document' });
    const noteContext = documentContext(itemContext, context, vault.id, item.id);
    const cleanup = (isFullPage ? noteModule.renderFullPage : noteModule.render)(body, noteContext);
    add(body, source, accessRow, comments);
    return cleanup;
  }

  if (item.kind === 'link') {
    add(h('a', { class: 'vaultfile__link', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, icon('link', 16), ` ${item.name}`),
      h('p', { class: 'vaultfile__url' }, item.url), source, accessRow, comments);
    return null;
  }

  if (item.kind === 'folder') {
    const children = vault.data.items.filter((i) => i.parentId === item.id).sort((a, b) => a.name.localeCompare(b.name));
    add(children.length
      ? h('ul', { class: 'vaultfile__folder' }, children.map((child) => h('li', {}, icon(iconForItem(child), 14), ` ${child.name}`)))
      : h('p', { class: 'module-empty' }, 'This folder is empty.'), source, accessRow);
    return null;
  }

  // An uploaded file.
  const { file } = item;
  const isImage = file?.mimeType.startsWith('image/') && file.dataUrl;
  add(
    isImage ? h('img', { class: 'vaultfile__image', src: file.dataUrl, alt: item.name }) : null,
    h('p', { class: 'vaultfile__file' },
      icon('file', 16), ` ${item.name} · ${formatBytes(file?.size ?? 0)} `,
      file?.dataUrl ? h('a', { href: file.dataUrl, download: item.name }, 'Download') : h('span', { class: 'vaultfile__url' }, '(too big to store in this prototype)')),
    source, accessRow, comments);
  return null;
}

/**
 * What the Document module needs for a vault note: its name as the title,
 * its text, and who changed it last; saving writes those back to the note.
 * The page's own module id and kind go along, so mentions point at this
 * page and a blog shows its byline.
 */
function documentContext(itemContext, pageContext, vaultModuleId, itemId) {
  const note = () => getModule(vaultModuleId)?.data.items.find((i) => i.id === itemId);
  return {
    ...itemContext,
    moduleId: pageContext.moduleId,
    spaceId: pageContext.spaceId,
    spaceKind: pageContext.spaceKind,
    getData: () => {
      const n = note();
      return { title: n?.name ?? '', html: n?.html || '<p></p>', lastEditedBy: n?.updatedBy ?? n?.createdBy ?? null, lastEditedAt: n?.updatedAt ?? null, updatedAt: n?.updatedAt ?? null };
    },
    saveData: (changes) => {
      const vault = getModule(vaultModuleId);
      if (!vault || itemContext.isVisitor) return;
      const vaultData = structuredClone(vault.data);
      const saved = vaultData.items.find((i) => i.id === itemId);
      if (!saved) return;
      Object.assign(saved, {
        name: (changes.title ?? '').trim() || saved.name, // a vault file always keeps a name
        html: changes.html ?? saved.html,
        updatedBy: changes.lastEditedBy ?? getCurrentUser()?.id ?? saved.updatedBy,
        updatedAt: changes.lastEditedAt ?? Date.now(),
      });
      updateModuleData(vaultModuleId, vaultData);
    },
  };
}
