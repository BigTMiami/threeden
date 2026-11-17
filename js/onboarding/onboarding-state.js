// @ts-check
/**
 * onboarding-state.js — how a new person arrived, and how far they've got.
 *
 * Saved on the account as member.onboarding (only accounts made in the app
 * have one; the demo people don't):
 *
 *   {
 *     source: 'event' | 'host' | 'group' | 'blog' | 'follow' | 'message' | 'organizer' | 'organized' | 'direct',
 *     itemId,        ← the event (event), or the person whose blog it was (blog)
 *     spaceId,       ← the group (group, organizer), or the event's space
 *     layout,        ← which starting homepage they got (js/data/starter-layouts.js)
 *     startedAt,
 *     done: [],              ← Get started steps finished by doing them (markStep)
 *     tipsSeen: [],          ← (old: floating tips, now replaced by one next step)
 *     tipsOff,               ← pressed "Skip tips"
 *     suggestionsDismissed: [],
 *     hidden,                ← closed the Get started card
 *     noteDismissed,         ← closed "We set this up for…"
 *     doneShown,             ← "You're set" was shown once
 *     answered,              ← answered "What brings you to 3den?" (direct only)
 *     blogWelcome,           ← null, 'yes' or 'later' (first visit to the Blog tab)
 *   }
 *
 *   newOnboarding({ source: 'event', itemId: 'band-ev-2' })   → a fresh record
 *   getOnboarding()                                           → the current user's, or null
 *   updateOnboarding({ hidden: true })
 *   markStep('calendar')   addToList('tipsSeen', 'event-rsvp')
 */

import { changeState, getCurrentUser, getPersonalSpace } from '../state/store.js';
import { layoutForArrival, STARTER_LAYOUTS } from '../data/starter-layouts.js';

export function newOnboarding(arrival) {
  const source = arrival?.source ?? 'direct';
  return {
    source,
    itemId: arrival?.itemId ?? null,
    spaceId: arrival?.spaceId ?? null,
    layout: layoutForArrival(source),
    startedAt: Date.now(),
    done: [],
    tipsSeen: [],
    suggestionsDismissed: [],
    hidden: false,
    noteDismissed: false,
    doneShown: false,
    answered: source !== 'direct',
    blogWelcome: null,
  };
}

/** The signed-in person's onboarding record, or null (demo people, guests). */
export function getOnboarding() {
  const me = getCurrentUser();
  return me && !me.isGuest ? me.onboarding ?? null : null;
}

export function updateOnboarding(changes) {
  const me = getCurrentUser();
  if (!me?.onboarding) return;
  changeState((state) => {
    const member = state.members.find((m) => m.id === me.id);
    Object.assign(member.onboarding, changes);
  }, 'notifications'); // a light event: the Get started card listens, the page isn't redrawn
}

/** Add an id to one of the record's lists (done, tipsSeen, suggestionsDismissed), once. */
export function addToList(list, id) {
  const record = getOnboarding();
  if (!record || record[list]?.includes(id)) return;
  updateOnboarding({ [list]: [...(record[list] ?? []), id] });
}

/**
 * Start over on a path: a new source (and its starting homepage). Used by
 * "What brings you to 3den?".
 */
export function choosePath(source, changes = {}) {
  const layout = layoutForArrival(source);
  const personal = getPersonalSpace();
  changeState((state) => {
    state.spaces.find((s) => s.id === personal.id).modules = STARTER_LAYOUTS[layout].modules();
  }, 'layout');
  updateOnboarding({ source, layout, answered: true, noteDismissed: false, ...changes });
}

/** A Get started step that's finished by doing something (not by checking the data). */
export function markStep(id) {
  addToList('done', id);
}
