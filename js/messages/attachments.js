// @ts-check
/**
 * attachments.js — the "+" menu in the message box, and how the things it
 * sends look in a conversation.
 *
 *   [+] [Write a message…              ] [Send]
 *    ├ 📅 Event          → a small form; sends an event card people can RSVP to
 *    ├ 🖼 Photo          → pick or take photos; they're shrunk to fit
 *    ├ ▶ Video          → record one or pick it (up to 3 MB)
 *    ├ 📎 File           → any file up to 2 MB; a card with Download (voice.js)
 *    └ @  Share a blog   → type @name; sends a card linking to their blog
 *   🎙 next to Send records a voice note (voice.js)
 *
 * In the conversation:
 *   photo  → the picture (click to see it large)
 *   video  → a player
 *   event  → date block, title, when and where, Going / Maybe / Can't go
 *   blog   → their avatar, blog name and bio, "Visit blog"
 *   post   → a post someone sent from a blog or the Feed (js/ui/share-dialog.js):
 *            who wrote it, a picture and the start of the text, "Open"
 *
 * Events made here are real calendar events (see addConversationEvent in
 * js/state/events.js), so they're on everyone's calendar and have a page.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { openLightbox } from '../ui/lightbox.js';
import { readImages } from '../ui/image-upload.js';
import { openPhotoEditor } from '../ui/photo-editor.js';
import { attachMentionPicker } from '../ui/mention-picker.js';
import { getAccounts, findAccountByUsername } from '../state/accounts.js';
import { getBlogOf, getMember, getModule } from '../state/store.js';
import { getConversation, conversationMemberIds } from '../state/messages.js';
import { findEvent, updateEvent, addConversationEvent } from '../state/events.js';
import { eventCoverBanner } from '../events/event-cover.js';
import { applyRsvp, colorValue, addMinutesToTime } from '../modules/calendar/calendar-data.js';
import { rsvpButtons, rsvpSummary } from '../events/rsvp.js';
import { dateBlock } from '../modules/events/events-list.js';
import { eventHref, whenLabel } from '../events/event-details.js';
import { todayKey, addDays } from '../utils/dates.js';
import { blogHref, openModulePage } from '../router.js';
import { requestModuleFocus } from '../editor/module-context.js';
import { renderVoice, renderFile, readFileAttachment } from './voice.js';

/** Videos are saved in the browser too, so only small ones fit. */
const MAX_VIDEO_BYTES = 3 * 1024 * 1024;
const DEFAULT_EVENT_HOURS = 2;

// ─── The "+" menu ────────────────────────────────────────────────────────────

/**
 * The "+" button, its menu, and the small panels it opens above the box.
 * @param {object}   options
 * @param {string}   options.conversationId
 * @param {object}   options.me
 * @param {function} options.onSend   (attachment, text) → sends the message
 * @returns {{ button: HTMLElement, panel: HTMLElement }}
 */
