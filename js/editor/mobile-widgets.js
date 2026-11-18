// @ts-check
/**
 * mobile-widgets.js — a group's (and your homepage's) first screen on phones
 * (Nov 18): a grid of
 * widgets, one per module, each saying what's going on in it at a glance.
 *
 *   ┌──────────────────────────────┐
 *   │ ▣ 22  Up next · Sunday       │  ← wide widget
 *   │ NOV   House meeting · 7pm    │
 *   ├──────────────┬───────────────┤
 *   │ House chat 2 │ To-do         │  ← small widgets
 *   │ Owen: I've…  │ ◔ 1 of 5      │
 *   └──────────────┴───────────────┘
 *
 * Tapping a widget opens the swipe view (module-swiper.js) at that module;
 * its Widgets button, or the phone's back gesture, comes back here. A chat
 * opens there too, as a module on the page.
 * Entering a group, or another of its tabs, starts here; coming back from
 * a module's own page returns to the swipe view.
 *
 * Widgets come in the tab's phone order (store.phoneOrdered) and are small
 * (half the width) or wide (store.widgetSize). Both are set on a computer
 * with Edit → Edit mobile (mobile-editor.js), which draws the same widgets
 * with renderWidget({ editing }).
 *
 *   initMobileWidgets(gridElement)    once, at startup
 *   renderWidget(module, space, me, { onOpen, controls })
 *   widgetsActive()                   is the widget screen showing?
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { getCurrentSpace, getCurrentTabId, getCurrentUser, getMember, getVisibleModules, isEditMode, subscribe, phoneOrdered, naturalPhoneOrder, widgetSize } from '../state/store.js';
import { getModuleType } from '../modules/registry.js';
import { widgetSummary } from './widget-summaries.js';
import { showModuleAt } from './module-swiper.js';

const PHONE = window.matchMedia('(max-width: 640px)');

/** 'widgets' or 'swipe', for the space and tab you're on. */
let view = 'widgets';
let viewKey = '';
let container = null;

const keyNow = () => `${getCurrentSpace()?.id}:${getCurrentTabId()}`;
const onHomepage = () => !document.getElementById('homepage-view')?.hidden;
/** Groups and your homepage open on widgets on a phone (blogs keep swiping). */
export const WIDGET_KINDS = ['group', 'personal'];
const isGroupPhone = () => PHONE.matches && !isEditMode() && WIDGET_KINDS.includes(getCurrentSpace()?.kind) && getVisibleModules().length > 0;

/** Is the widget screen showing right now? */
export const widgetsActive = () => isGroupPhone() && onHomepage() && view === 'widgets';

/** The ring for a task list: done of total. */
function ring(done, total) {
  const r = 17;
  const length = 2 * Math.PI * r;
  const part = total ? (done / total) * length : 0;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '44'); svg.setAttribute('height', '44'); svg.setAttribute('viewBox', '0 0 44 44'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--color-border-faint)" stroke-width="6"></circle>`
    + `<circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--color-accent)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${part} ${length}" transform="rotate(-90 22 22)"></circle>`;
  return svg;
}

/**
 * One widget. `onOpen` makes the whole widget a button; `controls` (the
 * editor's grip, size, and move buttons) go along its top instead.
 */
