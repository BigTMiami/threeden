// @ts-check
/**
 * demo-tour.js — "Organizer demo": a walk through 3den as an organizer, on
 * the sample data, for showing it to someone (or seeing it yourself).
 *
 *   Open #tour (Help, the landing page, or the account menu). A small card
 *   sits in the corner and moves the page along, step by step:
 *
 *     ┌ Organizer demo · 3 of 8 ──────────────────── × ┐
 *     │ Members see what needs them first, and can     │
 *     │ answer right here without opening anything.    │
 *     │                         [Back]  [Next]         │
 *     └────────────────────────────────────────────────┘
 *
 * Each step goes to a page and outlines one thing on it (.tour-spot). The
 * page still works: try things, then press Next. The step is kept in
 * sessionStorage, so it survives a reload but not a new window. The last
 * step offers to put the sample data back the way it started.
 */

import { h } from '../ui/dom.js';
import { goTo } from '../router.js';
import { getModule } from '../state/store.js';
import { normalizeEvent } from '../modules/calendar/calendar-data.js';
import { todayKey } from '../utils/dates.js';
import { clearSavedState } from '../state/storage.js';

const KEY = '3den.tour';

function tenantsEventHref() {
  const events = (getModule('tenants-calendar')?.data?.events ?? []).map(normalizeEvent)
    .filter((e) => e.kind !== 'task' && e.date >= todayKey()).sort((a, b) => a.date.localeCompare(b.date));
  return events[0] ? `#event-${events[0].id}` : '#space-tenants';
}

export const TOUR_STEPS = [
  { href: '#space-tenants', spot: '.space-header', title: 'A group', text: 'This is Juniper Tenants Union. A group is a page of modules (news, a calendar, a forum, a door-knocking board), arranged however the organizers like.' },
  { href: '#module-tenants-announcements', spot: '.asks', title: 'Ask, right in the post', text: 'An announcement can ask who’s coming and who’ll take each job. No separate form, no spreadsheet.' },
  { href: '#feed', spot: '.needs', title: 'What needs you', text: 'Members see what their groups need from them first, and can answer here without opening anything.' },
  { href: tenantsEventHref, spot: '.event-page__rsvp', title: 'Every event gets a page', text: 'RSVPs, co-hosts, a waitlist when it fills up, and a reminder for everyone going. After it, a one-tap recap.' },
  { href: '#space-me', spot: '.dashboard', title: 'Your week', text: 'Your dashboard: events you’re going to or invited to, and the tasks that are yours.' },
  { href: '#module-band-merch', spot: '.sheet', title: 'Spreadsheets when you need them', text: 'Budgets, inventories, and sign-up lists, with formulas, sorting, and fill. Shared with the group like any module.' },
  { href: '#directory-tenants', spot: '.directory', title: 'Who’s who', text: 'The member directory: each person’s intro, what they can help with, and how to reach them.' },
  { href: '#new-group', spot: '.new-group-form', title: 'Start yours', text: 'One page: a name, who can see it and how people join, and a template to start from. Then 3den shows you around it.', last: true },
];

let card = null;
let spotted = null;

const stepNow = () => { try { return Number(sessionStorage.getItem(KEY) ?? -1); } catch { return -1; } };
const setStep = (i) => { try { if (i < 0) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, String(i)); } catch { /* storage off: the tour lasts until a reload */ } };

function unspot() { spotted?.classList.remove('tour-spot'); spotted = null; }

function spot(selector) {
  unspot();
  let tries = 0;
  const look = () => {
    const el = [...document.querySelectorAll(selector)].find((e) => e.offsetParent !== null);
    if (el) { el.classList.add('tour-spot'); spotted = el; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if ((tries += 1) < 30) setTimeout(look, 100);
  };
  setTimeout(look, 150);
}

export function endTour() {
  setStep(-1);
  unspot();
  card?.remove();
  card = null;
}

function show(i) {
  const step = TOUR_STEPS[i];
  if (!step) { endTour(); return; }
  setStep(i);
  const href = typeof step.href === 'function' ? step.href() : step.href;
  if (window.location.hash !== href) goTo(href);
  card?.remove();
  card = h('aside', { class: 'tour-card', role: 'dialog', 'aria-label': 'Organizer demo', 'aria-live': 'polite' },
    h('div', { class: 'tour-card__top' },
      h('span', { class: 'tour-card__count' }, `Organizer demo · ${i + 1} of ${TOUR_STEPS.length}`),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'End the demo', onClick: endTour }, '×')),
    h('strong', { class: 'tour-card__title' }, step.title),
    h('p', { class: 'tour-card__text' }, step.text),
    h('div', { class: 'tour-card__actions' },
      step.last ? h('button', {
        type: 'button', class: 'link-button', title: 'Put the sample groups, people, and posts back the way they started',
        onClick: () => { endTour(); clearSavedState(); window.location.hash = '#feed'; window.location.reload(); },
      }, 'Reset the sample data') : null,
      i ? h('button', { type: 'button', class: 'button button--small button--quiet', onClick: () => show(i - 1) }, 'Back') : null,
      h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => (step.last ? endTour() : show(i + 1)) }, step.last ? 'Done' : 'Next')));
  document.body.append(card);
  card.querySelector('.button--primary').focus({ preventScroll: true });
  spot(step.spot);
}

/** main.js calls this after each page is drawn: #tour starts the demo; a tour in progress keeps its card. */
export function syncTour() {
  if (window.location.hash === '#tour') { show(0); return; }
  const i = stepNow();
  if (i < 0) return;
  if (!card) { show(i); return; }
  spot(TOUR_STEPS[i].spot); // the page was redrawn: outline the thing again
}

export function startTour() { show(0); }
