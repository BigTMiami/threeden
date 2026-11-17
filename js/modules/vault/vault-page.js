// @ts-check
/**
 * vault-page.js — the vault as a full page.
 *
 * Layout:
 *
 *   [ Search every folder ][ Sort: Name ▾ ][ List | Grid ]          [ + New ]
 *   ┌ folders ─────────┐ ┌ Vault › Bills & receipts ─────────────────────────┐
 *   │ Vault            │ │ Name               Type     Changed       ⋯       │
 *   │  Bills & receipts│ │ 📁 2026            Folder   2 days ago    Rename  │
 *   │   2026           │ │ 📝 October split   Note     3 days ago    Move    │
 *   │  House documents │ │ …                                         Delete  │
 *   └──────────────────┘ └───────────────────────────────────────────────────┘
 *
 * - The folder tree on the left shows every folder; click one to open it.
 * - Searching looks in every folder (names, note text, links) and shows
 *   where each result lives.
 * - "Move" picks a new folder for an item. A folder can't move inside itself.
 * - Opening a note or file shows it in place of the list, with a way back.
 */

import { h, replaceChildren, debounce } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { timeAgo } from '../../utils/dates.js';
import {
  labelForItem, SORT_OPTIONS, childrenOf, pathTo, describeItem, iconForItem, idsWithDescendants,
  sortItems, searchItems, locationLabel, folderTree,
} from './vault-data.js';
import { createVaultActions } from './vault-actions.js';
import {
  TOP_LEVEL_NAME, renderNewMenu, createFilePicker, renderCreateForm, renderOpenItem,
} from './vault-parts.js';

const SEARCH_DELAY_MS = 200;

