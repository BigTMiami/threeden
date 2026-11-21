// @ts-check
/**
 * preview-as-new.js — prototype only (Nov 20): from the sign-in page, see
 * each way into 3den as a brand-new person would, in one tap.
 *
 *   Preview as a new user
 *   [Invited to a group]        Juniper Supper Club's invite link
 *   [Sent an event]             Porch Lights at the Juniper Street Fair
 *   [A friend's invite link]    Jamal Brooks
 *   [Found a public page]       Porch Lights (follows it)
 *   [Wants to start a group]    Create a group, then set it up
 *   [Came with no link]         A new homepage
 *
 * Each tap makes a fresh account (a new name each time, no password,
 * marked `preview` so it stays out of the demo-account list), does what
 * that person would have done (joined, answered, befriended, followed),
 * and opens where they'd land, so that path's tutorials run from the start.
 *
 *   PREVIEW_PATHS          [{ id, label, detail }]
 *   startPreview(id)
 */

import { getState, getSpace, getSpaces, changeState } from '../state/store.js';
import { createAccount, usernameProblem } from '../state/accounts.js';
import { addMember } from '../state/groups.js';
import { updateEvent, findEvent } from '../state/events.js';
import { applyRsvp } from '../modules/calendar/calendar-data.js';
import { toggleFollow } from '../state/follows.js';
import { befriendByLink, findInviter } from '../state/bring.js';
import { goTo, spaceHref } from '../router.js';
import { showToast } from '../ui/toast.js';

const supperClub = () => getSpaces().find((s) => s.inviteCode === 'supper24');
const EVENT_ID = 'band-ev-2';
const BAND_ID = 'porchlights';

export const PREVIEW_PATHS = [
  { id: 'group', label: 'Invited to a group', detail: 'Juniper Supper Club’s invite link' },
  { id: 'event', label: 'Sent an event', detail: 'Porch Lights at the Juniper Street Fair' },
  { id: 'friend', label: 'A friend’s invite link', detail: 'Jamal Brooks' },
  { id: 'follow', label: 'Found a public page', detail: 'Porch Lights (follows it)' },
  { id: 'organizer', label: 'Wants to start a group', detail: 'Create a group, then set it up' },
  { id: 'direct', label: 'Came with no link', detail: 'A new homepage' },
];

const FIRST = ['Sam', 'Rosa', 'Theo', 'Maya', 'Ezra', 'Lena', 'Omar', 'Ivy', 'Noah', 'Priya', 'Jonah', 'Ada'];
const LAST = ['Rivera', 'Okafor', 'Lindqvist', 'Moreau', 'Haddad', 'Castillo', 'Nakamura', 'Brennan'];

/** A fresh, unused name and username for each preview. */
function freshPerson() {
  const n = getState().members.filter((m) => m.preview).length;
  const name = `${FIRST[n % FIRST.length]} ${LAST[n % LAST.length]}`;
  let i = n + 1;
  let username = `preview${i}`;
  while (usernameProblem(username)) { i += 1; username = `preview${i}`; }
  return { name, username };
}

function makeAccount(arrival) {
  const { name, username } = freshPerson();
  const member = createAccount({ name, username, email: `${username}@example.com`, password: null, arrival });
  changeState((state) => { const m = state.members.find((x) => x.id === member.id); if (m) m.preview = true; });
  return member;
}

/** Start one path as a brand-new person. */
export function startPreview(id) {
  if (id === 'group') {
    const group = supperClub();
    if (!group) return;
    const me = makeAccount({ source: 'group', spaceId: group.id });
    addMember(group.id, me.id, 'member', { via: 'link' });
    goTo(spaceHref(group.id));
    showToast(`You’re ${me.name}, new to 3den, and you just joined ${group.name}.`);
  } else if (id === 'event') {
    const found = findEvent(EVENT_ID);
    const me = makeAccount({ source: 'event', itemId: EVENT_ID, spaceId: found?.space.id ?? null });
    updateEvent(EVENT_ID, (event) => applyRsvp(event, me.id, 'going'));
    goTo(`#event-${EVENT_ID}`);
    showToast(`You’re ${me.name}, new to 3den, and you’re going to ${found?.event.title ?? 'the event'}.`);
  } else if (id === 'friend') {
    const inviter = findInviter('jamal');
    const me = makeAccount(inviter ? { source: 'friend', inviterId: inviter.id } : null);
    if (inviter) befriendByLink(inviter.id, me.id);
    goTo(inviter ? `#blog-${inviter.username}` : '#');
    showToast(`You’re ${me.name}, new to 3den${inviter ? `, and friends with ${inviter.name}` : ''}.`);
  } else if (id === 'follow') {
    const band = getSpace(BAND_ID);
    const me = makeAccount({ source: 'follow', spaceId: BAND_ID });
    if (band) toggleFollow(me.id, { kind: 'space', id: BAND_ID });
    goTo(spaceHref(BAND_ID));
    showToast(`You’re ${me.name}, new to 3den, and you follow ${band?.name ?? 'the band'}.`);
  } else if (id === 'organizer') {
    const me = makeAccount({ source: 'organizer' });
    goTo('#new-group');
    showToast(`You’re ${me.name}, new to 3den. Start your group.`);
  } else {
    const me = makeAccount(null);
    goTo('#');
    showToast(`Welcome to 3den, ${me.name.split(' ')[0]}!`);
  }
}
