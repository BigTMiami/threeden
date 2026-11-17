// @ts-check
/**
 * asks.js — "Are you coming?" and "Who's bringing what?" on an
 * announcement, so a simple ask doesn't need its own event or module.
 *
 *   Writing:   [Poll] [RSVP] [Sign-ups]
 *     RSVP      ☑ Ask who's coming   (optional: When  [Sat 9am at the pantry])
 *     Sign-ups  [ Folding tables ] [2] spots  ×
 *               [ Coffee        ] [1] spots  ×      [+ Add a line]
 *
 *   Reading:   Are you coming?  [Going] [Maybe] [Can’t go]   4 going · 1 maybe
 *              Sign up          Folding tables   1 of 2  (MC)   [I’ll bring it]
 *                               Coffee           1 of 1  (LL)   [Take me off]
 *
 *   askAttacher()  → { rsvpButton, signupButton, slot, read() → { rsvp, signups }, reset() }
 *   renderAsks({ getPost, savePost, me, canAnswer })  → element or null
 *
 * Saved on the post: rsvp: null | { when: '', answers: { memberId: 'going' | 'maybe' | 'no' } }
 *                    signups: [{ id, label, spots, memberIds }]
 */

import { h, replaceChildren, makeId } from './dom.js';
import { icon } from './icons.js';
import { avatarStack } from './avatar.js';
import { showToast } from './toast.js';
import { getMember } from '../state/store.js';

const ANSWERS = [
  { id: 'going', label: 'Going', emoji: '👍' },
  { id: 'maybe', label: 'Maybe', emoji: '🤔' },
  { id: 'no', label: 'Can’t go', emoji: '😢' },
];

export function askAttacher() {
  let rsvpOn = false;
  let lines = [];
  const slot = h('div', { class: 'asks-attacher' });
  const whenInput = h('input', { type: 'text', class: 'input input--compact', placeholder: 'When and where (optional)', 'aria-label': 'When and where' });
  const rsvpButton = h('button', { type: 'button', class: 'button button--small', onClick: () => { rsvpOn = !rsvpOn; draw(); } }, icon('ticket', 14), ' RSVP');
  const signupButton = h('button', { type: 'button', class: 'button button--small', onClick: () => { if (!lines.length) lines = [{ label: '', spots: 1 }]; else lines = []; draw(); } }, icon('hand2', 14), ' Sign-ups');

  function draw() {
    rsvpButton.classList.toggle('is-active', rsvpOn);
    signupButton.classList.toggle('is-active', lines.length > 0);
    replaceChildren(slot,
      rsvpOn ? h('div', { class: 'asks-attacher__box' },
        h('div', { class: 'poll-attacher__top' }, h('strong', {}, 'Ask who’s coming'), h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { rsvpOn = false; draw(); } }, 'Remove')),
        whenInput) : null,
      lines.length ? h('div', { class: 'asks-attacher__box' },
        h('div', { class: 'poll-attacher__top' }, h('strong', {}, 'Sign-ups'), h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { lines = []; draw(); } }, 'Remove')),
        lines.map((line, i) => h('div', { class: 'asks-attacher__line' },
          h('input', { type: 'text', class: 'input input--compact', placeholder: i === 0 ? 'What’s needed (e.g. Folding tables)' : 'Another thing', value: line.label, 'aria-label': `Sign-up ${i + 1}`, onInput: (e) => { line.label = e.target.value; } }),
          h('input', { type: 'text', inputmode: 'numeric', class: 'input input--compact asks-attacher__spots', value: String(line.spots), 'aria-label': 'How many people', onInput: (e) => { line.spots = Math.max(1, Math.min(99, Number(e.target.value.replace(/\D/g, '')) || 1)); } }),
          h('span', { class: 'asks-attacher__unit' }, 'spots'),
          h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Remove this line', onClick: () => { lines.splice(i, 1); draw(); } }, icon('close', 14)))),
        h('button', { type: 'button', class: 'link-button', onClick: () => { lines.push({ label: '', spots: 1 }); draw(); } }, icon('plus', 12), ' Add a line')) : null);
  }
  draw();

  return {
    rsvpButton,
    signupButton,
    slot,
    read: () => ({
      rsvp: rsvpOn ? { when: whenInput.value.trim(), answers: {} } : null,
      signups: lines.filter((l) => l.label.trim()).map((l) => ({ id: makeId('su'), label: l.label.trim(), spots: l.spots, memberIds: [] })),
    }),
    reset: () => { rsvpOn = false; lines = []; whenInput.value = ''; draw(); },
  };
}

