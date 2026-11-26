// @ts-check
/**
 * tutorial.js — the onboarding tutorial, step for step as Leo's onboarding
 * board lays it out (https://claude.ai/artifact/4YoZjJ41hc82h3W3ypBAsE).
 * Each step keeps its id from the board, so a change there maps to one
 * case in stepCard() here. (Nov 21; it replaced joined-tour.js.)
 *
 * Part 1: their first page, then home. Which lane depends on how the new
 * account arrived (member.onboarding.source, set by guest.js):
 *
 *   A · a group's invite link ('group')   A1 Welcome to [Group] → A2, one card
 *       per module on the page → (more tabs) "There's more on [Tab]"
 *   B · an event's link ('event')         B1 You're going! → B2 On your calendar
 *   C · a friend's link or blog ('friend', 'blog')  C1 You and [Name] are friends → C2 Your Feed
 *   E · no link ('direct')                E1 the welcome splash (welcome.js) → H0
 *   (a public page's Follow, and anything else: straight to the wait for H0)
 *
 *   then, on a phone's browser: APP "Download 3den in the App Store…"
 *   then 15 seconds later (going home sooner skips it):
 *   H0 Next step: your homepage → H1 Welcome! → H2 Your dashboard → H3 Your vault
 *   then: came with a link → P1; came with no link → E2 What do you want to do first?
 *
 * Part 2: their people, then their choice.
 *
 *   P1 Bring your people  [Import phone contacts] → P2a  [Find Instagram friends] → P2b  [Skip for now] → N1
 *   P2a / P2b → P3 Your people ("You added [N] friends") → N1
 *   N1 What next?  [Start a group] → G1  [Plan an event] → V1  [Edit my homepage] → M1
 *                  [Import contacts] → P1 (only if they skipped it)  [I'm done for now] → All set
 *   G1 Create a group (outlines the name) → they press Create → G2: "Set up your
 *      group's page" (group-setup.js), then D2 Plan the first event [Plan an event] [Later]
 *   V1 Plan an event (outlines the name) → they save it → V2 Invite people (outlines Share)
 *   M1 Edit your homepage (outlines the module list) → M2 Move and resize
 *   After G2 or M2: P1 if they haven't seen it yet, otherwise All set.
 *   END All set: "That's the tour. Replay it any time from Help."
 *
 * Every card (the board's rules): one at a time, bottom right (above the tab
 * bar on phones); it outlines one thing, or nothing; its top line names the
 * part and the count ("Your homepage · 2 of 3"); Back, one main button, and
 * × to close. × pauses the tour, and so does leaving partway: on their next
 * visit R1 asks "Welcome back! Want to finish the tour where you left off?"
 * [Resume] [No thanks]. Only accounts made in the last hour start it; Help →
 * Replay the tour (replayTour) starts it again for anyone, from H0.
 *
 * Progress is member.onboarding.tour, so a reload carries on:
 *   { at, i, since, paused, was, lane, p1: null | 'seen' | 'skipped' | 'done',
 *     base, from, groupId, eventId, myEvents, after, appNext, mods, done }
 *
 *   syncTutorial()   main.js, after each page is drawn
 *   replayTour()     Help → Replay the tour
 */

import { h } from '../ui/dom.js';
import { goTo, spaceHref, getRoute, blogHref } from '../router.js';
import {
  changeState, getCurrentUser, getSpace, getSpaces, getPersonalSpace, getCurrentSpace, getCurrentTabId, getTabs, getMember, setEditMode, isEditMode,
} from '../state/store.js';
import { getFriendIds, outgoingRequests, friendStatus } from '../state/friends.js';
import { findEvent } from '../state/events.js';
import { rsvpOf } from '../modules/calendar/calendar-data.js';
import { getModuleType } from '../modules/registry.js';
import { openInstagramConnect } from '../account/instagram-connect.js';
import { isGroupSetupOpen } from '../groups/group-setup.js';
import { getOnboarding, updateOnboarding } from './onboarding-state.js';

