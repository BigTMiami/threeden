/**
 * rsvp.js — Partiful-style RSVPs: the Going / Maybe / Can't go buttons and
 * the guest list. Used on event pages, in the calendar's event details and
 * in the Upcoming events module.
 *
 *   [👍 Going · 12] [🤔 Maybe · 3] [😢 Can't go · 1]
 *
 *   Going (12)   (LL)(AA)(WW) …
 *   Maybe (3)    (TM) …
 *   Invited (2)  (RP)(DK)        ← haven't answered yet
 *   Waitlist (2) (JB)(NL)        ← in order, when it's full
 *
 * A full event's Going button becomes "Join the waitlist" (or "On the
 * waitlist · #2", click to leave). When a spot opens, the first person
 * waiting moves up to Going (applyRsvp in calendar-data.js).
 *
 * Answering never moves the view (Leo, Nov 16): whatever redraws after an
 * answer, the buttons you pressed stay where they were on screen (the
 * scrolling box around them is nudged back), keyboard focus goes back to
 * the button, and places that only ask people who haven't answered (a
 * card's compact list, "For you", "Needs you") keep showing the buttons
 * for the rest of the visit so you can change your answer
 * (answeredThisVisit).
 */

import { h } from '../ui/dom.js';
import { avatar } from '../ui/avatar.js';
import { icon } from '../ui/icons.js';
import { getCurrentUser } from '../state/store.js';
import { friendsFirst, friendsGoingLine, isRegular, visitsOf } from './regulars.js';
import { RSVP_CHOICES, rsvpOf, rsvpLists, awaitingReply, isFull, applyRsvp, waitlistPlace } from '../modules/calendar/calendar-data.js';
import { findEvent, updateEvent } from '../state/events.js';
import { requireAccount } from '../onboarding/guest.js';

/**
 * The three answer buttons. Clicking your current answer takes it back.
 * Someone who isn't signed in is asked to sign up first; their answer is
 * saved as soon as the account exists (js/onboarding/guest.js).
 * @param {object}   event
 * @param {string}   memberId     the person answering
 * @param {function} onAnswer     called with 'going' | 'maybe' | 'no' | null
 * @param {object}   options      { compact }
 */
export function rsvpButtons(event, memberId, onAnswer, { compact = false, guestOf = null } = {}) {
  const mine = rsvpOf(event, memberId);
  // Answer, then put the view back the way it was (keepPlace).
  const answerWith = (button, choiceId, answer) => keepPlace(button, `${event.id}:${choiceId}`, () => {
    answeredHere.add(event.id);
    onAnswer(answer);
  });
  const lists = rsvpLists(event);
  const full = isFull(event) && mine !== 'going';

  return h('div', { class: `rsvp${compact ? ' rsvp--compact' : ''}`, role: 'group', 'aria-label': 'Your RSVP' },
    RSVP_CHOICES.map((choice) => {
      const isMine = mine === choice.id;
      const place = waitlistPlace(event, memberId);
      // Full: Going becomes the waitlist button.
      if (choice.id === 'going' && (full || place)) {
        return h('button', {
          type: 'button',
          class: `rsvp__button rsvp__button--waitlist${place ? ' is-mine' : ''}`,
          'aria-pressed': String(Boolean(place)),
          'data-rsvp-key': `${event.id}:going`,
          title: place ? 'Click to leave the waitlist' : 'It’s full. You’ll move up to Going if a spot opens, and we’ll tell you.',
          onClick: (click) => {
            if (requireAccount({
              reason: `to join the waitlist for “${event.title}”`,
              action: 'RSVP',
              arrival: { source: 'event', itemId: event.id, spaceId: findEvent(event.id)?.space.id ?? null },
              then: (newMemberId) => updateEvent(event.id, (saved) => applyRsvp(saved, newMemberId, 'waitlist')),
            })) return;
            answerWith(click.currentTarget, 'going', place ? null : 'waitlist');
          },
        }, h('span', { class: 'rsvp__emoji', 'aria-hidden': 'true' }, '📋'), place ? ` On the waitlist · #${place}` : ' Join the waitlist');
      }
      const disabled = false;
      return h('button', {
        type: 'button',
        class: `rsvp__button rsvp__button--${choice.id}${isMine ? ' is-mine' : ''}`,
        'aria-pressed': String(isMine),
        'data-rsvp-key': `${event.id}:${choice.id}`,
        disabled,
        title: disabled ? 'This event is full' : isMine ? 'Click again to take back your answer' : '',
        onClick: (click) => {
          if (requireAccount({
            reason: `to answer “${event.title}”`,
            action: 'RSVP',
            arrival: { source: 'event', itemId: event.id, spaceId: findEvent(event.id)?.space.id ?? null },
            then: (newMemberId) => updateEvent(event.id, (saved) => {
              applyRsvp(saved, newMemberId, choice.id);
              // Came through a friend's guest link: on the guest list from now on.
              if (guestOf && !saved.inviteeIds.includes(newMemberId)) saved.inviteeIds = [...saved.inviteeIds, newMemberId];
            }),
          })) return;
          answerWith(click.currentTarget, choice.id, isMine ? null : choice.id);
        },
      },
        h('span', { class: 'rsvp__emoji', 'aria-hidden': 'true' }, choice.emoji),
        ` ${disabled ? 'Full' : choice.label}`,
        compact ? null : h('span', { class: 'rsvp__count' }, ` · ${lists[choice.id].length}`));
    }),
  );
}

