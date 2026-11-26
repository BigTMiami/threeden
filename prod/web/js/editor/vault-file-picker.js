// @ts-check
/**
 * vault-file-picker.js — "File from vault": choose a file you already made,
 * and it goes on the page as a module.
 *
 *   ┌ File from vault ──────────────────────────────────── × ┐
 *   │ [ Search your files                                  ] │
 *   │ VAULT · YOUR HOMEPAGE                                   │
 *   │  📄 Budget notes        Note · Planning · 2 days ago    │
 *   │  ▦  Tour costs          Spreadsheet · 1 week ago        │
 *   │  ▭  Pitch deck          Presentation · Nov 3            │
 *   └─────────────────────────────────────────────────────────┘
 *
 * The vaults listed are this page's own, then your homepage's (on your
 * homepage, just yours). Anything but a folder can be chosen: notes,
 * spreadsheets, presentations, uploads, links, task lists… A List file
 * holding several lists offers each list (it opens on that one).
 *
 * Choosing calls `onPick({ vaultModuleId, itemId, listId?, name })`. The
 * caller adds (or fills) a File from vault module (js/modules/vaultfile/),
 * which shows the file live from its vault: notes through the Document
 * module, spreadsheets and presentations through theirs.
 *
 *   openVaultFilePicker({ space, onPick })
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { timeAgo } from '../utils/dates.js';
import { getPersonalSpace } from '../state/store.js';
import { iconForItem, describeItem, pathTo } from '../modules/vault/vault-data.js';
import { listsOf } from '../modules/grocery/grocery-lists.js';
import { openModulePage } from '../router.js';

/** The vaults whose files can go on this page: its own, then your homepage's. */
export function vaultsFor(space) {
  if (!space) return [];
  const own = space.modules.filter((m) => m.type === 'vault').map((vault) => ({ vault, where: space.kind === 'personal' ? 'Your homepage' : space.name }));
  const personal = getPersonalSpace();
  const mine = personal && personal.id !== space.id
    ? personal.modules.filter((m) => m.type === 'vault').map((vault) => ({ vault, where: 'Your homepage' }))
    : [];
  return [...own, ...mine];
}

/** Every file in a vault as choices, newest change first; a List file with several lists gives one per list. */
function choicesIn(vault) {
  const items = vault.data.items ?? [];
  return items
    .filter((item) => item.kind !== 'folder')
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.name.localeCompare(b.name))
    .flatMap((item) => {
      const folders = pathTo(items, item.parentId).map((f) => f.name);
      const base = { vault, item, folders, name: item.name, kind: describeItem(item, items), listId: null };
      // Shared lists: a Tasks file on its Lists view (the List module until Nov 20).
      if (item.kind === 'module' && (item.moduleType === 'grocery' || (item.moduleType === 'todo' && item.data?.view === 'lists'))) {
        const lists = listsOf(item.data);
        if (lists.length > 1) return lists.map((list) => ({ ...base, name: list.name || item.name, kind: `A list in ${item.name}`, listId: list.id }));
      }
      return [base];
    });
}

export function openVaultFilePicker({ space, onPick }) {
  const vaults = vaultsFor(space);
  const search = h('input', { type: 'search', class: 'input vault-picker__search', placeholder: 'Search your files', 'aria-label': 'Search your files' });
  const results = h('div', { class: 'vault-picker__results' });
  const close = () => modal.close();

  function draw() {
    const query = search.value.trim().toLowerCase();
    const sections = vaults.map(({ vault, where }) => {
      const choices = choicesIn(vault).filter((c) => !query || [c.name, c.kind, ...c.folders].join(' ').toLowerCase().includes(query));
      return { vault, where, choices };
    }).filter((s) => s.choices.length || !query);
    const anyFiles = vaults.some(({ vault }) => (vault.data.items ?? []).some((i) => i.kind !== 'folder'));

    if (!vaults.length || !anyFiles) {
      replaceChildren(results, h('div', { class: 'vault-picker__empty' },
        h('p', {}, vaults.length ? 'There’s nothing in your vault yet.' : 'This page has no vault.'),
        h('p', { class: 'vault-picker__hint' }, 'Make a note, spreadsheet, or presentation in your vault (+ New), or upload a file, then come back here to add it.'),
        vaults.length ? h('button', {
          type: 'button', class: 'button button--small',
          onClick: () => { close(); openModulePage(vaults[0].vault.id); },
        }, icon('vault', 14), ' Open your vault') : null));
      return;
    }
    if (!sections.some((s) => s.choices.length)) {
      replaceChildren(results, h('p', { class: 'vault-picker__empty' }, `No files match “${search.value.trim()}”.`));
      return;
    }
    replaceChildren(results, sections.filter((s) => s.choices.length).map(({ vault, where, choices }) => h('section', { class: 'vault-picker__vault' },
      h('h3', { class: 'vault-picker__vault-name' }, icon('vault', 13), ` ${vault.title}`, h('span', { class: 'vault-picker__where' }, ` · ${where}`)),
      h('ul', { class: 'vault-picker__list' }, choices.map((choice) => h('li', {},
        h('button', {
          type: 'button',
          class: 'vault-picker__item',
          onClick: () => {
            close();
            onPick({ vaultModuleId: vault.id, itemId: choice.item.id, listId: choice.listId, name: choice.name });
          },
        },
          h('span', { class: 'vault-picker__icon' }, icon(iconForItem(choice.item), 18)),
          h('span', { class: 'vault-picker__text' },
            h('span', { class: 'vault-picker__name' }, choice.name),
            h('span', { class: 'vault-picker__detail' }, [choice.kind, ...choice.folders, choice.item.updatedAt ? timeAgo(choice.item.updatedAt) : null].filter(Boolean).join(' · ')))))))),
    ));
  }

  search.addEventListener('input', draw);
  const content = h('div', { class: 'vault-picker' },
    h('div', { class: 'vault-picker__header' },
      h('h2', { class: 'vault-picker__title' }, 'File from vault'),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => close() }, icon('close', 18))),
    h('p', { class: 'vault-picker__hint' }, 'Choose a file to show on this page. It stays in your vault: changes in either place show in both.'),
    search,
    results);
  const modal = openModal(content, { label: 'File from vault', className: 'vault-picker-modal' });
  draw();
  requestAnimationFrame(() => search.focus());
  return modal;
}
