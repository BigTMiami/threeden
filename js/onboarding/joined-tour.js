// @ts-check
/**
 * joined-tour.js — after someone makes an account from a group's link and
 * joins (Nov 20), two tutorial cards point them to their homepage:
 *
 *   1. 15 seconds after they land in the group:
 *        NEXT STEP                                    ×
 *        Your homepage
 *        Everything you're in, in one place …
 *        [Go to my homepage]
 *      with the Home link outlined (the top bar's Home; on phones the tab bar's).
 *
 *   2. Once they open their homepage, three steps on it (Back / Next):
 *        1 of 3  Welcome to your homepage! You can manage all your groups and events here!
 *        2 of 3  Your dashboard     (the Dashboard module outlined)
 *        3 of 3  Your vault         (the vault outlined)  [Done]
 *      A step whose module isn't on the homepage is left out.
 *
 * Going home before the 15 seconds are up skips straight to the welcome.
 * Done ends it for good. × pauses it, and so does leaving partway (Nov 20):
 * the next time they open 3den, a card asks
 *   "Welcome back! Want to finish the tour where you left off?"  [Resume] [No thanks]
 * Resume points them home again (or opens the homepage step they were on);
 * No thanks ends it. Who gets it: an account made in the last
 * hour whose onboarding says it arrived from a group (arrival.source
 * 'group': the invite page or a group's Join button) and is a member now.
 * Progress lives in member.onboarding.joinedTour, so a reload carries on:
 *   { stage: 'wait' | 'next' | 'home' | 'paused' | 'done', since, step, was }
 *   (step: on the homepage; was: the stage it was paused at)
 *
 *   syncJoinedTour()   main.js, after each page is drawn
 */

import { h } from '../ui/dom.js';
import { goTo, spaceHref, getRoute } from '../router.js';
import { getCurrentUser, getSpace, getPersonalSpace, getCurrentSpace } from '../state/store.js';
import { getOnboarding, updateOnboarding } from './onboarding-state.js';

/** How long after joining the "Next step" card waits. */
export const NEXT_STEP_DELAY_MS = 15000;
/** Only accounts this new get it. */
const NEW_ACCOUNT_MS = 60 * 60 * 1000;

let card = null;
const pageOpenedAt = Date.now();
let cardStage = null;
let timer = null;
let keepSpot = null;
let spotted = null;

function stateOf() {
  const me = getCurrentUser();
  const onboarding = getOnboarding();
  if (!me || !onboarding || onboarding.source !== 'group') return null;
  const tour = onboarding.joinedTour ?? null;
  if (tour?.stage === 'done') return null;
  if (!tour) {
    // Not started: only for a new account that has joined the group it came from.
    const group = getSpace(onboarding.spaceId);
    if (!group?.memberIds.includes(me.id) || Date.now() - (me.createdAt ?? 0) > NEW_ACCOUNT_MS) return null;
  }
  return tour ?? { stage: 'new', since: 0 };
}

/** Is their own homepage on screen (not one of its module pages or settings)? */
const onHomepage = () => {
  const home = getPersonalSpace();
  return Boolean(home) && getRoute().page === 'home' && getCurrentSpace()?.id === home.id;
};

/** The Home link someone can see now: the tab bar's on a phone, the top bar's otherwise. */
function homeLink() {
  const home = getPersonalSpace();
  const candidates = [
    ...document.querySelectorAll(home ? `.tab-bar__tab[href="${spaceHref(home.id)}"]` : '.tab-bar__tab'),
    ...document.querySelectorAll('.app-bar__home'),
  ];
  return /** @type {HTMLElement | undefined} */ (candidates.find((el) => /** @type {HTMLElement} */ (el).offsetParent !== null));
}

function unspot() {
  spotted?.classList.remove('tour-spot', 'tour-spot--steady');
  spotted = null;
  clearInterval(keepSpot);
  keepSpot = null;
}

