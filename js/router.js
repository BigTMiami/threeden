// @ts-check
/**
 * router.js — which page is showing, kept in the URL's hash so the
 * browser's Back button works and pages can be linked to:
 *
 *   (no hash)            → the homepage of the group you visited most recently
 *   #space-me            → the homepage of space "me" (your personal one)
 *   #space-juniper       → the homepage of space "juniper" (#space-juniper--projects opens a tab)
 *   #blog-leo            → @leo's blog (anyone can view it)
 *   #module-mod-todo     → module "mod-todo" full-page, inside its own space
 *   #settings-juniper    → settings for space "juniper" (#settings-juniper--members opens a tab)
 *   #groups              → the Groups page (#groups-explore for Explore)
 *   #new-group           → the "Create a group" form
 *   #event-ev-3          → an event's own page (RSVPs, guests)
 *   #messages            → Messages (#messages-<id> opens a conversation, #messages-new starts one)
 *   #feed                → the Feed (#feed-friends for friends and requests)
 *   #account             → your account settings (#account-feed, #account-blog, #account-location jump to that section)
 *   #join-k3x9q2ab       → a group's invite link: join it (signing in or up first if needed)
 *   #hi-leo              → @leo's invite link: become friends (signing up first if needed)
 *   #bring               → Bring your people: contacts, a group chat, your invite link
 *   #signin, #signup     → when signed out: sign in, or create an account
 *   #finish-account      → a quick account (made answering an event) adds a username and password
 *
 * Module ids are unique across spaces, so a module link doesn't need to
 * name its space; main.js looks the space up.
 *
 * (The hosting sandbox only passes simple "#name" hashes made of letters,
 * digits and hyphens, which is why these aren't "#/space/me".)
 */

const SPACE_PREFIX = '#space-';
const BLOG_PREFIX = '#blog-';
const MODULE_PREFIX = '#module-';
const SETTINGS_PREFIX = '#settings-';
const MESSAGES_PREFIX = '#messages-';
const TAB_SEPARATOR = '--';

/** Pages that are just a word: '#account' → 'account'. */
const SIMPLE_PAGES = ['account', 'new-group', 'new-event', 'signin', 'signup', 'groups', 'finish-account', 'saved', 'welcome', 'week', 'bring'];

const listeners = new Set();

/**
 * True when the current module page was opened from a homepage in this
 * session. Then "back" can use history.back(), which keeps the Back and
 * Forward buttons tidy.
 */
let openedFromHomepage = false;

/**
 * Set when a module page was opened from somewhere other than its own
 * space, e.g. a group's task opened from your personal homepage. "Back"
 * then returns there instead of to the group.
 */
let returnSpaceId = null;

/**
 * What the URL asks for:
 *   {
 *     page: 'home' | 'module' | 'settings' | 'account' | 'new-group' | 'signin' | 'signup',
 *     spaceId: 'me' | null,       ← for 'home' and 'settings'
 *     blogUsername: 'leo' | null, ← for 'home' showing someone's blog
 *     moduleId: 'mod-todo' | null,← for 'module'
 *     tab: 'members' | null,      ← for 'settings'
 *     conversationId: null,       ← for 'messages' ('new' = starting one)
 *   }
 * 'home' with spaceId null = the default homepage.
 */
