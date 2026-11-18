// @ts-check
/**
 * edit-bar.js — the editing controls in a page's header (Nov 17; they used
 * to sit in a bar at the bottom of the screen).
 *
 *   Not editing:  [✎ Edit ▾]
 *   Editing:      [▦ Layouts ▾] [📱 Edit mobile] [👁 Preview] [✓ Done editing]
 *                 (Edit mobile in groups and on your homepage: their phone widgets, mobile-editor.js)
 *   Previewing:   👁 Previewing (as a member)  [Back to editing]
 *
 * Layouts opens the page layouts (js/editor/page-layouts.js), each with a
 * small drawing; it applies to the tab you're on. Under them, a layout with
 * a featured column has its Featured picker (and "Fit to content" once its
 * height was set), and "Reset phone order" once someone has set the order
 * modules come in on phones. Last, "Copy this page's layout" writes the
 * page's shape out as text to share (copy-layout.js).
 *
 * Preview shows the page without the editing controls. In a group it turns
 * your admin role off for the group until you come back (store.setMemberView),
 * so tabs, buttons, and settings links that only admins get disappear, just
 * as members see it. Leaving the page ends the preview.
 *
 *   initEditBar()            once, at startup (ends a preview when you leave the page)
 *   editingControls()        → the three buttons, for space-header.js
 *   previewControls(space)   → the "Previewing" note and Back to editing
 *   isPagePreview()          → is the page being previewed?
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getCurrentSpace, getVisibleModules, isEditMode, isMemberView, setEditMode, setMemberView, subscribe, getPageLayout, setPageLayout, setFeaturedModule, setFeaturedRows, hasPhoneOrder, resetPhoneOrder } from '../state/store.js';
import { LAYOUTS, layoutById } from './page-layouts.js';
import { openCopyLayout } from './copy-layout.js';
import { mobileEditToggle, setMobileEditing } from './mobile-editor.js';
import { getRoute, onRouteChange } from '../router.js';

/** The space being previewed (personal pages and blogs; groups use the member view). */
let previewSpaceId = null;

export function isPagePreview() {
  const space = getCurrentSpace();
  return Boolean(space) && (isMemberView() || previewSpaceId === space.id);
}

export function initEditBar() {
  const update = () => {
    const space = getCurrentSpace();
    const onHome = getRoute().page === 'home';
    // Leaving the page (to a module, settings, another page) ends a preview.
    if (isMemberView() && !onHome) setMemberView(false);
    if (previewSpaceId && (!onHome || space?.id !== previewSpaceId)) previewSpaceId = null;
    if (isEditMode()) previewSpaceId = null;
    document.body.classList.toggle('is-editing-page', onHome && (isEditMode() || isPagePreview()));
  };
  for (const event of ['mode', 'space']) subscribe(event, update);
  onRouteChange(update);
  update();
}

/** Preview: the page as people see it, without the editing controls. */
function startPreview() {
  const space = getCurrentSpace();
  layoutMenuOpen = false;
  setMobileEditing(false); // the preview is of the page
  if (space?.kind === 'group') { setMemberView(true); return; }
  previewSpaceId = space?.id ?? null;
  setEditMode(false);
}

function backToEditing() {
  if (isMemberView()) { setMemberView(false, { backToEditing: true }); return; }
  previewSpaceId = null;
  setEditMode(true);
}

export function editingControls() {
  return [
    layoutsControl(),
    mobileEditToggle(), // groups and your homepage: arrange the phone's widgets (mobile-editor.js)
    h('button', { type: 'button', class: 'button space-header__preview', onClick: startPreview }, icon('eye', 16), ' Preview'),
    h('button', {
      type: 'button',
      class: 'button button--primary space-header__done',
      onClick: () => { layoutMenuOpen = false; setEditMode(false); },
    }, icon('check', 16), ' Done editing'),
  ];
}

