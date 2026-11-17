// @ts-check
/**
 * recents-modules.js — two modules for your personal homepage.
 *
 * Recent groups: your groups, the one you opened most recently first, with
 * what's new in each and its next event.
 *
 *   (JT) Juniper Tenants Union    2 new posts · 1 unread in chat
 *        Visited 2 hours ago · Next: General meeting, Tue
 *   (PL) Porch Lights             Nothing new · visited yesterday
 *   Find more groups →
 *
 * Recents: anything you've opened lately (groups and homepages, a module's
 * full page, events, blogs, conversations), newest first, with chips to
 * narrow it down and Clear history (with Undo). From js/state/recents.js.
 *
 *   [All] [Groups & homepages] [Pages] [Events] [Blogs] [Messages]
 *   (JT) Juniper Tenants Union          Tenants union · 5 min ago
 *   ▤    Heat log                       Forum · Juniper Tenants… · 1 hour ago
 *   🎟    Thanksgiving dinner             Thu, Nov 26 · Larsen Family · yesterday
 *
 * Data: Recent groups {} · Recents { filter: 'all' | kind } (the chip you
 * picked, so the card remembers it).
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { showToast } from '../../ui/toast.js';
import { groupInitials } from '../../utils/initials.js';
import { timeAgo, formatShortDate } from '../../utils/dates.js';
import { spaceHref } from '../../router.js';
import { eventHref } from '../../events/event-details.js';
import { groupUpdates } from '../dashboard/dashboard-data.js';
import { getRecents, clearRecents, restoreRecents, RECENT_KINDS } from '../../state/recents.js';

const CARD_GROUPS = 6;
const CARD_RECENTS = 8;

export const recentGroupsModule = {
  type: 'recentgroups',
  label: 'Recent groups',
  description: 'Your groups, the one you opened last first, with what’s new in each',
  icon: 'people',
  defaultSpan: 4,
  defaultRows: 12,
  available: true,
  spaceKinds: ['personal'],
  createInitialData: () => ({}),
  render: (container, context) => renderRecentGroups(container, context, false),
  renderFullPage: (container, context) => renderRecentGroups(container, context, true),
};

export const recentsModule = {
  type: 'recents',
  label: 'Recents',
  description: 'Anything you’ve opened lately: groups, pages, events, blogs, and messages',
  icon: 'clock',
  defaultSpan: 4,
  defaultRows: 12,
  available: true,
  spaceKinds: ['personal'],
  createInitialData: () => ({ filter: 'all' }),
  render: (container, context) => renderRecents(container, context, false),
  renderFullPage: (container, context) => renderRecents(container, context, true),
};

// ─── Recent groups ───────────────────────────────────────────────────────────

function renderRecentGroups(container, context, isFullPage) {
  const updates = groupUpdates(context.currentUser);
  if (updates.length === 0) {
    replaceChildren(container, h('p', { class: 'module-empty' }, 'You’re not in any groups yet. ', h('a', { href: '#groups-explore' }, 'Find one to join'), '.'));
    return;
  }
  const shown = isFullPage ? updates : updates.slice(0, CARD_GROUPS);
  replaceChildren(container, h('div', { class: `recents${isFullPage ? ' recents--page' : ''}` },
    h('ul', { class: 'recents__list' }, shown.map((update) => {
      const { space, lastVisit, nextEvent } = update;
      const news = [
        update.newPosts && `${update.newPosts} new ${update.newPosts === 1 ? 'announcement' : 'announcements'}`,
        update.newThreads && `${update.newThreads} new ${update.newThreads === 1 ? 'thread' : 'threads'}`,
        update.newFeedPosts && `${update.newFeedPosts} new ${update.newFeedPosts === 1 ? 'post' : 'posts'}`,
        update.unreadChat && `${update.unreadChat} unread in chat`,
      ].filter(Boolean);
      return h('li', { class: 'recents__row' },
        h('span', { class: 'groups-menu__badge recents__badge', 'aria-hidden': 'true' }, groupInitials(space.name)),
        h('span', { class: 'recents__text' },
          h('a', { class: 'recents__title', href: spaceHref(space.id) }, space.name),
          news.length ? h('span', { class: 'recents__news' }, news.join(' · ')) : null,
          h('span', { class: 'recents__meta' },
            lastVisit ? `Visited ${timeAgo(lastVisit)}` : 'Not visited yet',
            nextEvent ? [' · Next: ', h('a', { href: eventHref(nextEvent.event.id) }, nextEvent.event.title), `, ${formatShortDate(nextEvent.date)}`] : null)));
    })),
    !isFullPage && updates.length > CARD_GROUPS
      ? h('button', { type: 'button', class: 'link-button recents__more', onClick: () => context.openFullPage() }, `All ${updates.length} groups →`)
      : h('a', { class: 'recents__more', href: '#groups-explore' }, 'Find more groups →')));
}

// ─── Recents ─────────────────────────────────────────────────────────────────

function renderRecents(container, context, isFullPage) {
  const me = context.currentUser;
  const data = context.getData() ?? {};
  let filter = data.filter ?? 'all';

  function draw() {
    const all = getRecents(me.id);
    const items = filter === 'all' ? all : all.filter((r) => r.kind === filter);
    const shown = isFullPage ? items : items.slice(0, CARD_RECENTS);
    const kindsPresent = new Set(all.map((r) => r.kind));

    replaceChildren(container, h('div', { class: `recents${isFullPage ? ' recents--page' : ''}` },
      all.length ? h('div', { class: 'recents__chips', role: 'group', 'aria-label': 'Show' },
        RECENT_KINDS.filter((k) => k.id === 'all' || kindsPresent.has(k.id)).map((k) => h('button', {
          type: 'button',
          class: `chip${filter === k.id ? ' is-active' : ''}`,
          'aria-pressed': String(filter === k.id),
          onClick: () => {
            filter = k.id;
            if (!context.isVisitor) context.saveData({ ...data, filter });
            draw();
          },
        }, k.label))) : null,
      shown.length === 0
        ? h('p', { class: 'module-empty' }, all.length ? 'Nothing of that kind lately.' : 'Things you open, like groups, events, pages, blogs, and conversations, will show up here.')
        : h('ul', { class: 'recents__list' }, shown.map(renderItem)),
      h('div', { class: 'recents__footer' },
        !isFullPage && items.length > CARD_RECENTS
          ? h('button', { type: 'button', class: 'link-button recents__more', onClick: () => context.openFullPage() }, `See all ${items.length} →`)
          : h('span'),
        all.length ? h('button', {
          type: 'button',
          class: 'link-button recents__clear',
          onClick: () => {
            const old = clearRecents(me.id);
            draw();
            showToast('Cleared your recent history.', { actionLabel: 'Undo', onAction: () => { restoreRecents(me.id, old); draw(); } });
          },
        }, 'Clear history') : null)));
  }

  function renderItem(item) {
    const leading = item.kind === 'space' && item.space.kind === 'group'
      ? h('span', { class: 'groups-menu__badge recents__badge', 'aria-hidden': 'true' }, groupInitials(item.title))
      : item.member ? avatar(item.member, 26)
        : h('span', { class: 'recents__icon', 'aria-hidden': 'true' },
          icon({ space: 'home', module: 'expand', event: 'ticket', blog: 'globe', conversation: 'chat' }[item.kind] ?? 'clock', 15));
    return h('li', { class: 'recents__row' },
      leading,
      h('span', { class: 'recents__text' },
        h('a', { class: 'recents__title', href: item.href }, item.title),
        h('span', { class: 'recents__meta' }, `${item.detail} · ${timeAgo(item.at)}`)));
  }

  draw();
}