export function getRoute() {
  const { hash } = window.location;
  const route = { page: 'home', spaceId: null, moduleId: null, tab: null, conversationId: null, eventId: null, blogUsername: null };
  if (hash.startsWith(MODULE_PREFIX)) return { ...route, page: 'module', moduleId: hash.slice(MODULE_PREFIX.length) };
  if (hash.startsWith(SPACE_PREFIX)) {
    const [spaceId, tab = null] = hash.slice(SPACE_PREFIX.length).split(TAB_SEPARATOR);
    return { ...route, spaceId, tab };
  }
  if (hash.startsWith(BLOG_PREFIX)) {
    const [blogUsername, tab = null] = hash.slice(BLOG_PREFIX.length).split(TAB_SEPARATOR);
    return { ...route, blogUsername, tab };
  }
  if (hash.startsWith(SETTINGS_PREFIX)) {
    const [spaceId, tab = null] = hash.slice(SETTINGS_PREFIX.length).split(TAB_SEPARATOR);
    return { ...route, page: 'settings', spaceId, tab };
  }
  if (hash === '#groups-explore') return { ...route, page: 'groups', tab: 'explore' };
  if (hash === '#signup-child') return { ...route, page: 'signup', tab: 'child' }; // an account for a child (child-account.js)
  if (hash === '#feed') return { ...route, page: 'feed', tab: 'feed' };
  if (hash === '#feed-friends') return { ...route, page: 'feed', tab: 'friends' };
  if (hash === '#account-feed') return { ...route, page: 'account', tab: 'feed' };
  if (hash === '#account-blog') return { ...route, page: 'account', tab: 'blog' };
  if (hash === '#account-location') return { ...route, page: 'account', tab: 'location' };
  if (hash === '#account-parts') return { ...route, page: 'account', tab: 'parts' };
  if (hash === '#account-blocked') return { ...route, page: 'account', tab: 'blocked' };
  if (hash === '#account-privacy') return { ...route, page: 'account', tab: 'privacy' };
  // Any other #account-<section> (Account settings has tabs: account-page.js, ACCOUNT_SECTIONS).
  if (hash.startsWith('#account-')) return { ...route, page: 'account', tab: hash.slice('#account-'.length) };
  if (hash.startsWith('#links-')) return { ...route, page: 'links', spaceId: hash.slice('#links-'.length) }; // link-in-bio page
  if (hash === '#help' || hash.startsWith('#help-')) return { ...route, page: 'help', topic: hash.slice('#help-'.length) || null }; // help center
  if (hash.startsWith('#new-event-')) return { ...route, page: 'new-event', spaceId: hash.slice('#new-event-'.length) }; // Plan an event, hosted by this group
  if (hash.startsWith('#tag-')) return { ...route, page: 'tag', tag: hash.slice('#tag-'.length) }; // a hashtag's page
  if (hash.startsWith('#series-')) return { ...route, page: 'series', eventId: hash.slice('#series-'.length) }; // a repeating event's dates
  if (hash.startsWith('#directory-')) return { ...route, page: 'directory', spaceId: hash.slice('#directory-'.length) }; // member directory
  if (hash.startsWith('#join-')) return { ...route, page: 'join', inviteCode: hash.slice('#join-'.length) };
  if (hash.startsWith('#hi-')) return { ...route, page: 'hi', username: hash.slice('#hi-'.length) }; // someone's invite link: become friends
  if (hash.startsWith('#event-')) {
    // #event-<id>~<code>: a guest link from someone going (js/events/event-extras.js).
    const [eventId, friendCode = null] = hash.slice('#event-'.length).split('~');
    return { ...route, page: 'event', eventId, friendCode };
  }
  // #search?q=…&sort=…&show=…: Advanced search (js/search/search-page.js).
  if (hash === '#search' || hash.startsWith('#search?')) return { ...route, page: 'search', searchParams: new URLSearchParams(hash.split('?')[1] ?? '') };
  if (hash === '#messages') return { ...route, page: 'messages' };
  if (hash.startsWith(MESSAGES_PREFIX)) return { ...route, page: 'messages', conversationId: hash.slice(MESSAGES_PREFIX.length) };
  const word = hash.slice(1);
  if (SIMPLE_PAGES.includes(word)) return { ...route, page: word };
  return route;
}

/** The link for a space's settings, optionally on one tab. */
export function settingsHref(spaceId, tab = null) {
  return `${SETTINGS_PREFIX}${spaceId}${tab ? `${TAB_SEPARATOR}${tab}` : ''}`;
}

export function goTo(href) {
  window.location.hash = href;
}

/** The id of the module open full-page, or null on a homepage. */
export function getOpenModuleId() {
  return getRoute().moduleId;
}

/** The link to someone's blog: '#blog-leo'. */
export function blogHref(member) {
  return `${BLOG_PREFIX}${member.username}`;
}

