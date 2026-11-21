// @ts-check
/**
 * preview-as-new.js — prototype only (Nov 20): from the sign-in page, see
 * each way into 3den as a brand-new person would, every step of it.
 *
 *   Preview as a new user
 *   [Invited to a group]        Juniper Supper Club's invite link
 *   [Sent an event]             Porch Lights at the Juniper Street Fair
 *   [A friend's invite link]    Jamal Brooks
 *   [Found a public page]       Porch Lights
 *   [Wants to start a group]    Create an account, then a group
 *   [Came with no link]         The 3den front page
 *
 * Each tap opens the page that person would open, signed out: the invite
 * page, the event, Jamal's invite link, the band's public page, the sign-up
 * form, or the front page. From there you do what they'd do (Create an
 * account and join, answer the RSVP, follow, sign up), so you see the
 * account-making and every tutorial after it. (Until Nov 20 evening each
 * tap made the account for you; Leo asked to see that step too.)
 *
 *   PREVIEW_PATHS          [{ id, label, detail }]
 *   startPreview(id)
 */

import { getSpaces } from '../state/store.js';
import { goTo, spaceHref } from '../router.js';
import { setAfterSignIn } from './auth-view.js';

const EVENT_ID = 'band-ev-2';
const BAND_ID = 'porchlights';
const FRIEND = 'jamal';

export const PREVIEW_PATHS = [
  { id: 'group', label: 'Invited to a group', detail: 'Juniper Supper Club’s invite link' },
  { id: 'event', label: 'Sent an event', detail: 'Porch Lights at the Juniper Street Fair' },
  { id: 'friend', label: 'A friend’s invite link', detail: 'Jamal Brooks' },
  { id: 'follow', label: 'Found a public page', detail: 'Porch Lights' },
  { id: 'organizer', label: 'Wants to start a group', detail: 'Create an account, then a group' },
  { id: 'direct', label: 'Came with no link', detail: 'The 3den front page' },
];

/** Tutorial progress kept for this browser tab: a preview starts with none. */
const TOUR_KEYS = ['3den.joinedTour.session', '3den.groupSetup'];

/** Start one path, signed out, where that person would. */
export function startPreview(id) {
  try { TOUR_KEYS.forEach((key) => sessionStorage.removeItem(key)); } catch { /* fine */ }
  setAfterSignIn(null);
  if (id === 'group') {
    const code = getSpaces().find((s) => s.inviteCode === 'supper24')?.inviteCode ?? 'supper24';
    goTo(`#join-${code}`);
  } else if (id === 'event') {
    goTo(`#event-${EVENT_ID}`);
  } else if (id === 'friend') {
    goTo(`#hi-${FRIEND}`);
  } else if (id === 'follow') {
    goTo(spaceHref(BAND_ID));
  } else if (id === 'organizer') {
    setAfterSignIn('#new-group');
    goTo('#signup');
  } else {
    goTo('#welcome');
  }
}
