// @ts-check
/**
 * The bar at the bottom while you edit a homepage, and the banner while you
 * look at a group the way its members do.
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ ✎ Editing Juniper Book Club. Changes save as you go.               │
 *   │  [▦ Layout: Spotlight ▾] [Featured: Forum ▾]  [👁 See it as a member] [✓ Done editing] │
 *
 * Layout opens a menu of the page layouts (js/editor/page-layouts.js), each
 * with a small drawing; it applies to the tab you're on. Layouts with a
 * featured column also get a Featured picker. Once someone has set the
 * order modules come in on phones (the small phone numbers on each module),
 * "Reset phone order" puts it back to the page's own order.
 *   └────────────────────────────────────────────────────────────────────┘
 *
 *   ┌────────────────────────────────────────────────────────────────────┐
 *   │ 👁 You’re seeing Juniper Book Club as a member would.  [Back to editing] │
 *   └────────────────────────────────────────────────────────────────────┘
 *
 * "See it as a member" turns your admin role off for this group until you
 * come back (store.setMemberView), so tabs, buttons, and settings links
 * that only admins get disappear, just as members see it.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getCurrentSpace, getVisibleModules, isEditMode, isMemberView, setEditMode, setMemberView, subscribe, getPageLayout, setPageLayout, setFeaturedModule, setFeaturedRows, hasPhoneOrder, resetPhoneOrder } from '../state/store.js';
import { LAYOUTS, layoutById } from './page-layouts.js';
import { getRoute, onRouteChange } from '../router.js';

let bar = null;
let cameFromEditing = false;

export function initEditBar() {
  bar = h('div', { class: 'edit-bar', role: 'region', 'aria-label': 'Editing', hidden: true });
  document.body.append(bar);
  for (const event of ['mode', 'space', 'layout']) subscribe(event, draw);
  onRouteChange(() => {
    // Leaving the homepage (to a module, settings, another page) ends the member view.
    if (isMemberView() && getRoute().page !== 'home') setMemberView(false);
    draw();
  });
  draw();
}

function draw() {
  if (!bar) return;
  const space = getCurrentSpace();
  const onHome = getRoute().page === 'home';
  const editing = onHome && isEditMode();
  const asMember = onHome && isMemberView();
  bar.hidden = !(editing || asMember);
  document.body.classList.toggle('has-edit-bar', !bar.hidden);
  if (bar.hidden) { replaceChildren(bar); return; }

  if (asMember) {
    bar.classList.add('edit-bar--member');
    replaceChildren(bar,
      h('p', { class: 'edit-bar__text', role: 'status' }, icon('eye', 15), h('span', {}, 'You’re seeing ', h('strong', {}, space.name), ' as a member would.')),
      h('div', { class: 'edit-bar__actions' },
        h('button', {
          type: 'button',
          class: 'button button--primary button--small',
          onClick: () => setMemberView(false, { backToEditing: cameFromEditing }),
        }, cameFromEditing ? 'Back to editing' : 'Back to my view')));
    return;
  }

  bar.classList.remove('edit-bar--member');
  const isGroup = space.kind === 'group';
  replaceChildren(bar,
    h('p', { class: 'edit-bar__text' }, icon('pencil', 15), h('span', {}, 'Editing ', h('strong', {}, space.name), '. Changes save as you go.')),
    h('div', { class: 'edit-bar__actions' },
      layoutPicker(),
      featuredPicker(),
      hasPhoneOrder() ? h('button', { type: 'button', class: 'link-button edit-bar__phone-reset', title: 'Phones show modules in the page’s own order again', onClick: resetPhoneOrder }, icon('phone', 13), ' Reset phone order') : null,
      isGroup ? h('button', {
        type: 'button',
        class: 'button button--small',
        onClick: () => { cameFromEditing = true; setMemberView(true); },
      }, icon('eye', 14), ' See it as a member') : null,
      h('button', {
        type: 'button',
        class: 'button button--primary button--small',
        onClick: () => { cameFromEditing = false; setEditMode(false); },
      }, icon('check', 14), ' Done editing')));
}

/** A small drawing of a layout, for its menu item. */
const SKETCH = {
  grid: [[0, 0, 7, 4], [8, 0, 4, 4], [0, 5, 4, 3], [5, 5, 7, 3]],
  spotlight: [[0, 0, 3, 3], [0, 4, 3, 4], [4, 0, 4, 8, 1], [9, 0, 3, 5], [9, 6, 3, 2]],
  sidebar: [[0, 0, 8, 8, 1], [9, 0, 3, 3], [9, 4, 3, 4]],
  magazine: [[0, 0, 12, 3, 1], [0, 4, 4, 4], [4.5, 4, 3.5, 4], [8.5, 4, 3.5, 4]],
  channels: [[0, 0, 3, 8], [4, 0, 8, 8, 1]],
  tiles: [[0, 0, 3.6, 3.6], [4.2, 0, 3.6, 3.6], [8.4, 0, 3.6, 3.6], [0, 4.4, 3.6, 3.6], [4.2, 4.4, 3.6, 3.6], [8.4, 4.4, 3.6, 3.6]],
  split: [[0, 0, 5.6, 8], [6.4, 0, 5.6, 8]],
  single: [[3, 0, 6, 2.5], [3, 3, 6, 5, 1]],
  masonry: [[0, 0, 3.6, 5], [0, 5.6, 3.6, 2.4], [4.2, 0, 3.6, 2.5], [4.2, 3, 3.6, 5], [8.4, 0, 3.6, 8]],
  lanes: [[0, 0, 3, 8], [3.6, 0, 3, 8], [7.2, 0, 3, 8], [10.8, 0, 1.2, 8]],
  storefront: [[0, 0, 12, 3, 1], [0, 3.6, 8, 4.4], [8.6, 3.6, 3.4, 4.4]],
  timeline: [[0.8, 0, 0.4, 8], [2, 0, 10, 2.2], [2, 2.9, 10, 2.2], [2, 5.8, 10, 2.2]],
};
function sketch(id) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '-0.5 -0.5 13 9');
  svg.setAttribute('width', '39');
  svg.setAttribute('height', '27');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('layout-menu__sketch');
  for (const [x, y, w, hh, featured] of SKETCH[id] ?? []) {
    const rect = document.createElementNS(ns, 'rect');
    Object.entries({ x, y, width: w, height: hh, rx: 0.5 }).forEach(([k, v]) => rect.setAttribute(k, String(v)));
    if (featured) rect.classList.add('is-featured');
    svg.append(rect);
  }
  return svg;
}

