// @ts-check
/**
 * privacy-checkup.js — Account → Privacy checkup: what other people can see
 * about you, in plain words, each with a way to change it. And "View as a
 * stranger", which shows your blog (or a public group) the way someone who
 * isn't signed in sees it.
 *
 *   Privacy checkup                                   [View my blog as a stranger]
 *   ✓ Your blog is public: 4 posts. Anyone can read it.          Change
 *   ✓ Your area shows as “Eastside”, never your address.          Change
 *   ✓ Your direct messages are end-to-end encrypted.
 *   ! Anyone on 3den can message you.                             Change
 *   ! Your blog's About lists the public groups you're in.        Change
 *   ✓ Strangers see 2 of your groups’ public pages, but not who’s in them.
 *   ✓ Nobody blocked or muted.                                     Manage
 *
 * Stranger view: store.setStrangerView(true) makes this window act signed
 * out (and save nothing) until "Back to my account" in the banner.
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getSpaces, getBlogOf, setStrangerView, isStrangerView } from '../state/store.js';
import { uses } from '../state/features.js';
import { areaOf } from '../state/events.js';
import { isPublicGroup } from '../state/group-access.js';
import { blockedBy, mutedBy } from '../state/blocks.js';
import { blogHref, goTo } from '../router.js';

let banner = null;

/** Show `href` as a stranger would see it, with a banner to come back. */
export function startStrangerView(href, label) {
  setStrangerView(true);
  banner?.remove();
  banner = h('div', { class: 'stranger-banner', role: 'status' },
    icon('eye', 15),
    h('span', {}, h('strong', {}, 'Viewing as a stranger. '), `This is ${label} for someone who isn’t signed in. Nothing you do here is saved.`),
    h('button', { type: 'button', class: 'button button--small', onClick: endStrangerView }, 'Back to my account'));
  document.body.append(banner);
  document.body.classList.add('is-stranger-view');
  goTo(href);
}

export function endStrangerView() {
  if (!isStrangerView()) return;
  setStrangerView(false);
  banner?.remove();
  banner = null;
  document.body.classList.remove('is-stranger-view');
  goTo('#account-privacy');
}

export function renderPrivacyCheckup(user) {
  const blog = getBlogOf(user.id);
  const blogOn = uses(user, 'blogs') && blog;
  const postCount = blog ? blog.modules.reduce((n, m) => n + (m.data?.posts?.length ?? 0) + (m.data?.photos?.length ?? 0), 0) : 0;
  const area = areaOf(user);
  const publicGroups = getSpaces().filter((s) => s.kind === 'group' && s.memberIds.includes(user.id) && isPublicGroup(s));
  const blocked = blockedBy(user.id).length;
  const muted = mutedBy(user.id).length;
  const messagesOn = uses(user, 'messages');
  const listsGroups = Boolean(blog?.modules.some((m) => m.type === 'about' && m.data?.showGroups));

  const row = (ok, text, action = null) => h('li', { class: `privacy-check__row${ok ? '' : ' is-review'}` },
    h('span', { class: 'privacy-check__mark', 'aria-hidden': 'true' }, ok ? icon('check', 13) : '!'),
    h('span', { class: 'privacy-check__text' }, ok ? null : h('span', { class: 'visually-hidden' }, 'Worth a look: '), text),
    action);
  const change = (href, label = 'Change') => h('a', { class: 'link-button', href }, label);

  const rows = [
    blogOn
      ? row(true, `Your blog is public${postCount ? `: ${postCount} ${postCount === 1 ? 'post' : 'posts'}` : ''}. Anyone with the link can read it, signed in or not.`, change('#account-blog'))
      : row(true, 'You don’t have a public blog. Nobody outside your groups sees what you post.'),
    area
      ? row(true, `Your area shows as “${area.label}”, never your address. It’s used for events near you.`, change('#account-location'))
      : row(true, 'You haven’t set an area, so nothing shows where you are.', change('#account-location', 'Set one')),
    row(true, 'Your direct messages are end-to-end encrypted: only you and the people you write to can read them.'),
    messagesOn
      ? row(false, 'Anyone on 3den can send you a message. Block anyone who bothers you, or turn messages off.', change('#account-parts'))
      : row(true, 'Messages are off: nobody can message you.', change('#account-parts')),
    listsGroups && publicGroups.length
      ? row(false, `Your blog’s About lists the ${publicGroups.length === 1 ? 'public group' : `${publicGroups.length} public groups`} you’re in, so anyone can see you belong.`, h('a', { class: 'link-button', href: blogHref(user) }, 'Change'))
      : null,
    publicGroups.length
      ? row(true, `Strangers can see the public pages of ${publicGroups.length === 1 ? publicGroups[0].name : `${publicGroups.length} of your groups`}, but not who’s in them.`,
        h('button', { type: 'button', class: 'link-button', onClick: () => startStrangerView(`#space-${publicGroups[0].id}`, publicGroups[0].name) }, 'See it'))
      : row(true, 'None of your groups is public.'),
    row(true, blocked || muted ? `You’ve blocked ${blocked} and muted ${muted}.` : 'You haven’t blocked or muted anyone.', change('#account-blocked', 'Manage')),
    user.phone ? row(true, `Your phone number is only used to text you. Nobody else sees it.`) : null,
    row(true, 'No ads, no data brokers, no tracking. 3den never sells or shares what you do here.'),
  ].filter(Boolean);
  const review = rows.filter((r) => r.classList.contains('is-review')).length;

  return h('section', { class: 'settings-section privacy-check', id: 'privacy-settings' },
    h('div', { class: 'privacy-check__top' },
      h('h2', { class: 'settings-section__title' }, 'Privacy checkup'),
      blogOn ? h('button', { type: 'button', class: 'button button--small', onClick: () => startStrangerView(blogHref(user), 'your blog') }, icon('eye', 14), ' View my blog as a stranger') : null),
    h('p', { class: 'settings-section__description' }, review ? `${rows.length - review} of ${rows.length} look good. ${review === 1 ? 'One is' : `${review} are`} worth a look.` : 'Everything looks good.'),
    h('ul', { class: 'privacy-check__list' }, rows));
}
