/**
 * app-bar.js — the top bar.
 *
 *   3den  ⌂ Home ▾ · Feed · Groups ▾ · Messages (2)   [Search…]   [🔔 1] (LL)
 *
 * Left to right, from what's most yours and most used to least:
 *   Home      click: your own private homepage (the logo goes there too);
 *             hover: what's yours: My homepage, My blog, Friends, and Saved
 *             (with the number of friend requests)
 *   Feed      the Feed page: what your friends and groups have been up to
 *   Groups    click: the Groups page (#groups); hover: a quick menu
 *   Messages  your conversations, with the unread count
 *
 *           ┌──────────────────────────────┐
 *           │ [14] 14 Juniper Lane   now   │   ← hover, focus, or tap "Groups"
 *           │ [JT] Juniper Tenants   2d    │     to open; most recently
 *           │ [PL] Porch Lights      6d    │     visited group first
 *           │ + Create a group             │
 *           └──────────────────────────────┘
 *
 * The link for the page you're on is highlighted ("Groups" while you're in
 * a group). Feed, My blog, and Friends are hidden for people who turned blogs and the feed off
 * in their account settings.
 * The bell shows your notifications
 * (notification-bell.js). Clicking your avatar opens the account menu:
 * account settings, homepage settings, create a group, sign out.
 *
 * When signed out, the bar shows just the logo and "Sign in" (and "Join
 * 3den" for a guest looking at a public page).
 *
 * On phones (css/mobile.css) the links move to a bottom tab bar
 * (tab-bar.js), the bell stays (the tab bar's last spot is Blog),
 * and the search box folds into a 🔍 button that opens it under the bar.
 * Menus open as sheets from the bottom of the screen.
 *
 * There are no Calendar or My vault links on purpose: people get those by
 * adding Calendar and Vault modules to their own homepage.
 */

import { quickCreateButton } from './quick-create.js';
import { uses } from '../state/features.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { timeAgo } from '../utils/dates.js';
import { groupInitials } from '../utils/initials.js';
import {
  getCurrentSpace, getCurrentUser, getPersonalSpace, getGroupsByRecentVisit, getLastVisit, getSpaceMembers, subscribe,
} from '../state/store.js';
import { signOutHere } from '../api/server-mode.js';
import { totalUnread } from '../state/messages.js';
import { spaceHref, goTo, getRoute, blogHref } from '../router.js';
import { renderNotificationBell } from './notification-bell.js';
import { usesSocial, incomingRequests } from '../state/friends.js';
import { onlineMemberIds } from '../state/presence.js';
import { openShortcuts } from './shortcuts.js';

/** How long the menu stays open after the pointer leaves (so diagonal moves don't close it). */
const CLOSE_DELAY_MS = 200;

let logoElement = null;
let navElement = null;
let accountElement = null;

/** The Groups menu and account menu currently on the page (rebuilt on every render). */
let groupsMenu = null;
let accountMenu = null;
let homeMenu = null;
/** Like ignoreHoverUntilLeave below, for the Home menu. */
let ignoreHomeHover = false;

/**
 * After clicking "Groups" the pointer is still on it; don't pop the menu
 * open over the Groups page until the pointer has left and come back.
 */
let ignoreHoverUntilLeave = false;

export function initAppBar(logo, nav, account) {
  logoElement = logo;
  navElement = nav;
  accountElement = account;

  // Touch: tapping anywhere outside the Groups menu closes it.
  document.addEventListener('pointerdown', (event) => {
    // (On phones a menu's dimmed backdrop is its wrapper itself: tapping it closes the menu.)
    const outside = (menu) => !menu.element.contains(event.target) || event.target === menu.element;
    if (groupsMenu && outside(groupsMenu)) groupsMenu.setOpen(false);
    if (accountMenu && outside(accountMenu)) accountMenu.setOpen(false);
    if (homeMenu && outside(homeMenu)) homeMenu.setOpen(false);
  });

  subscribe('space', render);
  subscribe('account', render);
  subscribe('messages', render); // the unread count
  subscribe('notifications', render); // the bell's count
  window.addEventListener('hashchange', render); // keeps the highlighted link right
  render();
}

