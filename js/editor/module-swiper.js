// @ts-check
/**
 * module-swiper.js — on phones, a homepage's modules sit side by side, one
 * screen each: swipe left and right to go between them.
 *
 *   ┌─────────────────────────────────┐
 *   │                                 │
 *   │   the module, full width and    │  ← swipe ← → (scroll snapping)
 *   │   nearly the screen's height    │
 *   │                 ● ○ ○ ○         │
 *   ├─────────────────────────────────┤
 *   │ [Dashboard] [My tasks] [Cal…]  ⋮│  ← one chip per module, tap to jump
 *   ├─────────────────────────────────┤
 *   │ Home  Blog  Groups  Messages  🔔│  ← the tab bar
 *   └─────────────────────────────────┘
 *
 * Only on screens 640 px wide or less, only in view mode (editing keeps the
 * stack, for dragging and resizing), and only with two or more modules.
 *
 * A page with a Chat module doesn't show it as a swipe-through module on a
 * phone: a Chat button sits at the start of the chips instead, always in
 * reach, with how many messages you haven't read, and opens the chat full
 * screen in Messages. (On a computer the chat stays a module on the page,
 * where it's easier to keep an eye on than in Messages.)
 * In a group, phones open on widgets first (mobile-widgets.js): tapping one
 * opens this view at that module, and a Widgets button at the start of the
 * chips goes back (there's no List there).
 * Elsewhere, the last chip, "List", switches back to one long column; that choice is
 * remembered in this browser. The swiping itself is CSS (scroll snapping in
 * css/mobile.css); this file draws the chips, keeps the current one lit, and
 * remembers which module you were on, per homepage and tab.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getCurrentSpace, getCurrentTabId, getCurrentUser, getModule, isEditMode, subscribe } from '../state/store.js';
import { getConversation, unreadCount } from '../state/messages.js';
import { goTo as navigate } from '../router.js';
import { getModuleType } from '../modules/registry.js';

const PHONE = window.matchMedia('(max-width: 640px)');
const PREFERENCE_KEY = '3den.phone-homepage-layout'; // 'swipe' (default) or 'list'

let grid = null;
let strip = null;
const positions = {}; // 'spaceId:tabId' → index of the module showing
let scrollTimer = null;

export function initModuleSwiper(gridElement, stripElement) {
  grid = gridElement;
  strip = stripElement;
  // Redraw the chips whenever the grid's modules change.
  new MutationObserver(update).observe(grid, { childList: true });
  PHONE.addEventListener('change', update);
  subscribe('mode', update);
  subscribe('messages', update); // the Chat button's unread count
  grid.addEventListener('scroll', onScroll, { passive: true });
  // The space header above the modules can change height (a description,
  // a next-step line), and so can the screen: refit when either does.
  window.addEventListener('resize', fitToScreen);
  new ResizeObserver(fitToScreen).observe(document.body);
  update();
}

/**
 * One module at a time should just fit the screen: from where the modules
 * start (under the group's name) down to the dots, above the chips and the
 * tab bar. Its own contents scroll inside it, so its bottom edge is always
 * in view. When the header is tall (a cover photo), the module is sized to
 * fit between the bars once the header has scrolled away.
 */
function fitToScreen() {
  if (!grid?.classList.contains('is-swiping')) { grid?.style.removeProperty('--swipe-height'); return; }
  const top = grid.getBoundingClientRect().top + window.scrollY; // where the modules start on the page
  const css = getComputedStyle(document.documentElement);
  const px = (name) => parseFloat(css.getPropertyValue(name)) || 0;
  const below = px('--module-strip-height') + px('--tab-bar-height') + px('--safe-bottom');
  const dots = 24; // the dots under the module, and a little air
  const underHeader = window.innerHeight - top - below - dots;
  // A tall header (a cover photo): size it to fit once the header has
  // scrolled away instead, so the whole module fits between the bars.
  const appBar = document.querySelector('.app-bar')?.getBoundingClientRect().bottom ?? 52;
  const pastHeader = window.innerHeight - appBar - below - dots - 8;
  const height = Math.floor(Math.max(MIN_HEIGHT_PX, underHeader >= window.innerHeight * 0.5 ? underHeader : pastHeader));
  if (grid.style.getPropertyValue('--swipe-height') !== `${height}px`) grid.style.setProperty('--swipe-height', `${height}px`);
}
const MIN_HEIGHT_PX = 320;

function prefersList() {
  try { return localStorage.getItem(PREFERENCE_KEY) === 'list'; } catch { return false; }
}

function setPrefersList(isList) {
  try { localStorage.setItem(PREFERENCE_KEY, isList ? 'list' : 'swipe'); } catch { /* storage off: just this time */ }
  update();
}

/** The modules you swipe through: on a phone, a chat is a button instead (chatFrames). */
const frames = () => [...grid.querySelectorAll(':scope > .module-frame')].filter((f) => !(phoneChat() && f.dataset.moduleType === 'chat'));
const chatFrames = () => [...grid.querySelectorAll(':scope > .module-frame[data-module-type="chat"]')];
const phoneChat = () => PHONE.matches && !isEditMode();
const positionKey = () => `${getCurrentSpace()?.id}:${getCurrentTabId()}`;

