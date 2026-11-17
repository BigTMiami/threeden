// @ts-check
/**
 * tag-page.js — everything with one hashtag (#tag-<name>), and the topics
 * around it.
 *
 *   #tenantrights                                   [Follow]
 *   7 posts from public blogs and your groups
 *   ┌──────────────────────────────────────────┐
 *   │ (PN) Priya Nair · Priya’s blog · 3h      │
 *   │ Crestline agreed to meet… #tenantrights  │
 *   └──────────────────────────────────────────┘
 *   Other topics: #mutualaid 4 · #organizing 2 · …
 *
 * Following a tag brings matching posts from public blogs into your Feed.
 * Group posts only show here for the group's own members.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { renderText } from '../ui/text.js';
import { getCurrentUser, getMember } from '../state/store.js';
import { collectTagged, popularTags, isFollowingTag, toggleFollowTag, followedTags } from '../state/tags.js';
import { timeAgo } from '../utils/dates.js';
import { blogHref } from '../router.js';
import { isMuted } from '../state/blocks.js';

export function renderTagPage(container, tag) {
  const me = getCurrentUser();
  const name = decodeURIComponent(tag).toLowerCase();
  const items = collectTagged(name, me).filter((i) => !isMuted(me.id, i.authorId));
  const following = isFollowingTag(me.id, name);
  const others = popularTags(me, 14).filter((t) => t.tag !== name);
  const mine = followedTags(me.id).filter((t) => t !== name);

  const card = (item) => {
    const author = getMember(item.authorId);
    const photo = item.media?.find((m) => m.src);
    return h('li', { class: 'tag-page__item' },
      h('div', { class: 'tag-page__head' },
        author ? h('a', { href: blogHref(author), tabindex: '-1', 'aria-hidden': 'true' }, avatar(author, 32)) : null,
        h('span', {},
          h('strong', {}, author?.name ?? 'Someone'),
          h('span', { class: 'tag-page__meta' }, ` · ${item.where} · ${timeAgo(item.timestamp)}`),
          item.spaceKind === 'group' ? h('span', { class: 'tag-page__private', title: 'Only the group’s members see this' }, icon('lock', 11), ' Members') : null)),
      item.title ? h('a', { class: 'tag-page__title', href: item.href }, item.title) : null,
      item.text ? h('p', { class: 'tag-page__text' }, renderText(item.text.length > 400 ? `${item.text.slice(0, 399)}…` : item.text)) : null,
      photo ? h('a', { href: item.href, class: 'tag-page__photo' }, h('img', { src: photo.src, alt: photo.caption || 'Photo', loading: 'lazy' })) : null,
      h('a', { class: 'link-button tag-page__open', href: item.href }, 'Open'));
  };

  replaceChildren(container, h('div', { class: 'tag-page' },
    h('header', { class: 'settings-page__header tag-page__header' },
      h('h1', { class: 'settings-page__title' }, icon('hash', 22), name),
      me.isGuest ? null : h('button', {
        type: 'button', class: `button${following ? '' : ' button--primary'}`, 'aria-pressed': String(following),
        onClick: () => {
          const now = toggleFollowTag(me.id, name);
          showToast(now ? `Following #${name}. Posts with it from public blogs will show in your Feed.` : `Stopped following #${name}.`);
          renderTagPage(container, tag);
        },
      }, following ? 'Following' : 'Follow'),
      h('p', { class: 'settings-page__subtitle' }, items.length ? `${items.length} ${items.length === 1 ? 'post' : 'posts'} from public blogs and your groups` : 'Nothing with this tag yet.')),
    items.length ? h('ul', { class: 'tag-page__list' }, items.map(card))
      : h('div', { class: 'empty-state' }, h('p', { class: 'empty-state__title' }, `Be the first to post with #${name}.`), h('p', {}, 'Add it to a post on your blog or in a group, and it’ll show up here.')),
    mine.length ? h('section', { class: 'tag-page__topics' }, h('h2', { class: 'event-page__section-title' }, 'Topics you follow'), h('div', { class: 'tag-page__chips' }, mine.map((t) => h('a', { class: 'chip', href: `#tag-${t}` }, `#${t}`)))) : null,
    others.length ? h('section', { class: 'tag-page__topics' }, h('h2', { class: 'event-page__section-title' }, 'Other topics'), h('div', { class: 'tag-page__chips' }, others.map((t) => h('a', { class: 'chip', href: `#tag-${t.tag}` }, `#${t.tag}`, h('span', { class: 'tag-page__count' }, ` ${t.count}`))))) : null));
}
