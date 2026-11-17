// @ts-check
/**
 * file-preview.js — a document shared from a vault, shown open in a post,
 * so people can start reading it right there in the Feed or on the blog.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ 📄 Rent increase letters: what to do    Note  │
 *   ├───────────────────────────────────────────────┤
 *   │ The first page or so of the document…         │
 *   │ …fading out at the bottom                     │
 *   ├───────────────────────────────────────────────┤
 *   │ Keep reading ↓                       Open ↗   │
 *   └───────────────────────────────────────────────┘
 *
 * "Keep reading" ("Show all" for a table or a board) opens the rest in place (and "Show less" folds it back);
 * "Open" shows it over the page, as before. Short documents show in full
 * with no "Keep reading".
 *
 *   renderMiniPreview(item)  → just the page, small, for a grid tile (or null)
 *   renderFilePreview(item)  → the card, or null when there's nothing to show
 *                              (a link, a file too big to store, a .zip…),
 *                              in which case the post lists it as a row.
 *
 * What gets a preview:
 *   notes                 the note's text
 *   module files          the board, list or calendar itself, read-only
 *   text, Markdown, JSON  the text
 *   CSV / TSV             a table (the first 40 rows; the rest on "Open")
 *   pictures              the picture, at its own shape
 *   PDFs                  the PDF, in the browser's own viewer
 */

import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { sanitizeHtml } from '../../utils/sanitize.js';
import { decorateMentions } from '../../ui/mentions.js';
import { getModuleType } from '../registry.js';
import { getCurrentUser, getMember } from '../../state/store.js';
import { textFromDataUrl, formatBytes } from '../vault/vault-data.js';
import { openItemViewer } from '../submissions/submission-items.js';

const TABLE_ROWS = 40;

/** What kind of preview an attached item gets, or null for none. */
export function previewKind(item) {
  if (item.kind === 'note') return 'note';
  if (item.kind === 'module') return getModuleTypeSafe(item.moduleType) ? 'module' : null;
  if (item.kind !== 'file' || !item.dataUrl) return null;
  const type = (item.mimeType ?? '').toLowerCase();
  const name = (item.name ?? '').toLowerCase();
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type === 'text/csv' || type === 'text/tab-separated-values' || /\.(csv|tsv)$/.test(name)) return 'table';
  if (type.startsWith('text/') || type === 'application/json' || /\.(txt|md|json)$/.test(name)) return 'text';
  return null;
}

function getModuleTypeSafe(type) {
  try { return getModuleType(type); } catch { return null; }
}

function labelFor(item, kind) {
  if (kind === 'note') return item.article ? 'Article' : 'Note';
  if (kind === 'module') return getModuleTypeSafe(item.moduleType)?.label ?? 'Module file';
  if (kind === 'pdf') return `PDF · ${formatBytes(item.size)}`;
  if (kind === 'table') return `Spreadsheet · ${formatBytes(item.size)}`;
  if (kind === 'image') return `Picture · ${formatBytes(item.size)}`;
  return `Text · ${formatBytes(item.size)}`;
}

function iconFor(item, kind) {
  if (kind === 'note') return item.article ? 'newspaper' : 'note';
  if (kind === 'module') return getModuleTypeSafe(item.moduleType)?.icon ?? 'file';
  if (kind === 'image') return 'image';
  if (kind === 'table') return 'table';
  return 'file';
}

export function renderFilePreview(item) {
  const kind = previewKind(item);
  if (!kind) return null;

  let body;
  try {
    body = renderBody(item, kind);
  } catch {
    return null; // a file we can't read falls back to a plain row
  }

  // Pictures and PDFs show whole (a PDF scrolls inside its own viewer);
  // everything else is clipped until "Keep reading".
  const clips = kind !== 'image' && kind !== 'pdf';
  const page = h('div', { class: `file-preview__page file-preview__page--${kind}${clips ? ' is-clipped' : ''}` }, body);
  // Words are read, tables and boards are looked over.
  const moreLabel = kind === 'note' || kind === 'text' ? 'Keep reading ↓' : 'Show all ↓';
  const more = h('button', { type: 'button', class: 'link-button file-preview__more', 'aria-expanded': 'false', hidden: true }, moreLabel);

  more.addEventListener('click', () => {
    const open = page.classList.toggle('is-clipped') === false;
    more.textContent = open ? 'Show less ↑' : moreLabel;
    more.setAttribute('aria-expanded', String(open));
    if (!open) card.scrollIntoView({ block: 'nearest' });
  });

  // Only offer "Keep reading" when there is more than fits.
  if (clips && typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => {
      if (!page.isConnected) return;
      if (page.classList.contains('is-clipped')) {
        const overflows = page.scrollHeight > page.clientHeight + 4;
        more.hidden = !overflows;
        page.classList.toggle('is-short', !overflows);
      }
    });
    observer.observe(page);
    if (body instanceof Element) observer.observe(body);
  }

  const card = h('figure', { class: `file-preview${item.article ? ' file-preview--article' : ''}`, 'data-preview': kind },
    h('figcaption', { class: 'file-preview__top' },
      h('span', { class: 'file-preview__icon' }, icon(iconFor(item, kind), 16)),
      h('span', { class: 'file-preview__name' }, item.name),
      h('span', { class: 'file-preview__kind' }, labelFor(item, kind))),
    page,
    h('div', { class: 'file-preview__bottom' },
      more,
      h('span', { class: 'file-preview__spacer' }),
      item.kind === 'file' ? h('a', { class: 'link-button file-preview__download', href: item.dataUrl, download: item.name }, 'Download') : null,
      h('button', { type: 'button', class: 'link-button file-preview__open', onClick: () => openItemViewer(item) }, 'Open ↗')));
  return card;
}

