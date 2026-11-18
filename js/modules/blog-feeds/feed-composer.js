// @ts-check
/**
 * feed-composer.js — writing a new post on your own blog feed.
 *
 *   PREVIEW · how it will look in the Feed     ← once anything is added: the whole
 *   ┌ (LL) Leo L · just now ─────────────┐      post, as the Feed shows it (renderFeedPost),
 *   │ the words, the pictures, the file,  │      at the top; it follows as you type
 *   │ the event, the poll                 │
 *   └─────────────────────────────────────┘
 *   [photo ×] [photo ×] [video ×]          ← what you've added, to remove or edit
 *   ↑↓ 📄 Pedalboard plans  [Can view ▾]  Remove  Preview   ← ↑↓ reorder; the first is the preview
 *   🎟 Porch jam session                 Remove
 *   (the poll's fields, when there's a poll)
 *   [ What's happening?                ]   ← two lines to start; grows with what you
 *                                            write, then scrolls
 *   [Photo or video] [From your vault] [Event] [Link] [Poll]   312 left  [Post]
 *
 * Pictures plus an event make a "connected event": the event shows small
 * under the pictures, with RSVP (renderEventStrip in feed-post.js). A
 * Photo & video feed offers this as [Connect an event].
 *
 * What's offered depends on the kind of feed (VARIANTS in feed-data.js):
 * a Text feed is words only; a Photo & video feed needs a picture or a
 * video; a General feed can carry any mix, as many as you like: pictures
 * and videos, files from your vault, links and event invitations.
 *
 *   renderComposer({ variant, spaceId, audience, onPost(post fields), onCreateEvent(fields) → event,
 *                    initial, onChange(fields), onClose(fields), onDiscard() })
 *
 * `audience` (audience-chip.js) puts a "who sees this" chip next to Post.
 * Drafts (js/state/post-drafts.js): `initial` fills it from a draft;
 * `onChange` hears every change (the feed saves the draft); × calls
 * `onClose` with what's written; Discard calls `onDiscard`. Polls aren't
 * kept in drafts.
 */

import { accessPicker } from '../../ui/file-access.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { readImages } from '../../ui/image-upload.js';
import { photoEditButton } from '../../ui/photo-editor.js';
import { attachMentionPicker } from '../../ui/mention-picker.js';
import { getAccounts } from '../../state/accounts.js';
import { getCurrentUser } from '../../state/store.js';
import { getPublicEvents } from '../../state/events.js';
import { todayKey, formatShortDate } from '../../utils/dates.js';
import { makeId, debounce } from '../../ui/dom.js';
import { renderVaultPicker, renderSubmittedItem } from '../submissions/submission-items.js';
import { pollAttacher } from '../../ui/poll-view.js';
import { audienceChip } from '../../ui/audience-chip.js';
import { autoGrow } from '../../ui/auto-grow.js';
import { VARIANTS, MAX_VIDEO_BYTES, canPost } from './feed-data.js';
import { renderFeedPost } from './feed-post.js';