/** How long after their first page's tour "Next step: your homepage" waits (the board's H0). */
export const NEXT_STEP_DELAY_MS = 15000;
/** Only accounts this new start it on their own. */
const NEW_ACCOUNT_MS = 60 * 60 * 1000;
const VISIT_KEY = '3den.tour.visit';

const LANE_OF = { group: 'A', event: 'B', friend: 'C', blog: 'C', direct: 'E' };
const LANE_START = { A: 'A1', B: 'B1', C: 'C1', E: 'H0' };

/** One line per module for A2 ("The Board is for posts and news."); others use the module's own description. */
const MODULE_LINES = {
  announcements: 'The Board is for posts and news.',
  calendar: 'The Calendar has the group’s events.',
  chat: 'Chat with everyone here.',
  upnext: 'Up next shows the next event and what’s new, all in one place.',
  todo: 'Tasks: what needs doing, and who’s doing it.',
  vault: 'The group’s vault: shared files, documents, and folders.',
  forum: 'The Forum is for longer conversations, with replies.',
  events: 'Upcoming events, with RSVPs.',
  shifts: 'Shifts people sign up to take.',
  submissions: 'Assignments people turn work in for.',
  budget: 'The group’s budget: what’s planned and what’s spent.',
  gantt: 'The plan over time.',
  vaultfile: 'A file from the group’s vault.',
  generalfeed: 'Posts, photos, and videos from the group.',
  textfeed: 'Short posts from the group.',
  articles: 'The group’s stories.',
  carousel: 'The group’s posts, one at a time.',
  about: 'Who the group is, and how to reach them.',
  gallery: 'The group’s photos.',
};

// ─── Where they are ─────────────────────────────────────────────────────────

const phone = () => window.matchMedia('(max-width: 640px)').matches;
/** In the installed app, not a browser (a real build's native app sets this too). */
const inApp = () => window.matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;
const visible = (el) => Boolean(el) && /** @type {HTMLElement} */ (el).offsetParent !== null && !el.closest('.tour-card');
const firstVisible = (selector) => /** @type {HTMLElement | undefined} */ ([...document.querySelectorAll(selector)].find(visible));

function onHomepage() {
  const home = getPersonalSpace();
  return Boolean(home) && getRoute().page === 'home' && getCurrentSpace()?.id === home.id;
}
const onSpace = (id) => getRoute().page === 'home' && getCurrentSpace()?.id === id;
const blogOf = (memberId) => getSpaces().find((s) => s.kind === 'blog' && s.memberIds?.[0] === memberId);
const goHome = () => { const home = getPersonalSpace(); if (home) goTo(spaceHref(home.id)); };

function homeLink() {
  const home = getPersonalSpace();
  return firstVisible(home ? `.tab-bar__tab[href="${spaceHref(home.id)}"], .app-bar__home` : '.app-bar__home');
}
const moduleEl = (id) => () => firstVisible(`[data-module-id="${id}"], [data-widget-id="${id}"]`);
const homeModule = (type) => getPersonalSpace()?.modules.find((m) => m.type === type);

/** Friends plus requests they've sent: P3 counts how many that grew by. */
function peopleCount(me) {
  return getFriendIds(me.id).length + outgoingRequests(me.id).length;
}

/** The modules on the page they're looking at, in the order they show. */
function modulesOnPage(space) {
  const ids = space.modules.map((m) => m.id);
  const seen = [];
  document.querySelectorAll('[data-module-id], [data-widget-id]').forEach((el) => {
    const id = el.getAttribute('data-module-id') || el.getAttribute('data-widget-id');
    if (id && ids.includes(id) && !seen.includes(id) && visible(el)) seen.push(id);
  });
  return seen;
}

/** A tab on this group they can see, other than the one they're on. */
function otherTab(space) {
  const current = getCurrentTabId();
  const tab = getTabs(space).find((t) => t.id !== current);
  if (!tab) return null;
  const link = /** @type {HTMLElement | undefined} */ ([...document.querySelectorAll('.space-tabs a')].find((a) => a.getAttribute('href') === spaceHref(space.id, tab.id) && visible(a)));
  return link ? { tab, link } : null;
}

