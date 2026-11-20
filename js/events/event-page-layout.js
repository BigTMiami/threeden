// @ts-check
/**
 * event-page-layout.js — hosts arranging their event's page, the way a
 * homepage or blog is arranged: move sections up and down, hide the ones
 * they don't need, and add their own.
 *
 * Saved on the event as `page` (missing = the usual order):
 *
 *   {
 *     order: ['rsvp', 'facts', 'b-1', 'about', …],   ← built-in sections and blocks, top to bottom
 *     hidden: ['guests'],                           ← built-in sections taken off the page
 *     blocks: [                                     ← sections the host added
 *       { id, kind: 'text', title, body },
 *       { id, kind: 'schedule', title, items: [{ time: '7:00', what: 'Doors' }] },
 *       { id, kind: 'links', title, links: [{ label, url }] },
 *       { id, kind: 'photos', title, media: [{ kind: 'image', src } | { kind: 'video', src }] },
 *     ],
 *   }
 *
 *   normalizePage(page)           with every built-in section placed
 *   BLOCK_KINDS, SECTION_LABELS
 *   renderBlock(block)            a block, for everyone
 *   renderBlockEditor(block, onSave)   its fields, while customizing
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { makeId } from '../ui/dom.js';
import { renderText } from '../ui/text.js';
import { mediaAttacher, renderMediaList } from '../ui/media-attach.js';

/** The built-in sections, in their usual order. */
export const SECTION_LABELS = {
  poll: 'Time poll',
  rsvp: 'Are you going?',
  facts: 'Where, host, and calendar',
  about: 'About',
  skips: 'Skipped dates',
  after: 'After the event',
  guests: 'Guests',
  bring: 'Bring a friend',
  notes: 'Meeting notes',
};
const BUILT_IN = Object.keys(SECTION_LABELS);
/** These always show (answering is the point of the page). */
export const ALWAYS_SHOWN = ['rsvp'];

export const BLOCK_KINDS = [
  { kind: 'text', label: 'Text', icon: 'note', hint: 'A paragraph: what to bring, parking, the dress code' },
  { kind: 'schedule', label: 'Schedule', icon: 'clock', hint: 'Times and what happens: doors, sets, dinner' },
  { kind: 'links', label: 'Links', icon: 'link', hint: 'Tickets, a playlist, a map, a registry' },
  { kind: 'photos', label: 'Photos and videos', icon: 'image', hint: 'The venue, last year, the lineup' },
];

export function normalizePage(page = {}) {
  const blocks = page?.blocks ?? [];
  const known = [...BUILT_IN, ...blocks.map((b) => b.id)];
  const order = (page?.order ?? []).filter((id) => known.includes(id));
  // Anything missing from the order goes where it usually is (blocks at the end).
  for (const id of known) {
    if (order.includes(id)) continue;
    const usual = BUILT_IN.indexOf(id);
    if (usual === -1) { order.push(id); continue; }
    const after = BUILT_IN.slice(0, usual).reverse().find((before) => order.includes(before));
    order.splice(after ? order.indexOf(after) + 1 : 0, 0, id);
  }
  return { order, hidden: (page?.hidden ?? []).filter((id) => !ALWAYS_SHOWN.includes(id)), blocks };
}

export function newBlock(kind) {
  const base = { id: makeId('b'), kind, title: BLOCK_KINDS.find((k) => k.kind === kind)?.label ?? 'Section' };
  if (kind === 'text') return { ...base, title: 'Good to know', body: '' };
  if (kind === 'schedule') return { ...base, items: [{ time: '', what: '' }] };
  if (kind === 'links') return { ...base, links: [{ label: '', url: '' }] };
  return { ...base, media: [] };
}