/** The link (href) for a space's homepage, optionally on one of its tabs. */
export function spaceHref(spaceId, tabId = null) {
  return `${SPACE_PREFIX}${spaceId}${tabId && tabId !== 'home' ? `${TAB_SEPARATOR}${tabId}` : ''}`;
}

/**
 * Show a module full-page. Pass `returnTo` (a space id) when opening it
 * from another space, so "back" goes to that space.
 */
export function openModulePage(moduleId, { returnTo = null } = {}) {
  openedFromHomepage = getRoute().page === 'home';
  returnSpaceId = returnTo;
  window.location.hash = `${MODULE_PREFIX}${moduleId}`;
}

/** The space "back" should return to, if it isn't the module's own. */
export function getReturnSpaceId() {
  return returnSpaceId;
}

/** Leave a module page, back to the homepage of `spaceId` (or where it was opened from). */
export function closeModulePage(spaceId, tabId = null) {
  if (openedFromHomepage) {
    history.back();
  } else {
    window.location.hash = returnSpaceId ? spaceHref(returnSpaceId) : spaceHref(spaceId, tabId);
  }
}

/** Call `listener()` whenever the page changes. */
export function onRouteChange(listener) {
  listeners.add(listener);
}

// ─── Back returns where you were ──────────────────────────────────────────
//
// `trail` is every page visited in this tab, newest last, with how far down
// each one was scrolled. Going back pops it and puts the scroll back, so a
// long Feed doesn't jump to the top after you open a post and return.

const trail = [{ hash: window.location.hash || '#', scrollY: 0 }];

// The scroll position just before a hash change (the change itself may scroll).
let lastScrollY = 0;
window.addEventListener('scroll', () => { lastScrollY = window.scrollY; }, { passive: true });
let restoreScrollTo = null;

/** Where Back goes, or null on the first page of the visit. */
export function previousPlace() {
  return trail.length > 1 ? trail[trail.length - 2].hash : null;
}

/** Go back one page in the app, or to `fallback` when there's nowhere to go back to. */
export function goBack(fallback = '#') {
  if (previousPlace() !== null) history.back();
  else window.location.hash = fallback;
}

/**
 * A plain name for the page Back goes to ("Feed", "Juniper Book Club"), or
 * `fallback` when it isn't easy to name. Spaces are looked up by `nameOf`.
 * @param {string} [fallback]
 * @param {(spaceId: string) => (string | null)} [nameOf]
 */
export function backLabel(fallback = 'Back', nameOf = () => null) {
  const hash = previousPlace();
  if (hash === null) return fallback;
  const words = { '#': 'Home', '': 'Home', '#feed': 'Feed', '#groups': 'Groups', '#messages': 'Messages', '#saved': 'Saved', '#notifications': 'Alerts', '#calendar': 'Calendar' };
  if (hash in words) return words[hash];
  if (hash.startsWith(SPACE_PREFIX)) return nameOf(hash.slice(SPACE_PREFIX.length).split('--')[0]) ?? fallback;
  return fallback;
}

window.addEventListener('hashchange', () => {
  if (getOpenModuleId() === null) {
    openedFromHomepage = false; // left the module page
    returnSpaceId = null;
  }
  const hash = window.location.hash || '#';
  trail[trail.length - 1].scrollY = lastScrollY;
  if (trail.length > 1 && trail[trail.length - 2].hash === hash) {
    restoreScrollTo = trail.pop() && trail[trail.length - 1].scrollY;
  } else if (trail[trail.length - 1].hash !== hash) {
    trail.push({ hash, scrollY: 0 });
    restoreScrollTo = null;
  }
  for (const listener of listeners) listener();
  if (restoreScrollTo) {
    const y = restoreScrollTo;
    restoreScrollTo = null;
    // Twice: once now, once after images and late cards have filled in.
    requestAnimationFrame(() => window.scrollTo(0, y));
    setTimeout(() => { if (Math.abs(window.scrollY - y) > 4) window.scrollTo(0, y); }, 250);
  }
});

