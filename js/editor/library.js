/**
 * library.js — the "Modules" sidebar shown in edit mode.
 *
 * People can add a module two ways:
 *   1. Drag it onto the page (drops at the spot they choose).
 *   2. Click or tap it (adds it to the end of the page). This also works
 *      with a keyboard.
 *
 * On touch screens, dragging from the library is turned off so people can
 * still scroll the list with a finger; tapping adds the module instead.
 * (Modules already on the page can be dragged by touch from their header.)
 *
 * On a phone the library isn't shown while you edit: "Add modules" (next to
 * Done) opens it as a sheet from the bottom; tapping a module adds it and
 * closes the sheet (openLibrarySheet / closeLibrarySheet).
 *
 * A second tab, "Removed", lists modules taken off this page, with their
 * contents, to put back (js/state/module-backups.js). Pages with a vault
 * keep those copies in the vault, and they're listed here too.
 *
 * Under the modules, "From your vaults" lists the files in this page's
 * vaults and your own homepage's vault. Dragging (or clicking) one adds a
 * Vault file module showing it: a note, a picture, a kanban board kept as
 * a file… (js/modules/vaultfile/).
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { moduleTypesFor, getModuleType } from '../modules/registry.js';
import { addModule, getCurrentSpace, getPersonalSpace, getMember, getCurrentUser, subscribe } from '../state/store.js';
import { removedFor, putBack } from '../state/module-backups.js';
import { timeAgo } from '../utils/dates.js';
import { iconForItem, describeItem, pathTo } from '../modules/vault/vault-data.js';
import { listsOf } from '../modules/grocery/grocery-lists.js';
import { beginPointerDrag } from './pointer-drag.js';

/**
 * Fill `container` with the module library. Called once at startup; the
 * list follows the space being shown, since blogs have their own modules
 * (photo gallery, carousel, document…) and groups have theirs.
 */
export function renderLibrary(container) {
  function draw() {
    const space = getCurrentSpace();
    const kind = space?.kind ?? 'group';
    const removed = removedFor(space);
    if (libraryTab === 'removed' && !space) libraryTab = 'add';
    const tab = (id, label) => h('button', {
      type: 'button', role: 'tab', class: `library__tab${libraryTab === id ? ' is-active' : ''}`, 'aria-selected': String(libraryTab === id),
      onClick: () => { libraryTab = id; draw(); },
    }, label);
    replaceChildren(container,
      h('div', { class: 'library__header' },
        h('h2', { class: 'library__title' }, kind === 'blog' ? 'Blog modules' : 'Modules'),
        h('button', { type: 'button', class: 'icon-button library__close', 'aria-label': 'Close the module list', onClick: closeLibrarySheet }, icon('close', 18)),
        h('div', { class: 'library__tabs', role: 'tablist', 'aria-label': 'Modules' },
          tab('add', 'Add'),
          tab('removed', removed.length ? `Removed (${removed.length})` : 'Removed')),
        libraryTab === 'add' ? h('p', { class: 'library__hint' }, isPhone() ? 'Tap one to add it at the end of the page.' : 'Drag onto the page, or click to add at the end.') : null,
      ),
      libraryTab === 'add' ? [renderModuleList(kind), renderVaultFiles(space)] : renderRemoved(space, removed, draw),
    );
  }
  // Redrawn when edit mode opens, so the vault list is current; and after a module comes off or goes back.
  subscribe('space', draw);
  subscribe('account', draw);
  subscribe('layout', draw);
  subscribe('mode', () => { closeLibrarySheet(); libraryTab = 'add'; draw(); });
  draw();
}

/** Which tab of the module list is showing: 'add' or 'removed'. */
let libraryTab = 'add';

// ─── Removed: modules taken off this page, with their contents ─────────────

function renderRemoved(space, removed, redraw) {
  const hasVault = space?.modules.some((m) => m.type === 'vault');
  const note = hasVault
    ? 'Modules you remove keep everything in them. This page keeps the copies in its vault, in “Removed from the page”.'
    : 'Modules you remove keep everything in them, here. Put one back to have it on the page again.';
  if (!removed.length) return h('p', { class: 'library__hint library__removed-empty' }, `Nothing removed yet. ${note}`);
  const me = getCurrentUser();
  return [
    h('p', { class: 'library__hint' }, note),
    h('ul', { class: 'library__list library__removed' }, removed.map((entry) => {
      let type = null;
      try { type = getModuleType(entry.type); } catch { type = null; }
      const who = entry.removedBy === me?.id ? 'you' : getMember(entry.removedBy)?.name.split(' ')[0] ?? 'someone';
      return h('li', { class: 'library__removed-item' },
        h('span', { class: 'library-item__icon', 'aria-hidden': 'true' }, icon(type?.icon ?? 'file', 16)),
        h('span', { class: 'library__removed-text' },
          h('span', { class: 'library-item__label' }, entry.title),
          h('span', { class: 'library-item__description' }, `${type?.label ?? 'Module'} · removed ${timeAgo(entry.removedAt)} by ${who}${entry.where === 'vault' ? ` · in ${entry.vaultName}` : ''}`)),
        type ? h('button', {
          type: 'button', class: 'button button--small',
          onClick: () => {
            const back = putBack(entry.ref);
            if (back) showToast(`Put “${back.title}” back on the page.`);
            redraw();
          },
        }, 'Put back') : null);
    })),
  ];
}