/**
 * Just the document itself, small, for a grid tile (feed-layouts.js): the
 * note's text, a text file, a table, or a board, as a little page. Null for
 * a PDF or anything it can't show.
 */
export function renderMiniPreview(item) {
  const kind = previewKind(item);
  if (!kind || kind === 'pdf' || kind === 'image') return null;
  try {
    return h('div', { class: `file-mini file-mini--${kind}`, 'aria-hidden': 'true', inert: '' }, renderBody(item, kind));
  } catch {
    return null;
  }
}

function renderBody(item, kind) {
  if (kind === 'note') {
    return decorateMentions(h('div', { class: 'rich-text__content file-preview__note', html: sanitizeHtml(item.html ?? '') }));
  }
  if (kind === 'text') {
    return h('pre', { class: 'file-preview__text' }, textFromDataUrl(item.dataUrl));
  }
  if (kind === 'table') {
    const text = textFromDataUrl(item.dataUrl);
    const separator = item.mimeType === 'text/tab-separated-values' || /\.tsv$/i.test(item.name) ? '\t' : ',';
    const rows = parseDelimited(text, separator).filter((row) => row.some((cell) => cell.trim()));
    const [head = [], ...rest] = rows;
    const shown = rest.slice(0, TABLE_ROWS);
    return h('div', { class: 'file-preview__table-wrap' },
      h('table', { class: 'file-preview__table' },
        h('thead', {}, h('tr', {}, head.map((cell) => h('th', { scope: 'col' }, cell)))),
        h('tbody', {}, shown.map((row) => h('tr', {}, head.map((_, i) => h('td', {}, row[i] ?? '')))))),
      rest.length > TABLE_ROWS ? h('p', { class: 'file-preview__note-line' }, `${rest.length - TABLE_ROWS} more rows. Open it to see them all.`) : null);
  }
  if (kind === 'image') {
    return h('img', { class: 'file-preview__image', src: item.dataUrl, alt: item.name, loading: 'lazy' });
  }
  if (kind === 'pdf') {
    // Browsers won't show a data: PDF in a frame, so hand it over as a blob.
    const frame = h('iframe', { class: 'file-preview__pdf', title: item.name, loading: 'lazy' });
    fetch(item.dataUrl).then((response) => response.blob())
      .then((blob) => { frame.src = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })); })
      .catch(() => frame.replaceWith(h('p', { class: 'file-preview__note-line' }, 'This PDF couldn’t be shown here. Try Download.')));
    return frame;
  }
  // A module file: the module itself, drawn read-only from the copy.
  const moduleType = getModuleType(item.moduleType);
  // inert: it's for looking at here (no ticking boxes in someone's copy);
  // "Open" shows it larger.
  const holder = h('div', { class: 'file-preview__module', inert: '' });
  const context = {
    moduleId: `snapshot:${item.id}`, spaceId: null, spaceKind: null,
    getData: () => item.data, saveData: () => {},
    members: [], currentUser: getCurrentUser(), getMember, can: () => false, role: null, isVisitor: true,
    openFullPage: () => openItemViewer(item), takeFocusRequest: () => null,
    getLinkedItems: () => [], updateLinkedItem: () => {}, openLinkedItem: () => {},
  };
  moduleType.render(holder, context);
  return holder;
}

/** Split CSV (or TSV) text into rows of cells, minding "quoted, cells". */
export function parseDelimited(text, separator = ',') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === separator) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