export function renderComposer({ variant, spaceId, audience = null, onPost, onCreateEvent, initial = null, onChange = null, onClose = null, onDiscard = null }) {
  const rules = VARIANTS[variant];
  const me = getCurrentUser();
  const draft = {
    text: initial?.text ?? '', media: structuredClone(initial?.media ?? []), attachments: structuredClone(initial?.attachments ?? []),
    audience: initial?.audience ?? audience?.value ?? 'everyone',
  };
  const chip = audience ? audienceChip({ ...audience, value: draft.audience }, (value) => { draft.audience = value; onChange?.(snapshot()); }) : null;
  const snapshot = () => ({ text: textField.value, media: draft.media, attachments: draft.attachments, audience: draft.audience });

  const textField = h('textarea', { class: 'input feed-composer__text', rows: '2', placeholder: rules.placeholder, 'aria-label': 'Post text' });
  textField.value = draft.text;
  // Two lines to start; it grows with what you write up to about ten lines, then scrolls.
  const { fit: fitText } = autoGrow(textField);
  attachMentionPicker(textField, { getCandidates: getAccounts, excludeId: me.id });
  const counter = h('span', { class: 'feed-composer__counter' });
  const postButton = h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Post');
  const previews = h('div', { class: 'feed-composer__previews' });
  // The whole post as the Feed will show it, at the top, once something is added.
  const preview = h('div', { class: 'feed-composer__preview', hidden: true });
  const panel = h('div', { class: 'feed-composer__panel' });
  const pollField = rules.allowsPolls ? pollAttacher({ me, onToggle: () => drawDraft() }) : null;

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*,video/*',
    multiple: true,
    hidden: true,
    onChange: async () => {
      await addFiles([...fileInput.files]);
      fileInput.value = '';
    },
  });

  async function addFiles(files) {
    for (const file of files) {
      if (draft.media.length >= rules.maxMedia) { showToast(`Up to ${rules.maxMedia} pictures or videos in one post.`); break; }
      if (file.type.startsWith('video/')) {
        if (file.size > MAX_VIDEO_BYTES) { showToast(`“${file.name}” is too big. In this prototype videos can be up to 3 MB.`); continue; }
        const src = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        draft.media.push({ id: makeId('media'), kind: 'video', src, caption: '' });
      } else {
        const [photo] = await readImages([file]);
        if (photo) draft.media.push({ id: makeId('media'), kind: 'image', src: photo.src, caption: '' });
      }
    }
    drawDraft();
  }

  let started = false; // the first draw isn't a change
  /**
   * ↑ ↓ to change the order of what's attached. With no photos added the
   * usual way, the first one is the post's preview (its tile in a grid, the
   * slide in a Carousel), so it says so.
   */
  function withOrder(row, index) {
    const move = (step) => {
      const list = draft.attachments;
      const to = index + step;
      if (to < 0 || to >= list.length) return;
      [list[index], list[to]] = [list[to], list[index]];
      drawDraft();
    };
    const count = draft.attachments.length;
    row.classList.add('feed-composer__ordered');
    row.prepend(h('span', { class: 'feed-composer__order' },
      count > 1 ? h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Move up', disabled: index === 0, onClick: () => move(-1) }, icon('chevronUp', 14)) : null,
      count > 1 ? h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Move down', disabled: index === count - 1, onClick: () => move(1) }, icon('chevronDown', 14)) : null));
    if (index === 0 && !draft.media.length && count > 0) row.append(h('span', { class: 'feed-composer__first' }, 'Preview'));
    return row;
  }

  function drawDraft() {
    if (started) onChange?.(snapshot());
    started = true;
    const left = rules.textLimit - textField.value.length;
    counter.textContent = left < 100 ? `${left} left` : '';
    counter.classList.toggle('is-over', left < 0);
    draft.text = textField.value;
    postButton.disabled = !canPost(variant, draft) && !pollField?.isOpen();
    replaceChildren(previews,
      draft.media.map((item) => h('span', { class: 'feed-composer__thumb' },
        item.kind === 'video' ? h('video', { src: item.src, muted: true }) : h('img', { src: item.src, alt: '' }),
        item.kind === 'video' ? null : photoEditButton(() => item.src, (edited) => { Object.assign(item, edited); drawDraft(); }),
        h('button', { type: 'button', class: 'feed-composer__remove', 'aria-label': 'Remove', onClick: () => { draft.media = draft.media.filter((m) => m !== item); drawDraft(); } }, icon('close', 12)))),
      draft.attachments.length ? h('ul', { class: 'sub-items feed-composer__attachment' }, draft.attachments.map((attachment, index) => {
        const remove = () => { draft.attachments = draft.attachments.filter((a) => a !== attachment); drawDraft(); };
        if (attachment.kind === 'file') {
          // What people who see the post can do with it (js/ui/file-access.js).
          const row = renderSubmittedItem(attachment.item, { onRemove: remove });
          if (attachment.item.from) row.append(accessPicker(attachment.access ?? 'view', (value) => { attachment.access = value; drawPreview(); }));
          return withOrder(row, index);
        }
        return withOrder(h('li', { class: 'sub-item' },
          h('span', { class: 'sub-item__icon' }, icon(attachment.kind === 'event' ? 'ticket' : 'link', 16)),
          h('span', { class: 'sub-item__text' },
            h('span', { class: 'sub-item__name' }, attachment.kind === 'event' ? attachment.title : attachment.name),
            h('span', { class: 'sub-item__meta' }, attachment.kind === 'event' ? (draft.media.length ? 'Connected event: shows under the pictures, with RSVP' : 'Event invitation: people can RSVP from the post') : attachment.url)),
          h('button', { type: 'button', class: 'link-button link-button--danger', onClick: remove }, 'Remove')), index);
      })) : null);
    drawPreview();
  }

  /** The preview card: the post as it would be if you pressed Post now. */
  function drawPreview() {
    const poll = pollField?.isOpen() ? pollField.preview() : null;
    const added = draft.media.length || draft.attachments.length || pollField?.isOpen();
    preview.hidden = !added;
    if (!added) { replaceChildren(preview); return; }
    const post = {
      id: 'composer-preview', authorId: me.id, createdAt: Date.now(), editedAt: null, audience: draft.audience,
      text: textField.value, media: draft.media,
      attachments: [...draft.attachments.map(cleanAttachment), ...(poll ? [{ kind: 'poll', poll }] : [])],
    };
    let card;
    try {
      card = renderFeedPost(post, { moduleId: 'composer-preview', ownerId: me.id, menu: () => null });
    } catch {
      card = h('p', { class: 'module-empty' }, 'The preview will show here.');
    }
    replaceChildren(preview,
      h('p', { class: 'feed-composer__preview-label' }, icon('eye', 12), ' Preview: how it will look in the Feed'),
      h('div', { class: 'feed-composer__preview-card', inert: '' }, card));
  }
  const drawPreviewSoon = debounce(drawPreview, 250);
  textField.addEventListener('input', drawPreviewSoon);

  /**
   * Add something to the post (the same event, link or vault file isn't
   * added twice). The vault list stays open, so you can pick several files.
   */
  function attach(attachment, { keepOpen = false } = {}) {
    const sameAs = (a) => (a.kind === 'event' && a.eventId === attachment.eventId)
      || (a.kind === 'link' && a.url === attachment.url)
      || (a.kind === 'file' && a.item.from && a.item.from.itemId === attachment.item?.from?.itemId);
    if (!draft.attachments.some(sameAs)) draft.attachments.push(attachment);
    if (!keepOpen) closePanel();
    drawDraft();
  }
  textField.addEventListener('input', drawDraft);

  const closePanel = () => replaceChildren(panel);

  function openVaultPicker() {
    replaceChildren(panel, renderVaultPicker({
      spaceId,
      title: 'Share a file from your vault',
      onPick: (item) => attach({ kind: 'file', item }, { keepOpen: true }),
      onClose: closePanel,
    }));
  }

  function openEventPicker() {
    // Public events you're hosting, or that one of your groups is.
    const mine = getPublicEvents().filter((o) => o.event.createdBy === me.id || (o.space.kind === 'group' && o.space.memberIds.includes(me.id)))
      // This page's own events first, then yours, then your other groups'.
      .sort((a, b) => Number(b.space.id === spaceId) - Number(a.space.id === spaceId) || Number(b.event.createdBy === me.id) - Number(a.event.createdBy === me.id));
    const title = h('input', { type: 'text', class: 'input', placeholder: 'What’s happening?', 'aria-label': 'Event name' });
    const date = h('input', { type: 'date', class: 'input input--compact', value: todayKey(), 'aria-label': 'Date' });
    const time = h('input', { type: 'time', class: 'input input--compact', value: '18:00', 'aria-label': 'Start time' });
    const location = h('input', { type: 'text', class: 'input', placeholder: 'Where (optional)', 'aria-label': 'Where' });
    requestAnimationFrame(() => title.focus());
    replaceChildren(panel, h('div', { class: 'sub-attach__box' },
      h('div', { class: 'sub-attach__box-top' }, h('strong', {}, 'Invite people to an event'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: closePanel }, icon('close', 14))),
      mine.length ? [
        h('p', { class: 'settings-field__hint' }, 'One of yours:'),
        h('ul', { class: 'sub-attach__vault-list' }, mine.slice(0, 6).map(({ event, date: day }) => h('li', {},
          h('button', {
            type: 'button',
            class: 'sub-attach__vault-item',
            onClick: () => attach({ kind: 'event', eventId: event.id, title: event.title }),
          }, icon('calendar', 14), h('span', { class: 'sub-attach__vault-name' }, event.title), h('span', { class: 'sub-attach__vault-where' }, formatShortDate(day)))))),
        h('p', { class: 'settings-field__hint' }, 'Or a new one (public, so anyone can RSVP):'),
      ] : h('p', { class: 'settings-field__hint' }, 'A new public event that anyone can RSVP to. It goes on your calendar too.'),
      h('form', {
        class: 'feed-composer__event-form',
        onSubmit: (event) => {
          event.preventDefault();
          if (!title.value.trim()) { title.focus(); return; }
          const created = onCreateEvent({ title: title.value.trim(), date: date.value || todayKey(), time: time.value, location: location.value.trim() });
          attach({ kind: 'event', eventId: created.id, title: created.title });
        },
      }, title, h('div', { class: 'form-row' }, date, time), location,
      h('div', { class: 'form-row' }, h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Add')))));
  }

  function openLinkForm() {
    const url = h('input', { type: 'url', class: 'input', placeholder: 'https://…', 'aria-label': 'Web address' });
    const name = h('input', { type: 'text', class: 'input', placeholder: 'What is it? (optional)', 'aria-label': 'Link name' });
    requestAnimationFrame(() => url.focus());
    replaceChildren(panel, h('div', { class: 'sub-attach__box' },
      h('div', { class: 'sub-attach__box-top' }, h('strong', {}, 'Add a link'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: closePanel }, icon('close', 14))),
      url, name,
      h('div', { class: 'form-row' }, h('button', {
        type: 'button',
        class: 'button button--small button--primary',
        onClick: () => {
          const address = url.value.trim();
          if (!/^https?:\/\//i.test(address)) { showToast('Start the address with https://'); url.focus(); return; }
          attach({ kind: 'link', url: address, name: name.value.trim() || address });
        },
      }, 'Add link'))));
  }

  const form = h('form', {
    class: `feed-composer feed-composer--${variant}`,
    onSubmit: (event) => {
      event.preventDefault();
      draft.text = textField.value;
      const { poll, error } = pollField?.read() ?? { poll: null };
      if (error) { showToast(error); return; }
      const attachments = [...draft.attachments.map(cleanAttachment), ...(poll ? [{ kind: 'poll', poll }] : [])];
      if (!canPost(variant, { ...draft, attachments })) return;
      onPost({ text: draft.text, media: draft.media, attachments, audience: draft.audience });
      pollField?.reset();
      textField.value = '';
      fitText();
      draft.media = [];
      draft.attachments = [];
      closePanel();
      started = false; // posting isn't a change to save as a draft
      drawDraft();
    },
  },
    onClose ? h('div', { class: 'feed-composer__top' },
      h('strong', {}, initial ? 'Draft' : 'New post'),
      onDiscard ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => onDiscard() }, 'Discard') : null,
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close (keeps a draft)', title: 'Close: what you wrote stays in Drafts', onClick: () => onClose(snapshot()) }, icon('close', 16))) : null,
    // What's attached comes first (the preview, then each thing to remove or edit, then the poll's fields); the words last.
    preview,
    previews,
    pollField?.slot,
    textField,
    panel,
    h('div', { class: 'feed-composer__bar' },
      rules.allowsMedia ? h('button', { type: 'button', class: 'button button--small', onClick: () => fileInput.click() }, icon('image', 14), variant === 'photo' ? ' Add photos or a video' : ' Photo or video') : null,
      rules.allowsAttachments ? h('button', { type: 'button', class: 'button button--small', onClick: openVaultPicker }, icon('vault', 14), ' From your vault') : null,
      rules.allowsAttachments || rules.allowsEvent ? h('button', { type: 'button', class: 'button button--small', title: 'Connect an event: it shows under the pictures, and people can RSVP from the post', onClick: openEventPicker }, icon('ticket', 14), rules.allowsAttachments ? ' Event' : ' Connect an event') : null,
      rules.allowsAttachments ? h('button', { type: 'button', class: 'button button--small', onClick: openLinkForm }, icon('link', 14), ' Link') : null,
      pollField?.button,
      fileInput,
      h('span', { class: 'feed-composer__spacer' }),
      counter,
      chip,
      postButton));

  // Typing in the poll (its question and choices) updates the preview too.
  pollField?.slot.addEventListener('input', drawPreviewSoon);
  drawDraft();
  return form;
}

/** What gets saved on the post (the picker's title is only for the draft). */
function cleanAttachment(attachment) {
  return attachment.kind === 'event' ? { kind: 'event', eventId: attachment.eventId } : attachment;
}