// ─── The tour's record ──────────────────────────────────────────────────────

const tourOf = () => getOnboarding()?.tour ?? null;
function save(changes) {
  const tour = tourOf() ?? {};
  updateOnboarding({ tour: { ...tour, ...changes } });
}
/** Move to a step (and whatever else changes with it), then draw. */
function to(at, changes = {}) {
  save({ at, i: 0, since: Date.now(), ...changes });
  closeCard();
  syncTutorial();
}

/** Start it for a new account, the first time it qualifies. */
function maybeStart() {
  const me = getCurrentUser();
  const onboarding = getOnboarding();
  if (!me || !onboarding || onboarding.tour) return;
  if (Date.now() - (me.createdAt ?? onboarding.startedAt ?? 0) > NEW_ACCOUNT_MS) return;
  if (onboarding.joinedTour?.stage === 'done') return; // finished the old tour already
  const lane = LANE_OF[onboarding.source] ?? 'F';
  if (lane === 'E' && !onboarding.answered) return; // the welcome splash first
  updateOnboarding({ tour: { at: LANE_START[lane] ?? 'WAIT', i: 0, since: Date.now(), lane, p1: null } });
}

/** Help → Replay the tour: from H0, for anyone signed in. */
export function replayTour() {
  const me = getCurrentUser();
  if (!me || me.isGuest) return;
  changeState((state) => {
    const member = state.members.find((m) => m.id === me.id);
    member.onboarding = member.onboarding ?? { source: 'replay', startedAt: Date.now(), answered: true };
    member.onboarding.tour = { at: onHomepage() ? 'H1' : 'H0', i: 0, since: Date.now(), lane: 'R', p1: null };
  }, 'notifications');
  visitAsked = true; // they asked for it: no "pick up where you left off?"
  closeCard();
  syncTutorial();
}

// ─── The card ───────────────────────────────────────────────────────────────

let card = null;
let cardKey = '';
let spotted = null;
let keepSpot = null;
let waitTimer = null;

function unspot() {
  spotted?.classList.remove('tour-spot', 'tour-spot--steady');
  spotted = null;
  clearInterval(keepSpot);
  keepSpot = null;
}

/** Outline one thing, and keep it outlined when the page is drawn again. */
function spot(find) {
  unspot();
  if (!find) return;
  let scrolled = false;
  const apply = () => {
    const el = find();
    if (el && !scrolled) { scrolled = true; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    // Again whenever it's missing: a redraw can swap the element, or reset its classes (the RSVP buttons do).
    if (el && (el !== spotted || !el.classList.contains('tour-spot'))) { if (el !== spotted) spotted?.classList.remove('tour-spot', 'tour-spot--steady'); el.classList.add('tour-spot', 'tour-spot--steady'); spotted = el; }
  };
  apply();
  keepSpot = setInterval(apply, 500);
}

function closeCard() {
  unspot();
  card?.remove();
  card = null;
  cardKey = '';
  document.body.classList.remove('has-tour-card');
}

/** Room under the page for the card, so whatever it would cover (a form's button) can scroll clear of it. */
function makeRoom() {
  if (!card) return;
  document.documentElement.style.setProperty('--tour-card-space', `${Math.ceil(card.getBoundingClientRect().height)}px`);
  document.body.classList.add('has-tour-card');
}

/** × : put it aside until their next visit. */
function pause() {
  const tour = tourOf();
  if (!tour) return;
  save({ paused: true, was: tour.at });
  visitAsked = true; // not again this visit
  closeCard();
}

function finish() {
  save({ at: 'DONE', done: Date.now(), paused: false });
  closeCard();
}

/**
 * @param {{ key: string, kicker: string, title: string, text: string, spot?: (() => HTMLElement | undefined) | null,
 *   back?: (() => void) | null, main?: { label: string, run: () => void } | null,
 *   choices?: { label: string, run: () => void }[], closable?: boolean }} c
 */
function showCard(c) {
  if (cardKey === c.key && card?.isConnected) return;
  closeCard();
  card = h('aside', { class: `tour-card onboarding-tour${c.choices ? ' onboarding-tour--choices' : ''}`, role: 'dialog', 'aria-label': c.title, 'aria-live': 'polite', 'data-step': c.key.split(':')[0] },
    h('div', { class: 'tour-card__top' },
      h('span', { class: 'tour-card__count onboarding-tour__kicker' }, c.kicker),
      c.closable === false ? null : h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: pause }, '×')),
    h('strong', { class: 'tour-card__title' }, c.title),
    h('p', { class: 'tour-card__text' }, c.text),
    c.choices ? h('div', { class: 'onboarding-tour__choices' }, c.choices.map((choice, n) => h('button', {
      type: 'button', class: `button button--small${n === 0 ? ' button--primary' : ''}`, onClick: choice.run,
    }, choice.label))) : null,
    c.main || c.back ? h('div', { class: 'tour-card__actions' },
      c.back ? h('button', { type: 'button', class: 'button button--small button--quiet', onClick: c.back }, 'Back') : null,
      c.main ? h('button', { type: 'button', class: 'button button--small button--primary', onClick: c.main.run }, c.main.label) : null) : null);
  document.body.append(card);
  cardKey = c.key;
  makeRoom();
  spot(c.spot ?? null);
  /** @type {HTMLElement | null} */ (card.querySelector('.button--primary'))?.focus({ preventScroll: true });
}

