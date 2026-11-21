// @ts-check
/**
 * group-setup.js — right after Create a group (Nov 20): pick the modules,
 * then learn to arrange them.
 *
 *   1. A sheet over the new group:
 *        Set up your group's page                    (a group with a public page:
 *                                                      "Set up your group's Private page.
 *                                                       Only members can see this.")
 *        What do you want on your page?
 *        [✓ Up next] [✓ Board] [ Calendar ] [ Chat ] [ Tasks ] …   ← every group module;
 *        [Add to my page]                                             a tap picks or unpicks
 *      Up next and Board start picked. The picked modules go on the members'
 *      page (Home, or the Private tab), in the module list's order.
 *
 *   2. Edit mode turns on, and tutorial cards (bottom left) show how to
 *      arrange them, with the control outlined:
 *        desktop: "Move your modules" (the drag strip) → "Resize them" (the corner) → Done
 *        phone:   "Reorder your modules" (a widget's grip) → Done
 *      Done turns edit mode off.
 *
 * Progress lives in sessionStorage, so a redraw (or a reload) keeps the card;
 * going to another page ends it.
 *
 *   startGroupSetup(groupId)   new-group-page.js, after createGroup
 *   syncGroupSetup()           main.js, after each page is drawn
 */

import { h, makeId, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { isPhone } from '../ui/swipe.js';
import { showToast } from '../ui/toast.js';
import { changeState, getSpace, getState, getCurrentSpace, setEditMode, setCurrentTab, getTabs } from '../state/store.js';
import { moduleTypesFor, getModuleType } from '../modules/registry.js';
import { goTo, spaceHref } from '../router.js';

const KEY = '3den.groupSetup';
/** Picked to start with. */
const PICKED_FIRST = ['upnext', 'announcements'];
/** Not offered here: it needs a file picked first. */
const LEFT_OUT = new Set(['vaultfile']);

/** The members' tab: Private on a group with a public page, else Home. */
export const membersTabOf = (group) => (getTabs(group).some((t) => t.id === 'private') ? 'private' : getTabs(group)[0]?.id ?? 'home');
const hasPublicPage = (group) => getTabs(group).some((t) => t.id === 'private');

function saved() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function save(value) {
  try { if (value) sessionStorage.setItem(KEY, JSON.stringify(value)); else sessionStorage.removeItem(KEY); } catch { /* fine */ }
}

/** The modules offered, in the module list's order. */
export function setupChoices() {
  return moduleTypesFor('group').filter((t) => !t.hiddenFromLibrary && t.available !== false && !LEFT_OUT.has(t.type));
}

/** Put the picked modules on the group's members' tab. */
export function addPickedModules(groupId, types) {
  const group = getSpace(groupId);
  if (!group) return;
  const tabId = membersTabOf(group);
  const onHome = tabId === (getTabs(group)[0]?.id ?? 'home');
  const made = types.map((type) => {
    const t = getModuleType(type);
    // Up next leads, full width and short, like a new group's always has.
    const [span, rows] = type === 'upnext' ? [12, 7] : [t.defaultSpan ?? 6, t.defaultRows ?? 10];
    return { id: makeId('mod'), type, title: t.label, span, rows, data: t.createInitialData(getState()), ...(onHome ? {} : { tabId }) };
  });
  changeState(() => { getSpace(groupId).modules.push(...made); }, 'layout');
}

// ─── 1. Pick the modules ────────────────────────────────────────────────────

export function startGroupSetup(groupId) {
  save({ groupId, stage: 'pick' });
  showPicker(groupId);
}

let picker = null;
function showPicker(groupId) {
  const group = getSpace(groupId);
  if (!group || picker) return;
  const picked = new Set(PICKED_FIRST);
  const grid = h('div', { class: 'group-setup__choices', role: 'group', 'aria-label': 'Modules' });
  const count = h('span', { class: 'group-setup__count' });
  const draw = () => {
    replaceChildren(grid, setupChoices().map((t) => {
      const on = picked.has(t.type);
      return h('button', {
        type: 'button', class: `group-setup__choice${on ? ' is-picked' : ''}`, 'aria-pressed': String(on),
        onClick: () => { if (on) picked.delete(t.type); else picked.add(t.type); draw(); },
      },
      h('span', { class: 'group-setup__check', 'aria-hidden': 'true' }, on ? icon('check', 14) : null),
      h('span', { class: 'group-setup__icon', 'aria-hidden': 'true' }, icon(t.icon ?? 'grid', 18)),
      h('span', { class: 'group-setup__text' }, h('strong', {}, t.label), t.description ? h('span', {}, t.description) : null));
    }));
    count.textContent = picked.size === 1 ? '1 picked' : `${picked.size} picked`;
  };
  draw();
  const finish = () => {
    const order = setupChoices().map((t) => t.type).filter((type) => picked.has(type));
    addPickedModules(groupId, order);
    picker?.close();
    picker = null;
    save({ groupId, stage: 'move' });
    // Open the members' tab by its address (the address decides the tab).
    goTo(spaceHref(groupId, membersTabOf(getSpace(groupId))));
    setCurrentTab(membersTabOf(getSpace(groupId)));
    setEditMode(true);
    showToast(order.length ? `Added ${order.length} module${order.length === 1 ? '' : 's'}.` : 'Your page is empty for now. Add modules any time.');
    requestAnimationFrame(() => syncGroupSetup());
  };
  const title = hasPublicPage(group) ? 'Set up your group’s Private page' : 'Set up your group’s page';
  picker = openModal(h('div', { class: 'group-setup' },
    h('h2', { class: 'group-setup__title' }, title),
    hasPublicPage(group) ? h('p', { class: 'group-setup__sub' }, 'Only members can see this.') : null,
    h('p', { class: 'group-setup__ask' }, 'What do you want on your page?'),
    h('p', { class: 'group-setup__hint' }, 'Tap to pick or unpick. You can add, remove, and move modules any time.'),
    grid,
    h('div', { class: 'group-setup__actions' },
      count,
      h('button', { type: 'button', class: 'button button--primary', onClick: finish }, 'Add to my page'))),
  { label: title, className: 'group-setup-modal', onDismiss: finish });
}

// ─── 2. Arrange them ────────────────────────────────────────────────────────

let card = null;
let cardKey = '';
let spotted = null;
let keepSpot = null;

function unspot() {
  spotted?.classList.remove('tour-spot', 'tour-spot--steady');
  spotted = null;
  clearInterval(keepSpot);
  keepSpot = null;
}

function spot(selector) {
  unspot();
  const apply = () => {
    const el = /** @type {HTMLElement | null} */ ([...document.querySelectorAll(selector)].find((e) => /** @type {HTMLElement} */ (e).offsetParent !== null) ?? null);
    if (el && el !== spotted) { spotted?.classList.remove('tour-spot', 'tour-spot--steady'); el.classList.add('tour-spot', 'tour-spot--steady'); spotted = el; }
  };
  apply();
  keepSpot = setInterval(apply, 500);
}

function closeCard() {
  unspot();
  card?.remove();
  card = null;
  cardKey = '';
}

export function endGroupSetup({ leaveEditing = false } = {}) {
  save(null);
  closeCard();
  picker?.close();
  picker = null;
  if (!leaveEditing) setEditMode(false);
}

function steps() {
  if (isPhone()) {
    return [{
      key: 'reorder', title: 'Reorder your modules', target: '.mwidget__grip',
      text: 'Drag a module by its grip to move it, or use ‹ ›. People swipe through them in this order.',
    }];
  }
  return [
    { key: 'move', title: 'Move your modules', target: '.module-frame__drag-strip', text: 'Drag a module by the strip along its top to put it somewhere else on the page.' },
    { key: 'resize', title: 'Resize them', target: '.resize-handle', text: 'Pull a module’s bottom-right corner to make it bigger or smaller.' },
  ];
}

function showStep(groupId, i) {
  const all = steps();
  const step = all[Math.min(i, all.length - 1)];
  const at = all.indexOf(step);
  const key = `${groupId}:${step.key}`;
  if (cardKey === key) return;
  closeCard();
  const last = at === all.length - 1;
  card = h('aside', { class: 'tour-card group-setup-tip', role: 'dialog', 'aria-label': step.title, 'aria-live': 'polite' },
    h('div', { class: 'tour-card__top' },
      h('span', { class: 'tour-card__count' }, all.length > 1 ? `Arrange your page · ${at + 1} of ${all.length}` : 'Arrange your page'),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => endGroupSetup() }, '×')),
    h('strong', { class: 'tour-card__title' }, step.title),
    h('p', { class: 'tour-card__text' }, step.text),
    h('div', { class: 'tour-card__actions' },
      at ? h('button', { type: 'button', class: 'button button--small button--quiet', onClick: () => { save({ groupId, stage: all[at - 1].key }); showStep(groupId, at - 1); } }, 'Back') : null,
      last
        ? h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => { endGroupSetup(); showToast('Your page is set up. Edit it any time.'); } }, 'Done')
        : h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => { save({ groupId, stage: all[at + 1].key }); showStep(groupId, at + 1); } }, 'Next')));
  document.body.append(card);
  cardKey = key;
  spot(step.target);
}

/** main.js calls this after each page is drawn. */
export function syncGroupSetup() {
  const setup = saved();
  if (!setup) { if (card) closeCard(); return; }
  const group = getSpace(setup.groupId);
  if (!group) { endGroupSetup({ leaveEditing: true }); return; }
  // Somewhere else now: it's over.
  if (getCurrentSpace()?.id !== group.id || !/^#?space-/.test(window.location.hash.replace(/^#/, '#'))) {
    endGroupSetup({ leaveEditing: true });
    return;
  }
  if (setup.stage === 'pick') { showPicker(group.id); return; }
  const all = steps();
  const i = Math.max(0, all.findIndex((s) => s.key === setup.stage));
  showStep(group.id, i);
}
