// @ts-check
/**
 * mobile-editor.js — Edit → Edit mobile (Nov 18): arranging a group's phone
 * screen from a computer.
 *
 *   [▦ Layouts ▾] [📱 Edit mobile] [👁 Preview] [✓ Done editing]
 *
 *   ┌─ phone ───────────┐   Phone layout
 *   │ ⠿ ‹ › [S|W|Big]   │   On a phone, 14 Juniper Lane opens on these
 *   │ ┌───────────────┐ │   widgets. Tapping one opens its module, and
 *   │ │ Up next       │ │   people swipe between modules in this order.
 *   │ └───────────────┘ │   [Reset phone layout]  [Back to the page]
 *   └───────────────────┘
 *
 * While it's on, the page's modules give way to a phone-sized copy of the
 * widget screen (mobile-widgets.js renderWidget). Each widget has a grip to
 * drag it (pointer events, so touch and pen work too), ‹ › to move it with
 * the keyboard, and Small / Wide / Big. Changes save at once, per tab, in the same
 * places phones read them: space.mobileOrders (store.setPhoneOrder,
 * setPhonePosition) and space.mobileWidgets (store.setWidgetSize).
 * Done editing, leaving the page, or a phone-sized window turns it off.
 *
 * On a phone (Nov 18) this IS editing a group or your homepage: Edit shows
 * the widgets with the same controls plus × (take the module off the page,
 * with Undo), under "+ Add modules"; there's no toggle, no phone frame, and
 * no Layouts (widgets, then modules, is the only layout on phones).
 *
 *   initMobileEditor()       once, at startup
 *   isMobileEditing()
 *   setMobileEditing(on)
 *   mobileEditToggle()       the header button, for edit-bar.js
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { getCurrentSpace, getCurrentTabId, getCurrentUser, isEditMode, subscribe, setPhoneOrder, setPhonePosition, setWidgetSize, widgetSize, hasPhoneOrder, resetPhoneOrder } from '../state/store.js';
import { renderWidget, widgetModules, WIDGET_KINDS } from './mobile-widgets.js';
import { handleRemove } from './module-frame.js';

const PHONE = window.matchMedia('(max-width: 640px)');
let on = false;
let container = null;
let lastKey = '';

const widgetPage = () => isEditMode() && WIDGET_KINDS.includes(getCurrentSpace()?.kind);
/** On a phone, editing a group or your homepage is editing its widgets. */
export const isPhoneEditing = () => PHONE.matches && widgetPage();
/** On a computer, Edit mobile switches to it. */
export const isMobileEditing = () => isPhoneEditing() || (on && !PHONE.matches && widgetPage());

export function setMobileEditing(value) {
  on = Boolean(value);
  draw();
  document.querySelectorAll('.space-header__mobile').forEach((button) => {
    button.classList.toggle('is-on', isMobileEditing());
    button.setAttribute('aria-pressed', String(isMobileEditing()));
  });
}

/** The "Edit mobile" toggle in the page header while editing a group. */
export function mobileEditToggle() {
  if (PHONE.matches || !WIDGET_KINDS.includes(getCurrentSpace()?.kind)) return null;
  return h('button', {
    type: 'button',
    class: `button space-header__mobile${isMobileEditing() ? ' is-on' : ''}`,
    'aria-pressed': String(isMobileEditing()),
    title: 'Arrange what this page looks like on a phone',
    onClick: () => setMobileEditing(!on),
  }, icon('phone', 16), ' Edit mobile');
}

/** Drag a widget by its grip; the others make room as it passes. */
function startDrag(event, cell, gridEl) {
  if (event.button !== 0) return;
  event.preventDefault();
  const grip = /** @type {HTMLElement} */ (event.currentTarget);
  grip.setPointerCapture?.(event.pointerId);
  const before = [...gridEl.children].map((c) => /** @type {HTMLElement} */ (c).dataset.widgetId);
  cell.classList.add('is-dragging');
  const move = (e) => {
    const target = /** @type {HTMLElement | null} */ (document.elementFromPoint(e.clientX, e.clientY)?.closest('.mobile-editor .mwidgets__cell'));
    if (!target || target === cell) return;
    const cells = [...gridEl.children];
    if (cells.indexOf(target) > cells.indexOf(cell)) target.after(cell); else target.before(cell);
  };
  const end = (e, cancel = false) => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancelled);
    document.removeEventListener('keydown', escape, true);
    cell.classList.remove('is-dragging');
    const after = [...gridEl.children].map((c) => /** @type {HTMLElement} */ (c).dataset.widgetId);
    if (cancel || after.join() === before.join()) { draw(); return; }
    setPhoneOrder(after);
  };
  const up = (e) => end(e);
  const cancelled = (e) => end(e, true);
  const escape = (e) => { if (e.key === 'Escape') { e.preventDefault(); end(e, true); } };
  // On the document: moving the widget in the page drops the grip's pointer capture.
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', cancelled);
  document.addEventListener('keydown', escape, true);
}

