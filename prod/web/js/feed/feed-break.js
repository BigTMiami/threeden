// @ts-check
/**
 * feed-break.js — "Take a break" from the Feed for 24 hours.
 *
 * While a break is on, the Feed tab shows a quiet "You're taking a break"
 * page with the time it ends, instead of posts, and the Dashboard's
 * "From friends" section is hidden. There's no way to end it early: that's
 * the point. Friends, your own blog, groups, and Messages all still work,
 * and you can still open a particular person's blog on purpose.
 *
 *   startFeedBreak(memberId)     → the time it ends (ms)
 *   feedBreakEndsAt(memberId)    → ms, or null if there's no break on
 *   feedBreakControl(me)         → the "Take a break" button, with a confirm step
 *
 * Saved as member.feedBreakUntil (a timestamp); nothing needs clearing when
 * it runs out.
 */

import { changeState, getMember, getCurrentUser } from '../state/store.js';
import { blogHref } from '../router.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';

export const BREAK_HOURS = 24;

export function feedBreakEndsAt(memberId) {
  const until = getMember(memberId)?.feedBreakUntil;
  return until && until > Date.now() ? until : null;
}

export const isOnFeedBreak = (memberId) => feedBreakEndsAt(memberId) !== null;

export function startFeedBreak(memberId) {
  const until = Date.now() + BREAK_HOURS * 60 * 60 * 1000;
  changeState((state) => { state.members.find((m) => m.id === memberId).feedBreakUntil = until; }, 'account');
  return until;
}

/** "tomorrow at 1:05 AM" */
export function breakEndLabel(until) {
  const end = new Date(until);
  const time = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = end.toDateString() === new Date().toDateString();
  return `${sameDay ? 'today' : 'tomorrow'} at ${time}`;
}

/** "23 hours" / "40 minutes" */
function timeLeftLabel(until) {
  const minutes = Math.max(1, Math.round((until - Date.now()) / 60000));
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** What the Feed tab shows during a break. */
export function renderFeedBreak(memberId) {
  const until = feedBreakEndsAt(memberId);
  return h('div', { class: 'settings-section feed-break' },
    h('span', { class: 'feed-break__icon', 'aria-hidden': 'true' }, icon('clock', 22)),
    h('h2', { class: 'feed-break__title' }, 'You’re taking a break from your feed'),
    h('p', {}, `It comes back ${breakEndLabel(until)}, in about ${timeLeftLabel(until)}.`),
    h('p', { class: 'settings-field__hint' },
      'Your groups, Messages, friends, and your own blog all still work. ',
      'If someone posts something you need to know, they can still message you.'),
    h('div', { class: 'form-row feed-break__links' },
      h('a', { class: 'button', href: '#space-me' }, 'Go to your homepage'),
      h('a', { class: 'button button--quiet', href: blogHref(getCurrentUser()) }, 'Your blog')));
}

/**
 * A "Take a break" button. The first click asks to confirm (it can't be
 * undone for 24 hours); the second starts it. During a break it says when
 * the feed comes back.
 */
export function feedBreakControl(me, { onStart = null, compact = false } = {}) {
  const box = h('span', { class: 'feed-break-control' });
  function draw(confirming = false) {
    const until = feedBreakEndsAt(me.id);
    if (until) {
      replaceChildren(box, h('span', { class: 'settings-field__hint' }, icon('clock', 12), ` On a break until ${breakEndLabel(until)}`));
      return;
    }
    if (!confirming) {
      replaceChildren(box, h('button', {
        type: 'button',
        class: compact ? 'link-button feed-break-control__start' : 'button feed-break-control__start',
        title: `Hide your feed for ${BREAK_HOURS} hours`,
        onClick: () => draw(true),
      }, icon('clock', 12), ' Take a break'));
      return;
    }
    replaceChildren(box,
      h('span', { class: 'feed-break-control__ask' }, `Hide your feed for ${BREAK_HOURS} hours? You can’t turn it back on early.`),
      h('button', {
        type: 'button',
        class: 'button button--small button--primary',
        onClick: () => {
          const ends = startFeedBreak(me.id);
          showToast(`Enjoy the break. Your feed comes back ${breakEndLabel(ends)}.`);
          if (onStart) onStart(); else draw();
        },
      }, 'Start break'),
      h('button', { type: 'button', class: 'button button--small button--quiet', onClick: () => draw(false) }, 'Cancel'));
  }
  draw();
  return box;
}