// ─── On a phone: a sheet that opens from "Add modules" ─────────────────────

const PHONE = '(max-width: 640px)';
const isPhone = () => window.matchMedia(PHONE).matches;
let backdrop = null;

export function openLibrarySheet() {
  const library = document.getElementById('module-library');
  if (!library) return;
  library.classList.add('is-open');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'library-backdrop';
    backdrop.addEventListener('click', closeLibrarySheet);
  }
  document.body.append(backdrop);
  document.addEventListener('keydown', closeOnEscape);
  library.querySelector('.library-item')?.focus({ preventScroll: true });
}

export function closeLibrarySheet() {
  const library = document.getElementById('module-library');
  const wasOpen = library?.classList.contains('is-open');
  library?.classList.remove('is-open');
  backdrop?.remove();
  document.removeEventListener('keydown', closeOnEscape);
  if (wasOpen) document.querySelector('.space-header__add-modules')?.focus({ preventScroll: true });
}

function closeOnEscape(event) {
  if (event.key === 'Escape') closeLibrarySheet();
}

/** The modules most groups start with; the rest are one tap away. */
const BASICS = ['announcements', 'calendar', 'chat', 'todo', 'note', 'vault'];
/** Modules few pages use: in their own "Less common modules" menu at the bottom of the list. */
const LESS_COMMON = ['gantt', 'relationship', 'survey', 'presentation', 'canvas', 'shifts', 'recents', 'recentgroups', 'gallery', 'carousel'];
/** Whether "More modules" is open (kept while the page is open). */
let showAllModules = false;
let showRare = false;

/**
 * The module list. A blog's feeds (photo & video, text, general) come
 * first under "Feeds", since they're what a blog is mostly for.
 */
function renderModuleList(kind) {
  const all = moduleTypesFor(kind).filter((t) => !t.hiddenFromLibrary);
  // Modules few pages use go in their own menu at the very bottom.
  const rare = all.filter((t) => LESS_COMMON.includes(t.type));
  const types = all.filter((t) => !LESS_COMMON.includes(t.type));
  const feeds = types.filter((t) => t.isFeed);
  const rareMenu = rare.length ? collapsible('library-rare', 'Less common modules', rare, () => showRare, (on) => { showRare = on; }) : null;
  // In a group or on a homepage: the six most groups start with, then the rest behind "More modules".
  if (kind !== 'blog' || feeds.length === 0) {
    const basics = BASICS.map((type) => types.find((t) => t.type === type)).filter(Boolean);
    const rest = types.filter((t) => !BASICS.includes(t.type));
    if (basics.length < 3 || rest.length === 0) return [h('ul', { class: 'library__list' }, types.map(renderLibraryItem)), rareMenu];
    return [
      h('h3', { class: 'library__section' }, 'The basics'),
      h('ul', { class: 'library__list' }, basics.map(renderLibraryItem)),
      collapsible('library-more', 'More modules', rest, () => showAllModules, (on) => { showAllModules = on; }),
      rareMenu,
    ];
  }
  return [
    h('h3', { class: 'library__section' }, 'Feeds'),
    h('p', { class: 'library__hint' }, 'What you post in a feed shows up in your friends’ Feeds.'),
    h('ul', { class: 'library__list' }, feeds.map(renderLibraryItem)),
    h('h3', { class: 'library__section' }, 'Other blog modules'),
    h('ul', { class: 'library__list' }, types.filter((t) => !t.isFeed).map(renderLibraryItem)),
    rareMenu,
  ];
}

/** A "More modules (N)" style button with its list under it, open or shut. */
function collapsible(id, label, types, isOpen, setOpen) {
  const list = h('ul', { class: 'library__list', id, hidden: !isOpen() }, types.map(renderLibraryItem));
  const toggle = h('button', {
    type: 'button', class: 'library__more', 'aria-expanded': String(isOpen()), 'aria-controls': id,
    onClick: () => {
      setOpen(!isOpen());
      list.hidden = !isOpen();
      toggle.setAttribute('aria-expanded', String(isOpen()));
      replaceChildren(toggle, [icon(isOpen() ? 'chevronUp' : 'chevronDown', 14), ` ${label} (${types.length})`]);
    },
  }, icon(isOpen() ? 'chevronUp' : 'chevronDown', 14), ` ${label} (${types.length})`);
  return [toggle, list];
}