/** The RSVP buttons and sign-up list on a post, or null if it has neither. */
export function renderAsks({ getPost, savePost, me, canAnswer = true, collapse = false, compact = false }) {
  // compact: one row of buttons, no box, label, or counts (the From groups box shows the when itself).
  const root = h('div', { class: `asks${compact ? ' asks--compact' : ''}` });
  if (compact) collapse = true;
  // collapse: sign-ups start as one line ("3 slots open · Pick one"), opened with a tap.
  let signupsOpen = !collapse;
  function draw() {
    const post = getPost();
    if (!post || (!post.rsvp && !post.signups?.length)) { replaceChildren(root); return; }
    const answers = post.rsvp?.answers ?? {};
    const mine = answers[me.id];
    const counts = ANSWERS.map((a) => [a.id, Object.values(answers).filter((x) => x === a.id).length]);
    replaceChildren(root,
      post.rsvp ? h('div', { class: 'asks__rsvp' },
        compact ? null : h('span', { class: 'asks__label' }, 'Are you coming?', post.rsvp.when ? h('span', { class: 'asks__when' }, ` ${post.rsvp.when}`) : null),
        canAnswer ? h('span', { class: 'rsvp rsvp--compact' }, ANSWERS.map((a) => h('button', {
          type: 'button', class: `rsvp__button${mine === a.id ? ' is-chosen' : ''}`, 'aria-pressed': String(mine === a.id),
          onClick: () => {
            savePost((p) => { p.rsvp.answers = { ...p.rsvp.answers, [me.id]: a.id }; });
            showToast(a.id === 'going' ? 'You’re going.' : a.id === 'maybe' ? 'Marked as maybe.' : 'Thanks for letting them know.');
            draw();
          },
        }, `${a.emoji} ${a.label}`))) : null,
        compact ? null : h('span', { class: 'asks__counts' }, counts.filter(([, n]) => n).map(([id, n]) => `${n} ${id === 'no' ? 'can’t' : id}`).join(' · ') || 'No answers yet'),
        compact && post.signups?.length && !signupsOpen ? signupChip(post) : null) : null,
      compact && !post.rsvp && post.signups?.length && !signupsOpen ? signupChip(post) : null,
      post.signups?.length && !signupsOpen && !compact ? signupLine(post) : null,
      post.signups?.length && signupsOpen ? h('ul', { class: 'asks__signups' },
        h('li', { class: 'asks__label' }, 'Sign up'),
        post.signups.map((slot) => {
          const taken = slot.memberIds ?? [];
          const isMine = taken.includes(me.id);
          const full = taken.length >= slot.spots;
          return h('li', { class: 'asks__slot' },
            h('span', { class: 'asks__slot-label' }, slot.label),
            h('span', { class: 'asks__slot-count' }, `${taken.length} of ${slot.spots}`),
            taken.length ? avatarStack(taken.map(getMember).filter(Boolean), 20, 4) : null,
            canAnswer ? h('button', {
              type: 'button', class: `button button--small${isMine ? '' : ' button--primary'}`, disabled: full && !isMine,
              onClick: () => {
                savePost((p) => {
                  p.signups = p.signups.map((s) => (s.id !== slot.id ? s : { ...s, memberIds: isMine ? s.memberIds.filter((id) => id !== me.id) : [...(s.memberIds ?? []), me.id] }));
                });
                showToast(isMine ? `Took you off “${slot.label}”.` : `You’re down for “${slot.label}”.`);
                draw();
              },
            }, isMine ? 'Take me off' : full ? 'Full' : 'I’ll take it') : null);
        })) : null);
  }
  /** Compact: sign-ups as one small button, "Sign up · 4 open", that opens the list. */
  function signupChip(post) {
    const open = post.signups.reduce((n, s) => n + Math.max(0, s.spots - (s.memberIds ?? []).length), 0);
    const mine = post.signups.some((s) => (s.memberIds ?? []).includes(me.id));
    return h('button', {
      type: 'button', class: `chip asks__signup-chip${mine ? ' is-chosen' : ''}`, 'aria-expanded': 'false', disabled: !canAnswer || (!open && !mine),
      onClick: () => { signupsOpen = true; draw(); },
    }, icon('hand2', 13), mine ? ' You signed up' : open ? ` Sign up · ${open} open` : ' All taken');
  }
  /** Sign-ups folded into one line: "Sign up · 3 slots open [Pick one]", or yours. */
  function signupLine(post) {
    const open = post.signups.reduce((n, s) => n + Math.max(0, s.spots - (s.memberIds ?? []).length), 0);
    const mine = post.signups.filter((s) => (s.memberIds ?? []).includes(me.id)).map((s) => `“${s.label}”`);
    return h('div', { class: 'asks__signup-line' },
      h('span', { class: 'asks__label' }, 'Sign up'),
      h('span', { class: 'asks__counts' }, mine.length ? `You’re on ${mine.join(' and ')}` : open ? `${open} ${open === 1 ? 'slot' : 'slots'} open` : 'All taken'),
      canAnswer && (open || mine.length) ? h('button', { type: 'button', class: 'button button--small', 'aria-expanded': 'false', onClick: () => { signupsOpen = true; draw(); } }, mine.length ? 'Change' : 'Pick one') : null);
  }
  draw();
  return root;
}
