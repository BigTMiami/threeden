/**
 * main.js — starts the app.
 *
 * Wires each part of the page to its container in index.html. Each part
 * listens to the store (js/state/store.js) and redraws itself when the
 * state it cares about changes.
 *
 * The URL (js/router.js) decides what's showing:
 *   - signed out: the sign-in / create-account screen, and nothing else
 *   - a homepage: your personal one or a group's (space header + module grid,
 *     plus the module library in edit mode)
 *   - a module page: one module full-page, inside its space
 *   - a settings page: a space's settings, your account, or "Create a group"
 *   - Messages: your conversations
 *
 * Homepages, module pages and space settings wear the space's look (fonts,
 * colors, background: js/groups/appearance.js). Account pages use the
 * plain 3den look.
 */

import { FEATURES, uses, setUses } from './state/features.js';
import { initAppBar } from './editor/app-bar.js';
import { initTabBar } from './editor/tab-bar.js';
import { initModuleSwiper } from './editor/module-swiper.js';
import { needsWelcomeSplash, welcomeOnce, needsBlogWelcome, renderBlogWelcome } from './onboarding/welcome.js';
import { needsFullAccount, renderFinishAccount } from './onboarding/finish-account.js';
import { initSearchBox } from './editor/search-box.js';
import { initSpaceHeader, renderSpaceHeader } from './editor/space-header.js';
import { initEditBar } from './editor/edit-bar.js';
import { initJump } from './editor/jump.js';
import { initShortcuts } from './editor/shortcuts.js';
import { initGrid, renderGrid } from './editor/grid.js';
import { renderLibrary } from './editor/library.js';
import { initModulePage, renderModulePage, clearModulePage } from './editor/module-page.js';
import { renderAuthView } from './account/auth-view.js';
import { renderJoinPage } from './groups/join-page.js';
import { findEvent } from './state/events.js';
import { recordRoute } from './state/recents.js';
import { setPageMeta } from './ui/page-meta.js';
import { applyTheme } from './ui/themes.js';
import { startDisappearingTimer } from './state/messages.js';
import { startInstagramSync } from './state/instagram.js';
import { startEncryption } from './state/e2ee.js';
import { startPresence } from './state/live.js';
import { renderLanding } from './onboarding/landing.js';
import { renderHelpPage } from './onboarding/help-page.js';
import { renderTagPage } from './feed/tag-page.js';
import { renderSeriesPage } from './events/event-series.js';
import { renderDirectoryPage } from './groups/directory-page.js';
import { syncTour } from './onboarding/demo-tour.js';
import { syncGroupTour } from './onboarding/group-tour.js';
import { renderSavedPage } from './feed/saved-page.js';
import { renderWeekPage } from './feed/week-page.js';
import { renderBringPage, renderHiPage } from './feed/bring-page.js';
import { startReminders } from './state/reminders.js';
import { startDelivery } from './state/delivery.js';
import { watchWaitlists, watchRsvpFollows, checkEventFollowups } from './state/event-followups.js';
import { renderAccountPage } from './account/account-page.js';
import { renderSettingsPage } from './groups/settings-page.js';
import { renderNewGroupPage } from './groups/new-group-page.js';
import { renderNewEventPage } from './events/new-event-page.js';
import { renderSearchPage } from './search/search-page.js';
import { renderLinksPage, canHaveLinksPage } from './groups/links-page.js';
import { renderGroupsPage } from './groups/groups-page.js';
import { renderFeedPage } from './feed/feed-page.js';
import { renderEventPage } from './events/event-page.js';
import { renderMessagesPage, clearMessagesPage } from './messages/messages-page.js';
import { applyAppearance } from './groups/appearance.js';
import { watchAssignments, watchGroupNews } from './state/notifications.js';
import { markActive } from './state/presence.js';
import {
  effectiveSpace, isPreviewing, stopPreview, saveDraft, discardDraft, getDraft,
} from './groups/settings-drafts.js';
import {
  subscribe, isEditMode, getCurrentUser, getCurrentSpace, getSpace, getSpaceOfModule, setCurrentSpace, canViewSpace, canViewModule, getBlogOf,
  setCurrentTab, HOME_TAB_ID, setGuestBrowsing, getPersonalSpace, isStrangerView,
  upgradeOnLoad,
} from './state/store.js';
import { findAccountByUsername } from './state/accounts.js';
import { getRoute, onRouteChange, spaceHref, settingsHref, goTo } from './router.js';
import { h, replaceChildren } from './ui/dom.js';
import { showToast } from './ui/toast.js';
import { initScrollFlow } from './ui/scroll-flow.js';