export function renderVaultPage(container, context) {
  // View settings (not saved).
  const view = {
    folderId: null,     // the open folder (null = top level)
    openItemId: null,   // a note or file being viewed
    search: '',
    sortId: 'name',
    layout: 'list',     // 'list' | 'grid'
    creatingKind: null, // 'folder' | 'note' | 'link'
    renamingItemId: null,
    movingItemId: null,
    isMenuOpen: false,
  };

  // Permissions (js/state/permissions.js), as on the card.
  const canCreate = context.can('createInVault');
  const canModerate = context.can('moderate');
  const canDelete = (item) => item.createdBy === context.currentUser.id || canModerate;

  const items = () => context.getData().items;
  const findItem = (itemId) => items().find((item) => item.id === itemId) ?? null;
  const actions = createVaultActions(context, { onChange: () => drawAll() });
  const folderName = (folderId) => (folderId ? findItem(folderId)?.name ?? TOP_LEVEL_NAME : TOP_LEVEL_NAME);

  // Opened at an item (e.g. from search elsewhere): show it in its folder.
  const focused = findItem(context.takeFocusRequest());
  if (focused) {
    view.folderId = focused.kind === 'folder' ? focused.id : focused.parentId;
    if (focused.kind !== 'folder') view.openItemId = focused.id;
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  function openFolder(folderId) {
    Object.assign(view, { folderId, openItemId: null, search: '', creatingKind: null, renamingItemId: null, movingItemId: null });
    searchInput.value = '';
    drawAll();
  }

  function openItem(item) {
    if (item.kind === 'folder') { openFolder(item.id); return; }
    view.openItemId = item.id;
    drawAll();
  }

  // ─── Toolbar ───────────────────────────────────────────────────────────────

  const fileInput = createFilePicker((files) => actions.uploadFiles(files, view.folderId));

  const searchInput = h('input', {
    type: 'search',
    class: 'input page-search__input',
    placeholder: 'Search every folder',
    'aria-label': 'Search the vault',
    onInput: debounce((event) => {
      view.search = event.target.value;
      view.openItemId = null;
      drawMain();
    }, SEARCH_DELAY_MS),
  });

  const sortSelect = h('select', {
    class: 'input input--compact',
    'aria-label': 'Sort by',
    onChange: (event) => { view.sortId = event.target.value; drawMain(); },
  }, SORT_OPTIONS.map((option) => h('option', { value: option.id }, option.label)));

  const layoutBar = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Show as' });
  const newSlot = h('div', { class: 'vault__new vault-page__new' });

  function drawToolbar() {
    replaceChildren(layoutBar, [['list', 'List'], ['grid', 'Grid']].map(([id, label]) => h('button', {
      type: 'button',
      class: `segmented__option${view.layout === id ? ' is-active' : ''}`,
      'aria-pressed': String(view.layout === id),
      onClick: () => { view.layout = id; drawToolbar(); drawMain(); },
    }, label)));

    replaceChildren(newSlot, !canCreate ? null : [
      h('button', {
        type: 'button',
        class: 'button button--primary',
        'aria-haspopup': 'menu',
        'aria-expanded': String(view.isMenuOpen),
        onClick: () => { view.isMenuOpen = !view.isMenuOpen; drawToolbar(); },
      }, icon('plus', 16), ' New'),
      view.isMenuOpen ? renderNewMenu(startCreating) : null,
    ]);
  }

  function startCreating(action) {
    view.isMenuOpen = false;
    view.openItemId = null;
    if (action === 'upload') {
      fileInput.value = '';
      fileInput.click();
      drawToolbar();
      return;
    }
    view.creatingKind = action;
    drawAll();
  }

  /** Close the "+ New" menu on outside clicks and Escape. */
  function handleDocumentClick(event) {
    if (!event.target.isConnected || !view.isMenuOpen) return;
    if (!newSlot.contains(event.target)) { view.isMenuOpen = false; drawToolbar(); }
  }
  function handleKeydown(event) {
    if (event.key === 'Escape' && view.isMenuOpen) { view.isMenuOpen = false; drawToolbar(); }
  }
  document.addEventListener('click', handleDocumentClick);
  container.addEventListener('keydown', handleKeydown);

  const toolbar = h('div', { class: 'page-toolbar' },
    h('label', { class: 'page-search' }, icon('search', 16), searchInput),
    h('label', { class: 'page-control' }, h('span', { class: 'page-control__label' }, 'Sort by'), sortSelect),
    layoutBar,
    h('span', { class: 'page-toolbar__spacer' }),
    newSlot,
  );

  // ─── Folder tree ───────────────────────────────────────────────────────────

  const tree = h('nav', { class: 'vault-tree', 'aria-label': 'Folders' });

  function drawTree() {
    const openPath = new Set(pathTo(items(), view.folderId).map((folder) => folder.id));
    const treeButton = (folderId, name, depth) => h('button', {
      type: 'button',
      class: `vault-tree__folder${folderId === view.folderId && !view.search ? ' is-current' : ''}${openPath.has(folderId) ? ' is-open' : ''}`,
      style: { paddingLeft: `${8 + depth * 14}px` },
      onClick: () => openFolder(folderId),
    }, icon(depth < 0 ? 'vault' : 'folder', 14), ` ${name}`);

    replaceChildren(tree,
      treeButton(null, TOP_LEVEL_NAME, -1),
      folderTree(items()).map(({ folder, depth }) => treeButton(folder.id, folder.name, depth + 1)),
    );
  }

  // ─── Main area: list, search results, or an open item ──────────────────────

  const main = h('div', { class: 'vault-page__main' });

  function drawMain() {
    const item = view.openItemId ? findItem(view.openItemId) : null;
    if (item) {
      replaceChildren(main, h('div', { class: 'vault-page__open-item' }, renderOpenItem(item, {
        items: items(),
        folderName: folderName(item.parentId),
        onBack: () => { view.openItemId = null; drawAll(); },
        context,
        actions,
      })));
      return;
    }

    const all = items();
    const isSearching = view.search.trim() !== '';
    const shown = sortItems(isSearching ? searchItems(all, view.search) : childrenOf(all, view.folderId), view.sortId);

    replaceChildren(main,
      isSearching
        ? h('h2', { class: 'vault-page__heading' }, `${shown.length} ${shown.length === 1 ? 'result' : 'results'} for "${view.search.trim()}"`)
        : renderBreadcrumbs(),
      view.creatingKind
        ? renderCreateForm(view.creatingKind, {
            onCreate: (fields) => {
              view.creatingKind = null;
              const created = actions.createItem(fields, view.folderId);
              if (created.kind === 'note' || created.kind === 'module') openItem(created);
            },
            onCancel: () => { view.creatingKind = null; drawMain(); },
          })
        : null,
      shown.length === 0
        ? h('p', { class: 'module-empty vault-page__empty' }, isSearching ? 'Nothing matches. Try another word.' : 'This folder is empty. Use "+ New" to add something.')
        : view.layout === 'grid'
          ? h('ul', { class: 'vault-grid' }, shown.map((i) => renderTile(i, all, isSearching)))
          : renderTable(shown, all, isSearching),
    );
  }

  function renderBreadcrumbs() {
    const crumbs = [{ id: null, name: TOP_LEVEL_NAME }, ...pathTo(items(), view.folderId)];
    return h('nav', { class: 'vault__breadcrumbs vault-page__heading', 'aria-label': 'Folder path' },
      crumbs.map((crumb, i) => [
        i > 0 ? h('span', { class: 'vault__crumb-separator', 'aria-hidden': 'true' }, '›') : null,
        i === crumbs.length - 1
          ? h('span', { class: 'vault__crumb is-current', 'aria-current': 'page' }, crumb.name)
          : h('button', { type: 'button', class: 'link-button vault__crumb', onClick: () => openFolder(crumb.id) }, crumb.name),
      ]));
  }

  /** The item's name: a rename box, a link out (for links), or a button that opens it. */
  function renderName(item) {
    if (item.id === view.renamingItemId) {
      let done = false; // Enter and blur can both fire; only handle the first.
      const finish = (value) => {
        if (done) return;
        done = true;
        view.renamingItemId = null;
        if (!actions.renameItem(item.id, value)) drawMain();
      };
      const input = h('input', {
        type: 'text',
        class: 'input vault-item__rename',
        value: item.name,
        'aria-label': 'New name',
        onKeydown: (event) => {
          if (event.key === 'Enter') finish(event.target.value);
          if (event.key === 'Escape') { done = true; view.renamingItemId = null; drawMain(); }
        },
        onBlur: (event) => finish(event.target.value),
      });
      requestAnimationFrame(() => input.select());
      return input;
    }
    if (item.kind === 'link') {
      return h('a', { class: 'vault-item__name', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, item.name);
    }
    return h('button', { type: 'button', class: 'vault-item__name', onClick: () => openItem(item) }, item.name);
  }

  function renderActions(item) {
    return h('span', { class: 'vault-item__actions' },
      h('button', { type: 'button', class: 'link-button', onClick: () => { view.renamingItemId = item.id; drawMain(); } }, 'Rename'),
      h('button', { type: 'button', class: 'link-button', onClick: () => { view.movingItemId = item.id; drawMain(); } }, 'Move'),
      canDelete(item) ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => actions.deleteItem(item) }, 'Delete') : null,
    );
  }

  /** "Move ‘X’ to [folder ▾] [Move] Cancel", shown under the item being moved. */
  function renderMoveForm(item) {
    const blocked = item.kind === 'folder' ? idsWithDescendants(items(), item.id) : new Set();
    const select = h('select', { class: 'input input--compact', 'aria-label': `Move "${item.name}" to` },
      h('option', { value: '', selected: item.parentId === null }, TOP_LEVEL_NAME),
      folderTree(items(), blocked).map(({ folder, depth }) => h('option', {
        value: folder.id,
        selected: folder.id === item.parentId,
      }, `${'— '.repeat(depth + 1)}${folder.name}`)),
    );

    return h('form', {
      class: 'vault-move',
      onSubmit: (event) => {
        event.preventDefault();
        const folderId = select.value || null;
        view.movingItemId = null;
        if (folderId === item.parentId) { drawMain(); return; }
        if (actions.moveItem(item.id, folderId)) showToast(`Moved "${item.name}" to ${folderName(folderId)}.`);
      },
    },
      h('span', {}, `Move “${item.name}” to`),
      select,
      h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Move'),
      h('button', { type: 'button', class: 'link-button', onClick: () => { view.movingItemId = null; drawMain(); } }, 'Cancel'),
    );
  }

  function renderTable(shown, all, isSearching) {
    return h('div', { class: 'vault-table-wrap' }, h('table', { class: 'vault-table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, 'Name'),
        h('th', { scope: 'col' }, isSearching ? 'Where' : 'Type'),
        h('th', { scope: 'col' }, 'Last changed'),
        h('th', { scope: 'col' }, h('span', { class: 'visually-hidden' }, 'Actions')),
      )),
      h('tbody', {}, shown.map((item) => {
        const editor = context.getMember(item.updatedBy);
        return [
          h('tr', { class: 'vault-table__row', dataset: { itemId: item.id } },
            h('td', { class: 'vault-table__name' },
              h('span', { class: `vault-item__icon vault-item__icon--${item.kind}` }, icon(iconForItem(item), 16)),
              renderName(item)),
            h('td', { class: 'vault-table__muted' }, isSearching
              ? h('button', { type: 'button', class: 'link-button', onClick: () => openFolder(item.parentId) }, locationLabel(all, item, TOP_LEVEL_NAME))
              : describeItem(item, all)),
            h('td', { class: 'vault-table__muted' }, `${timeAgo(item.updatedAt)}${editor ? ` by ${editor.name.split(' ')[0]}` : ''}`),
            h('td', { class: 'vault-table__actions' }, renderActions(item)),
          ),
          item.id === view.movingItemId ? h('tr', {}, h('td', { colspan: '4' }, renderMoveForm(item))) : null,
        ];
      })),
    ));
  }

  function renderTile(item, all, isSearching) {
    return h('li', { class: 'vault-tile', dataset: { itemId: item.id } },
      h('span', { class: `vault-tile__icon vault-item__icon--${item.kind}` }, icon(iconForItem(item), 32)),
      renderName(item),
      h('span', { class: 'vault-tile__meta' }, isSearching ? locationLabel(all, item, TOP_LEVEL_NAME) : labelForItem(item)),
      renderActions(item),
      item.id === view.movingItemId ? renderMoveForm(item) : null,
    );
  }

  // ─── Layout ────────────────────────────────────────────────────────────────

  function drawAll() {
    drawToolbar();
    drawTree();
    drawMain();
  }

  container.append(toolbar, h('div', { class: 'vault-page' }, tree, main), fileInput);
  drawAll();

  return () => document.removeEventListener('click', handleDocumentClick);
}
