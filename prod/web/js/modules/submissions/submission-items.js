/**
 * submission-items.js — attaching work to a submission, and looking at it.
 *
 *   [From a vault] [Upload a file] [Add a link] [Write an answer]
 *     From a vault → a list of the files in this group's vaults and your
 *     own homepage's vault; picking one attaches a copy of it.
 *
 *   📄 Essay draft (note, from My vault)          Open · Remove
 *   🖼 Site photo.jpg · 240 KB                    Open · Remove
 *
 * "Open" shows the item over the page: a note's text, a picture, a link,
 * a written answer, or a module file (a kanban, a map…) drawn read-only.
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { sanitizeHtml } from '../../utils/sanitize.js';
import { renderText } from '../../ui/text.js';
import { decorateMentions } from '../../ui/mentions.js';
import { getModuleType } from '../registry.js';
import { getSpace, getPersonalSpace, getMember, getCurrentUser } from '../../state/store.js';
import { formatBytes, readFileAsDataUrl, MAX_STORED_FILE_BYTES, iconForItem, pathTo } from '../vault/vault-data.js';
import { newItemId } from './submissions-data.js';

// ─── Attaching ───────────────────────────────────────────────────────────────

/** A copy of a vault item, to attach to a submission. */
export function snapshotVaultItem(item, vaultModuleId) {
  const from = { vaultModuleId, itemId: item.id };
  const base = { id: newItemId(), name: item.name, from };
  if (item.kind === 'note') return { ...base, kind: 'note', html: item.html ?? '', ...(item.article ? { article: true } : {}) };
  if (item.kind === 'link') return { ...base, kind: 'link', url: item.url };
  if (item.kind === 'module') return { ...base, kind: 'module', moduleType: item.moduleType, data: structuredClone(item.data) };
  return { ...base, kind: 'file', mimeType: item.file?.mimeType ?? '', size: item.file?.size ?? 0, dataUrl: item.file?.dataUrl ?? null };
}

/** The vaults you can attach from: this group's, then your own homepage's. */
function vaultsFor(spaceId) {
  const space = getSpace(spaceId);
  const personal = getPersonalSpace();
  const list = (s, where) => (s?.modules ?? []).filter((m) => m.type === 'vault').map((vault) => ({ vault, where }));
  return [...list(space, space?.name), ...(personal && personal.id !== spaceId ? list(personal, 'Your homepage') : [])];
}

/**
 * "Attach from a vault": a searchable list of the files in this space's
 * vaults and your homepage's. `onPick` gets a copy of the chosen item.
 * Also used by the blog's General feed to attach a file to a post.
 */
export function renderVaultPicker({ spaceId, onPick, onClose, title = 'Attach from a vault' }) {
  const vaults = vaultsFor(spaceId);
  const files = vaults.flatMap(({ vault, where }) => (vault.data.items ?? [])
    .filter((item) => item.kind !== 'folder')
    .map((item) => ({ item, vault, where, path: pathTo(vault.data.items, item.parentId).map((f) => f.name) })));
  const search = h('input', { type: 'search', class: 'input input--compact', placeholder: 'Find a file', 'aria-label': 'Find a file in your vaults' });
  const list = h('ul', { class: 'sub-attach__vault-list' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = files.filter((f) => !q || f.item.name.toLowerCase().includes(q));
    replaceChildren(list, shown.length ? shown.map(({ item, vault, where, path }) => h('li', {},
      h('button', {
        type: 'button',
        class: 'sub-attach__vault-item',
        onClick: () => onPick(snapshotVaultItem(item, vault.id)),
      },
        icon(iconForItem(item), 14),
        h('span', { class: 'sub-attach__vault-name' }, item.name),
        h('span', { class: 'sub-attach__vault-where' }, [`${vault.title} · ${where}`, ...path].join(' › ')))))
      : h('li', { class: 'module-empty' }, files.length ? 'No files match.' : 'Your vaults are empty.'));
  };
  search.addEventListener('input', draw);
  draw();
  requestAnimationFrame(() => search.focus());
  return h('div', { class: 'sub-attach__box' },
    h('div', { class: 'sub-attach__box-top' }, h('strong', {}, title), h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: onClose }, icon('close', 14))),
    search, list);
}

/**
 * The row of "add" buttons and the small panel each one opens.
 * `onAdd(item)` gets a ready-to-save attached item.
 */