let layoutMenuOpen = false;
function layoutPicker() {
  const current = getPageLayout();
  const menu = h('div', { class: 'layout-menu', role: 'menu', 'aria-label': 'Page layouts', hidden: !layoutMenuOpen },
    LAYOUTS.map((layout) => h('button', {
      type: 'button',
      role: 'menuitemradio',
      'aria-checked': String(layout.id === current.kind),
      class: `layout-menu__item${layout.id === current.kind ? ' is-current' : ''}`,
      onClick: () => { layoutMenuOpen = false; setPageLayout(layout.id); },
    }, sketch(layout.id), h('span', { class: 'layout-menu__text' }, h('strong', {}, layout.label), h('span', {}, layout.description)))));
  const button = h('button', {
    type: 'button',
    class: 'button button--small layout-menu__button',
    'aria-haspopup': 'true',
    'aria-expanded': String(layoutMenuOpen),
    onClick: () => { layoutMenuOpen = !layoutMenuOpen; draw(); },
  }, sketch(current.kind), ` Layout: ${layoutById(current.kind).label}`, icon('chevronUp', 12));
  if (layoutMenuOpen) {
    const close = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'pointerdown' && wrapper.contains(event.target)) return;
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', close, true);
      if (layoutMenuOpen) { layoutMenuOpen = false; draw(); }
    };
    setTimeout(() => { document.addEventListener('pointerdown', close, true); document.addEventListener('keydown', close, true); });
  }
  const wrapper = h('div', { class: 'layout-menu__wrap' }, menu, button);
  if (layoutMenuOpen) requestAnimationFrame(() => keepMenuOnScreen(menu, wrapper));
  return wrapper;
}

/**
 * Slide the open Layout menu sideways so all of it is on screen. It opens
 * from the button's left edge, which on a phone can push it off either side.
 */
function keepMenuOnScreen(menu, wrapper) {
  if (!menu.isConnected) return;
  const margin = 8;
  const anchor = wrapper.getBoundingClientRect().left;
  const width = menu.getBoundingClientRect().width;
  const left = Math.max(margin, Math.min(anchor, window.innerWidth - margin - width));
  menu.style.left = `${left - anchor}px`;
  menu.style.right = 'auto';
}

function featuredPicker() {
  const layout = getPageLayout();
  if (!layoutById(layout.kind).featured) return null;
  const modules = getVisibleModules();
  if (modules.length < 2) return null;
  return [h('label', { class: 'edit-bar__featured' }, 'Featured ',
    h('select', { class: 'input input--compact', 'aria-label': 'Featured module', onChange: (event) => setFeaturedModule(event.target.value) },
      modules.map((m) => h('option', { value: m.id, selected: m.id === layout.featuredId }, m.title)))),
    // Its height was set with the resize handle: back to growing with its content.
    layout.featuredRows ? h('button', { type: 'button', class: 'link-button edit-bar__fit', onClick: () => setFeaturedRows(null) }, 'Fit to content') : null];
}