// ─── Each step, as on the board ─────────────────────────────────────────────

/** After their first page's cards: the phone note, then the wait for H0. */
function laneEnd() {
  if (phone() && !inApp()) to('APP', { appNext: 'WAIT' });
  else to('WAIT');
}
/** After G2 or M2: P1 if they haven't seen it, otherwise All set. */
function afterChoice() {
  const tour = tourOf();
  to(tour?.p1 ? 'END' : 'P1', { after: null });
}

/**
 * The step's card, or null when it doesn't show on this page (it waits).
 * @returns {Parameters<typeof showCard>[0] | null}
 */
function stepCard(tour, me, onboarding) {
  const at = tour.at;
  switch (at) {
    // ── Lane A: a group's invite link ──
    case 'A1': case 'A2': case 'ATAB': {
      const group = getSpace(onboarding.spaceId);
      if (!group) { laneEnd(); return null; }
      if (!onSpace(group.id)) return null;
      const mods = tour.mods ?? modulesOnPage(group);
      if (!tour.mods) save({ mods });
      const more = otherTab(group);
      const total = 1 + mods.length + (more ? 1 : 0);
      const kicker = (n) => (total > 1 ? `${group.name} · ${n} of ${total}` : group.name);
      if (at === 'A1') {
        return {
          key: 'A1', kicker: kicker(1), title: `Welcome to ${group.name}`, spot: () => firstVisible('.space-header'),
          text: `This is ${group.name}’s page. Everything the group shares lives here.`,
          main: { label: 'Next', run: () => (mods.length ? to('A2', { i: 0 }) : more ? to('ATAB') : laneEnd()) },
        };
      }
      if (at === 'A2') {
        const i = Math.min(tour.i ?? 0, mods.length - 1);
        const module = group.modules.find((m) => m.id === mods[i]);
        if (!module) { laneEnd(); return null; }
        const type = getModuleType(module.type);
        const step = (n) => { save({ i: n }); syncTutorial(); };
        const next = () => (i + 1 < mods.length ? step(i + 1) : more ? to('ATAB') : laneEnd());
        return {
          key: `A2:${i}`, kicker: kicker(2 + i), title: module.title || type?.label || 'A module', spot: moduleEl(module.id),
          text: MODULE_LINES[module.type] ?? type?.description ?? '',
          back: () => (i ? step(i - 1) : to('A1')),
          main: { label: 'Next', run: next },
        };
      }
      if (!more) { laneEnd(); return null; }
      return {
        key: 'ATAB', kicker: kicker(total), title: `There’s more on ${more.tab.name}`, spot: () => otherTab(group)?.link,
        text: `${group.name} has another tab: ${more.tab.name}. Open it any time, up here.`,
        back: () => (mods.length ? to('A2', { i: mods.length - 1 }) : to('A1')), main: { label: 'Next', run: laneEnd },
      };
    }

    // ── Lane B: an event's link ──
    case 'B1': case 'B2': {
      const found = findEvent(onboarding.itemId);
      if (!found) { laneEnd(); return null; }
      const { event } = found;
      if (getRoute().page !== 'event' || getRoute().eventId !== event.id) return null;
      const answer = rsvpOf(event, me.id);
      const withCalendar = answer === 'going' || answer === 'maybe';
      const total = withCalendar ? 2 : 1;
      if (at === 'B1') {
        return {
          // The key has the answer: it's saved just after the account is made, so the card is drawn again when it lands.
          key: `B1:${answer}`, kicker: `Your event · 1 of ${total}`, spot: () => firstVisible('.event-page__rsvp .rsvp'),
          title: answer === 'going' ? 'You’re going!' : answer === 'maybe' ? 'You said maybe' : 'Thanks for answering',
          text: `You’re on the list for ${event.title}. Change your answer here any time.`,
          main: { label: 'Next', run: () => (['going', 'maybe'].includes(rsvpOf(event, me.id)) ? to('B2') : laneEnd()) },
        };
      }
      if (!withCalendar) { laneEnd(); return null; }
      return {
        key: 'B2', kicker: 'Your event · 2 of 2', title: 'On your calendar', spot: () => firstVisible('.event-ics-button'),
        text: `${event.title} is on your 3den calendar. Add it to your phone’s calendar too.`,
        back: () => to('B1'), main: { label: 'Next', run: laneEnd },
      };
    }

    // ── Lane C: a friend's invite link or blog ──
    case 'C1': case 'C2': {
      const friend = getMember(onboarding.itemId);
      const blog = friend && blogOf(friend.id);
      if (!friend || !blog) { laneEnd(); return null; }
      const first = friend.name.split(' ')[0];
      if (at === 'C1') {
        if (!onSpace(blog.id)) return null;
        const friends = friendStatus(me.id, friend.id) === 'friends';
        return {
          key: 'C1', kicker: `${first} · 1 of 2`, title: friends ? `You and ${first} are friends` : `You asked ${first} to be friends`,
          spot: () => firstVisible('.space-header'),
          text: `This is ${first}’s blog: their posts, photos, and events.`,
          main: { label: 'Next', run: () => to('C2') },
        };
      }
      return {
        key: 'C2', kicker: `${first} · 2 of 2`, title: 'Your Feed', spot: () => firstVisible('.tab-bar__tab[href="#feed"], .app-bar__link[href="#feed"]'),
        text: 'Posts from your friends and groups show up in your Feed.',
        back: () => { goTo(blogHref(friend)); to('C1'); }, main: { label: 'Next', run: laneEnd },
      };
    }

    case 'APP':
      return {
        key: 'APP', kicker: 'Next step', title: 'Get the app', closable: true,
        text: 'Download 3den in the App Store to get push notifications.',
        main: { label: 'Got it', run: () => to(tour.appNext || 'WAIT', { appNext: null }) },
      };

    case 'WAIT': {
      // Going home before the 15 seconds are up skips straight to the welcome.
      if (onHomepage()) { to('H1'); return null; }
      if (!waitTimer) {
        const left = Math.max(0, (tour.since ?? 0) + NEXT_STEP_DELAY_MS - Date.now());
        waitTimer = setTimeout(() => {
          waitTimer = null;
          if (tourOf()?.at === 'WAIT') to('H0');
        }, left);
      }
      return null;
    }

    // ── Their homepage ──
    case 'H0':
      return {
        key: 'H0', kicker: 'Next step', title: 'Your homepage', spot: homeLink,
        text: 'Everything you’re in, in one place: your groups, your events, and what’s coming up.',
        main: { label: 'Go to my homepage', run: () => { goHome(); to('H1'); } },
      };
    case 'H1': case 'H2': case 'H3': {
      if (!onHomepage()) return null;
      const dashboard = homeModule('dashboard');
      const vault = homeModule('vault');
      const steps = ['H1', dashboard ? 'H2' : null, vault ? 'H3' : null].filter(Boolean);
      const n = steps.indexOf(at);
      if (n < 0) { // that module isn't on their homepage: the next step that is
        const later = ['H1', 'H2', 'H3'].slice(['H1', 'H2', 'H3'].indexOf(at) + 1).find((s) => steps.includes(s));
        to(later || afterHome(tour)); return null;
      }
      const kicker = `Your homepage · ${n + 1} of ${steps.length}`;
      const next = () => (n + 1 < steps.length ? to(steps[n + 1]) : to(afterHome(tour)));
      const back = n ? () => to(steps[n - 1]) : null;
      if (at === 'H1') return { key: 'H1', kicker, title: 'Welcome to your homepage!', text: 'You can manage all your groups and events here!', back, main: { label: 'Next', run: next } };
      if (at === 'H2') return { key: 'H2', kicker, title: 'Your dashboard', spot: moduleEl(dashboard.id), text: 'The Dashboard shows you upcoming events, invitations, and tasks from your groups.', back, main: { label: 'Next', run: next } };
      return { key: 'H3', kicker, title: 'Your vault', spot: moduleEl(vault.id), text: 'This is your own personal cloud storage. 100% encrypted.', back, main: { label: 'Next', run: next } };
    }

    case 'E2':
      return {
        key: 'E2', kicker: 'Getting started', title: 'Where to start', text: 'What do you want to do first?',
        choices: [
          { label: 'Start a group', run: () => to('G1', { from: 'E2' }) },
          { label: 'Find my friends', run: () => to('P1') },
        ],
      };

    // ── Their people ──
    case 'P1':
      if (!tour.p1) save({ p1: 'seen', base: peopleCount(me) });
      return {
        key: 'P1', kicker: 'Your people', title: 'Bring your people',
        text: '3den is better with your people. Find friends who are already here, and invite the rest. Nothing is sent without you.',
        choices: [
          { label: 'Import phone contacts', run: () => { goTo('#bring'); to('P2a'); } },
          { label: 'Find Instagram friends', run: () => { goTo('#bring'); to('P2b'); } },
          { label: 'Skip for now', run: () => to('N1', { p1: 'skipped' }) },
        ],
      };
    case 'P2a':
      if (getRoute().page !== 'bring') { goTo('#bring'); return null; }
      return {
        key: 'P2a', kicker: 'Your people · 1 of 2', title: 'From your contacts', spot: () => firstVisible('.bring__contacts'),
        text: 'Pick your contacts. We’ll show who’s on 3den to add as friends, and help you invite the rest.',
        back: () => to('P1'),
        main: { label: 'Choose contacts', run: () => { /** @type {HTMLElement | null} */ (document.querySelector('.bring__contacts .button--primary'))?.click(); to('P3'); } },
      };
    case 'P2b':
      if (getRoute().page !== 'bring') { goTo('#bring'); return null; }
      return {
        key: 'P2b', kicker: 'Your people · 1 of 2', title: 'Instagram friends',
        text: 'Find people you follow on Instagram who are on 3den. Nothing is posted to Instagram.',
        back: () => to('P1'),
        main: { label: 'Connect Instagram', run: () => { closeCard(); openInstagramConnect({ onDone: () => syncTutorial() }); to('P3'); } },
      };
    case 'P3': {
      if (document.querySelector('.ig-connect, dialog[open]')) return null; // Instagram's dialog first
      const added = Math.max(0, peopleCount(me) - (tour.base ?? 0));
      return {
        key: `P3:${added}`, kicker: 'Your people · 2 of 2', title: 'Your people',
        text: added ? `You added ${added === 1 ? '1 friend' : `${added} friends`}. Their posts and events will show up for you.` : 'You can bring people in any time from Friends.',
        main: { label: 'Next', run: () => to('N1', { p1: 'done' }) },
      };
    }

    // ── Their choice ──
    case 'N1':
      return {
        key: 'N1', kicker: 'What next?', title: 'What next?', text: 'What would you like to do next?',
        choices: [
          { label: 'Start a group', run: () => to('G1', { from: 'N1' }) },
          { label: 'Plan an event', run: () => to('V1', { from: 'N1', after: null }) },
          { label: 'Edit my homepage', run: () => to('M1') },
          tour.p1 === 'skipped' ? { label: 'Import contacts', run: () => to('P1') } : null,
          { label: 'I’m done for now', run: () => to('END') },
        ].filter(Boolean),
      };

    case 'G1': {
      // They pressed Create: on to their new group.
      const made = getSpaces().find((s) => s.kind === 'group' && (s.createdAt ?? 0) >= (tour.since ?? 0) && s.memberIds?.includes(me.id));
      if (made) { to('G2', { groupId: made.id }); return null; }
      if (getRoute().page !== 'new-group') { goTo('#new-group'); return null; }
      return {
        key: 'G1', kicker: 'Start a group', title: 'Start a group', spot: () => firstVisible('.new-group-form [aria-label="Group name"]'),
        text: 'Give it a name. You can change everything later.',
        back: () => { goHome(); to(tour.from || 'N1'); },
      };
    }
    case 'G2': {
      const group = getSpace(tour.groupId);
      if (!group) { afterChoice(); return null; }
      if (isGroupSetupOpen()) return null; // "Set up your group's page" and its tips come first
      if (!onSpace(group.id)) return null;
      return {
        key: 'G2', kicker: 'Your new group', title: 'Plan the first event', spot: () => firstVisible('.space-header'),
        text: 'People come for events. Plan one now, so people have something to say yes to.',
        choices: [
          { label: 'Plan an event', run: () => to('V1', { from: 'G2', after: 'choice', host: group.id }) },
          { label: 'Later', run: () => (phone() && !inApp() ? to('APP', { appNext: tour.p1 ? 'END' : 'P1' }) : afterChoice()) },
        ],
      };
    }

    case 'V1': {
      const host = tour.host || getPersonalSpace()?.id;
      const mine = tour.myEvents ?? null;
      const route = getRoute();
      if (mine && route.page === 'event' && !mine.includes(route.eventId) && findEvent(route.eventId)?.event.createdBy === me.id) {
        to('V2', { eventId: route.eventId }); return null;
      }
      if (route.page !== 'new-event') { goTo(`#new-event-${host}`); return null; }
      if (!mine) save({ myEvents: myEventIds(me) });
      return {
        key: 'V1', kicker: 'Plan an event', title: 'Plan an event', spot: () => firstVisible('[aria-label="Event name"]'),
        text: 'Name it, pick a date, and choose who can see it.',
        back: () => { if (tour.from === 'G2') goTo(spaceHref(tour.groupId)); else goHome(); to(tour.from || 'N1'); },
      };
    }
    case 'V2':
      if (getRoute().page !== 'event' || getRoute().eventId !== tour.eventId) return null;
      return {
        key: 'V2', kicker: 'Plan an event', title: 'Invite people', spot: () => firstVisible('.event-share-button'),
        text: 'Share the link or send it in Messages. People can RSVP even without an account.',
        main: { label: 'Done', run: () => (tour.after === 'choice' ? afterChoice() : to('END')) },
      };

    case 'M1': case 'M2': {
      if (!onHomepage()) { goHome(); return null; }
      if (!isEditMode()) setEditMode(true);
      if (at === 'M1') {
        return {
          key: 'M1', kicker: 'Your homepage · 1 of 2', title: 'Edit your homepage',
          spot: () => firstVisible('#module-library') ?? /** @type {HTMLElement | undefined} */ ([...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'Add modules' && visible(el))),
          text: phone() ? 'Tap Add modules to put one on your page.' : 'Drag a module onto your page, or click one to add it.',
          main: { label: 'Next', run: () => to('M2') },
        };
      }
      return {
        key: 'M2', kicker: 'Your homepage · 2 of 2', title: 'Move and resize', spot: () => firstVisible(phone() ? '.mwidget__grip' : '.resize-handle'),
        text: phone() ? 'Drag a module by its grip to move it. Done saves it.' : 'Drag a module by its title to move it. Pull a corner to resize. Done saves it.',
        back: () => to('M1'),
        // Move on first: turning Edit off redraws the page, and M2 would turn it back on.
        main: { label: 'Done', run: () => { afterChoice(); setEditMode(false); } },
      };
    }

    case 'END':
      return {
        key: 'END', kicker: 'All set', title: 'All set', text: 'That’s the tour. Replay it any time from Help.',
        main: { label: 'Done', run: finish },
      };
    default:
      return null;
  }
}