/** Events answered during this visit: lists of things to answer keep showing them, so the buttons don't vanish mid-click. */
const answeredHere = new Set();

/** Did `memberId`'s answer to this event happen during this visit? (Keep its buttons on screen.) */
export const answeredThisVisit = (eventId) => answeredHere.has(eventId);

/** Every box that scrolls around an element, innermost first, then the page. */
function scrollersOf(el) {
  const out = [];
  for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) out.push(node);
  }
  return out;
}

/**
 * Run `redraw`, then keep the view still: put back every scroll position
 * around `button`, move the nearest one so the new button with the same
 * `key` sits where the old one was, and give it keyboard focus. Redraws
 * that happen a frame later (pop-ups wait a frame) are caught too.
 */
function keepPlace(button, key, redraw) {
  if (!button) { redraw(); return; }
  const top = button.getBoundingClientRect().top;
  const scrollers = scrollersOf(button).map((el) => ({ el, y: el.scrollTop }));
  const page = { x: window.scrollX, y: window.scrollY };
  const hadFocus = document.activeElement === button || button.contains(document.activeElement);
  const inDialog = Boolean(button.closest('[role="dialog"], dialog, .modal'));
  redraw();
  const settle = () => {
    for (const { el, y } of scrollers) if (el.isConnected) el.scrollTop = y;
    window.scrollTo(page.x, page.y);
    // The same event can have buttons in several places (a card behind a pop-up): take the one in the same
    // pop-up (or outside any pop-up), nearest to where the pressed one was.
    const dialogOf = (el) => el.closest('[role="dialog"], dialog, .modal');
    const candidates = [...document.querySelectorAll(`[data-rsvp-key="${CSS.escape(key)}"]`)]
      .filter((el) => el instanceof HTMLElement && Boolean(dialogOf(el)) === inDialog);
    const now = /** @type {HTMLElement | undefined} */ (candidates
      .sort((a, b) => Math.abs(a.getBoundingClientRect().top - top) - Math.abs(b.getBoundingClientRect().top - top))[0]);
    if (!now) return;
    const shift = now.getBoundingClientRect().top - top;
    if (Math.abs(shift) > 1) {
      const box = scrollersOf(now)[0];
      if (box) box.scrollTop += shift;
      else window.scrollBy(0, shift);
    }
    if (hadFocus || document.activeElement === document.body) now.focus({ preventScroll: true });
  };
  settle();
  requestAnimationFrame(() => { settle(); requestAnimationFrame(settle); });
}

/**
 * "12 going · 3 maybe" (and "· 5 spots left" when there's a limit).
 * `counts: false` leaves out going and maybe, for places whose RSVP buttons
 * already show them (the event page), so only spots and the waitlist remain.
 * @param {any} event
 * @param {{ counts?: boolean }} [options]
 */
export function rsvpSummary(event, { counts = true } = {}) {
  const lists = rsvpLists(event);
  const parts = counts ? [`${lists.going.length} going`] : [];
  if (counts && lists.maybe.length) parts.push(`${lists.maybe.length} maybe`);
  if (event.capacity) {
    const left = Math.max(0, Number(event.capacity) - lists.going.length);
    parts.push(left ? `${left} ${left === 1 ? 'spot' : 'spots'} left` : 'full');
  }
  if (event.waitlist?.length) parts.push(`${event.waitlist.length} on the waitlist`);
  return parts.join(' · ');
}

/** The guest list: who's going, maybe, can't go, and hasn't answered. No counts: the RSVP buttons show them. */
export function guestList(event, getMember) {
  const lists = rsvpLists(event);
  const meId = getCurrentUser()?.id;
  // Friends first: the faces you know are the reason to come.
  const going = friendsFirst(lists.going, meId);
  const rows = [
    ['Going', going],
    ['Maybe', lists.maybe],
    ['Can’t go', lists.no],
    ['Invited', awaitingReply(event)],
    ['Waitlist', event.waitlist ?? []],
  ].filter(([, ids]) => ids.length);

  if (rows.length === 0) return h('p', { class: 'guest-list__empty' }, 'No one has answered yet. Be the first!');

  const friendsLine = friendsGoingLine(event, meId, going);
  return h('div', {},
    friendsLine ? h('p', { class: 'guest-list__friends' }, icon('people', 13), ` ${friendsLine}`) : null,
    h('dl', { class: 'guest-list' }, rows.map(([label, ids]) => [
      h('dt', {}, label),
      h('dd', {}, ids.map((id) => {
        const member = getMember(id);
        // A regular: three or more dates of a repeating event.
        const regular = label === 'Going' && isRegular(event, id);
        return member
          ? h('span', { class: 'guest-list__person', title: `${member.name} (@${member.username})${regular ? ` · a regular, ${visitsOf(event, id)} times` : ''}` },
            avatar(member, 26), h('span', { class: 'guest-list__name' }, member.name.split(' ')[0]),
            regular ? h('span', { class: 'guest-list__regular' }, 'Regular') : null)
          : null;
      })),
    ])));
}
