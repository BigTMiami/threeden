// @ts-check
/**
 * onboarding-state.js — how a new person arrived.
 *
 * Saved on the account as member.onboarding (only accounts made in the app
 * have one; the demo people don't):
 *
 *   {
 *     source: 'event' | 'host' | 'group' | 'blog' | 'friend' | 'follow' | 'message' | 'organizer' | 'organized' | 'direct',
 *     itemId,        ← the event (event), or the person whose blog it was (blog)
 *     spaceId,       ← the group (group, organizer), or the event's space
 *     layout,        ← which starting homepage they got (js/data/starter-layouts.js)
 *     startedAt,
 *     answered,      ← false only for direct sign-ups, until the welcome splash has shown
 *     blogWelcome,   ← null, 'yes' or 'later' (first visit to the Blog tab)
 *   }
 *
 * The first tutorial (the "We set this up for you" note, the "Next: …" line,
 * suggestions, and the Dashboard's focused view with tips) was removed on
 * Nov 17 so a new one can be designed. Older records may still carry its
 * fields (done, tipsSeen, suggestionsDismissed, hidden, noteDismissed,
 * doneShown); nothing reads them.
 *
 *   newOnboarding({ source: 'event', itemId: 'band-ev-2' })   → a fresh record
 *   getOnboarding()                                           → the current user's, or null
 *   updateOnboarding({ blogWelcome: 'later' })
 */

import { changeState, getCurrentUser } from '../state/store.js';
import { layoutForArrival } from '../data/starter-layouts.js';

export function newOnboarding(arrival) {
  const source = arrival?.source ?? 'direct';
  return {
    source,
    itemId: arrival?.itemId ?? arrival?.inviterId ?? null, // a friend's invite link: who sent it
    spaceId: arrival?.spaceId ?? null,
    layout: layoutForArrival(source),
    startedAt: Date.now(),
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
  }, 'notifications'); // a light event: the page isn't redrawn
}
