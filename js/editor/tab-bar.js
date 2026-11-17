// @ts-check
/**
 * tab-bar.js — the bottom tab bar on phones, like an iPhone app's:
 *
 *   ┌──────┬──────┬──────┬──────────┬──────┐
 *   │  ⌂   │  ♡   │  👥  │    💬    │  ✎   │
 *   │ Home │ Feed │Groups│ Messages │ Blog │
 *   └──────┴──────┴──────┴──────────┴──────┘
 *
 * It replaces the top bar's links on screens 640 px wide or less (see
 * css/mobile.css, which also hides it on bigger screens). The same four
 * places as the top bar, plus Blog (your own blog; on a computer it's in
 * the Home menu). Notifications are the bell in the top bar, which opens
 * them as a sheet (js/editor/notification-bell.js). Badges show friend
 * requests (Home) and unread messages.
 */

import { uses } from '../state/features.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getCurrentUser, getCurrentSpace, getPersonalSpace, subscribe } from '../state/store.js';
import { totalUnread } from '../state/messages.js';
import { usesSocial, incomingRequests } from '../state/friends.js';
import { getRoute, spaceHref, blogHref } from '../router.js';
import { areNotificationsOpen } from './notification-bell.js';
import { quickCreateButton } from './quick-create.js';

let barElement = null;

export function initTabBar(container) {
  barElement = container;
  subscribe('space', render);
  subscribe('account', render);
  subscribe('messages', render);
  subscribe('notifications', render);
  window.addEventListener('hashchange', render);
  window.addEventListener('3den:notifications-toggled', render);
  render();
}

function render() {
  const user = getCurrentUser();
  barElement.hidden = !user || user.isGuest;
  if (!user || user.isGuest) {
    replaceChildren(barElement);
    return;
  }

  const { page } = getRoute();
  const alertsOpen = areNotificationsOpen(); // the notifications sheet covers the page, so no tab is lit
  const space = getCurrentSpace();
  const onSpacePage = ['home', 'module', 'settings'].includes(page);
  const personal = getPersonalSpace();
  const social = usesSocial(user.id);

  /** One tab: an icon over a label, with an optional badge. */
  const tab = ({ label, iconName, href = null, isCurrent: lit = false, badge = 0, onClick = null, extra = {} }) => {
    const isCurrent = href ? lit && !alertsOpen : lit;
    return h(href ? 'a' : 'button', {
      class: `tab-bar__tab${isCurrent ? ' is-current' : ''}`,
      href,
      type: href ? null : 'button',
      'aria-current': isCurrent ? 'page' : null,
      'aria-label': badge ? `${label}, ${badge} new` : label,
      onClick,
      ...extra,
    },
      h('span', { class: 'tab-bar__icon' }, icon(iconName, 24), badge ? h('span', { class: 'unread-badge tab-bar__badge' }, badge > 9 ? '9+' : String(badge)) : null),
      h('span', { class: 'tab-bar__label' }, label));
  };

  replaceChildren(barElement,
    personal ? tab({ label: 'Home', iconName: 'home', href: spaceHref(personal.id), isCurrent: onSpacePage && space?.id === personal.id, badge: social ? incomingRequests(user.id).length : 0 }) : null,
    social ? tab({ label: 'Feed', iconName: 'heart', href: '#feed', isCurrent: page === 'feed' && getRoute().tab !== 'friends' }) : null,
    uses(user, 'groups') ? tab({ label: 'Groups', iconName: 'people', href: '#groups', isCurrent: page === 'groups' || page === 'new-group' || (onSpacePage && space?.kind === 'group') }) : null,
    uses(user, 'messages') ? tab({ label: 'Messages', iconName: 'chat', href: '#messages', isCurrent: page === 'messages', badge: totalUnread(user.id) }) : null,
    social ? tab({ label: 'Blog', iconName: 'pencil', href: blogHref(user), isCurrent: onSpacePage && space?.kind === 'blog' && space.memberIds.includes(user.id) }) : null,
    // The "+" for a new post, event, task, or message floats just above the bar (quick-create.js).
    quickCreateButton('quick-create__button--float'),
  );
}