export function renderWidget(module, space, me, { onOpen = null, controls = null } = {}) {
  const type = getModuleType(module.type);
  const size = widgetSize(module, space);
  const s = widgetSummary(module, space, me);
  const featured = module.type === 'upnext' && s.date;
  const body = [
    h('span', { class: 'mwidget__head' },
      icon(type?.icon ?? 'note', 16),
      h('span', { class: 'mwidget__name' }, module.title || type?.label || 'Module'),
      s.badge ? h('span', { class: 'mwidget__badge' }, s.badge) : null),
    s.date ? h('span', { class: 'mwidget__event' },
      h('span', { class: 'mwidget__date', 'aria-hidden': 'true' }, h('span', {}, s.date.month), h('strong', {}, s.date.day)),
      h('span', { class: 'mwidget__text' },
        s.kicker ? h('span', { class: 'mwidget__kicker' }, s.kicker) : null,
        h('strong', { class: 'mwidget__title' }, s.title),
        s.lines.map((line) => h('span', { class: 'mwidget__line' }, line)))) : null,
    s.progress ? h('span', { class: 'mwidget__progress' }, ring(s.progress.done, s.progress.total),
      h('span', { class: 'mwidget__text' }, h('strong', { class: 'mwidget__big' }, `${s.progress.done} of ${s.progress.total}`), h('span', { class: 'mwidget__line' }, 'done'))) : null,
    s.image ? h('img', { class: 'mwidget__image', src: s.image, alt: '' }) : null,
    !s.date && s.title ? h('span', { class: 'mwidget__text' },
      s.kicker ? h('span', { class: 'mwidget__kicker' }, s.kicker) : null,
      h('strong', { class: 'mwidget__title' }, s.title)) : null,
    !s.date ? s.lines.filter(Boolean).map((line) => h('span', { class: 'mwidget__line' }, line)) : null,
    s.chips?.length ? h('span', { class: 'mwidget__chips' }, s.chips.map((chip) => h('span', { class: 'mwidget__chip' }, chip))) : null,
    s.people?.length ? h('span', { class: 'mwidget__people' }, s.people.map((id) => avatar(getMember(id), 22))) : null,
  ];
  const className = `mwidget mwidget--${size}${featured ? ' mwidget--featured' : ''}`;
  if (onOpen) {
    return h('button', { type: 'button', class: className, dataset: { widgetId: module.id }, 'aria-label': `${module.title}${s.badge ? `, ${s.badge}` : ''}: open`, onClick: () => onOpen(module) }, body);
  }
  return h('div', { class: `${className} mwidget--editing`, dataset: { widgetId: module.id } }, controls, h('div', { class: 'mwidget__body', 'aria-hidden': 'true' }, body));
}

/** The current tab's modules, in phone order. */
export function widgetModules() {
  return phoneOrdered(naturalPhoneOrder(getVisibleModules()));
}

/** Open a widget: the swipe view, at that module (a chat too: it stays on the page). */
function open(module) {
  view = 'swipe';
  try { history.pushState({ ...(history.state ?? {}), phoneSwipe: viewKey }, ''); } catch { /* some frames refuse: Back still works from the button */ }
  update();
  showModuleAt(module.id);
}

/** Back to the widgets (the swipe view's Widgets button). */
export function backToWidgets() {
  if (history.state?.phoneSwipe) { history.back(); return; } // popstate brings us back here
  view = 'widgets';
  update();
}

function update() {
  if (!container) return;
  const key = keyNow();
  // Entering a group, or another of its tabs, starts on the widgets.
  if (key !== viewKey) { viewKey = key; view = 'widgets'; }
  const showing = widgetsActive();
  document.documentElement.classList.toggle('phone-widgets', showing);
  container.hidden = !showing;
  if (!showing) { replaceChildren(container); return; }
  const space = getCurrentSpace();
  const me = getCurrentUser();
  replaceChildren(container,
    h('div', { class: 'mwidgets__grid', role: 'list', 'aria-label': 'Modules' },
      widgetModules().map((module) => h('div', { role: 'listitem', class: `mwidgets__cell mwidgets__cell--${widgetSize(module, space)}` }, renderWidget(module, space, me, { onOpen: open })))));
}

export function initMobileWidgets(gridElement) {
  container = h('section', { id: 'mobile-widgets', class: 'mwidgets', 'aria-label': 'Widgets', hidden: true });
  document.getElementById('homepage-grid')?.before(container);
  new MutationObserver(update).observe(gridElement, { childList: true });
  PHONE.addEventListener('change', update);
  subscribe('mode', update);
  subscribe('layout', update);
  subscribe('messages', update);
  // Coming back from a module's own page keeps the swipe view; arriving from anywhere else starts on the widgets.
  let lastHash = window.location.hash;
  window.addEventListener('hashchange', (event) => {
    lastHash = window.location.hash;
    const from = new URL(event.oldURL).hash;
    const to = new URL(event.newURL).hash;
    if (!from.startsWith('#module-') && !to.startsWith('#module-')) view = 'widgets';
    requestAnimationFrame(update);
  });
  // The back gesture from the swipe view: same page, no swipe mark. (Following
  // a link fires popstate too, but with a new hash; hashchange handles that.)
  window.addEventListener('popstate', (event) => {
    if (view === 'swipe' && !event.state?.phoneSwipe && window.location.hash === lastHash) { view = 'widgets'; update(); }
  });
  window.addEventListener('3den:widgets', backToWidgets);
  update();
}
