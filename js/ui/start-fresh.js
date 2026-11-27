// @ts-check
/**
 * start-fresh.js — prototype only (Nov 27): the two buttons that change
 * what's in this browser's 3den, each needing a second click (confirm()
 * dialogs are blocked in the sandbox, and both throw away everything):
 *
 *   [Start fresh]         empty 3den, nobody signed in (store.startFresh)
 *   [Bring back the samples]  the sample data again (store.resetToDemo)
 *
 * On the sign-in page (auth-view.js), and beside Reset demo in edit mode.
 */

import { h } from './dom.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';
import { startFresh, resetToDemo } from '../state/store.js';
import { goTo } from '../router.js';

const CONFIRM_MS = 4000;

/** A button that asks "Click again to …" before it acts. */
function twoClick(label, armedLabel, iconName, act) {
  let armed = false;
  let timer = null;
  const button = h('button', { type: 'button', class: 'button button--quiet start-fresh' }, icon(iconName, 16), ` ${label}`);
  const disarm = () => { armed = false; button.classList.remove('button--danger'); button.replaceChildren(icon(iconName, 16), ` ${label}`); };
  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.classList.add('button--danger');
      button.textContent = armedLabel;
      timer = setTimeout(disarm, CONFIRM_MS);
      return;
    }
    clearTimeout(timer);
    act();
  });
  return button;
}

/** Empty this browser's 3den, then make an account. */
export function startFreshButton() {
  return twoClick('Start fresh', 'Click again to empty 3den', 'trash', () => {
    startFresh();
    goTo('#signup');
    showToast('3den is empty. Make your account to start filling it.');
  });
}

/** Put the sample data back (after Start fresh). */
export function bringBackSamplesButton() {
  return twoClick('Bring back the samples', 'Click again to bring them back', 'reset', () => {
    resetToDemo();
    goTo('#');
    showToast('The sample data is back.');
  });
}