export function previewControls(space) {
  return [
    h('span', { class: 'space-header__previewing', role: 'status' }, icon('eye', 15), space.kind === 'group' ? ' Previewing as a member' : ' Previewing'),
    h('button', { type: 'button', class: 'button button--primary', onClick: backToEditing }, icon('pencil', 16), ' Back to editing'),
  ];
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

/** Whether the Layouts menu is open (kept while the header redraws). */
let layoutMenuOpen = false;

const PHONE = window.matchMedia('(max-width: 640px)');

/** "Layouts": the layouts, then the featured column's picker and the phone order. */
function layoutsControl() {
  // On a phone, groups and homepages have one layout: widgets, then modules (mobile-editor.js).
  if (PHONE.matches && ['group', 'personal'].includes(getCurrentSpace()?.kind)) return null;
  const current = getPageLayout();
  const menu = h('div', { class: 'layout-menu layout-menu--down', role: 'menu', 'aria-label': 'Page layouts', hidden: !layoutMenuOpen },
    h('div', { class: 'layout-menu__layouts' }, LAYOUTS.map((layout) => h('button', {
      type: 'button',
      role: 'menuitemradio',
      'aria-checked': String(layout.id === current.kind),
      class: `layout-menu__item${layout.id === current.kind ? ' is-current' : ''}`,
      onClick: () => { layoutMenuOpen = false; setPageLayout(layout.id); },
    }, sketch(layout.id), h('span', { class: 'layout-menu__text' }, h('strong', {}, layout.label), h('span', {}, layout.description))))),
    layoutExtras());
  const button = h('button', {
    type: 'button',
    class: 'button layout-menu__button',
    'aria-haspopup': 'true',
    'aria-expanded': String(layoutMenuOpen),
    title: `Layout: ${layoutById(current.kind).label}`,
    onClick: () => setOpen(!layoutMenuOpen),
  }, sketch(current.kind), ' Layouts', icon('chevronDown', 12));
  const wrapper = h('div', { class: 'layout-menu__wrap' }, button, menu);

  function onOutside(event) {
    if (event.type === 'keydown' && event.key !== 'Escape') return;
    if (event.type === 'pointerdown' && wrapper.contains(event.target)) return;
    setOpen(false);
  }
  function setOpen(open) {
    layoutMenuOpen = open;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onOutside, true);
    if (open) {
      setTimeout(() => { document.addEventListener('pointerdown', onOutside, true); document.addEventListener('keydown', onOutside, true); });
      requestAnimationFrame(() => keepMenuOnScreen(menu, wrapper));
    }
  }
  if (layoutMenuOpen) setOpen(true);
  return wrapper;
}

/** Under the layouts: Featured (and Fit to content), and Reset phone order, when they apply; then Copy this page's layout. */
function layoutExtras() {
  const layout = getPageLayout();
  const modules = getVisibleModules();
  const featured = layoutById(layout.kind).featured && modules.length >= 2;
  const phone = hasPhoneOrder();
  return h('div', { class: 'layout-menu__extras' },
    featured ? h('label', { class: 'layout-menu__featured' }, 'Featured ',
      h('select', { class: 'input input--compact', 'aria-label': 'Featured module', onChange: (event) => setFeaturedModule(event.target.value) },
        modules.map((m) => h('option', { value: m.id, selected: m.id === layout.featuredId }, m.title)))) : null,
    // Its height was set with the resize handle: back to growing with its content.
    featured && layout.featuredRows ? h('button', { type: 'button', class: 'link-button layout-menu__fit', onClick: () => setFeaturedRows(null) }, 'Fit to content') : null,
    phone ? h('button', { type: 'button', class: 'link-button layout-menu__phone-reset', title: 'Phones show modules in the page’s own order again', onClick: resetPhoneOrder }, icon('phone', 13), ' Reset phone order') : null,
    // The prototype keeps pages in this browser: this writes one out as text to share (copy-layout.js).
    h('button', { type: 'button', class: 'link-button layout-menu__copy', onClick: () => { layoutMenuOpen = false; openCopyLayout(); } }, icon('layers', 13), ' Copy this page’s layout'));
}

/**
 * Slide the open Layouts menu sideways so all of it is on screen. It opens
 * under the button's left edge, which can push it off either side.
 */
function keepMenuOnScreen(menu, wrapper) {
  if (!menu.isConnected) return;
  menu.style.left = '';
  menu.style.right = '';
  const margin = 8;
  const anchor = wrapper.getBoundingClientRect().left;
  const width = menu.getBoundingClientRect().width;
  const left = Math.max(margin, Math.min(anchor, window.innerWidth - margin - width));
  menu.style.left = `${left - anchor}px`;
  menu.style.right = 'auto';
}
