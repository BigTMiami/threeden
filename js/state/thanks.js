// @ts-check
/**
 * thanks.js — thanking someone after an event.
 *
 *   state.thanks = [{ id, fromId, toId, eventId, eventTitle, text, createdAt }]
 *
 * A thank-you shows on the thanked person's blog ("Grace, for the Saturday
 * pantry: ‘You kept the line moving!’ — Leo"), and they're told. There are
 * deliberately no counts anywhere: it's a note, not a score.
 */

import { changeState, getState, getMember } from './store.js';
import { notify } from './notifications.js';
import { makeId } from '../ui/dom.js';

export function sayThanks({ fromId, toId, event, text }) {
  const entry = { id: makeId('thx'), fromId, toId, eventId: event.id, eventTitle: event.title, text: text.trim(), createdAt: Date.now() };
  changeState((state) => { state.thanks = [...(state.thanks ?? []), entry]; }, 'account');
  const from = getMember(fromId);
  notify({
    recipientIds: [toId], actorId: fromId, kind: 'thanks',
    text: `${from?.name ?? 'Someone'} thanked you for “${event.title}”${entry.text ? `: “${entry.text.slice(0, 80)}”` : ''}`,
    href: `#blog-${getMember(toId)?.username ?? ''}`,
  });
  return entry;
}

export function unsayThanks(id) {
  changeState((state) => { state.thanks = (state.thanks ?? []).filter((t) => t.id !== id); }, 'account');
}

/** Thank-yous to this person, newest first. */
export function thanksFor(memberId) {
  return (getState().thanks ?? []).filter((t) => t.toId === memberId).sort((a, b) => b.createdAt - a.createdAt);
}

/** Has `fromId` already thanked `toId` for this event? */
export function hasThanked(fromId, toId, eventId) {
  return (getState().thanks ?? []).some((t) => t.fromId === fromId && t.toId === toId && t.eventId === eventId);
}
