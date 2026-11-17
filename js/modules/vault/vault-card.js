// @ts-check
/**
 * vault-card.js — the vault as it appears on the homepage.
 *
 * Two views inside the card:
 *   - folder view: breadcrumbs, the "+ New" menu, and the folder's items
 *   - item view:   an open note (editor) or file (preview)
 *
 * The full page (vault-page.js) adds a folder tree, search across every
 * folder, sorting, a grid view, and moving things between folders.
 *
 * Only people whose role has "Add to vaults" see "+ New", and only the
 * person who added something (or someone who can moderate) can delete it.
 * (See js/state/permissions.js.)
 */

import { emptyState } from '../../ui/empty-state.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { timeAgo } from '../../utils/dates.js';
import { childrenOf, pathTo, describeItem, iconForItem } from './vault-data.js';
import { createVaultActions } from './vault-actions.js';
import {
  TOP_LEVEL_NAME, renderNewMenu, createFilePicker, renderCreateForm, renderOpenItem,
} from './vault-parts.js';

export function renderVaultCard(container, context) {
  // View settings (not saved).
  let currentFolderId = null; // null = top level
  let openItemId = null;      // a note or file being viewed
  let renamingItemId = null;
  let creatingKind = null;    // 'folder' | 'note' | 'link' while the create form is open
  let isMenuOpen = false;

  // Permissions (js/state/permissions.js): who can add things, and who can
  // remove things other people added.
  const canCreate = context.can('createInVault');
  const canModerate = context.can('moderate');
  const canDelete = (item) => item.createdBy === context.currentUser.id || canModerate;

  const items = () => context.getData().items;
  const findItem = (itemId) => items().find((item) => item.id === itemId);
  const actions = createVaultActions(context, { onChange: () => redraw() });

  const folderName = (folderId) => (folderId ? findItem(folderId)?.name ?? TOP_LEVEL_NAME : TOP_LEVEL_NAME);

  // ─── Navigation ────────────────────────────────────────────────────────────

  function openFolder(folderId) {
    currentFolderId = folderId;
    openItemId = null;
    renamingItemId = null;
    creatingKind = null;
    redraw();
  }

  function openItem(item) {
    if (item.kind === 'folder') return openFolder(item.id);
    // A module file (kanban, map…) needs room: open it on the vault's full page.
    if (item.kind === 'module') return context.openFullPage(item.id);
    openItemId = item.id;
    redraw();
  }

  function closeItem() {
    openItemId = null;
    redraw();
  }

  // ─── Creating ──────────────────────────────────────────────────────────────

  const fileInput = createFilePicker((files) => actions.uploadFiles(files, currentFolderId));

  function startCreating(action) {
    isMenuOpen = false;
    if (action === 'upload') {
      fileInput.value = '';
      fileInput.click();
      redraw();
      return;
    }
    creatingKind = action;
    redraw();
  }

  function finishCreating(fields) {
    creatingKind = null;
    const item = actions.createItem(fields, currentFolderId);
    if (item.kind === 'note' || item.kind === 'module') openItem(item); // Jump straight in.
  }

  // ─── Renaming ──────────────────────────────────────────────────────────────

  function finishRenaming(itemId, newName) {
    // Enter and blur can both fire for one rename; only handle the first.
    if (renamingItemId !== itemId) return;
    renamingItemId = null;
    if (!actions.renameItem(itemId, newName)) redraw();
  }

  // ─── Toolbar: breadcrumbs and "+ New" ──────────────────────────────────────

  const toolbar = h('div', { class: 'vault__toolbar' });

  // The menu opens in the page flow under the toolbar (not floating), so
  // the module's scrolling body never cuts it off.
  const menuSlot = h('div');

  function drawToolbar() {
    const crumbs = [{ id: null, name: TOP_LEVEL_NAME }, ...pathTo(items(), currentFolderId)];

    const breadcrumbs = h('nav', { class: 'vault__breadcrumbs', 'aria-label': 'Folder path' },
      crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return [
          i > 0 ? h('span', { class: 'vault__crumb-separator', 'aria-hidden': 'true' }, '›') : null,
          isLast
            ? h('span', { class: 'vault__crumb is-current', 'aria-current': 'page' }, crumb.name)
            : h('button', { type: 'button', class: 'link-button vault__crumb', onClick: () => openFolder(crumb.id) }, crumb.name),
        ];
      }),
    );

    const newButton = h('button', {
      type: 'button',
      class: 'button button--primary button--small',
      'aria-haspopup': 'menu',
      'aria-expanded': String(isMenuOpen),
      onClick: () => { isMenuOpen = !isMenuOpen; redraw(); },
    }, icon('plus', 14), ' New');

    replaceChildren(toolbar, breadcrumbs, canCreate ? h('div', { class: 'vault__new' }, newButton) : null);
    replaceChildren(menuSlot, isMenuOpen ? renderNewMenu(startCreating) : null);
  }

  /** Close the "+ New" menu on outside clicks and Escape. */
  function handleDocumentClick(event) {
    // Ignore clicks on elements a redraw just removed (like the "+ New" button itself).
    if (!event.target.isConnected) return;
    const clickedInside = toolbar.querySelector('.vault__new')?.contains(event.target) || menuSlot.contains(event.target);
    if (isMenuOpen && !clickedInside) {
      isMenuOpen = false;
      redraw();
    }
  }
  function handleKeydown(event) {
    if (event.key === 'Escape' && isMenuOpen) {
      isMenuOpen = false;
      redraw();
    }
  }
  document.addEventListener('click', handleDocumentClick);
  container.addEventListener('keydown', handleKeydown);

  // ─── Folder view: the item list ────────────────────────────────────────────

  const createFormSlot = h('div');
  const itemList = h('ul', { class: 'vault__items' });

  function drawItemList() {
    const all = items();
    const children = childrenOf(all, currentFolderId);

    if (children.length === 0) {
      replaceChildren(itemList, emptyState({ tag: 'li', icon: 'folder', title: 'This folder is empty', text: 'Use + New to add a note, a link, or a file.' }));
      return;
    }
    replaceChildren(itemList, children.map((item) => renderItemRow(item, all)));
  }

  function renderItemRow(item, all) {
    const isRenaming = item.id === renamingItemId;

    // Links open the web page directly; everything else opens inside the vault.
    const nameElement = isRenaming
      ? h('input', {
          type: 'text',
          class: 'input vault-item__rename',
          value: item.name,
          'aria-label': 'New name',
          onKeydown: (event) => {
            if (event.key === 'Enter') finishRenaming(item.id, event.target.value);
            if (event.key === 'Escape') { renamingItemId = null; redraw(); }
          },
          onBlur: (event) => finishRenaming(item.id, event.target.value),
        })
      : item.kind === 'link'
        ? h('a', { class: 'vault-item__name', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, item.name)
        : h('button', { type: 'button', class: 'vault-item__name', onClick: () => openItem(item) }, item.name);

    if (isRenaming) requestAnimationFrame(() => nameElement.select());

    const editor = context.getMember(item.updatedBy);

    return h('li', { class: 'vault-item' },
      h('span', { class: `vault-item__icon vault-item__icon--${item.kind}` }, icon(iconForItem(item), 18)),
      h('span', { class: 'vault-item__text' },
        nameElement,
        h('span', { class: 'vault-item__meta' },
          `${describeItem(item, all)} · ${timeAgo(item.updatedAt)}${editor ? ` by ${editor.name.split(' ')[0]}` : ''}`),
      ),
      h('span', { class: 'vault-item__actions' },
        h('button', { type: 'button', class: 'link-button', onClick: () => { renamingItemId = item.id; redraw(); } }, 'Rename'),
        canDelete(item) ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => actions.deleteItem(item) }, 'Delete') : null,
      ),
    );
  }

  const folderView = h('div', { class: 'vault__folder-view' }, createFormSlot, itemList);

  // ─── Item view: an open note or file ───────────────────────────────────────

  const itemView = h('div', { class: 'vault__item-view' });

  function drawItemView() {
    const item = findItem(openItemId);
    if (!item) { closeItem(); return; }
    replaceChildren(itemView, renderOpenItem(item, {
      items: items(),
      folderName: folderName(item.parentId),
      onBack: closeItem,
      context,
      actions,
    }));
  }

  // ─── Drawing ───────────────────────────────────────────────────────────────

  function redraw() {
    const isItemOpen = openItemId !== null;
    toolbar.hidden = isItemOpen;
    menuSlot.hidden = isItemOpen;
    folderView.hidden = isItemOpen;
    itemView.hidden = !isItemOpen;

    if (isItemOpen) {
      drawItemView();
      return;
    }
    drawToolbar();
    replaceChildren(createFormSlot, creatingKind
      ? renderCreateForm(creatingKind, { onCreate: finishCreating, onCancel: () => { creatingKind = null; redraw(); } })
      : null);
    drawItemList();
  }

  container.append(toolbar, menuSlot, folderView, itemView, fileInput);
  redraw();

  return () => document.removeEventListener('click', handleDocumentClick);
}
