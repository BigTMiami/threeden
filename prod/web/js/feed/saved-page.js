// @ts-check
/**
 * saved-page.js — Home ▾ → Saved (#saved): what you saved for later from
 * the Feed's "…" menu or an event page, newest first. Only you see it.
 *
 *   Saved
 *   (All) (Posts) (Events)
 *   🔖 Porch Lights at the Juniper Street Fair   Porch Lights · Dec 7      [Open] [Remove]
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { timeAgo, formatShortDate } from '../utils/dates.js';
import { getCurrentUser } from '../state/store.js';
import { savedOf, removeSaved } from '../state/saved.js';
import { findEvent } from '../state/events.js';

let filter = 'all';

export function renderSavedPage(container) {
  const me = getCurrentUser();
  const redraw = () => renderSavedPage(container);
  const all = savedOf(me.id);
  const items = filter === 'events' ? all.filter((s) => s.kind === 'event') : filter === 'posts' ? all.filter((s) => s.kind !== 'event') : all;
  const chip = (id, label) => h('button', { type: 'button', class: `chip feed-filters__chip${filter === id ? ' is-on' : ''}`, 'aria-pressed': String(filter === id), onClick: () => { filter = id; redraw(); } }, label);

  replaceChildren(container,
    h('header', { class: 'settings-page__header' }, h('h1', { class: 'settings-page__title' }, 'Saved')),
    all.length ? h('div', { class: 'feed-filters saved__filters' }, chip('all', 'All'), chip('posts', 'Posts'), chip('events', 'Events')) : null,
    !all.length
      ? h('div', { class: 'empty-state' },
        h('span', { class: 'empty-state__icon', 'aria-hidden': 'true' }, icon('bookmark', 28)),
        h('p', { class: 'empty-state__title' }, 'Nothing saved yet'),
        h('p', {}, 'Use “Save for later” in a post’s ⋯ menu, or Save on an event page, and it waits for you here.'),
        h('a', { class: 'button', href: '#feed' }, 'Go to the Feed'))
      : h('ul', { class: 'saved__list' }, items.map((entry) => {
        const event = entry.kind === 'event' ? findEvent(entry.eventId ?? entry.key)?.event : null;
        return h('li', { class: 'saved__row' },
          h('span', { class: 'saved__icon', 'aria-hidden': 'true' }, icon(entry.kind === 'event' ? 'ticket' : entry.kind === 'thread' ? 'forum' : 'bookmarkFilled', 18)),
          h('div', { class: 'saved__text' },
            h('a', { class: 'saved__title', href: entry.href }, entry.title),
            h('span', { class: 'saved__meta' }, [entry.where, event ? formatShortDate(event.date) : null, `saved ${timeAgo(entry.savedAt)}`].filter(Boolean).join(' · '))),
          h('a', { class: 'button button--small', href: entry.href }, 'Open'),
          h('button', { type: 'button', class: 'link-button', onClick: () => { removeSaved(me.id, entry.key); redraw(); } }, 'Remove'));
      })));
  window.scrollTo(0, 0);
}
