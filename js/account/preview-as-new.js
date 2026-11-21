// @ts-check
/**
 * preview-as-new.js — prototype only: from the sign-in page, see each way
 * into 3den as a brand-new person would, every step of it. One preview per
 * lane on the onboarding board (https://claude.ai/artifact/4YoZjJ41hc82h3W3ypBAsE):
 *
 *   Preview as a new user
 *   [Invited to a group]      A · Juniper Supper Club's invite link
 *   [Sent an event]           B · Porch Lights at the Juniper Street Fair
 *   [A friend's invite link]  C · Jamal Brooks
 *   [Came with no link]       E · the 3den front page
 *
 * Each tap opens the page that person would open, signed out: the invite
 * page (AL), the event (BL), Jamal's invite link (CL), or the front page
 * (EL). You press their button and make the account yourself (AK–EK), and
 * the tutorial (js/onboarding/tutorial.js) runs from that lane's first card.
 * (Nov 21: "Wants to start a group" and "Found a public page" are gone: the
 * board has no lane for either, and nobody signing up has said yet that
 * they want to start a group.)
 *
 *   PREVIEW_PATHS          [{ id, lane, label, detail }]
 *   startPreview(id)
 */

import { getSpaces } from '../state/store.js';
import { goTo } from '../router.js';
import { setAfterSignIn } from './auth-view.js';

const EVENT_ID = 'band-ev-2';
const FRIEND = 'jamal';

export const PREVIEW_PATHS = [
  { id: 'group', lane: 'A', label: 'Invited to a group', detail: 'Juniper Supper Club’s invite link' },
  { id: 'event', lane: 'B', label: 'Sent an event', detail: 'Porch Lights at the Juniper Street Fair' },
  { id: 'friend', lane: 'C', label: 'A friend’s invite link', detail: 'Jamal Brooks' },
  { id: 'direct', lane: 'E', label: 'Came with no link', detail: 'The 3den front page' },
];

/** What this browser tab remembers about tours: a preview starts with none of it. */
const TOUR_KEYS = ['3den.tour.visit', '3den.groupSetup'];

/** Start one lane, signed out, where that person would. */
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
  } else {
    goTo('#welcome');
  }
}