/** After H3: P1 for people who came with a link, E2 for those who didn't. */
const afterHome = (tour) => (tour.lane === 'E' ? 'E2' : 'P1');

function myEventIds(me) {
  const ids = [];
  getSpaces().forEach((s) => s.modules.forEach((m) => (m.data?.events ?? []).forEach((e) => { if (e.createdBy === me.id) ids.push(e.id); })));
  return ids;
}

// ─── R1: pick up where you left off? ───────────────────────────────────────

const pageOpenedAt = Date.now();
let visitAsked = false;
function isNewVisit() {
  try {
    if (sessionStorage.getItem(VISIT_KEY)) return false;
    sessionStorage.setItem(VISIT_KEY, '1');
    return true;
  } catch { return false; }
}

/** Resume: back to the page a step belongs on (steps that open their own page, like G1 or P2a, go there themselves). */
function goToStepPage(at) {
  const onboarding = getOnboarding();
  const tour = tourOf() ?? {};
  if (/^A|^ATAB/.test(at) && onboarding?.spaceId) goTo(spaceHref(onboarding.spaceId));
  else if (/^B/.test(at) && onboarding?.itemId) goTo(`#event-${onboarding.itemId}`);
  else if (at === 'C1') { const friend = getMember(onboarding?.itemId); if (friend) goTo(blogHref(friend)); }
  else if (/^H[1-3]$|^M/.test(at)) goHome();
  else if (at === 'G2' && tour.groupId) goTo(spaceHref(tour.groupId));
  else if (at === 'V2' && tour.eventId) goTo(`#event-${tour.eventId}`);
}