/** Outline something (the Home link, a module), and keep it outlined when the page is drawn again. */
function spotHome(find = homeLink, { scroll = false } = {}) {
  unspot();
  let scrolled = false;
  const apply = () => {
    const el = find();
    if (el && scroll && !scrolled) { scrolled = true; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    if (el && el !== spotted) { spotted?.classList.remove('tour-spot', 'tour-spot--steady'); el.classList.add('tour-spot', 'tour-spot--steady'); spotted = el; }
  };
  apply();
  keepSpot = setInterval(apply, 500);
}

function closeCard() {
  unspot();
  card?.remove();
  card = null;
  cardStage = null;
}

function end() {
  clearTimeout(timer);
  timer = null;
  closeCard();
  updateOnboarding({ joinedTour: { stage: 'done', since: Date.now() } });
}

/** × : put it aside until their next visit, remembering where they were. */
function pause() {
  const tour = getOnboarding()?.joinedTour ?? {};
  clearTimeout(timer);
  timer = null;
  closeCard();
  newVisit = false; // put aside this visit: ask again on the next one
  updateOnboarding({ joinedTour: { stage: 'paused', since: Date.now(), step: tour.step ?? 0, was: tour.stage === 'paused' ? tour.was : tour.stage ?? 'wait' } });
}

// A visit is one browser session: the tour asks to resume once per new one.
const SESSION_KEY = '3den.joinedTour.session';
function isNewVisit() {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
    sessionStorage.setItem(SESSION_KEY, '1');
    return true;
  } catch { return false; }
}
let visitChecked = false;
let newVisit = false;

function showResume(tour) {
  if (cardStage === 'resume') return;
  closeCard();
  const resume = () => {
    closeCard();
    // Back to pointing them home, or straight to the homepage step they were on.
    updateOnboarding({ joinedTour: { stage: tour.was === 'home' && onHomepage() ? 'home' : 'next', since: Date.now(), step: tour.step ?? 0 } });
    syncJoinedTour();
  };
  card = h('aside', { class: 'tour-card joined-tour joined-tour--resume', role: 'dialog', 'aria-label': 'Finish the tour?', 'aria-live': 'polite' },
    h('div', { class: 'tour-card__top' },
      h('span', { class: 'tour-card__count joined-tour__kicker' }, 'Welcome back'),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => { newVisit = false; closeCard(); } }, '×')),
    h('strong', { class: 'tour-card__title' }, 'Finish the tour?'),
    h('p', { class: 'tour-card__text' }, 'Welcome back! Want to finish the tour where you left off?'),
    h('div', { class: 'tour-card__actions' },
      h('button', { type: 'button', class: 'button button--small button--quiet', onClick: end }, 'No thanks'),
      h('button', { type: 'button', class: 'button button--small button--primary', onClick: resume }, 'Resume')));
  document.body.append(card);
  cardStage = 'resume';
  card.querySelector('.button--primary')?.focus({ preventScroll: true });
}

function showNextStep() {
  if (cardStage === 'next') return;
  closeCard();
  const home = getPersonalSpace();
  card = h('aside', { class: 'tour-card joined-tour', role: 'dialog', 'aria-label': 'Next step', 'aria-live': 'polite' },
    h('div', { class: 'tour-card__top' },
      h('span', { class: 'tour-card__count joined-tour__kicker' }, 'Next step'),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: pause }, '×')),
    h('strong', { class: 'tour-card__title' }, 'Your homepage'),
    h('p', { class: 'tour-card__text' }, 'Everything you’re in, in one place: your groups, your events, and what’s coming up. It’s where to go next.'),
    h('div', { class: 'tour-card__actions' },
      h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => { if (home) goTo(spaceHref(home.id)); } }, 'Go to my homepage')));
  document.body.append(card);
  cardStage = 'next';
  spotHome();
}

/** The homepage's steps: the welcome, then the Dashboard and the vault if they're there. */
function homeSteps() {
  const modules = getPersonalSpace()?.modules ?? [];
  const dashboard = modules.find((m) => m.type === 'dashboard');
  const vault = modules.find((m) => m.type === 'vault');
  return [
    { kicker: 'Your homepage', title: 'Welcome to your homepage!', text: 'You can manage all your groups and events here!' },
    dashboard ? { kicker: 'Your homepage', title: 'Your dashboard', moduleId: dashboard.id,
      text: 'What’s coming up across all your groups: events you’re going to or invited to, tasks that are yours, and things waiting for your answer. Answer right from here.' } : null,
    vault ? { kicker: 'Your homepage', title: 'Your vault', moduleId: vault.id,
      text: 'Your own files: documents, spreadsheets, presentations, photos, and more. Only you can see them until you share one, or publish it to a group or your blog.' } : null,
  ].filter(Boolean);
}