function render() {
  const user = getCurrentUser();
  // Signed out (or a guest looking at something public): the logo, Sign in and Join.
  if (!user || user.isGuest) {
    groupsMenu = null;
    accountMenu = null;
    homeMenu = null;
    replaceChildren(logoElement, h('a', { class: 'app-bar__wordmark', href: '#signin' }, '3den'));
    replaceChildren(navElement);
    replaceChildren(accountElement,
      h('a', { class: 'app-bar__home-link', href: '#signin' }, 'Sign in'),
      user?.isGuest ? h('a', { class: 'button button--primary button--small', href: '#signup' }, 'Join 3den') : null);
    return;
  }

  const current = getCurrentSpace();
  const { page } = getRoute();
  const onSpacePage = ['home', 'module', 'settings'].includes(page);

  const personal = getPersonalSpace();
  const onMyHomepage = onSpacePage && current?.id === personal?.id;

  // The logo goes to your own homepage, like "Home".
  replaceChildren(logoElement, h('a', { class: 'app-bar__wordmark', href: personal ? spaceHref(personal.id) : '#' }, '3den'));

  const unread = totalUnread(user.id);
  const social = usesSocial(user.id);
  const requestCount = social ? incomingRequests(user.id).length : 0;
  const { tab: feedTab } = getRoute();
  const onFriends = page === 'feed' && feedTab === 'friends';
  const onFeed = page === 'feed' && !onFriends;
  const onMyBlog = onSpacePage && current?.kind === 'blog' && current.memberIds.includes(user.id);
  replaceChildren(navElement,
    personal ? renderHomeMenu(user, personal, { social, requestCount, onMyHomepage, onMine: onMyHomepage || onFriends || onMyBlog }) : null,
    social ? h('a', {
      href: '#feed',
      class: 'app-bar__link',
      'aria-current': onFeed ? 'page' : null,
      title: 'What your friends and groups have been up to',
    }, 'Feed') : null,
    // Groups and Messages show unless turned off in "Parts of 3den you use".
    uses(user, 'groups') ? renderGroupsMenu(onSpacePage && current?.kind === 'group' ? current : null) : null,
    uses(user, 'messages') ? h('a', {
      href: '#messages',
      class: 'app-bar__messages',
      'aria-current': page === 'messages' ? 'page' : null,
      'aria-label': unread ? `Messages, ${unread} unread` : 'Messages',
    }, 'Messages', unread ? h('span', { class: 'unread-badge' }, String(unread)) : null) : null,
  );

  replaceChildren(accountElement, quickCreateButton('app-bar__new'), renderSearchToggle(), renderNotificationBell(user), renderAccountMenu(user, personal));
}

// ─── Account menu (your avatar) ──────────────────────────────────────────────

