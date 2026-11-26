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
 * A Chat module is a module like any other here (Nov 18: it used to be a
 * button that left for Messages): its chip shows how many messages you
 * haven't read, and the chat opens right on the page.
 * In a group or on your homepage, phones open on widgets first (mobile-widgets.js): tapping one
 * opens this view at that module, and a Widgets button at the start of the
 * chips goes back (there's no List there).
 * Elsewhere, the last chip, "List", switches back to one long column; that choice is
 * remembered in this browser. The swiping itself is CSS (scroll snapping in
 * css/mobile.css); this file draws the chips, keeps the current one lit, and
 * remembers which module you were on, per homepage and tab.
 */

import { chatUnreadTotal } from '../modules/chat/chat-data.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getCurrentSpace, getCurrentTabId, getCurrentUser, getModule, isEditMode, subscribe } from '../state/store.js';
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
  if (groupPhone()) { fillScreen(); return; }
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

/**
 * In a group or on your homepage (Nov 18): the module fills the screen
 * between the top bar and the chips, and the group's name and description
 * sit just above it, out of view. The page snaps between the two with the
 * browser's own scroll snapping (html.phone-module-snap in css/mobile.css),
 * so the snap is part of the scroll itself, carried by its momentum, not a
 * second motion after it: flick down past the top of the module and the
 * header comes into view; a small pull springs back; flick back up and it
 * lands on the module.
 */
function fillScreen() {
  const css = getComputedStyle(document.documentElement);
  const px = (name) => parseFloat(css.getPropertyValue(name)) || 0;
  const below = px('--module-strip-height') + px('--tab-bar-height') + px('--safe-bottom');
  const appBar = Math.round(document.querySelector('.app-bar')?.getBoundingClientRect().height ?? 52);
  const height = Math.floor(Math.max(MIN_HEIGHT_PX, window.innerHeight - appBar - below - SNAP_GAP_PX - DOTS_PX));
  if (grid.style.getPropertyValue('--swipe-height') !== `${height}px`) grid.style.setProperty('--swipe-height', `${height}px`);
  document.documentElement.style.setProperty('--snap-top', `${appBar + SNAP_GAP_PX}px`);
}
const SNAP_GAP_PX = 6; // air between the top bar and the module
const DOTS_PX = 22; // the dots under the module

/** Scroll the page so the module sits right under the top bar (the header just out of view). */
function snapToModule() {
  if (!grid?.classList.contains('is-swiping') || !groupPhone()) return;
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--snap-top')) || 58;
  const top = grid.getBoundingClientRect().top + window.scrollY - gap;
  window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
}
let snapPending = false;
let wasSwiping = false;


function prefersList() {
  try { return localStorage.getItem(PREFERENCE_KEY) === 'list'; } catch { return false; }
}

function setPrefersList(isList) {
  try { localStorage.setItem(PREFERENCE_KEY, isList ? 'list' : 'swipe'); } catch { /* storage off: just this time */ }
  update();
}

/** The modules you swipe through. */
const frames = () => [...grid.querySelectorAll(':scope > .module-frame')];
const positionKey = () => `${getCurrentSpace()?.id}:${getCurrentTabId()}`;

/** A group or your homepage on a phone: widgets first (mobile-widgets.js), then this swipe view; no list. */
const groupPhone = () => PHONE.matches && ['group', 'personal'].includes(getCurrentSpace()?.kind);

function update() {
  const modules = frames();
  const inGroup = groupPhone();
  const canSwipe = PHONE.matches && !isEditMode() && (modules.length > 1 || (inGroup && modules.length > 0));
  const swiping = canSwipe && (inGroup || !prefersList());
  grid.classList.toggle('is-swiping', swiping);
  // A group or homepage: the module fills the screen, and the page snaps between it and the header.
  document.documentElement.classList.toggle('phone-module-snap', swiping && inGroup);
  if (swiping && inGroup && !wasSwiping) snapPending = true;
  // Back to the widgets: start at the top, with the group's name.
  if (wasSwiping && !(swiping && inGroup) && PHONE.matches && document.documentElement.classList.contains('phone-widgets')) window.scrollTo({ top: 0, behavior: 'instant' });
  wasSwiping = swiping && inGroup;
  if (!swiping) grid.style.removeProperty('--swipe-height');
  if (!swiping) grid.parentElement.querySelector('.module-dots')?.remove();
  strip.hidden = !canSwipe;
  if (strip.hidden) { replaceChildren(strip); return; }

  const current = Math.min(positions[positionKey()] ?? 0, modules.length - 1);
  replaceChildren(strip,
    // In a group: back to the widgets, first, where a thumb finds it.
    inGroup ? h('button', { type: 'button', class: 'module-strip__widgets', 'aria-label': 'Back to widgets', title: 'Widgets', onClick: () => window.dispatchEvent(new CustomEvent('3den:widgets')) }, icon('dashboard', 16)) : null,
    h('div', { class: 'module-strip__chips', role: swiping ? 'tablist' : null, 'aria-label': 'Modules on this page' },
      modules.map((frame, index) => {
        const type = frame.dataset.moduleType;
        const unread = type === 'chat' ? chatUnread(frame) : 0;
        return h('button', {
          type: 'button',
          class: `module-strip__chip${swiping && index === current ? ' is-current' : ''}`,
          role: swiping ? 'tab' : null,
          'aria-selected': swiping ? String(index === current) : null,
          'aria-label': unread ? `${frame.getAttribute('aria-label')}: ${unread} unread` : null,
          onClick: () => goTo(index),
        }, icon(getModuleType(type).icon, 14), ` ${frame.getAttribute('aria-label')}`,
        unread ? h('span', { class: 'module-strip__badge' }, unread > 9 ? '9+' : String(unread)) : null);
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
      if (snapPending) { snapPending = false; snapToModule(); }
    });
  }
}

/** How many messages in a page's chat you haven't read (shown on its chip). */
function chatUnread(frame) {
  const module = getModule(frame.dataset.moduleId);
  const me = getCurrentUser();
  return module && me ? chatUnreadTotal(module.data, me.id) : 0; // every channel (chat-data.js)
}

/** Open the swipe view at a module (a widget was tapped, mobile-widgets.js). */
export function showModuleAt(moduleId) {
  const index = frames().findIndex((f) => f.dataset.moduleId === moduleId);
  positions[positionKey()] = Math.max(0, index);
  snapPending = true; // open on the module, the header just above it
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