/** A module on the page someone can see (a card, or a widget on a phone). */
const moduleOnPage = (moduleId) => () => /** @type {HTMLElement | undefined} */ ([...document.querySelectorAll(`[data-module-id="${moduleId}"], [data-widget-id="${moduleId}"]`)]
  .find((el) => /** @type {HTMLElement} */ (el).offsetParent !== null && !el.closest('.joined-tour')));

function showHomeStep(i) {
  const steps = homeSteps();
  const step = steps[Math.min(i, steps.length - 1)];
  const at = steps.indexOf(step);
  if (cardStage === `home:${at}`) return;
  closeCard();
  const last = at === steps.length - 1;
  const go = (n) => { updateOnboarding({ joinedTour: { stage: 'home', since: Date.now(), step: n } }); showHomeStep(n); };
  card = h('aside', { class: 'tour-card joined-tour joined-tour--home', role: 'dialog', 'aria-label': step.title, 'aria-live': 'polite' },
    h('div', { class: 'tour-card__top' },
      h('span', { class: 'tour-card__count joined-tour__kicker' }, steps.length > 1 ? `${step.kicker} · ${at + 1} of ${steps.length}` : step.kicker),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: pause }, '×')),
    h('strong', { class: 'tour-card__title' }, step.title),
    h('p', { class: 'tour-card__text' }, step.text),
    h('div', { class: 'tour-card__actions' },
      at ? h('button', { type: 'button', class: 'button button--small button--quiet', onClick: () => go(at - 1) }, 'Back') : null,
      last
        ? h('button', { type: 'button', class: 'button button--small button--primary', onClick: end }, steps.length > 1 ? 'Done' : 'Got it')
        : h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => go(at + 1) }, 'Next')));
  document.body.append(card);
  cardStage = `home:${at}`;
  if (step.moduleId) spotHome(moduleOnPage(step.moduleId), { scroll: true });
  card.querySelector('.button--primary')?.focus({ preventScroll: true });
}

/** main.js calls this after each page is drawn. */
export function syncJoinedTour() {
  const tour = stateOf();
  if (!visitChecked && tour) { visitChecked = true; newVisit = isNewVisit(); }
  if (!tour) { if (card) closeCard(); clearTimeout(timer); timer = null; return; }

  // Paused (×), or left partway on an earlier visit: ask once this visit whether to pick it up.
  const leftPartway = newVisit && ['wait', 'next', 'home'].includes(tour.stage) && tour.since && tour.since < pageOpenedAt;
  if (tour.stage === 'paused' || leftPartway) {
    if (!newVisit) return; // paused this visit: wait for the next one
    showResume(tour.stage === 'paused' ? tour : { ...tour, was: tour.stage });
    return;
  }
  if (cardStage === 'resume') return;

  // Home already (any time before the end): the welcome.
  if (onHomepage()) {
    clearTimeout(timer);
    timer = null;
    if (tour.stage !== 'home') updateOnboarding({ joinedTour: { stage: 'home', since: Date.now(), step: 0 } });
    showHomeStep(tour.stage === 'home' ? tour.step ?? 0 : 0);
    return;
  }
  if (tour.stage === 'home') { closeCard(); return; } // they saw the welcome and wandered off: it waits for home

  if (tour.stage === 'new') {
    updateOnboarding({ joinedTour: { stage: 'wait', since: Date.now() } });
    tour.stage = 'wait';
    tour.since = Date.now();
  }
  if (tour.stage === 'next') { showNextStep(); return; }
  // Waiting: show the next step once 15 seconds have passed since they joined.
  if (!timer) {
    const left = Math.max(0, tour.since + NEXT_STEP_DELAY_MS - Date.now());
    timer = setTimeout(() => {
      timer = null;
      const now = stateOf();
      if (!now || now.stage === 'home') return;
      if (onHomepage()) { syncJoinedTour(); return; }
      updateOnboarding({ joinedTour: { stage: 'next', since: Date.now() } });
      showNextStep();
    }, left);
  }
}
