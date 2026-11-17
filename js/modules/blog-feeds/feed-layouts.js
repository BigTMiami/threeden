/**
 * feed-layouts.js — how a General feed shows its posts: as a list or a
 * grid where every post, whatever it holds, gets the same size and shape.
 *
 *   List                                     Grid
 *   ┌────┐ Finally drew up plans for…        ┌──────┐┌──────┐┌──────┐
 *   │ 📷 │ my pedalboard. Anyone have…       │photo ││ Aa   ││ NOV  │
 *   └────┘ 3 days ago · Photo · ♥ 2 · 💬 1   │      ││ text ││  20  │
 *   ┌────┐ Fixing bikes at the pantry…       └──────┘└──────┘└──────┘
 *   │NOV │ Event · Free bike repair
 *   └────┘
 *
 * Each post becomes a summary (summarize): its first picture, or for a post
 * without one, what it is (an event's date, a document's first lines, a
 * link, a poll, or the words themselves). Tapping one opens the whole post
 * over the page (photo-viewer.js), with ‹ › to the next.
 *
 * The person who owns the feed picks the layout from "Layout" above it,
 * and it's saved on the module, so visitors see the same:
 *
 *   data.display = {
 *     layout: 'list' | 'grid',
 *     columns: 2 | 3 | 4,                         ← grid
 *     shape: 'square' | 'tall' | 'wide',          ← grid tiles: 1:1, 4:5, 4:3
 *     thumb: 'small' | 'medium' | 'large',        ← list pictures: 56, 88, 128 px
 *     lines: 2 | 3 | 5,                           ← list: lines of text
 *   }
 */

import { liveItem } from '../../ui/file-access.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { timeAgo } from '../../utils/dates.js';
import { findEvent } from '../../state/events.js';
import { getReactions } from '../../state/reactions.js';
import { eventCoverStyle } from '../../events/event-cover.js';
import { textFromDataUrl } from '../vault/vault-data.js';
import { postKey } from './feed-data.js';
import { renderMiniPreview } from './file-preview.js';

export const DISPLAY_DEFAULTS = { layout: 'grid', columns: 3, shape: 'square', thumb: 'medium', lines: 3 };

