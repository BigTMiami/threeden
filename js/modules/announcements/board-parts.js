// @ts-check
/**
 * board-parts.js — pieces the Board's card and full page share (Nov 18).
 *
 *   boardComposer({ context, me, canPin, withAsks, onPosted })
 *       → { form, reset }   the "+ Post" form: optional title, what's
 *         attached (Add: poll, vault file, camera roll), the words, then
 *         [Pin: Don't pin ▾] (admins) and [✓ Show in members' Feeds]
 *   likeButton(post, me, onToggle)        ♡ 3
 *   pinChooser({ post, onPin, onUnpin })  Pin ▸ 1 day · 3 days · 1 week · 2 weeks · Until unpinned
 *
 * Pins: announcements-data.js (makePin, isPinned, pinLabel).
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { attachMentionPicker } from '../../ui/mention-picker.js';
import { askAttacher } from '../../ui/asks.js';
import { eventAttacher, addEventToSpace } from '../../ui/event-attach.js';
import { notifyMentions } from '../../state/notifications.js';
import { announcementAttacher } from './announcement-attach.js';
import { createPost, makePin, isPinned, PIN_DURATIONS, postName } from './announcements-data.js';

/**
 * The "+ Post" form: [Add] [Event] [Sign-ups] (Nov 18: Event and Sign-ups
 * everywhere); `withAsks` adds the lighter RSVP ask too (the full page).
 * Event makes a real calendar event (js/ui/event-attach.js).
 */
export function boardComposer({ context, me, canPin, withAsks = false, onPosted }) {
  const isSolo = context.members.length <= 1;
  const titleInput = h('input', { type: 'text', class: 'input', placeholder: 'Title (optional)', 'aria-label': 'Title (optional)' });
  const bodyInput = h('textarea', { class: 'input', rows: '3', placeholder: isSolo ? 'A note to yourself' : 'Share something with the group', 'aria-label': 'Post' });
  attachMentionPicker(bodyInput, { getCandidates: () => context.members, excludeId: me.id });
  const add = announcementAttacher({ me, moduleId: context.moduleId });
  const asks = askAttacher();
  const eventField = eventAttacher();
  const pinSelect = canPin ? h('select', { class: 'input input--compact', 'aria-label': 'Pin it' },
    h('option', { value: '' }, 'Don’t pin'),
    PIN_DURATIONS.map((d) => h('option', { value: d.id }, d.ms == null ? 'Pin until unpinned' : `Pin for ${d.label}`))) : null;
  const toFeed = h('input', { type: 'checkbox', checked: true });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const clearError = () => { error.textContent = ''; };
  titleInput.addEventListener('input', clearError);
  bodyInput.addEventListener('input', clearError);

  const form = h('form', {
    class: 'board-composer',
    onSubmit: (event) => {
      event.preventDefault();
      const title = titleInput.value.trim();
      const body = bodyInput.value.trim();
      const attached = add.read();
      if (attached.error) { error.textContent = attached.error; return; }
      const extra = asks.read();
      if (!withAsks) extra.rsvp = null;
      const eventFields = eventField.read();
      const hasSomething = title || body || attached.media.length || attached.files.length || attached.poll || extra.rsvp || extra.signups?.length || eventFields;
      if (!hasSomething) { error.textContent = 'Write something, or add a photo, file, or poll.'; bodyInput.focus(); return; }
      if (eventFields && !(eventFields.title || title)) { error.textContent = 'Give the event a name (or the post a title).'; return; }
      // The event goes on the group's calendar (or Upcoming events); the post shows it with its RSVP.
      const made = eventFields ? addEventToSpace(context.spaceId, { ...eventFields, title: eventFields.title || title, notes: body }, { me, fallbackModuleId: context.moduleId, visibility: context.spaceKind === 'group' ? 'group' : 'public' }) : null;
      const post = createPost({
        authorId: me.id, title, body,
        pin: pinSelect?.value ? makePin(pinSelect.value, me.id) : null,
        toFeed: toFeed.checked,
        poll: attached.poll, media: attached.media, files: attached.files, ...extra,
        eventId: made?.id ?? null,
      });
      onPosted(post);
      notifyMentions({ moduleId: context.moduleId, itemId: post.id, after: post.body, where: `the board post “${postName(post)}”` });
      reset();
    },
  },
    titleInput,
    add.slots,
    eventField.slot,
    asks.slot,
    bodyInput,
    error,
    h('div', { class: 'board-composer__row' },
      h('span', { class: 'form-row' }, add.button, eventField.button, withAsks && !isSolo ? asks.rsvpButton : null, !isSolo ? asks.signupButton : null),
      h('span', { class: 'form-row' },
        pinSelect,
        isSolo || context.isVisitor ? null : h('label', { class: 'page-control board-composer__feed', title: 'Members see it in their Feeds too' }, toFeed, h('span', {}, 'Show in members’ Feeds')),
        h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Post'))));

  function reset() {
    form.reset();
    toFeed.checked = true;
    add.reset();
    asks.reset();
    eventField.reset();
    clearError();
  }
  return { form, reset };
}

/** ♡ and how many liked it; filled when you did. */
export function likeButton(post, me, onToggle, { disabled = false } = {}) {
  const likes = post.likes ?? [];
  const mine = likes.includes(me.id);
  return h('button', {
    type: 'button',
    class: `link-button board-like${mine ? ' is-on' : ''}`,
    'aria-pressed': String(mine),
    'aria-label': `${mine ? 'Unlike' : 'Like'}${likes.length ? ` (${likes.length})` : ''}`,
    disabled,
    onClick: onToggle,
  }, icon('heart', 13), likes.length ? ` ${likes.length}` : ' Like');
}

/** Toggle my like on a post (inside a data change). */
export function toggleLike(post, memberId) {
  const likes = post.likes ?? [];
  post.likes = likes.includes(memberId) ? likes.filter((id) => id !== memberId) : [...likes, memberId];
}

/** "Pin" opens the durations in a row; "Unpin" on a pinned post. */
export function pinChooser({ post, onPin, onUnpin }) {
  const root = h('span', { class: 'board-pin' });
  const closed = () => replaceChildren(root, isPinned(post)
    ? h('button', { type: 'button', class: 'link-button', onClick: onUnpin }, icon('pin', 12), ' Unpin')
    : h('button', { type: 'button', class: 'link-button', 'aria-expanded': 'false', onClick: open }, icon('pin', 12), ' Pin'));
  function open() {
    replaceChildren(root, h('span', { class: 'board-pin__choices', role: 'group', 'aria-label': 'Pin for how long?' },
      h('span', { class: 'board-pin__label' }, 'Pin for'),
      PIN_DURATIONS.map((d) => h('button', { type: 'button', class: 'chip board-pin__choice', onClick: () => onPin(d.id) }, d.label)),
      h('button', { type: 'button', class: 'link-button', onClick: closed }, 'Cancel')));
    /** @type {HTMLElement | null} */ (root.querySelector('.board-pin__choice'))?.focus();
  }
  closed();
  return root;
}