function showResume(tour) {
  showCard({
    key: 'R1', kicker: 'Welcome back', title: 'Pick up where you left off?',
    text: 'Welcome back! Want to finish the tour where you left off?',
    choices: [
      { label: 'Resume', run: () => { visitAsked = true; const at = tour.was || tour.at; goToStepPage(at); to(at, { paused: false, was: null }); } },
      { label: 'No thanks', run: () => { visitAsked = true; finish(); } },
    ],
  });
}

// ─── main.js, after each page is drawn ──────────────────────────────────────

export function syncTutorial() {
  maybeStart();
  const me = getCurrentUser();
  const onboarding = getOnboarding();
  const tour = onboarding?.tour;
  if (!me || !tour || tour.at === 'DONE') { if (card) closeCard(); return; }
  if (document.querySelector('.welcome-splash')) { setTimeout(syncTutorial, 2600); return; } // E1 first

  // Paused (×), or left partway on an earlier visit: R1 once on their next visit.
  const newVisit = !visitAsked && isNewVisit();
  if (newVisit) visitAsked = true;
  const leftPartway = newVisit && (tour.since ?? 0) < pageOpenedAt;
  if (tour.paused || leftPartway) {
    if (!newVisit && cardKey !== 'R1') return; // put aside this visit
    if (!tour.paused) save({ paused: true, was: tour.at });
    showResume(tour.paused ? tour : { ...tour, was: tour.at });
    return;
  }
  if (cardKey === 'R1') return;

  if (tour.at !== 'WAIT') { clearTimeout(waitTimer); waitTimer = null; }
  const next = stepCard(tour, me, onboarding);
  if (tourOf()?.at !== tour.at || tourOf()?.i !== tour.i) return; // the step moved on while working it out
  if (next) showCard(next);
  else if (card && cardKey !== 'R1') closeCard();
}