export function renderAttachChooser({ spaceId, onAdd }) {
  const panel = h('div', { class: 'sub-attach__panel' });
  const fileInput = h('input', {
    type: 'file',
    multiple: true,
    hidden: true,
    onChange: async () => {
      for (const file of [...fileInput.files]) {
        if (file.size > MAX_STORED_FILE_BYTES) {
          showToast(`“${file.name}” is over 1 MB, too big for this prototype. Try a smaller file, or a link.`);
          continue;
        }
        onAdd({ id: newItemId(), kind: 'file', name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, dataUrl: await readFileAsDataUrl(file) });
      }
      fileInput.value = '';
    },
  });

  const open = (content) => replaceChildren(panel, content);
  const close = () => replaceChildren(panel);

  const vaultPicker = () => renderVaultPicker({ spaceId, onPick: (item) => { onAdd(item); close(); }, onClose: close });

  function linkForm() {
    const url = h('input', { type: 'url', class: 'input', placeholder: 'https://…', 'aria-label': 'Web address' });
    const name = h('input', { type: 'text', class: 'input', placeholder: 'Name (optional)', 'aria-label': 'Link name' });
    requestAnimationFrame(() => url.focus());
    return h('form', {
      class: 'sub-attach__box',
      onSubmit: (event) => {
        event.preventDefault();
        const address = url.value.trim();
        if (!/^https?:\/\//i.test(address)) { showToast('Start the address with https://'); url.focus(); return; }
        onAdd({ id: newItemId(), kind: 'link', name: name.value.trim() || address, url: address });
        close();
      },
    }, h('strong', {}, 'Add a link'), url, name, h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Add'),
      h('button', { type: 'button', class: 'link-button', onClick: close }, 'Cancel')));
  }

  function textForm() {
    const text = h('textarea', { class: 'input', rows: '6', placeholder: 'Write your answer here', 'aria-label': 'Your answer' });
    requestAnimationFrame(() => text.focus());
    return h('form', {
      class: 'sub-attach__box',
      onSubmit: (event) => {
        event.preventDefault();
        if (!text.value.trim()) { text.focus(); return; }
        onAdd({ id: newItemId(), kind: 'text', name: 'Written answer', text: text.value.trim() });
        close();
      },
    }, h('strong', {}, 'Write an answer'), text, h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Add'),
      h('button', { type: 'button', class: 'link-button', onClick: close }, 'Cancel')));
  }

  return h('div', { class: 'sub-attach' },
    h('div', { class: 'sub-attach__buttons' },
      h('button', { type: 'button', class: 'button button--small', onClick: () => open(vaultPicker()) }, icon('vault', 14), ' From a vault'),
      h('button', { type: 'button', class: 'button button--small', onClick: () => fileInput.click() }, icon('upload', 14), ' Upload a file'),
      h('button', { type: 'button', class: 'button button--small', onClick: () => open(linkForm()) }, icon('link', 14), ' Add a link'),
      h('button', { type: 'button', class: 'button button--small', onClick: () => open(textForm()) }, icon('pencil', 14), ' Write an answer'),
      fileInput),
    panel);
}

// ─── Showing attached items ──────────────────────────────────────────────────

function iconFor(item) {
  if (item.kind === 'note') return item.article ? 'newspaper' : 'note';
  if (item.kind === 'link') return 'link';
  if (item.kind === 'text') return 'pencil';
  if (item.kind === 'module') return getModuleType(item.moduleType)?.icon ?? 'file';
  return item.mimeType?.startsWith('image/') ? 'image' : 'file';
}

function describe(item) {
  if (item.kind === 'note') return item.article ? 'Article' : 'Note';
  if (item.kind === 'link') return item.url;
  if (item.kind === 'text') return `${item.text.split(/\s+/).length} words`;
  if (item.kind === 'module') return `${getModuleType(item.moduleType)?.label ?? 'Module'} (a copy)`;
  return `${formatBytes(item.size)}${item.dataUrl ? '' : ' · not stored'}`;
}

/** One attached item: icon, name, what it is, Open (and Remove while still a draft). */
export function renderSubmittedItem(item, { onRemove = null } = {}) {
  return h('li', { class: 'sub-item' },
    h('span', { class: 'sub-item__icon' }, icon(iconFor(item), 16)),
    h('span', { class: 'sub-item__text' },
      h('button', { type: 'button', class: 'link-button sub-item__name', onClick: () => openItemViewer(item) }, item.name),
      h('span', { class: 'sub-item__meta' }, describe(item), item.from ? ' · from a vault' : '')),
    onRemove ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: onRemove }, 'Remove') : null);
}

/** Look at an attached item over the page. */
export function openItemViewer(item) {
  const previousFocus = document.activeElement;
  let cleanup = () => {};
  const body = h('div', { class: 'sub-viewer__body' });

  if (item.kind === 'note') body.append(decorateMentions(h('div', { class: 'rich-text__content', html: sanitizeHtml(item.html) })));
  else if (item.kind === 'text') body.append(...item.text.split(/\n{2,}/).map((para) => h('p', {}, renderText(para))));
  else if (item.kind === 'link') body.append(h('p', {}, h('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer' }, item.url, ' ↗')));
  else if (item.kind === 'module') {
    // A read-only copy: the module draws from the snapshot and can't save.
    const moduleType = getModuleType(item.moduleType);
    const me = getCurrentUser();
    const context = {
      moduleId: `snapshot:${item.id}`, spaceId: null, spaceKind: null,
      getData: () => item.data, saveData: () => {},
      members: [], currentUser: me, getMember, can: () => false, role: null, isVisitor: true,
      openFullPage: () => {}, takeFocusRequest: () => null, getLinkedItems: () => [], updateLinkedItem: () => {}, openLinkedItem: () => {},
    };
    cleanup = (moduleType.renderFullPage ?? moduleType.render)(body, context) || (() => {});
  } else if (item.mimeType?.startsWith('image/') && item.dataUrl) {
    body.append(h('img', { class: 'sub-viewer__image', src: item.dataUrl, alt: item.name }));
  } else {
    body.append(h('p', {}, `${item.name} · ${formatBytes(item.size)}. `,
      item.dataUrl ? h('a', { href: item.dataUrl, download: item.name }, 'Download') : 'This file was too big to store in the prototype.'));
  }

  const overlay = h('div', { class: 'sub-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': item.name },
    h('div', { class: 'sub-viewer__panel' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, icon(iconFor(item), 18), ` ${item.name}`),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: close }, icon('close', 18))),
      item.kind === 'module' ? h('p', { class: 'sub-viewer__note' }, 'A copy, as it was when it was attached. Read-only.') : null,
      body));

  function close() {
    cleanup();
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    previousFocus?.focus?.();
  }
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  overlay.querySelector('.icon-button').focus();
}