// ─── From your vaults ────────────────────────────────────────────────────────

/** The vaults whose files can go on this page: its own, then your homepage's. */
function vaultsFor(space) {
  if (!space) return [];
  const own = space.modules.filter((m) => m.type === 'vault').map((vault) => ({ vault, where: space.kind === 'personal' ? 'Your homepage' : space.name }));
  const personal = getPersonalSpace();
  const mine = personal && personal.id !== space.id
    ? personal.modules.filter((m) => m.type === 'vault').map((vault) => ({ vault, where: 'Your homepage' }))
    : [];
  return [...own, ...mine];
}

function renderVaultFiles(space) {
  const vaults = vaultsFor(space).filter(({ vault }) => (vault.data.items ?? []).some((i) => i.kind !== 'folder'));
  if (vaults.length === 0) return null;
  return h('div', { class: 'library__vaults' },
    h('h2', { class: 'library__title' }, 'From your vaults'),
    h('p', { class: 'library__hint' }, 'Show a file on this page: drag it on, or click it.'),
    vaults.map(({ vault, where }) => h('section', { class: 'library__vault' },
      h('h3', { class: 'library__vault-name' }, icon('vault', 13), ` ${vault.title}`, h('span', { class: 'library__vault-where' }, ` · ${where}`)),
      h('ul', { class: 'library__list' }, vault.data.items
        .filter((item) => item.kind !== 'folder')
        .sort((a, b) => a.name.localeCompare(b.name))
        .flatMap((item) => vaultEntries(vault, item))))));
}

/** A file's entries: one, or for a List file holding several lists, one per list (it opens on that list: grocery-lists.js). */
function vaultEntries(vault, item) {
  if (item.kind === 'module' && item.moduleType === 'grocery') {
    const lists = listsOf(item.data);
    if (lists.length > 1) return lists.map((list) => renderVaultItem(vault, item, list));
  }
  return [renderVaultItem(vault, item)];
}

function renderVaultItem(vault, item, list = null) {
  const folders = pathTo(vault.data.items, item.parentId).map((f) => f.name);
  const name = list ? list.name || item.name : item.name;
  const drag = {
    kind: 'new',
    moduleType: 'vaultfile',
    overrides: { title: name, data: { vaultModuleId: vault.id, itemId: item.id, ...(list ? { listId: list.id } : {}) } },
    label: name,
    icon: iconForItem(item),
  };
  return h('li', {}, h('button', {
    type: 'button',
    class: 'library-item library-item--file',
    onClick: () => {
      const module = addModule('vaultfile', undefined, drag.overrides);
      closeLibrarySheet();
      showToast(`“${name}” added to the end of the page.`);
      requestAnimationFrame(() => document.querySelector(`[data-module-id="${module.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    },
    onPointerdown: (event) => { if (event.pointerType !== 'touch') beginPointerDrag(event, drag); },
  },
    h('span', { class: 'library-item__icon' }, icon(iconForItem(item), 16)),
    h('span', { class: 'library-item__text' },
      h('span', { class: 'library-item__label' }, name),
      h('span', { class: 'library-item__description' }, [list ? `A list in ${item.name}` : describeItem(item, vault.data.items), ...folders].join(' · '))),
    h('span', { class: 'library-item__grip' }, icon('grip', 16))));
}

function renderLibraryItem(moduleType) {
  const isAvailable = moduleType.available;

  const button = h('button', {
    type: 'button',
    class: `library-item${isAvailable ? '' : ' library-item--soon'}`,
    onClick: () => handleClick(moduleType),
    onPointerdown: (event) => handlePointerDown(event, moduleType),
  },
    h('span', { class: 'library-item__icon' }, icon(moduleType.icon, 18)),
    h('span', { class: 'library-item__text' },
      h('span', { class: 'library-item__label' }, moduleType.label),
      h('span', { class: 'library-item__description' }, moduleType.description),
    ),
    isAvailable
      ? h('span', { class: 'library-item__grip' }, icon('grip', 16))
      : h('span', { class: 'library-item__soon' }, 'Soon'),
  );

  return h('li', {}, button);
}

function handleClick(moduleType) {
  if (!moduleType.available) {
    showToast(`${moduleType.label} is coming in a later phase.`);
    return;
  }
  const module = addModule(moduleType.type);
  showToast(`${moduleType.label} added to the end of the page.`);
  closeLibrarySheet();

  // Bring the new module into view once the grid has re-rendered.
  requestAnimationFrame(() => {
    document.querySelector(`[data-module-id="${module.id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function handlePointerDown(event, moduleType) {
  if (!moduleType.available || event.pointerType === 'touch') return;
  beginPointerDrag(event, {
    kind: 'new',
    moduleType: moduleType.type,
    label: moduleType.label,
    icon: moduleType.icon,
  });
}