const libraryContainer = document.getElementById('module-library');
const homepageView = document.getElementById('homepage-view');
const modulePageView = document.getElementById('module-page-view');
const settingsView = document.getElementById('settings-view');
const authView = document.getElementById('auth-view');
const messagesView = document.getElementById('messages-view');
const previewBanner = document.getElementById('preview-banner');

// The browser's storage is full (usually from photos): say so instead of losing changes silently.
window.addEventListener('3den:save-failed', (event) => {
  showToast(event.detail.isFull
    ? 'This browser’s storage for 3den is full, so your last change wasn’t saved. Try removing some photos.'
    : 'Your last change couldn’t be saved in this browser.');
});

// Keep "who's online" current: note activity, and refresh the counts every minute.
const PRESENCE_REFRESH_MS = 60 * 1000;
document.addEventListener('pointerdown', markActive);
document.addEventListener('keydown', markActive);
setInterval(() => {
  if (!document.hidden) markActive();
  if (getRoute().page === 'home') renderSpaceHeader();
}, PRESENCE_REFRESH_MS);
markActive();

// Notice when someone is assigned something, for the bell (js/state/notifications.js).
watchAssignments();
watchGroupNews();
startDisappearingTimer(); // disappearing messages go when their time is up (js/state/messages.js)
startReminders(); // "remind me" before events and when tasks are due (js/state/reminders.js)
startDelivery(); // new notifications also go to the device, if asked (js/state/delivery.js)
startPresence(); // who else has this page open (js/state/live.js)
startEncryption(); // keys, and sealing direct messages end to end (js/state/e2ee.js)
startInstagramSync(); // connected Instagram accounts copy new posts (js/state/instagram.js)
watchRsvpFollows(); // answering an event follows its group or host (js/state/event-followups.js)
watchWaitlists(); // moving up from a waitlist, or being made a co-host, sends a notification

// Shown inside phone.html's iPhone frame (?frame=iphone or ?frame=iphone-se):
// css/mobile.css leaves room for the pretend home indicator (none on an SE).
const phoneFrame = new URLSearchParams(window.location.search).get('frame');
if (phoneFrame === 'iphone' || phoneFrame === 'iphone-se') {
  document.documentElement.classList.add('in-phone-frame');
  if (phoneFrame === 'iphone-se') document.documentElement.dataset.device = 'se';
}

initAppBar(document.getElementById('app-logo'), document.getElementById('app-nav'), document.getElementById('app-account'));
initSearchBox(document.getElementById('app-search'));
initTabBar(document.getElementById('tab-bar'));
renderLibrary(libraryContainer);
initSpaceHeader(document.getElementById('space-header'));
initEditBar();
initJump();
initShortcuts();
initScrollFlow(); // one continuous wheel stroke over a homepage's modules
initGrid(document.getElementById('homepage-grid'));
initModuleSwiper(document.querySelector('#homepage-grid .module-grid'), document.getElementById('module-strip'));
initModulePage(modulePageView);

let wasOnHomepage = true;

/**
 * Make the store's current space match the URL. Returns false if the URL
 * names a space you're not in (or that doesn't exist).
 */
function syncSpaceWithRoute({ page, spaceId, moduleId, blogUsername, tab }) {
  if (page === 'module') {
    const space = getSpaceOfModule(moduleId);
    if (!canViewModule(moduleId)) return false; // a members-only tab of a group you're not in
    setCurrentSpace(space.id);
    return true;
  }
  if (blogUsername) {
    const blog = getBlogOf(findAccountByUsername(blogUsername)?.id);
    if (!canViewSpace(blog)) return false; // no such person, or they turned blogs off
    setCurrentSpace(blog.id);
    setCurrentTab(tab ?? HOME_TAB_ID);
    return true;
  }
  if (spaceId) {
    if (!canViewSpace(getSpace(spaceId))) return false;
    setCurrentSpace(spaceId);
    if (page === 'home') setCurrentTab(tab ?? HOME_TAB_ID); // #space-juniper--projects
    return true;
  }
  // No space in the URL: open the group you visited most recently (or your homepage).
  setCurrentSpace(getCurrentSpace()?.id);
  return true;
}

/** Show the right view, and the library only in edit mode on a homepage. */
let isSyncing = false;

