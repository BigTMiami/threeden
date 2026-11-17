// @ts-check
/**
 * get-started.js — what a new person sees above their homepage's modules:
 *
 *   We set this up for your event · Change · ×            ← the setup note
 *   → Next: Find it on your calendar  [Show me]  1 of 3 ×  ← one next step
 *
 * The line shows the first step not done yet (steps tick themselves), then,
 * once they're all done, one suggestion at a time ("Add a Dashboard?").
 *
 * Only on your own homepage, and only for accounts made in the app (the
 * demo people have no onboarding record). "Change" swaps the homepage for
 * another starting layout, with Undo. The steps are in steps.js and the
 * suggestions in suggestions.js.
 *
 * When the homepage's Dashboard is focused on what they came for, the line
 * stays out of the way: the Dashboard shows the next
 * steps (js/modules/dashboard/dashboard-focus.js).
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import {
  getCurrentUser, getCurrentSpace, getPersonalSpace, isEditMode, subscribe, onModuleDataChange, changeState,
} from '../state/store.js';
import { getRoute, goTo } from '../router.js';
import { nextStepLine } from './next-step.js';
import { STARTER_LAYOUTS } from '../data/starter-layouts.js';
import { getOnboarding, updateOnboarding } from './onboarding-state.js';
import { pathFor } from './steps.js';
import { nextSuggestion, dismissSuggestion } from './suggestions.js';
import { focusFor } from '../modules/dashboard/dashboard-focus.js';

let slot = null;
let showingLayouts = false; // the "Change" list is open

export function initGetStarted(container) {
  slot = container;
  for (const event of ['space', 'layout', 'account', 'person', 'notifications', 'mode']) subscribe(event, draw);
  onModuleDataChange(() => draw());
  window.addEventListener('hashchange', draw);
  draw();
}

function draw() {
  const me = getCurrentUser();
  const record = getOnboarding();
  const personal = getPersonalSpace();
  const onMyHomepage = getRoute().page === 'home' && personal && getCurrentSpace()?.id === personal.id;
  if (!me || !record || !onMyHomepage) {
    slot.hidden = true;
    replaceChildren(slot);
    return;
  }

  // Editing the homepage means they've made it their own: the note can go.
  if (isEditMode() && !record.noteDismissed) {
    updateOnboarding({ noteDismissed: true });
    return;
  }

  slot.hidden = false;
  // A Dashboard focused on what they came for shows the next steps itself
  // (dashboard-focus.js), so the card and suggestions step aside: one place
  // to look, not three.
  const dashboardLeads = personal.modules.some((m) => m.type === 'dashboard' && focusFor(me, m.data ?? {}));
  replaceChildren(slot,
    renderSetupNote(record, personal),
    dashboardLeads ? null : renderNextStep(me, record));
  if (!slot.childElementCount) slot.hidden = true;
}

// ─── "We set this up for your event · Change" ───────────────────────────────

function renderSetupNote(record, personal) {
  const layout = STARTER_LAYOUTS[record.layout];
  if (record.noteDismissed || !layout?.note) return null;

  const note = h('div', { class: 'setup-note' },
    h('p', { class: 'setup-note__line' },
      icon('home', 14), ` We set this up for ${layout.note} · `,
      h('button', {
        type: 'button', class: 'link-button', 'aria-expanded': String(showingLayouts),
        onClick: () => { showingLayouts = !showingLayouts; draw(); },
      }, 'Change'),
      h('button', {
        type: 'button', class: 'icon-button icon-button--subtle setup-note__close', 'aria-label': 'Close this note',
        onClick: () => { showingLayouts = false; updateOnboarding({ noteDismissed: true }); },
      }, icon('close', 14))),
    showingLayouts ? h('ul', { class: 'setup-note__layouts' }, Object.entries(STARTER_LAYOUTS).map(([id, option]) => h('li', {},
      h('button', {
        type: 'button',
        class: `setup-note__layout${id === record.layout ? ' is-current' : ''}`,
        'aria-pressed': String(id === record.layout),
        onClick: () => switchLayout(personal, id),
      }, h('strong', {}, option.label), h('span', {}, option.description))))) : null);
  return note;
}

/** Swap the homepage's modules for another starting layout (Undo puts them back). */
function switchLayout(personal, layoutId) {
  const before = { modules: structuredClone(personal.modules), layout: getOnboarding().layout };
  changeState((state) => {
    state.spaces.find((s) => s.id === personal.id).modules = STARTER_LAYOUTS[layoutId].modules();
  }, 'layout');
  showingLayouts = false;
  updateOnboarding({ layout: layoutId });
  showToast(`Switched to “${STARTER_LAYOUTS[layoutId].label}”.`, {
    actionLabel: 'Undo',
    onAction: () => {
      changeState((state) => { state.spaces.find((s) => s.id === personal.id).modules = before.modules; }, 'layout');
      updateOnboarding({ layout: before.layout });
    },
  });
}

// ─── One next step ───────────────────────────────────────────────────────────
//
// The first step not done yet; once they're all done, one suggestion at a
// time; then nothing. (This replaced a checklist card, floating tips, and a
// separate suggestion line: one thing to do, not four.)

function renderNextStep(me, record) {
  if (record.hidden) return null;
  const { steps } = pathFor(me, record);
  const doneCount = steps.filter((s) => s.done).length;
  const step = steps.find((s) => !s.done);
  if (step) {
    return nextStepLine({
      ariaLabel: 'Get started',
      label: step.label,
      href: step.action ? null : step.href ?? null,
      action: step.action ?? (step.href ? { label: 'Go', run: () => goTo(step.href) } : null),
      done: doneCount,
      total: steps.length,
      hideLabel: 'Hide next steps',
      onHide: () => updateOnboarding({ hidden: true }),
    });
  }
  const suggestion = nextSuggestion(me, record);
  if (!suggestion) return null;
  return nextStepLine({
    ariaLabel: 'A suggestion',
    label: suggestion.text,
    action: { label: suggestion.acceptLabel, run: () => { suggestion.accept(); dismissSuggestion(suggestion.id); } },
    hideLabel: 'No thanks',
    onHide: () => dismissSuggestion(suggestion.id),
  });
}
