// @ts-check
/**
 * vaultfile-module.js — a file from a vault, shown on a homepage or blog.
 *
 * In edit mode, the module library lists the files in this page's vaults
 * (and your own homepage's vault). Drag one onto the page, or click it,
 * and it becomes one of these modules. It's a live link, not a copy:
 *
 *   module data: { vaultModuleId, itemId, access, listId? }  (listId: a List file with several lists opens on that one)
 *
 * `access` (js/ui/file-access.js) is what people who see it here can do
 * beyond the vault's own members: 'view' (the default), 'comment' (comments
 * under it), or 'edit' (documents and module files: anyone signed in who
 * sees it can change it). People who can edit the page set it under the file.
 *
 *   note          → the note's text (editable by people who can edit the vault)
 *   module file   → that module's card: a kanban board, a relationship map…
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
import { sanitizeHtml } from '../../utils/sanitize.js';
import { decorateMentions } from '../../ui/mentions.js';
import { createRichTextEditor } from '../../ui/rich-text-editor.js';
import { getModule, getSpaceOfModule, getCurrentUser, updateModuleData } from '../../state/store.js';
import { getModuleType } from '../registry.js';
import { createItemContext } from '../vault/vault-module-files.js';
import { describeItem, iconForItem, formatBytes } from '../vault/vault-data.js';
import { requestModuleFocus } from '../../editor/module-context.js';
import { openModulePage } from '../../router.js';

export const vaultFileModule = {
  type: 'vaultfile',
  label: 'Vault file',
  description: 'A file from a vault, shown on the page (drag one from the list below)',
  icon: 'vault',
  defaultSpan: 6,
  defaultRows: 12,
  available: true,
  // Added from the library's "From your vaults" list, not the module list.
  hiddenFromLibrary: true,
  spaceKinds: ['group', 'personal', 'blog'],

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
  const found = findLinkedFile(context.getData());
  if (!found) {
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
    if (itemContext.isVisitor || !itemContext.can('createInVault')) {
      add(decorateMentions(h('div', { class: 'rich-text__content vaultfile__note', html: sanitizeHtml(item.html || '') })), source, accessRow, comments);
    } else {
      const editor = createRichTextEditor({
        html: item.html,
        label: `${item.name} text`,
        mentions: { getCandidates: () => itemContext.members, excludeId: getCurrentUser().id },
        onChange: (html) => {
          const vaultData = structuredClone(getModule(vault.id).data);
          Object.assign(vaultData.items.find((i) => i.id === item.id), { html, updatedBy: getCurrentUser().id, updatedAt: Date.now() });
          updateModuleData(vault.id, vaultData);
        },
      });
      add(editor.toolbar, editor.content, editor.statusBar, source, accessRow, comments);
    }
    return null;
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