function syncView() {
  // Changing the space (below) announces a 'mode' change, which would call
  // syncView again in the middle of this one and draw the page twice.
  if (isSyncing) return;
  isSyncing = true;
  try {
    showViewForRoute();
  } finally {
    isSyncing = false;
  }
  syncTour(); // the organizer demo (#tour), if one is running
  syncGroupTour(); // the look around a group you just made, if one is running
}

/** 'groups' or 'messages' if this page belongs to a part of 3den they turned off. */
function turnedOffPartFor(route) {
  const me = getCurrentUser();
  if (!uses(me, 'messages') && route.page === 'messages') return FEATURES.find((f) => f.id === 'messages');
  if (uses(me, 'groups')) return null;
  const space = route.page === 'module' ? getSpaceOfModule(route.moduleId) : route.spaceId ? getSpace(route.spaceId) : null;
  const isGroupPage = ['groups', 'new-group', 'join'].includes(route.page) || (space?.kind === 'group' && space.memberIds.includes(me.id));
  return isGroupPage ? FEATURES.find((f) => f.id === 'groups') : null;
}

/** "You've turned off Groups" with a button to turn it back on. */
function renderTurnedOff(container, feature) {
  replaceChildren(container, h('div', { class: 'welcome' },
    h('h1', { class: 'welcome__title' }, `You’ve turned off ${feature.label}`),
    h('p', { class: 'welcome__lede' }, feature.off),
    h('div', { class: 'form-row' },
      h('button', {
        type: 'button', class: 'button button--primary',
        onClick: () => { setUses(getCurrentUser().id, feature.id, true); showToast(`${feature.label} is back on.`); showViewForRoute(); },
      }, `Use ${feature.label} again`),
      h('a', { class: 'button button--quiet', href: '#account-parts' }, 'Parts of 3den you use'))));
}

/** A page in the settings view that isn't about a space (a welcome screen). */
function showSimplePage(render) {
  clearModulePage();
  wasOnHomepage = false;
  showOnly(settingsView);
  applyAppearance(null);
  render();
  window.scrollTo(0, 0);
}

/** Can someone who isn't signed in look at this page? */
function isPublicRoute(route) {
  if (route.page === 'join' || route.page === 'hi' || route.page === 'welcome' || route.page === 'help') return true; // the front page and Help are for anyone
  if (route.page === 'links') return canHaveLinksPage(getSpace(route.spaceId));
  if (route.page === 'event') {
    const event = findEvent(route.eventId)?.event;
    return event?.visibility === 'public' || Boolean(route.friendCode && event?.friendCodes?.[route.friendCode]);
  }
  if (route.blogUsername) return canViewSpace(getBlogOf(findAccountByUsername(route.blogUsername)?.id));
  if (route.page === 'module') return canViewModule(route.moduleId);
  if (route.page === 'home' && route.spaceId) return canViewSpace(getSpace(route.spaceId));
  return false;
}

/** Hide every view except `visible` (and the library unless editing). */
function showOnly(visible) {
  for (const view of [homepageView, modulePageView, settingsView, messagesView, authView]) view.hidden = view !== visible;
  if (visible !== messagesView) clearMessagesPage();
  libraryContainer.hidden = !(visible === homepageView && isEditMode());
  document.body.classList.toggle('is-editing', visible === homepageView && isEditMode());
  document.body.classList.toggle('is-signed-out', visible === authView);
}

