// @ts-check
/**
 * group-tour.js — a short look around the group you just made.
 *
 * Starting a group (new-group-page.js) ends here instead of
 * asking "what first?": a small card in the corner walks through the new
 * group, outlining one thing at a time (the same card and outline as the
 * Organizer demo, demo-tour.js):
 *
 *   1. Here's Maple Ave Tenants      the header: name, who can see it, Mute, Edit
 *   2. Up next                       what members see first
 *   3. Your modules                  what this kind of group starts with
 *   4. Make it yours                 Edit: add, remove, rearrange
 *   5. Bring people in               the Members page, worded for how people join
 *   6. Plan the first event          [Plan an event] or Later
 *
 * Steps whose thing isn't there (a Blank slate has no Up next) are skipped.
 * The step is kept in sessionStorage, so a reload keeps the card.
 *
 *   startGroupTour(spaceId)   syncGroupTour() (main.js, after each page is drawn)   endGroupTour()
 */

import { h } from '../ui/dom.js';
import { goTo, spaceHref, settingsHref } from '../router.js';
import { getSpace } from '../state/store.js';
import { isPublicGroup } from '../state/group-access.js';
import { GROUP_TEMPLATES } from '../data/starter-layouts.js';

const KEY = '3den.group-tour';

let card = null;
let spotted = null;

function saved() {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); } catch { return null; }
}
function save(value) {
  try { if (value) sessionStorage.setItem(KEY, JSON.stringify(value)); else sessionStorage.removeItem(KEY); } catch { /* storage off: the tour lasts until a reload */ }
}

/** "A, B, and C" */
const joinNames = (names) => (names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`);

/** The steps for this group, leaving out any whose thing it doesn't have. */
function stepsFor(space) {
  const home = spaceHref(space.id);
  // What's on the tab that opens first (a group with Private and Public tabs opens on Private).
  const firstTab = space.tabs?.[0]?.id ?? 'home';
  const onFirst = space.modules.filter((m) => (m.tabId ?? 'home') === firstTab);
  const upNext = onFirst.find((m) => m.type === 'upnext');
  const rest = onFirst.filter((m) => m.type !== 'upnext');
  const publicTab = space.tabs?.length > 1 ? space.tabs.find((t) => t.visibility === 'public') : null;
  const onPublic = publicTab ? space.modules.filter((m) => m.tabId === publicTab.id).map((m) => m.title) : [];
  const kind = GROUP_TEMPLATES.find((t) => t.id === space.template)?.label.toLowerCase() ?? 'group';
  const join = {
    admins: 'Only admins add people here: type a name, or pick from your friends.' + (isPublicGroup(space) ? ' Everyone else can follow the group to see its public page.' : ''),
    invite: 'Share the invite link or its QR code, or invite people by name. Anyone with the link can join.',
    request: 'People ask from the group’s page, and their requests show up here for you to say yes or no. You can invite people here too.',
    open: 'Anyone can join from the group’s page. You can still invite people here, or send the link.',
  }[space.joining] ?? 'Invite people here.';
  return [
    { href: home, spot: '.space-header', title: `Here’s ${space.name}`,
      text: `This is your group’s page. ${isPublicGroup(space) ? 'The globe means anyone can find it and see its public tab.' : 'The lock means only members can see it.'} You can change that, and everything else, in Group settings.` },
    upNext ? { href: home, spot: `[data-module-id="${upNext.id}"]`, title: 'Up next',
      text: 'The first thing members see: the next event, and what’s new since their last visit. It fills in as the group gets going.' } : null,
    rest.length ? { href: home, spot: `[data-module-id="${rest[0].id}"]`, title: 'Your modules',
      text: `As a ${kind}, the group starts with ${joinNames(rest.map((m) => m.title))}. Each one opens to a full page.${publicTab ? ` ${joinNames(onPublic)} ${onPublic.length === 1 ? 'is' : 'are'} on the ${publicTab.name} tab: what visitors and followers see.` : ''}` } : null,
    { href: home, spot: '.space-header__actions [title="Edit this page, its layout, or its settings"]', title: 'Make it yours',
      text: 'Edit adds, removes, and rearranges modules. Nothing is lost: a module you take off keeps everything in it.' },
    { href: settingsHref(space.id, 'members'), spot: () => [...document.querySelectorAll('.settings-section')].find((s) => /^(Invite|Add people)/.test(s.querySelector('.settings-section__title')?.textContent ?? '')),
      title: 'Bring people in', text: join },
    { href: home, spot: '.space-header', title: 'Plan the first event',
      text: 'People come for events. Plan one now, so the people you bring in have something to say yes to.', last: true },
  ].filter(Boolean);
}

function unspot() { spotted?.classList.remove('tour-spot'); spotted = null; }

function spot(target) {
  unspot();
  let tries = 0;
  const look = () => {
    const el = typeof target === 'function' ? target() : [...document.querySelectorAll(target)].find((e) => e.offsetParent !== null);
    if (el) { el.classList.add('tour-spot'); spotted = el; el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if ((tries += 1) < 30) setTimeout(look, 100);
  };
  setTimeout(look, 150);
}

export function endGroupTour() {
  save(null);
  unspot();
  card?.remove();
  card = null;
}

function show(spaceId, i) {
  const space = getSpace(spaceId);
  const steps = space ? stepsFor(space) : [];
  const step = steps[i];
  if (!step) { endGroupTour(); return; }
  save({ spaceId, i });
  if (window.location.hash !== step.href) goTo(step.href);
  card?.remove();
  card = h('aside', { class: 'tour-card group-tour', role: 'dialog', 'aria-label': `A look around ${space.name}`, 'aria-live': 'polite' },
    h('div', { class: 'tour-card__top' },
      h('span', { class: 'tour-card__count' }, `Your new group · ${i + 1} of ${steps.length}`),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'End the tour', onClick: endGroupTour }, '×')),
    h('strong', { class: 'tour-card__title' }, step.title),
    h('p', { class: 'tour-card__text' }, step.text),
    h('div', { class: 'tour-card__actions' },
      i ? h('button', { type: 'button', class: 'button button--small button--quiet', onClick: () => show(spaceId, i - 1) }, 'Back') : null,
      step.last
        ? [
          h('button', { type: 'button', class: 'button button--small button--quiet', onClick: endGroupTour }, 'Later'),
          h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => { endGroupTour(); goTo(`#new-event-${spaceId}`); } }, 'Plan an event'),
        ]
        : h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => show(spaceId, i + 1) }, 'Next')));
  document.body.append(card);
  card.querySelector('.button--primary')?.focus({ preventScroll: true });
  spot(step.spot);
}

/** Start the look around a group you just made. */
export function startGroupTour(spaceId) { show(spaceId, 0); }

/** main.js calls this after each page is drawn: a tour in progress keeps its card and its outline. */
export function syncGroupTour() {
  const tour = saved();
  if (!tour) return;
  const space = getSpace(tour.spaceId);
  if (!space) { endGroupTour(); return; }
  if (!card) { show(tour.spaceId, tour.i); return; }
  const step = stepsFor(space)[tour.i];
  // Wandering off to another page ends it; the tour's own pages keep the outline.
  if (!step) { endGroupTour(); return; }
  if (window.location.hash !== step.href) { endGroupTour(); return; }
  spot(step.spot);
}