function controlsFor(module, index, count, space, gridEl) {
  const size = widgetSize(module, space);
  const name = module.title || 'this module';
  const move = (to) => { setPhonePosition(module.id, to); requestAnimationFrame(() => container?.querySelector(`[data-widget-id="${module.id}"] .mwidget__move--${to < index + 1 ? 'earlier' : 'later'}`)?.focus()); };
  const grip = h('button', { type: 'button', class: 'mwidget__grip', 'aria-label': `Drag ${name} to move it`, title: 'Drag to move' }, icon('grip', 15));
  grip.addEventListener('pointerdown', (event) => startDrag(event, grip.closest('.mwidgets__cell'), gridEl));
  return h('div', { class: 'mwidget__controls' },
    grip,
    h('button', { type: 'button', class: 'mwidget__move mwidget__move--earlier', 'aria-label': `Move ${name} earlier`, title: 'Earlier', disabled: index === 0, onClick: () => move(index) }, icon('chevronLeft', 15)),
    h('button', { type: 'button', class: 'mwidget__move mwidget__move--later', 'aria-label': `Move ${name} later`, title: 'Later', disabled: index === count - 1, onClick: () => move(index + 2) }, icon('chevronRight', 15)),
    h('span', { class: 'mwidget__sizes', role: 'group', 'aria-label': `Size of ${name}` },
      ['small', 'wide', 'big'].map((value) => h('button', {
        type: 'button', class: `mwidget__size${size === value ? ' is-on' : ''}`, 'aria-pressed': String(size === value),
        onClick: () => { if (size !== value) setWidgetSize(module.id, value); },
      }, { small: 'Small', wide: 'Wide', big: 'Big' }[value]))),
    // Take it off the page (a copy is kept; the toast has Undo).
    h('button', { type: 'button', class: 'mwidget__remove', 'aria-label': `Remove ${name} from the page`, title: 'Remove', onClick: () => handleRemove(module.id) }, icon('trash', 15)));
}

function draw() {
  if (!container) return;
  const key = `${getCurrentSpace()?.id}:${getCurrentTabId()}`;
  if (key !== lastKey && lastKey) on = false; // another page or tab: back to the page
  lastKey = key;
  const showing = isMobileEditing();
  document.documentElement.classList.toggle('mobile-editing', showing);
  container.hidden = !showing;
  if (!showing) { replaceChildren(container); return; }
  const space = getCurrentSpace();
  const me = getCurrentUser();
  const modules = widgetModules();
  const tab = space.tabs?.length > 1 ? space.tabs.find((t) => t.id === getCurrentTabId()) : null;
  const phone = PHONE.matches;
  container.classList.toggle('mobile-editor--phone', phone);
  const gridEl = h('div', { class: 'mwidgets__grid', role: 'list', 'aria-label': 'Widgets, in phone order' });
  modules.forEach((module, index) => gridEl.append(h('div', { role: 'listitem', class: `mwidgets__cell mwidgets__cell--${widgetSize(module, space)}`, dataset: { widgetId: module.id } },
    renderWidget(module, space, me, { controls: controlsFor(module, index, modules.length, space, gridEl) }))));
  const empty = h('p', { class: 'module-empty' }, phone ? 'Nothing here yet. Add modules: each one gets a widget.' : 'Add modules to this page first: each one gets a widget.');
  if (phone) {
    replaceChildren(container,
      h('p', { class: 'mobile-editor__hint' }, 'Drag ', icon('grip', 13), ' or use ‹ › to move a widget. Tapping a widget opens its module, in this order.'),
      modules.length ? gridEl : empty,
      hasPhoneOrder() ? h('button', { type: 'button', class: 'button button--small mobile-editor__reset', onClick: () => { resetPhoneOrder(); showToast('Back to the page’s own order and sizes.'); } }, icon('reset', 14), ' Reset order and sizes') : null);
    return;
  }
  replaceChildren(container,
    h('div', { class: 'mobile-editor__phone' },
      h('div', { class: 'mobile-editor__screen' },
        h('div', { class: 'mobile-editor__group' }, h('strong', {}, space.name), tab ? h('span', {}, tab.name) : null),
        modules.length ? gridEl : empty)),
    h('aside', { class: 'mobile-editor__side' },
      h('h2', { class: 'mobile-editor__title' }, 'Phone layout', tab ? h('span', { class: 'mobile-editor__tab' }, ` · ${tab.name} tab`) : null),
      h('p', {}, `On a phone, ${space.kind === 'personal' ? 'your homepage' : space.name} opens on these widgets. Tapping one opens its module, and people swipe between modules in this same order.`),
      h('ul', { class: 'mobile-editor__tips' },
        h('li', {}, 'Drag a widget by ', icon('grip', 13), ' to move it, or use ‹ ›.'),
        h('li', {}, 'Small takes half the width; Wide takes all of it; Big is as wide and twice as tall, and shows the next few things.')),
      h('div', { class: 'form-row' },
        hasPhoneOrder() ? h('button', { type: 'button', class: 'button', onClick: () => { resetPhoneOrder(); showToast('Phones follow the page’s own order again.'); } }, icon('reset', 14), ' Reset phone layout') : null,
        h('button', { type: 'button', class: 'button button--quiet', onClick: () => setMobileEditing(false) }, 'Back to the page'))));
}

export function initMobileEditor() {
  container = h('section', { id: 'mobile-editor', class: 'mobile-editor', 'aria-label': 'Phone layout', hidden: true });
  document.getElementById('homepage-grid')?.before(container);
  subscribe('mode', () => { if (!isEditMode()) on = false; draw(); });
  subscribe('layout', draw);
  PHONE.addEventListener('change', draw);
  window.addEventListener('hashchange', () => requestAnimationFrame(draw));
  draw();
}