function showViewForRoute() {
  const route = getRoute();
  // Which page this is ('feed', 'groups', 'home'…), for styles that depend on it
  // (the + for making something shows only on the Feed: css/base.css).
  document.body.dataset.page = route.page;
  setPageMeta(null); // public pages set their own title and description (js/ui/page-meta.js)

  // Signed out: public things (a public event, a group's public tabs, a
  // blog, an invite link) can still be looked at, as a guest. Pressing
  // RSVP, Join, Add friend or Like asks them to sign up (js/onboarding/guest.js).
  // Anything else shows the sign-in screen.
  const signedIn = Boolean(getCurrentUser()) && !getCurrentUser().isGuest;
  document.body.classList.toggle('is-guest', !signedIn);
  if (!signedIn) {
    // Signed out at 3den's own address: the front page (landing.js), not a sign-in form.
    if (route.page === 'home' && !route.spaceId && !route.blogUsername && !isStrangerView()) {
      history.replaceState(null, '', '#welcome');
      showViewForRoute();
      return;
    }
    const canBrowse = isPublicRoute(route);
    setGuestBrowsing(canBrowse);
    if (!canBrowse) {
      clearModulePage();
      showOnly(authView);
      applyAppearance(null);
      renderAuthView(authView, route.page === 'signup' ? (route.tab === 'child' ? 'child' : 'signup') : 'signin');
      return;
    }
  }
  if (route.page === 'signin' || route.page === 'signup') {
    history.replaceState(null, '', route.tab === 'child' ? '#account-children' : '#');
    showViewForRoute();
    return;
  }
  if (signedIn) recordRoute(route); // for the Recents module

  // Quick accounts (made answering an event) finish their account before
  // groups and blogs (js/onboarding/finish-account.js).
  if (needsFullAccount(route)) {
    showSimplePage(() => renderFinishAccount(settingsView, route));
    return;
  }
  if (route.page === 'finish-account') { // already a full account
    history.replaceState(null, '', '#');
    showViewForRoute();
    return;
  }

  // A part of 3den they turned off (Account settings → Parts of 3den you use).
  const offPart = turnedOffPartFor(route);
  if (offPart) {
    showSimplePage(() => renderTurnedOff(settingsView, offPart));
    return;
  }

  // New accounts that came with no link: two seconds of welcome over their homepage.
  const personalId = getPersonalSpace()?.id;
  const isMyHome = route.page === 'home' && !route.blogUsername && (!route.spaceId || route.spaceId === personalId);
  if (isMyHome && needsWelcomeSplash()) welcomeOnce();
  // No blog yet: the Blog tab (and My blog) asks whether to dive in.
  if (needsBlogWelcome(route)) {
    showSimplePage(() => renderBlogWelcome(settingsView, route));
    return;
  }

  // Pages that aren't about a space.
  if (route.page === 'messages') {
    clearModulePage();
    wasOnHomepage = false;
    showOnly(messagesView);
    applyAppearance(null);
    const isComposing = route.conversationId === 'new';
    renderMessagesPage(messagesView, isComposing ? null : route.conversationId, isComposing);
    return;
  }
  if (route.page === 'join') {
    clearModulePage();
    wasOnHomepage = false;
    showOnly(settingsView);
    applyAppearance(null);
    renderJoinPage(settingsView, route.inviteCode);
    window.scrollTo(0, 0);
    return;
  }
  if (route.page === 'welcome') {
    showSimplePage(() => renderLanding(settingsView));
    return;
  }
  if (route.page === 'help') {
    showSimplePage(() => renderHelpPage(settingsView, route.topic));
    return;
  }
  if (route.page === 'tag') {
    showSimplePage(() => renderTagPage(settingsView, route.tag));
    return;
  }
  if (route.page === 'series') {
    showSimplePage(() => renderSeriesPage(settingsView, route.eventId));
    return;
  }
  if (route.page === 'directory') {
    showSimplePage(() => renderDirectoryPage(settingsView, route.spaceId));
    return;
  }
  if (route.page === 'links') {
    showSimplePage(() => renderLinksPage(settingsView, route.spaceId));
    return;
  }
  if (route.page === 'event') {
    clearModulePage();
    wasOnHomepage = false;
    showOnly(settingsView);
    applyAppearance(null);
    renderEventPage(settingsView, route.eventId, route.friendCode);
    window.scrollTo(0, 0);
    return;
  }
  if (route.page === 'hi') {
    clearModulePage();
    wasOnHomepage = false;
    showOnly(settingsView);
    applyAppearance(null);
    renderHiPage(settingsView, route.username);
    window.scrollTo(0, 0);
    return;
  }
  if (['account', 'new-group', 'new-event', 'groups', 'feed', 'search', 'saved', 'week', 'bring'].includes(route.page)) {
    clearModulePage();
    wasOnHomepage = false;
    showOnly(settingsView);
    applyAppearance(null);
    if (route.page === 'account') renderAccountPage(settingsView);
    else if (route.page === 'groups') renderGroupsPage(settingsView, route.tab ?? 'yours');
    else if (route.page === 'feed') renderFeedPage(settingsView, route.tab);
    else if (route.page === 'new-event') renderNewEventPage(settingsView);
    else if (route.page === 'saved') renderSavedPage(settingsView);
    else if (route.page === 'week') renderWeekPage(settingsView);
    else if (route.page === 'bring') renderBringPage(settingsView);
    else if (route.page === 'search') renderSearchPage(settingsView, route.searchParams);
    else renderNewGroupPage(settingsView);
    // #account-feed and #account-blog: jump to "Your feed" or "Your blog".
    const target = route.page === 'account' && route.tab ? document.getElementById(`${route.tab}-settings`) : null;
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
    return;
  }

  const isShowable = syncSpaceWithRoute(route);
  if (!isShowable && getCurrentUser().isGuest) {
    // A guest followed a link to something members-only: sign in first.
    history.replaceState(null, '', '#signin');
    showViewForRoute();
    return;
  }
  if (!isShowable) {
    // A link to a group you're not in: go to your default page instead.
    history.replaceState(null, '', spaceHref(getCurrentSpace().id));
    showToast(route.blogUsername ? `@${route.blogUsername} doesn’t have a public blog.` : 'That page is only for the group’s members.');
    showViewForRoute();
    return;
  }
  // Previewing unsaved settings only lasts while you're on that homepage.
  const space = getCurrentSpace();
  if (route.page !== 'home' && route.page !== 'settings') stopPreview();
  if (route.page === 'settings') stopPreview();
  applyAppearance(effectiveSpace(space));
  drawPreviewBanner(space);
  if (route.page === 'home') renderSpaceHeader(); // shows the preview, or stops showing it

  if (route.page === 'settings') {
    clearModulePage();
    wasOnHomepage = false;
    showOnly(settingsView);
    renderSettingsPage(settingsView, route.spaceId, route.tab);
    return;
  }

  const onHomepage = route.page === 'home';

  // Coming back from another page: redraw cards with any changes made there.
  if (onHomepage && !wasOnHomepage) renderGrid();
  wasOnHomepage = onHomepage;

  showOnly(onHomepage ? homepageView : modulePageView);
  if (onHomepage) clearModulePage();
  else renderModulePage(route.moduleId);
}

