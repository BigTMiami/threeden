// @ts-check
/**
 * event-thanks.js — "Say thanks" on an event's page once it's over, and
 * the thank-yous on someone's blog.
 *
 *   Say thanks
 *   Who made it happen?  [Grace (host) ▾]  [ You kept the line moving! ] [Send]
 *   ✓ You thanked Grace · Undo
 *
 *   On Grace's blog:
 *   💛 Thanks  “You kept the line moving!”  Leo, for Saturday free pantry
 *
 * The people offered: the hosts first, then whoever took a sign-up spot,
 * then everyone else who went. No counts anywhere (js/state/thanks.js).
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { getMember } from '../state/store.js';
import { sayThanks, unsayThanks, thanksFor, hasThanked } from '../state/thanks.js';
import { hostIdsOf, rsvpOf } from '../modules/calendar/calendar-data.js';
import { blogHref } from '../router.js';

const MAX_ON_BLOG = 3;

/** Who someone might thank for this event, with why ("host", "brought snacks"). */
function thankable(event, meId) {
  const seen = new Set([meId]);
  const people = [];
  const add = (id, why) => { if (!id || seen.has(id) || !getMember(id)) return; seen.add(id); people.push({ id, why }); };
  for (const id of hostIdsOf(event)) add(id, id === event.createdBy ? 'host' : 'co-host');
  for (const [id, answer] of Object.entries(event.rsvps ?? {})) if (answer === 'going') add(id, 'went');
  return people;
}

export function renderSayThanks(event, me) {
  if (!me || me.isGuest) return null;
  const went = event.createdBy === me.id || ['going', 'maybe'].includes(rsvpOf(event, me.id));
  if (!went) return null;
  const people = thankable(event, me.id);
  if (!people.length) return null;

  const root = h('section', { class: 'event-page__thanks' });
  const draw = () => {
    const open = people.filter((p) => !hasThanked(me.id, p.id, event.id));
    const done = people.filter((p) => hasThanked(me.id, p.id, event.id));
    const select = h('select', { class: 'input input--compact', 'aria-label': 'Who to thank' },
      open.map((p) => h('option', { value: p.id }, `${getMember(p.id).name.split(' ')[0]} (${p.why})`)));
    const note = h('input', { type: 'text', class: 'input', maxlength: '140', placeholder: 'What made a difference? (optional)', 'aria-label': 'Your thank-you note' });
    replaceChildren(root,
      h('h2', { class: 'event-page__section-title' }, 'Say thanks'),
      open.length ? h('form', {
        class: 'event-thanks__form',
        onSubmit: (e) => {
          e.preventDefault();
          const entry = sayThanks({ fromId: me.id, toId: select.value, event, text: note.value });
          const name = getMember(entry.toId)?.name.split(' ')[0];
          draw();
          showToast(`Thanked ${name}. It shows on their blog.`, { actionLabel: 'Undo', onAction: () => { unsayThanks(entry.id); draw(); } });
        },
      }, select, note, h('button', { type: 'submit', class: 'button button--small button--primary' }, icon('heart', 13), ' Send')) : null,
      done.length ? h('p', { class: 'event-details__muted' }, icon('check', 13), ` You thanked ${done.map((p) => getMember(p.id).name.split(' ')[0]).join(', ')}.`) : null);
  };
  draw();
  return root;
}

/** The latest thank-yous to the blog's owner, for their blog's header. No counts. */
export function renderThanksOnBlog(ownerId) {
  const list = thanksFor(ownerId);
  if (!list.length) return null;
  let showAll = false;
  const root = h('div', { class: 'blog-thanks', 'aria-label': 'Thank-yous' });
  const draw = () => {
    const shown = showAll ? list : list.slice(0, MAX_ON_BLOG);
    replaceChildren(root,
      h('p', { class: 'blog-thanks__title' }, icon('heart', 13), ' Thanks'),
      h('ul', { class: 'blog-thanks__list' }, shown.map((t) => {
        const from = getMember(t.fromId);
        return h('li', { class: 'blog-thanks__item' },
          from ? avatar(from, 22) : null,
          h('span', {},
            t.text ? h('q', { class: 'blog-thanks__text' }, t.text) : null,
            h('span', { class: 'blog-thanks__who' }, ' ', from ? h('a', { href: blogHref(from) }, from.name.split(' ')[0]) : 'Someone', `, for ${t.eventTitle}`)));
      })),
      !showAll && list.length > MAX_ON_BLOG ? h('button', { type: 'button', class: 'link-button', onClick: () => { showAll = true; draw(); } }, 'See them all') : null);
  };
  draw();
  return root;
}