/** A group on a phone: widgets first (mobile-widgets.js), then this swipe view; no list. */
const groupPhone = () => PHONE.matches && getCurrentSpace()?.kind === 'group';

function update() {
  const modules = frames();
  const chats = phoneChat() ? chatFrames() : [];
  grid.classList.toggle('has-phone-chat', chats.length > 0);
  const inGroup = groupPhone();
  const canSwipe = PHONE.matches && !isEditMode() && (modules.length > 1 || (inGroup && modules.length > 0));
  const swiping = canSwipe && (inGroup || !prefersList());
  grid.classList.toggle('is-swiping', swiping);
  if (!swiping) grid.style.removeProperty('--swipe-height');
  if (!swiping) grid.parentElement.querySelector('.module-dots')?.remove();
  strip.hidden = !canSwipe && !chats.length;
  if (strip.hidden) { replaceChildren(strip); return; }
  if (!canSwipe) { replaceChildren(strip, chats.map(chatButton)); return; }

  const current = Math.min(positions[positionKey()] ?? 0, modules.length - 1);
  replaceChildren(strip,
    // In a group: back to the widgets, first, where a thumb finds it.
    inGroup ? h('button', { type: 'button', class: 'module-strip__widgets', 'aria-label': 'Back to widgets', title: 'Widgets', onClick: () => window.dispatchEvent(new CustomEvent('3den:widgets')) }, icon('dashboard', 16)) : null,
    chats.map(chatButton),
    h('div', { class: 'module-strip__chips', role: swiping ? 'tablist' : null, 'aria-label': 'Modules on this page' },
      modules.map((frame, index) => {
        const type = frame.dataset.moduleType;
        return h('button', {
          type: 'button',
          class: `module-strip__chip${swiping && index === current ? ' is-current' : ''}`,
          role: swiping ? 'tab' : null,
          'aria-selected': swiping ? String(index === current) : null,
          onClick: () => goTo(index),
        }, icon(getModuleType(type).icon, 14), ` ${frame.getAttribute('aria-label')}`);
      })),
    inGroup ? null : h('button', {
      type: 'button',
      class: 'module-strip__mode',
      'aria-label': swiping ? 'Show modules as a list' : 'Swipe between modules',
      title: swiping ? 'Show as a list' : 'Swipe between modules',
      onClick: () => setPrefersList(swiping),
    }, icon(swiping ? 'list' : 'slides', 16)));

  if (swiping) {
    // Back to the module they were on (redraws start at the left).
    requestAnimationFrame(() => {
      fitToScreen();
      grid.scrollTo({ left: current * grid.clientWidth, behavior: 'instant' });
      drawDots(current);
    });
  }
}

/** "💬 Chat 3": opens the page's chat full screen (Messages), or the module's own page if it hasn't started yet. */
function chatButton(frame) {
  const module = getModule(frame.dataset.moduleId);
  const conversation = module?.data?.conversationId ? getConversation(module.data.conversationId) : null;
  const me = getCurrentUser();
  const unread = conversation && me ? unreadCount(conversation, me.id) : 0;
  return h('button', {
    type: 'button', class: 'module-strip__chat',
    'aria-label': unread ? `${module?.title ?? 'Chat'}: ${unread} unread` : module?.title ?? 'Chat',
    onClick: () => navigate(conversation ? `#messages-${conversation.id}` : `#module-${frame.dataset.moduleId}`),
  }, icon('chat', 15), ' Chat', unread ? h('span', { class: 'module-strip__badge' }, unread > 9 ? '9+' : String(unread)) : null);
}

/** Open the swipe view at a module (a widget was tapped, mobile-widgets.js). */
export function showModuleAt(moduleId) {
  const index = frames().findIndex((f) => f.dataset.moduleId === moduleId);
  positions[positionKey()] = Math.max(0, index);
  update();
}

/** Jump to a module: swipe there, or (as a list) scroll down to it. */
function goTo(index) {
  const frame = frames()[index];
  if (!frame) return;
  if (grid.classList.contains('is-swiping')) {
    grid.scrollTo({ left: index * grid.clientWidth, behavior: 'smooth' });
  } else {
    frame.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/** While swiping: light the chip of the module in view, and remember it. */
function onScroll() {
  if (!grid.classList.contains('is-swiping')) return;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    const index = Math.round(grid.scrollLeft / grid.clientWidth);
    positions[positionKey()] = index;
    strip.querySelectorAll('.module-strip__chip').forEach((chip, i) => {
      chip.classList.toggle('is-current', i === index);
      chip.setAttribute('aria-selected', String(i === index));
      if (i === index) chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
    drawDots(index);
  }, 60);
}

/** "● ○ ○ ○" under the modules, so it's clear there's more to the side. */
function drawDots(index) {
  let dots = grid.parentElement.querySelector('.module-dots');
  if (!grid.classList.contains('is-swiping')) { dots?.remove(); return; }
  if (!dots) {
    dots = h('div', { class: 'module-dots', 'aria-hidden': 'true' });
    grid.after(dots);
  }
  replaceChildren(dots, frames().map((_, i) => h('span', { class: `module-dots__dot${i === index ? ' is-current' : ''}` })));
}
