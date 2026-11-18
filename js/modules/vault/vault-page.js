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
 * - Photos and videos show as picture tiles above the other files (Nov 17).
 * - A folder you're in has the Sharing tile beside its path (who can open
 *   it, where it's shared, Publish with a cover photo).
 * - "Shared with you" (a group's vault: "Shared with this group") lists
 *   files other people shared, live from their vaults (file-access.js).
 * - Select: tick several files, then Move, Share, Download, Make a copy,
 *   Publish (or Post), or Delete them together.
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
import { documentShareButton, openShareMany } from '../../ui/document-sharing.js';
import { sharedWith, accessLabel } from '../../ui/file-access.js';
import { openPublishDialog, publishVerb } from '../../ui/publish-dialog.js';
import { vaultFileModule } from '../vaultfile/vaultfile-module.js';
import { getSpaceOfModule } from '../../state/store.js';
import {
  TOP_LEVEL_NAME, renderNewMenu, createFilePicker, renderCreateForm, renderOpenItem,
} from './vault-parts.js';

const SEARCH_DELAY_MS = 200;
/** The open "folder" that lists what others shared with you (or this group). */
const SHARED = '__shared';

const isMedia = (item) => item.kind === 'file' && item.file?.dataUrl && /^(image|video)\//.test(item.file.mimeType ?? '') && item.file.mimeType !== 'image/svg+xml';

/** A file to download: the upload itself; a note as a web page; a module file as its data. */
function downloadItem(item) {
  let href = item.file?.dataUrl ?? null;
  let name = item.name;
  if (item.kind === 'note') { href = URL.createObjectURL(new Blob([`<!doctype html><meta charset="utf-8"><title>${item.name}</title>${item.html ?? ''}`], { type: 'text/html' })); name = `${item.name}.html`; }
  if (item.kind === 'module') { href = URL.createObjectURL(new Blob([JSON.stringify(item.data ?? {}, null, 2)], { type: 'application/json' })); name = `${item.name}.json`; }
  if (!href) return false;
  const a = document.createElement('a');
  a.href = href; a.download = name; document.body.append(a); a.click(); a.remove();
  return true;
}

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
    selecting: false,   // Select: tick several files to act on them together
    selected: new Set(),
    bulkMoving: false,
    openShared: null,   // { vaultModuleId, itemId, access }: a file someone shared, open
  };
  const me = context.currentUser;
  /** Files other people shared with you (your homepage's vault) or with this group (its vault). */
  const sharedHere = () => (context.spaceKind === 'personal' ? sharedWith({ memberId: me?.id }) : context.spaceKind === 'group' ? sharedWith({ spaceId: context.spaceId }) : []);
  const sharedName = context.spaceKind === 'group' ? 'Shared with this group' : 'Shared with you';

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
    Object.assign(view, { folderId, openItemId: null, openShared: null, search: '', creatingKind: null, renamingItemId: null, movingItemId: null });
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
    selectButton.setAttribute('aria-pressed', String(view.selecting));
    selectButton.classList.toggle('is-active', view.selecting);
    replaceChildren(selectButton, icon(view.selecting ? 'close' : 'check', 15), view.selecting ? ' Done selecting' : ' Select');
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

  const selectButton = h('button', {
    type: 'button', class: 'button vault-page__select', 'aria-pressed': 'false',
    onClick: () => { view.selecting = !view.selecting; view.selected.clear(); view.bulkMoving = false; drawAll(); },
  }, icon('check', 15), ' Select');
  const toolbar = h('div', { class: 'page-toolbar' },
    h('label', { class: 'page-search' }, icon('search', 16), searchInput),
    h('label', { class: 'page-control' }, h('span', { class: 'page-control__label' }, 'Sort by'), sortSelect),
    layoutBar,
    h('span', { class: 'page-toolbar__spacer' }),
    context.isVisitor ? null : selectButton,
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

    const shared = sharedHere();
    replaceChildren(tree,
      treeButton(null, TOP_LEVEL_NAME, -1),
      folderTree(items()).map(({ folder, depth }) => treeButton(folder.id, folder.name, depth + 1)),
      shared.length ? h('button', {
        type: 'button', class: `vault-tree__folder vault-tree__shared${view.folderId === SHARED ? ' is-current' : ''}`,
        onClick: () => openFolder(SHARED),
      }, icon('people', 14), ` ${sharedName} (${shared.length})`) : null,
    );
  }

  // ─── Main area: list, search results, or an open item ──────────────────────

  const main = h('div', { class: 'vault-page__main' });

  function drawMain() {
    if (view.openShared) { drawSharedFile(); return; }
    if (view.folderId === SHARED && !view.search.trim()) { drawSharedList(); return; }
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

    const media = view.layout === 'list' ? shown.filter(isMedia) : [];
    const rest = view.layout === 'list' ? shown.filter((i) => !isMedia(i)) : shown;
    const shared = !isSearching && view.folderId === null ? sharedHere() : [];
    replaceChildren(main,
      isSearching
        ? h('h2', { class: 'vault-page__heading' }, `${shown.length} ${shown.length === 1 ? 'result' : 'results'} for "${view.search.trim()}"`)
        : h('div', { class: 'vault-page__path' }, renderBreadcrumbs(),
          // The folder you're in: who can open it, where it's shared, Publish (with a cover photo).
          view.folderId && !context.isVisitor && me && !me.isGuest ? documentShareButton({ vaultModuleId: context.moduleId, itemId: view.folderId }) : null),
      view.selecting ? renderSelectBar(shown) : null,
      shared.length ? h('button', { type: 'button', class: 'vault-page__shared-link', onClick: () => openFolder(SHARED) },
        icon('people', 16), ` ${sharedName}`, h('span', { class: 'vault-page__shared-count' }, String(shared.length)), icon('chevronRight', 14)) : null,
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
          : [
            // Photos and videos as picture tiles, like a feed's grid.
            media.length ? h('ul', { class: 'vault-media', 'aria-label': 'Photos and videos' }, media.map(renderMediaTile)) : null,
            rest.length ? renderTable(rest, all, isSearching) : null,
          ],
    );
  }

  // ─── Shared with you (or with this group) ──────────────────────────────────

  function drawSharedList() {
    const shared = sharedHere();
    replaceChildren(main,
      h('nav', { class: 'vault__breadcrumbs vault-page__heading', 'aria-label': 'Folder path' },
        h('button', { type: 'button', class: 'link-button vault__crumb', onClick: () => openFolder(null) }, TOP_LEVEL_NAME),
        h('span', { class: 'vault__crumb-separator', 'aria-hidden': 'true' }, '›'),
        h('span', { class: 'vault__crumb is-current', 'aria-current': 'page' }, sharedName)),
      h('p', { class: 'vault-page__hint' }, 'Files people shared, live from their vaults. Changes they make show here; what you can do depends on how they shared it.'),
      shared.length ? h('div', { class: 'vault-table-wrap' }, h('table', { class: 'vault-table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Name'), h('th', { scope: 'col' }, 'Shared by'), h('th', { scope: 'col' }, 'You can'), h('th', { scope: 'col' }, 'Shared'))),
        h('tbody', {}, shared.map(({ vault, item, entry }) => {
          const from = getSpaceOfModule(vault.id);
          const by = context.getMember(entry.by);
          return h('tr', { class: 'vault-table__row' },
            h('td', { class: 'vault-table__name' },
              h('span', { class: `vault-item__icon vault-item__icon--${item.kind}` }, icon(iconForItem(item), 16)),
              h('button', { type: 'button', class: 'vault-item__name', onClick: () => { view.openShared = { vaultModuleId: vault.id, itemId: item.id, access: entry.access }; drawMain(); } }, item.name)),
            h('td', { class: 'vault-table__muted' }, `${by?.name ?? 'Someone'}${from?.kind === 'group' ? ` · ${from.name}` : ''}`),
            h('td', { class: 'vault-table__muted' }, accessLabel(entry.access)),
            h('td', { class: 'vault-table__muted' }, entry.at ? timeAgo(entry.at) : ''));
        })))) : h('p', { class: 'module-empty' }, 'Nothing shared here yet.'));
  }

  /** A shared file, open: shown live from its own vault, as File from vault shows it (js/modules/vaultfile/). */
  function drawSharedFile() {
    const { vaultModuleId, itemId, access } = view.openShared;
    const body = h('div', { class: 'vault-page__shared-file' });
    const sharedContext = {
      ...context,
      moduleId: `shared:${vaultModuleId}:${itemId}`,
      getData: () => ({ vaultModuleId, itemId, access }),
      saveData: () => {},
      can: () => false,
      isVisitor: false,
      openFullPage: () => {},
      takeFocusRequest: () => null,
    };
    replaceChildren(main,
      h('button', { type: 'button', class: 'link-button vault__back', onClick: () => { view.openShared = null; drawMain(); } }, icon('arrowLeft', 14), ` Back to ${sharedName}`),
      body);
    vaultFileModule.renderFullPage(body, sharedContext);
  }

  // ─── Select: act on several at once ────────────────────────────────────────

  function toggleSelected(itemId) {
    if (view.selected.has(itemId)) view.selected.delete(itemId); else view.selected.add(itemId);
    drawMain();
  }

  function checkbox(item) {
    if (!view.selecting) return null;
    return h('input', {
      type: 'checkbox', class: 'vault-select__check', checked: view.selected.has(item.id), 'aria-label': `Select ${item.name}`,
      onClick: (event) => event.stopPropagation(),
      onChange: () => toggleSelected(item.id),
    });
  }

  function renderSelectBar(shown) {
    const chosen = [...view.selected].map(findItem).filter(Boolean);
    const n = chosen.length;
    const allShown = shown.length > 0 && shown.every((i) => view.selected.has(i.id));
    const files = chosen.filter((i) => i.kind !== 'folder');
    const deletable = chosen.filter(canDelete);
    const verb = publishVerb(chosen);
    const act = (label, iconName, onClick, { disabled = !n, danger = false } = {}) => h('button', {
      type: 'button', class: `button button--small${danger ? ' button--danger' : ''}`, disabled, onClick,
    }, icon(iconName, 14), ` ${label}`);
    return h('div', { class: 'vault-select', role: 'toolbar', 'aria-label': 'Selected files' },
      h('label', { class: 'vault-select__all' },
        h('input', { type: 'checkbox', checked: allShown, onChange: () => { if (allShown) shown.forEach((i) => view.selected.delete(i.id)); else shown.forEach((i) => view.selected.add(i.id)); drawMain(); } }),
        ` ${n ? `${n} selected` : 'Select all'}`),
      h('span', { class: 'vault-select__actions' },
        act('Move', 'folder', () => { view.bulkMoving = !view.bulkMoving; drawMain(); }),
        act('Share', 'people', () => openShareMany({ vaultModuleId: context.moduleId, itemIds: chosen.map((i) => i.id), onDone: drawAll })),
        act('Download', 'download', () => {
          const done = chosen.filter(downloadItem).length;
          showToast(done ? `Downloading ${done} ${done === 1 ? 'file' : 'files'}.` : 'Nothing here can be downloaded.');
        }, { disabled: !files.length }),
        canCreate ? act('Make a copy', 'layers', () => {
          for (const item of files) actions.createItem({ ...structuredClone(item), id: undefined, name: `${item.name} (copy)`, sharedWith: undefined }, item.parentId);
          showToast(`Made ${files.length} ${files.length === 1 ? 'copy' : 'copies'}.`);
        }, { disabled: !files.length }) : null,
        act(verb, verb === 'Publish' ? 'newspaper' : 'announcements', () => openPublishDialog({ entries: chosen.map((item) => ({ vaultModuleId: context.moduleId, item })) })),
        act('Delete', 'trash', () => bulkDelete(deletable), { disabled: !deletable.length, danger: true })),
      view.bulkMoving && n ? renderBulkMove(chosen) : null);
  }

  function renderBulkMove(chosen) {
    const select = h('select', { class: 'input input--compact', 'aria-label': `Move ${chosen.length} to` },
      h('option', { value: '' }, TOP_LEVEL_NAME),
      folderTree(items()).map(({ folder, depth }) => h('option', { value: folder.id, disabled: view.selected.has(folder.id) }, `${'— '.repeat(depth + 1)}${folder.name}`)));
    return h('form', {
      class: 'vault-move vault-select__move',
      onSubmit: (event) => {
        event.preventDefault();
        const folderId = select.value || null;
        const moved = chosen.filter((item) => item.parentId !== folderId && actions.moveItem(item.id, folderId)).length;
        view.bulkMoving = false;
        view.selected.clear();
        showToast(moved ? `Moved ${moved} to ${folderName(folderId)}.` : 'Nothing moved.');
        drawAll();
      },
    }, h('span', {}, `Move ${chosen.length} to`), select, h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Move'));
  }

  function bulkDelete(chosen) {
    const before = structuredClone(context.getData());
    const ids = new Set(chosen.flatMap((item) => [...idsWithDescendants(items(), item.id)]));
    const data = structuredClone(context.getData());
    data.items = data.items.filter((i) => !ids.has(i.id));
    context.saveData(data);
    view.selected.clear();
    drawAll();
    showToast(`Deleted ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}.`, { actionLabel: 'Undo', onAction: () => { context.saveData(before); drawAll(); } });
  }

  /** A photo or video as a picture tile; tap to open it (or tick it while selecting). */
  function renderMediaTile(item) {
    const isVideo = item.file.mimeType.startsWith('video/');
    return h('li', { class: `vault-media__tile${view.selected.has(item.id) ? ' is-selected' : ''}`, dataset: { itemId: item.id } },
      h('button', {
        type: 'button', class: 'vault-media__open', 'aria-label': `${view.selecting ? 'Select' : 'Open'} ${item.name}`,
        onClick: () => (view.selecting ? toggleSelected(item.id) : openItem(item)),
      },
        isVideo ? h('video', { src: item.file.dataUrl, muted: true, preload: 'metadata' }) : h('img', { src: item.file.dataUrl, alt: '', loading: 'lazy' }),
        isVideo ? h('span', { class: 'vault-media__badge', 'aria-hidden': 'true' }, '▶') : null,
        h('span', { class: 'vault-media__name' }, item.name)),
      checkbox(item));
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
              checkbox(item),
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
    return h('li', { class: `vault-tile${view.selected.has(item.id) ? ' is-selected' : ''}`, dataset: { itemId: item.id } },
      checkbox(item),
      // Photos and videos show themselves; everything else its icon.
      isMedia(item)
        ? h('span', { class: 'vault-tile__thumb' }, item.file.mimeType.startsWith('video/') ? h('video', { src: item.file.dataUrl, muted: true, preload: 'metadata' }) : h('img', { src: item.file.dataUrl, alt: '', loading: 'lazy' }))
        : h('span', { class: `vault-tile__icon vault-item__icon--${item.kind}` }, icon(iconForItem(item), 32)),
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
