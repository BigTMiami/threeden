// @ts-check
/**
 * met-in-person.js — the "Met in person" line on a blog, and the button.
 *
 *   🤝 Met in person by Maya, Theo, and you    [✓ I’ve met Grace]
 *
 * Names only, people you know first (js/state/vouches.js). The button shows
 * for people you share a group with; tapping it again takes it back.
 */

import { h, replaceChildren } from './dom.js';
import { showToast } from './toast.js';
import { getMember } from '../state/store.js';
import { vouchersFor, hasVouched, setVouch, canVouch } from '../state/vouches.js';

const SHOW_NAMES = 3;

function namesLine(ids, viewerId) {
  const names = ids.slice(0, SHOW_NAMES).map((id) => (id === viewerId ? 'you' : getMember(id)?.name.split(' ')[0] ?? 'someone'));
  if (ids.length > SHOW_NAMES) names.push('others you know');
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')}${names.length > 2 ? ',' : ''} and ${names[names.length - 1]}`;
}

export function renderMetInPerson(ownerId, me) {
  const root = h('div', { class: 'met-in-person' });
  const draw = () => {
    const ids = vouchersFor(ownerId, me?.id);
    const mine = Boolean(me) && hasVouched(me.id, ownerId);
    const offer = Boolean(me) && !me.isGuest && canVouch(me.id, ownerId);
    const first = getMember(ownerId)?.name.split(' ')[0] ?? 'them';
    if (!ids.length && !offer) { replaceChildren(root); root.hidden = true; return; }
    root.hidden = false;
    replaceChildren(root,
      ids.length ? h('span', { class: 'met-in-person__line' }, h('span', { 'aria-hidden': 'true' }, '🤝 '), `Met in person by ${namesLine(ids, me?.id)}`) : null,
      offer ? h('button', {
        type: 'button', class: `chip met-in-person__button${mine ? ' is-on' : ''}`, 'aria-pressed': String(mine),
        title: mine ? 'Tap to take it back' : `Only if you’ve actually met ${first}. It helps people in your groups trust each other.`,
        onClick: () => {
          setVouch(me.id, ownerId, !mine);
          draw();
          showToast(mine ? 'Taken back.' : `Noted: you’ve met ${first}. People in your groups see it on their blog.`);
        },
      }, mine ? `✓ I’ve met ${first}` : `I’ve met ${first}`) : null);
  };
  draw();
  return root;
}