const safeUrl = (url) => (/^https?:\/\//i.test(url) ? url : /^[\w.-]+\.[a-z]{2,}/i.test(url) ? `https://${url}` : null);

export function renderBlock(block) {
  let body = null;
  if (block.kind === 'text') body = block.body ? h('p', { class: 'event-page__notes' }, renderText(block.body)) : null;
  if (block.kind === 'schedule') {
    const items = (block.items ?? []).filter((i) => i.time || i.what);
    body = items.length ? h('ol', { class: 'event-block__schedule' }, items.map((i) => h('li', {}, h('span', { class: 'event-block__time' }, i.time), h('span', {}, i.what)))) : null;
  }
  if (block.kind === 'links') {
    const links = (block.links ?? []).filter((l) => safeUrl(l.url));
    body = links.length ? h('ul', { class: 'event-block__links' }, links.map((l) => h('li', {},
      h('a', { href: safeUrl(l.url), target: '_blank', rel: 'noopener noreferrer' }, icon('link', 14), ` ${l.label || l.url}`)))) : null;
  }
  if (block.kind === 'photos') body = renderMediaList(block.media ?? []);
  if (!body) return null;
  return h('section', { class: `event-page__block event-block--${block.kind}` },
    block.title ? h('h2', { class: 'event-page__section-title' }, block.title) : null,
    body);
}

/** A block's fields while customizing. onSave(changes) saves them. */
export function renderBlockEditor(block, onSave) {
  const title = h('input', { type: 'text', class: 'input input--compact event-block__title-input', value: block.title ?? '', placeholder: 'Section title', 'aria-label': 'Section title', onChange: (e) => onSave({ title: e.target.value.trim() }) });
  let fields = null;
  if (block.kind === 'text') {
    const body = h('textarea', { class: 'input', rows: '4', placeholder: 'Write something for your guests', 'aria-label': 'Text', onChange: (e) => onSave({ body: e.target.value }) });
    body.value = block.body ?? '';
    fields = body;
  }
  if (block.kind === 'schedule' || block.kind === 'links') {
    const isSchedule = block.kind === 'schedule';
    const key = isSchedule ? 'items' : 'links';
    const rows = [...(block[key] ?? [])];
    const save = () => onSave({ [key]: rows.filter((r) => Object.values(r).some(Boolean)) });
    fields = h('div', { class: 'event-block__rows' },
      rows.map((row, i) => h('div', { class: 'form-row event-block__row' },
        h('input', {
          type: 'text', class: `input input--compact ${isSchedule ? 'event-block__time-input' : ''}`, value: isSchedule ? row.time : row.label,
          placeholder: isSchedule ? '7:00pm' : 'Tickets', 'aria-label': isSchedule ? 'Time' : 'Link name',
          onChange: (e) => { rows[i] = { ...rows[i], [isSchedule ? 'time' : 'label']: e.target.value.trim() }; save(); },
        }),
        h('input', {
          type: 'text', class: 'input input--compact event-block__wide', value: isSchedule ? row.what : row.url,
          placeholder: isSchedule ? 'Doors open' : 'https://…', 'aria-label': isSchedule ? 'What happens' : 'Link address',
          onChange: (e) => { rows[i] = { ...rows[i], [isSchedule ? 'what' : 'url']: e.target.value.trim() }; save(); },
        }),
        h('button', { type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': 'Remove this row', onClick: () => { rows.splice(i, 1); onSave({ [key]: rows }, { redraw: true }); } }, icon('close', 14)))),
      h('button', { type: 'button', class: 'link-button', onClick: () => onSave({ [key]: [...rows, isSchedule ? { time: '', what: '' } : { label: '', url: '' }] }, { redraw: true }) }, icon('plus', 13), isSchedule ? ' Add a time' : ' Add a link'));
  }
  if (block.kind === 'photos') {
    const media = mediaAttacher({ label: 'Add photos or videos', initial: block.media ?? [] });
    // Save whenever the chosen items change.
    const observer = new MutationObserver(() => onSave({ media: media.read() }));
    observer.observe(media.slot, { childList: true });
    fields = h('div', {}, media.slot, media.button);
  }
  return h('div', { class: 'event-block__editor' }, title, fields);
}