/**
 * "Previewing unsaved changes to 237 Hart Street   [Save changes] [Keep editing] [Discard]"
 * Shown at the top of a homepage while previewing its settings draft.
 */
function drawPreviewBanner(space) {
  const previewing = space && isPreviewing(space.id);
  previewBanner.hidden = !previewing;
  if (!previewing) {
    replaceChildren(previewBanner);
    return;
  }
  const backToSettings = () => goTo(settingsHref(space.id, getDraft(space.id).appearance ? 'appearance' : null));
  replaceChildren(previewBanner,
    h('span', {}, h('strong', {}, 'Preview. '), `This is how ${space.name} will look. Your changes aren’t saved yet.`),
    h('span', { class: 'preview-banner__actions' },
      h('button', {
        type: 'button',
        class: 'button button--primary button--small',
        onClick: () => {
          saveDraft(space.id);
          showToast('Changes saved.');
          showViewForRoute();
          renderGrid();
        },
      }, 'Save changes'),
      h('button', { type: 'button', class: 'button button--small', onClick: backToSettings }, 'Keep editing'),
      h('button', {
        type: 'button',
        class: 'button button--quiet button--small',
        onClick: () => {
          discardDraft(space.id);
          showToast('Changes discarded.');
          showViewForRoute();
        },
      }, 'Discard'),
    ),
  );
}

subscribe('mode', syncView);
subscribe('account', syncView);
// A space's look or members changed: restyle the page.
subscribe('space', () => {
  if (getCurrentUser() && ['home', 'module', 'settings'].includes(getRoute().page)) applyAppearance(effectiveSpace(getCurrentSpace()));
});
// Your theme (Account settings → Theme), before anything draws, and whenever you switch accounts.
applyTheme(getCurrentUser());
subscribe('account', () => applyTheme(getCurrentUser()));

onRouteChange(syncView);
syncView();

// The prototype changed since your last visit: your data came along (js/state/upgrade.js).
if (upgradeOnLoad) {
  setTimeout(() => showToast(upgradeOnLoad.added
    ? `3den was updated. Your data is all here, and ${upgradeOnLoad.added} new sample ${upgradeOnLoad.added === 1 ? 'thing was' : 'things were'} added.`
    : '3den was updated. Your data is all here.'), 600);
}

// After events you went to: "How was it? Next from them: …" (once each). On load, and on signing in as someone.
let followedUpFor = null;
function followUpEvents() {
  const me = getCurrentUser();
  if (!me || me.isGuest || followedUpFor === me.id) return;
  followedUpFor = me.id;
  checkEventFollowups(me);
}
subscribe('account', followUpEvents);
followUpEvents();