function renderAccountMenu(user, personal) {
  const trigger = h('button', {
    type: 'button',
    class: 'app-bar__user',
    // A profile photo if they have one (Account settings → Profile), else initials.
    style: user.photo ? { backgroundColor: user.color, backgroundImage: `url("${user.photo}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: user.color },
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    'aria-label': `${user.name}: account menu`,
    title: `${user.name} (@${user.username})`,
  }, user.photo ? null : user.initials);

  const item = (label, href) => h('a', { href, role: 'menuitem', class: 'account-menu__item', onClick: () => setOpen(false) }, label);

  const menu = h('div', { class: 'groups-menu account-menu', role: 'menu', 'aria-label': 'Account' },
    h('div', { class: 'account-menu__who' },
      h('strong', {}, user.name),
      h('span', {}, `@${user.username}`)),
    // Just your account (Nov 15): homepage, blog, friends, and saved are under Home; groups under Groups.
    personal ? item('My homepage', spaceHref(personal.id)) : null,
    item('Bring your people', '#bring'),
    item('Account settings', '#account'),
    // With blogs and friends off, Home has no menu, so Saved would have no way in.
    usesSocial(user.id) ? null : item('Saved', '#saved'),
    item('Help', '#help'),
    h('button', { type: 'button', role: 'menuitem', class: 'account-menu__item', onClick: () => { setOpen(false); openShortcuts(); } }, 'Keyboard shortcuts'),
    item('Organizer demo', '#tour'),
    h('button', {
      type: 'button',
      role: 'menuitem',
      class: 'account-menu__item account-menu__sign-out',
      onClick: () => {
        setOpen(false);
        signOutHere();
        goTo('#signin');
        showToast('Signed out.');
      },
    }, 'Sign out'),
  );

  const wrapper = h('div', { class: 'app-bar__menu app-bar__menu--account' }, trigger, menu);

  function setOpen(isOpen) {
    wrapper.classList.toggle('is-open', isOpen);
    trigger.setAttribute('aria-expanded', String(isOpen));
  }

  trigger.addEventListener('click', () => setOpen(!wrapper.classList.contains('is-open')));
  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      trigger.focus();
    }
  });
  wrapper.addEventListener('focusout', (event) => {
    if (!wrapper.contains(event.relatedTarget)) setOpen(false);
  });

  accountMenu = { element: wrapper, setOpen };
  return wrapper;
}

// ─── Search (phones) ─────────────────────────────────────────────────────────

/** Phones only (CSS hides it elsewhere): shows the search box under the bar. */
function renderSearchToggle() {
  const isOpen = document.body.classList.contains('is-searching');
  return h('button', {
    type: 'button',
    class: 'app-bar__search-toggle',
    'aria-label': isOpen ? 'Close search' : 'Search',
    'aria-expanded': String(isOpen),
    onClick: (event) => {
      const open = document.body.classList.toggle('is-searching');
      event.currentTarget.setAttribute('aria-expanded', String(open));
      replaceChildren(event.currentTarget, icon(open ? 'close' : 'search', 20));
      if (open) document.querySelector('.app-search__input')?.focus();
    },
  }, icon(isOpen ? 'close' : 'search', 20));
}

// Going somewhere (or Escape) folds the phone search away again.
window.addEventListener('hashchange', () => document.body.classList.remove('is-searching'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('is-searching')) {
    document.body.classList.remove('is-searching');
    render();
  }
});

// ─── Home menu ───────────────────────────────────────────────────────────────

/**
 * "Home" goes to your homepage; hovering it (or pressing ↓) shows what's
 * yours: your homepage, your blog, and your friends.
 */
function renderHomeMenu(user, personal, { social, requestCount, onMyHomepage, onMine }) {
  let closeTimer = null;
  const trigger = h('a', {
    href: spaceHref(personal.id),
    class: 'app-bar__menu-trigger app-bar__home',
    'aria-haspopup': social ? 'true' : null,
    'aria-expanded': social ? 'false' : null,
    'aria-current': onMine ? 'page' : null,
    'aria-label': requestCount ? `Home, ${requestCount} friend ${requestCount === 1 ? 'request' : 'requests'}` : 'Home',
    title: 'Your homepage (only you can see it)',
  }, icon('home', 15), ' Home', requestCount ? h('span', { class: 'unread-badge' }, String(requestCount)) : null, social ? [' ', icon('chevronDown', 12)] : null);
  // With blogs and friends turned off, Home is just a link.
  if (!social) return trigger;

  const item = (iconName, label, href, isCurrent, extra = null) => h('a', {
    href, role: 'menuitem', class: `groups-menu__create home-menu__item${isCurrent ? ' is-current' : ''}`, onClick: () => setOpen(false),
  }, icon(iconName, 14), ` ${label}`, extra);
  const { page, tab } = getRoute();
  const menu = h('div', { class: 'groups-menu home-menu', role: 'menu', 'aria-label': 'Yours' },
    item('home', 'My homepage', spaceHref(personal.id), onMyHomepage),
    item('pencil', 'My blog', blogHref(user), onMine && !onMyHomepage && page !== 'feed'),
    item('heart', 'Friends', '#feed-friends', page === 'feed' && tab === 'friends',
      requestCount ? h('span', { class: 'unread-badge' }, String(requestCount)) : null),
    item('bookmark', 'Saved', '#saved', page === 'saved'));
  const wrapper = h('div', { class: 'app-bar__menu' }, trigger, menu);

  function setOpen(isOpen) {
    clearTimeout(closeTimer);
    wrapper.classList.toggle('is-open', isOpen);
    trigger.setAttribute('aria-expanded', String(isOpen));
  }
  wrapper.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse' && !ignoreHomeHover) setOpen(true); });
  wrapper.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse') return;
    ignoreHomeHover = false;
    closeTimer = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  });
  trigger.addEventListener('click', () => { ignoreHomeHover = true; setOpen(false); });
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    setOpen(true);
    menu.querySelector('a')?.focus();
  });
  wrapper.addEventListener('focusout', (event) => { if (!wrapper.contains(event.relatedTarget)) setOpen(false); });
  wrapper.addEventListener('keydown', (event) => { if (event.key === 'Escape') { setOpen(false); trigger.focus(); } });
  homeMenu = { element: wrapper, setOpen };
  return wrapper;
}

// ─── Groups menu ─────────────────────────────────────────────────────────────

function renderGroupsMenu(current) {
  const isInGroup = current?.kind === 'group';
  let closeTimer = null;

  // "Groups" goes to the Groups page; hovering it (or pressing ↓) shows
  // the quick menu of your groups.
  const trigger = h('a', {
    href: '#groups',
    class: 'app-bar__menu-trigger',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    'aria-current': isInGroup || getRoute().page === 'groups' ? 'page' : null,
  }, 'Groups ', icon('chevronDown', 12));

  const menu = h('div', { class: 'groups-menu', role: 'menu', 'aria-label': 'Your groups' },
    h('p', { class: 'groups-menu__heading' }, 'Your groups · recently visited first'),
    getGroupsByRecentVisit().length === 0
      ? h('p', { class: 'groups-menu__empty' }, 'You’re not in any groups yet.')
      : getGroupsByRecentVisit().map((group) => renderGroupLink(group, group.id === current?.id)),
    h('a', {
      href: '#groups',
      role: 'menuitem',
      class: 'groups-menu__create',
      onClick: () => setOpen(false),
    }, icon('search', 14), ' All groups and Explore'),
    h('a', {
      href: '#new-group',
      role: 'menuitem',
      class: 'groups-menu__create',
      onClick: () => setOpen(false),
    }, icon('plus', 14), ' Create a group'),
  );

  const wrapper = h('div', { class: 'app-bar__menu' }, trigger, menu);

  function setOpen(isOpen) {
    clearTimeout(closeTimer);
    wrapper.classList.toggle('is-open', isOpen);
    trigger.setAttribute('aria-expanded', String(isOpen));
  }

  // Mouse: open on hover, close shortly after leaving.
  wrapper.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse' || ignoreHoverUntilLeave) return;
    setOpen(true);
  });
  wrapper.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse') return;
    ignoreHoverUntilLeave = false;
    closeTimer = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  });

  // Clicking goes to the Groups page (the link's href); close the menu.
  trigger.addEventListener('click', () => {
    ignoreHoverUntilLeave = true;
    setOpen(false);
  });
  // Keyboard: ↓ opens the quick menu and moves into it.
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    setOpen(true);
    menu.querySelector('a')?.focus();
  });

  // Keyboard: close when focus leaves the menu, or on Escape.
  wrapper.addEventListener('focusout', (event) => {
    if (!wrapper.contains(event.relatedTarget)) setOpen(false);
  });
  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      trigger.focus();
    }
  });

  groupsMenu = { element: wrapper, setOpen };
  return wrapper;
}

function renderGroupLink(group, isCurrent) {
  const lastVisit = getLastVisit(group.id);
  const memberCount = getSpaceMembers(group).length;

  return h('a', {
    href: spaceHref(group.id),
    role: 'menuitem',
    class: `groups-menu__item${isCurrent ? ' is-current' : ''}`,
    'aria-current': isCurrent ? 'page' : null,
  },
    h('span', { class: 'groups-menu__badge', 'aria-hidden': 'true' }, groupInitials(group.name)),
    h('span', { class: 'groups-menu__text' },
      h('span', { class: 'groups-menu__name' }, group.name),
      h('span', { class: 'groups-menu__meta' }, `${memberCount} members · `,
        h('span', { class: 'online-dot', 'aria-hidden': 'true' }), ` ${onlineMemberIds(group).length} online`),
    ),
    h('span', { class: 'groups-menu__visited' },
      isCurrent ? 'Here now' : lastVisit ? timeAgo(lastVisit) : 'Not visited'),
  );
}