export function displayOf(data) {
  return { ...DISPLAY_DEFAULTS, ...(data?.display ?? {}) };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Text without markup, for a preview. */
function plain(html) {
  const div = document.createElement('div');
  div.innerHTML = html ?? '';
  return div.textContent.replace(/\s+/g, ' ').trim();
}

/**
 * What a post is, at a glance:
 *   { kind, label, iconName, image, video, date: { month, day }, cover, title, text, count }
 */
export function summarize(post) {
  const text = post.text.replace(/\s+/g, ' ').trim();
  const media = post.media ?? [];
  const attachments = post.attachments ?? [];
  const base = { text, count: media.length };
  const firstImage = media.find((m) => m.kind === 'image');
  if (media.length) {
    const video = media[0].kind === 'video' ? media[0] : null;
    return { ...base, kind: video ? 'video' : 'photo', label: video ? 'Video' : media.length > 1 ? `${media.length} photos` : 'Photo', iconName: 'image', image: firstImage?.src ?? null, video: video?.src ?? null };
  }
  const first = attachments[0];
  if (first?.kind === 'event') {
    const event = findEvent(first.eventId)?.event;
    const [, month, day] = (event?.date ?? '').split('-');
    return {
      ...base, kind: 'event', label: 'Event', iconName: 'calendar', title: event?.title ?? 'An event',
      date: event ? { month: MONTHS[Number(month) - 1], day: Number(day) } : null, cover: event ? eventCoverStyle(event) : null,
    };
  }
  if (first?.kind === 'file') {
    // Shared to comment on or edit: the tile shows the file as it is now (file-access.js).
    const live = first.access && first.access !== 'view' ? liveItem(first.item.from)?.item : null;
    const item = live ? { ...first.item, html: live.html ?? first.item.html, data: live.data ?? first.item.data, name: live.name } : first.item;
    if (item.kind === 'file' && item.mimeType?.startsWith('image/') && item.dataUrl) {
      return { ...base, kind: 'photo', label: 'Picture', iconName: 'image', image: item.dataUrl, title: item.name };
    }
    let snippet = '';
    if (item.kind === 'note') snippet = plain(item.html);
    else if (item.kind === 'file' && item.dataUrl && /^text\/|json|csv/.test(item.mimeType ?? '')) {
      try { snippet = textFromDataUrl(item.dataUrl).replace(/\s+/g, ' ').trim(); } catch { snippet = ''; }
    }
    const isArticle = item.kind === 'note' && item.article;
    return { ...base, kind: 'file', item, label: isArticle ? 'Article' : item.kind === 'note' ? 'Note' : item.kind === 'module' ? 'Module file' : 'File', iconName: isArticle ? 'newspaper' : item.kind === 'note' ? 'note' : 'file', title: item.name, snippet: snippet.slice(0, 300) };
  }
  if (first?.kind === 'link') {
    let host = '';
    try { host = new URL(first.url).hostname.replace(/^www\./, ''); } catch { host = ''; }
    return { ...base, kind: 'link', label: 'Link', iconName: 'link', title: first.name || first.url, snippet: host };
  }
  if (first?.kind === 'poll') {
    return { ...base, kind: 'poll', label: 'Poll', iconName: 'list', title: first.poll?.question ?? 'A poll' };
  }
  return { ...base, kind: 'text', label: 'Post', iconName: 'note' };
}

/** The picture part of a tile or row: the same box for every kind of post. */
function visual(summary, { big = false } = {}) {
  if (summary.image) return h('img', { class: 'feed-layout__img', src: summary.image, alt: '', loading: 'lazy' });
  if (summary.video) return h('video', { class: 'feed-layout__img', src: summary.video, muted: true, preload: 'metadata' });
  if (summary.kind === 'event') {
    return h('span', { class: 'feed-layout__visual feed-layout__visual--event', style: summary.cover ?? null },
      summary.date ? h('span', { class: 'feed-layout__date' }, h('span', {}, summary.date.month), h('strong', {}, String(summary.date.day))) : icon('calendar', 22));
  }
  if (summary.kind === 'text') {
    // Words only: the words are the picture (in the grid); a quote mark in the list.
    return big
      ? h('span', { class: 'feed-layout__visual feed-layout__visual--words' }, h('span', { class: 'feed-layout__words' }, summary.text))
      : h('span', { class: 'feed-layout__visual feed-layout__visual--quote', 'aria-hidden': 'true' }, '“');
  }
  // A document in a tile: the page itself, small, fading out at the bottom.
  const mini = big && summary.kind === 'file' && summary.item ? renderMiniPreview(summary.item) : null;
  if (mini) {
    // Centered, like a sheet of paper on a desk; the name strip below says what it is.
    return h('span', { class: `feed-layout__visual feed-layout__visual--doc${summary.item.article ? ' is-article' : ''}` },
      h('span', { class: 'feed-layout__page' }, mini));
  }
  return h('span', { class: `feed-layout__visual feed-layout__visual--${summary.kind}` },
    icon(summary.iconName, big ? 28 : 20),
    big && summary.title ? h('span', { class: 'feed-layout__visual-title' }, summary.title) : null,
    big && summary.snippet ? h('span', { class: 'feed-layout__visual-snippet' }, summary.snippet) : null);
}

function countsLine(post) {
  const { likes, comments } = getReactions(postKey(post.id));
  return [likes.length ? `♥ ${likes.length}` : null, comments.length ? `💬 ${comments.length}` : null].filter(Boolean);
}

/**
 * The posts, laid out. options: { posts, display, onOpen(index), limit, decorate(el, post) }
 * (limit: the card shows a few; the full page shows them all; decorate: e.g. make it draggable, feed-move.js).
 */
export function renderLayout({ posts, display, onOpen, limit = Infinity, decorate = (el) => el }) {
  const shown = posts.slice(0, limit);
  if (display.layout === 'grid') {
    return h('div', {
      class: `feed-layout feed-layout--grid feed-layout--${display.shape}`,
      style: { '--feed-columns': String(display.columns) },
    }, shown.map((post, index) => {
      const summary = summarize(post);
      const caption = summary.kind === 'text' ? '' : summary.title || summary.text;
      return decorate(h('button', {
        type: 'button', class: `feed-tile feed-tile--${summary.kind}`,
        'aria-label': `Open post: ${(summary.title || summary.text || summary.label).slice(0, 80)}`,
        onClick: () => onOpen(index),
      },
      visual(summary, { big: true }),
      h('span', { class: 'feed-tile__badge', 'aria-hidden': 'true' }, icon(summary.iconName, 12), summary.count > 1 ? ` ${summary.count}` : null),
      caption && (summary.image || summary.video || summary.kind === 'event') ? h('span', { class: 'feed-tile__caption' }, caption) : null,
      summary.kind === 'file' && summary.item && summary.title ? h('span', { class: 'feed-tile__docname' }, icon(summary.iconName, 12), h('span', { class: 'feed-tile__docname-text' }, summary.title)) : null), post);
    }));
  }
  return h('ul', {
    class: `feed-layout feed-layout--list feed-layout--thumb-${display.thumb}`,
    style: { '--feed-lines': String(display.lines) },
  }, shown.map((post, index) => {
    const summary = summarize(post);
    const heading = summary.title && summary.title !== summary.text ? summary.title : null;
    const body = summary.text || summary.snippet || '';
    return h('li', {},
      decorate(h('button', { type: 'button', class: `feed-row feed-row--${summary.kind}`, onClick: () => onOpen(index) },
        h('span', { class: 'feed-row__thumb' }, visual(summary)),
        h('span', { class: 'feed-row__body' },
          heading ? h('span', { class: 'feed-row__title' }, heading) : null,
          body ? h('span', { class: 'feed-row__text' }, body) : null,
          h('span', { class: 'feed-row__meta' }, [timeAgo(post.createdAt), summary.label, { friends: 'Friends only', members: 'Members only' }[post.audience], ...countsLine(post)].filter(Boolean).join(' · ')))), post));
  }));
}

/**
 * "Layout" for the feed's owner: list or grid, and the sizes. Changes save
 * right away (onChange gets the new display).
 */
export function renderLayoutControls(display, onChange, { open = false, onToggle = () => {} } = {}) {
  const panel = h('div', { class: 'feed-layout-controls__panel', hidden: !open });
  const toggle = h('button', {
    type: 'button', class: 'link-button feed-layout-controls__toggle', 'aria-expanded': String(open),
    onClick: () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      onToggle(!panel.hidden);
    },
  }, icon(display.layout === 'grid' ? 'dashboard' : 'list', 14), ` Layout: ${display.layout === 'grid' ? 'Grid' : 'List'}`);

  const segmented = (label, options, value, key) => h('div', { class: 'feed-layout-controls__row' },
    h('span', { class: 'feed-layout-controls__label' }, label),
    h('div', { class: 'segmented', role: 'group', 'aria-label': label }, options.map(([id, text]) => h('button', {
      type: 'button', class: `segmented__option${id === value ? ' is-active' : ''}`, 'aria-pressed': String(id === value),
      onClick: () => onChange({ ...display, [key]: id }),
    }, text))));

  replaceChildren(panel,
    segmented('Show as', [['list', 'List'], ['grid', 'Grid']], display.layout, 'layout'),
    display.layout === 'grid' ? [
      segmented('Columns', [[2, '2'], [3, '3'], [4, '4']], display.columns, 'columns'),
      segmented('Shape', [['square', 'Square'], ['tall', 'Tall'], ['wide', 'Wide']], display.shape, 'shape'),
    ] : [
      segmented('Pictures', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], display.thumb, 'thumb'),
      segmented('Text', [[2, '2 lines'], [3, '3 lines'], [5, '5 lines']], display.lines, 'lines'),
    ],
    h('p', { class: 'feed-layout-controls__hint' }, 'Every post gets the same size and shape. Visitors see it this way too.'));
  return h('div', { class: 'feed-layout-controls' }, toggle, panel);
}