export function createAttachMenu({ conversationId, me, onSend }) {
  const panel = h('div', { class: 'attach-panel', hidden: true });
  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*,video/*',
    hidden: true,
    onChange: () => sendFiles(fileInput.files),
  });

  const menu = h('div', { class: 'groups-menu attach-menu', role: 'menu', 'aria-label': 'Add to message' },
    menuItem('calendar', 'Event', 'Plan something; people can RSVP', () => openPanel(renderEventForm())),
    menuItem('image', 'Photo', 'From your device or camera', () => { fileInput.accept = 'image/*'; fileInput.multiple = true; fileInput.click(); }),
    menuItem('video', 'Video', 'Record one, or pick one (up to 3 MB)', () => { fileInput.accept = 'video/*'; fileInput.multiple = false; fileInput.click(); }),
    menuItem('paperclip', 'File', 'A document, spreadsheet, or anything (up to 2 MB)', () => anyFile.click()),
    menuItem('globe', 'Share a blog', 'Type @ and a name', () => openPanel(renderBlogPicker())),
  );
  // Any kind of file (voice.js): sent as a card with its name, size, and Download.
  const anyFile = h('input', {
    type: 'file', hidden: true, multiple: true,
    onChange: async () => {
      for (const file of [...anyFile.files]) {
        try { onSend(await readFileAttachment(file), ''); } catch (error) { showToast(error.message === 'too-big' ? `“${file.name}” is too big. In this prototype files can be up to 2 MB.` : `Couldn’t read “${file.name}”.`); }
      }
      anyFile.value = '';
    },
  });
  const trigger = h('button', {
    type: 'button',
    class: 'icon-button thread__attach',
    'aria-label': 'Add an event, photo, video, file, or blog',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
    title: 'Add an event, photo, video, file, or blog',
  }, icon('plus', 18));
  const wrapper = h('div', { class: 'app-bar__menu attach-menu__wrapper' }, trigger, menu, fileInput, anyFile);

  // Clicking anywhere else closes the menu (listening only while it's open).
  const closeIfOutside = (event) => { if (!wrapper.contains(event.target)) setOpen(false); };
  function setOpen(isOpen) {
    wrapper.classList.toggle('is-open', isOpen);
    trigger.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) document.addEventListener('pointerdown', closeIfOutside);
    else document.removeEventListener('pointerdown', closeIfOutside);
  }
  trigger.addEventListener('click', () => setOpen(!wrapper.classList.contains('is-open')));
  wrapper.addEventListener('keydown', (event) => { if (event.key === 'Escape') { setOpen(false); trigger.focus(); } });

  function menuItem(iconName, label, hint, onChoose) {
    return h('button', {
      type: 'button',
      role: 'menuitem',
      class: 'attach-menu__item',
      onClick: () => { setOpen(false); onChoose(); },
    }, icon(iconName, 16), h('span', {}, h('strong', {}, label), h('span', { class: 'attach-menu__hint' }, hint)));
  }

  function openPanel(content) {
    panel.hidden = false;
    replaceChildren(panel, content);
    requestAnimationFrame(() => panel.querySelector('input')?.focus());
  }
  function closePanel() {
    panel.hidden = true;
    replaceChildren(panel);
  }

  // Photos and videos
  async function sendFiles(files) {
    for (const file of [...files]) {
      if (file.type.startsWith('video/')) {
        if (file.size > MAX_VIDEO_BYTES) {
          showToast(`“${file.name}” is too big. In this prototype videos can be up to 3 MB.`);
          continue;
        }
        const src = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(file);
        });
        onSend({ kind: 'video', src, name: file.name }, '');
      }
    }
    const photos = await readImages(files);
    for (const [index, photo] of photos.entries()) {
      // A quick look (and any edits) before each photo goes out; Cancel skips that photo.
      const edited = await openPhotoEditor(photo.src, { title: photos.length > 1 ? `Photo ${index + 1} of ${photos.length}` : 'Send a photo', doneLabel: 'Send' });
      if (edited) onSend({ kind: 'photo', src: edited.src, width: edited.width, height: edited.height }, '');
    }
    fileInput.value = '';
  }

  // An event
  function renderEventForm() {
    const title = h('input', { type: 'text', class: 'input', placeholder: 'What’s happening?', 'aria-label': 'Event name', required: true });
    const date = h('input', { type: 'date', class: 'input input--compact', value: addDays(todayKey(), 1), 'aria-label': 'Date' });
    const time = h('input', { type: 'time', class: 'input input--compact', value: '18:00', 'aria-label': 'Start time' });
    const location = h('input', { type: 'text', class: 'input', placeholder: 'Where (optional)', 'aria-label': 'Location' });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const conversation = getConversation(conversationId);
    const where = conversation?.spaceId ? 'It goes on the group’s calendar.' : 'Everyone here is invited, and it goes on their calendars.';

    return h('form', {
      class: 'attach-panel__form',
      onSubmit: (event) => {
        event.preventDefault();
        if (!title.value.trim()) { error.textContent = 'Give it a name.'; title.focus(); return; }
        const created = addConversationEvent(conversation, me, conversationMemberIds(conversation), {
          title: title.value.trim(),
          date: date.value || todayKey(),
          allDay: !time.value,
          time: time.value,
          endTime: time.value ? addMinutesToTime(time.value, DEFAULT_EVENT_HOURS * 60) : '',
          location: location.value.trim(),
          color: 'orange',
        });
        closePanel();
        onSend({ kind: 'event', eventId: created.id }, '');
      },
    },
      h('div', { class: 'attach-panel__top' },
        h('strong', {}, icon('calendar', 14), ' New event'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Cancel', onClick: closePanel }, icon('close', 14))),
      title,
      h('div', { class: 'form-row' }, date, time),
      location,
      error,
      h('div', { class: 'form-row form-row--end' },
        h('span', { class: 'attach-panel__hint' }, where),
        h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Send')),
    );
  }

  // Someone's blog
  function renderBlogPicker() {
    const input = h('input', { type: 'text', class: 'input', placeholder: '@username', 'aria-label': 'Whose blog?', value: '@' });
    const error = h('p', { class: 'form-error', role: 'alert' });
    attachMentionPicker(input, { getCandidates: getAccounts });
    return h('form', {
      class: 'attach-panel__form',
      onSubmit: (event) => {
        event.preventDefault();
        const member = findAccountByUsername(input.value.trim().replace(/^@/, ''));
        if (!member || !getBlogOf(member.id)) { error.textContent = 'There’s no one with that username.'; return; }
        closePanel();
        onSend({ kind: 'blog', memberId: member.id }, '');
      },
    },
      h('div', { class: 'attach-panel__top' },
        h('strong', {}, icon('globe', 14), ' Share a blog'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Cancel', onClick: closePanel }, icon('close', 14))),
      h('div', { class: 'form-row' }, input, h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Send')),
      error);
  }

  return { button: wrapper, panel };
}

// ─── Showing attachments in a conversation ───────────────────────────────────

/**
 * What a message carries, as it shows under its text.
 * `onChange` redraws the conversation (after an RSVP).
 */
export function renderAttachment(attachment, { me, onChange }) {
  if (!attachment) return null;

  if (attachment.kind === 'photo') {
    return h('button', {
      type: 'button',
      class: 'attachment attachment--photo',
      'aria-label': 'Open photo',
      onClick: () => openLightbox([{ id: 'photo', src: attachment.src, caption: '' }], 0),
    }, h('img', { src: attachment.src, alt: 'Photo', loading: 'lazy' }));
  }

  if (attachment.kind === 'voice') return renderVoice(attachment, attachment.src?.slice(-40) ?? String(attachment.duration));
  if (attachment.kind === 'file') return renderFile(attachment);

  if (attachment.kind === 'video') {
    return h('video', { class: 'attachment attachment--video', src: attachment.src, controls: true, preload: 'metadata', 'aria-label': attachment.name || 'Video' });
  }

  if (attachment.kind === 'blog') {
    const member = getMember(attachment.memberId);
    const blog = member ? getBlogOf(member.id) : null;
    if (!member || !blog) return h('p', { class: 'attachment attachment--missing' }, 'This blog isn’t available anymore.');
    return h('a', { class: 'attachment attachment--blog', href: blogHref(member) },
      avatar(member, 36),
      h('span', { class: 'attachment__text' },
        h('strong', {}, blog.name),
        h('span', { class: 'attachment__meta' }, `@${member.username}${blog.description ? ` · ${blog.description}` : ''}`)),
      h('span', { class: 'attachment__action' }, 'Visit blog →'));
  }

  if (attachment.kind === 'post') {
    const author = getMember(attachment.authorId);
    if (!getModule(attachment.moduleId)) return h('p', { class: 'attachment attachment--missing' }, 'This post isn’t available anymore.');
    return h('button', {
      type: 'button',
      class: 'attachment attachment--post',
      onClick: () => { requestModuleFocus(attachment.moduleId, attachment.itemId); openModulePage(attachment.moduleId); },
    },
      attachment.image ? h('img', { class: 'attachment__thumb', src: attachment.image, alt: '' }) : avatar(author, 36),
      h('span', { class: 'attachment__text' },
        h('strong', {}, attachment.title),
        h('span', { class: 'attachment__meta' }, [author?.name, attachment.where].filter(Boolean).join(' · ')),
        attachment.excerpt ? h('span', { class: 'attachment__meta' }, attachment.excerpt) : null),
      h('span', { class: 'attachment__action' }, 'Open →'));
  }

  if (attachment.kind === 'event') {
    const found = findEvent(attachment.eventId);
    if (!found) return h('p', { class: 'attachment attachment--missing' }, 'This event was deleted.');
    const { event } = found;
    const cover = eventCoverBanner(event, 'attachment__cover');
    return h('div', { class: `attachment attachment--event${cover ? ' attachment--has-cover' : ''}` },
      cover ? h('a', { href: eventHref(event.id), class: 'attachment__cover-link', tabindex: '-1', 'aria-hidden': 'true' }, cover) : null,
      dateBlock(event.date, colorValue(event.color)),
      h('div', { class: 'attachment__text' },
        h('a', { href: eventHref(event.id), class: 'attachment__title' }, event.title),
        h('span', { class: 'attachment__meta' }, [whenLabel(event), event.location].filter(Boolean).join(' · ')),
        h('span', { class: 'attachment__meta' }, rsvpSummary(event)),
        rsvpButtons(event, me.id, (answer) => {
          updateEvent(event.id, (saved) => applyRsvp(saved, me.id, answer));
          onChange();
        }, { compact: true })));
  }

  return null;
}
