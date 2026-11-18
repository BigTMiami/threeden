// @ts-check
/**
 * feed-post.js — one post from a blog feed, as it shows on the blog and
 * in the Feed.
 *
 *   (LL) Leo L · 2h ago                              Edit · Delete
 *   Finally fixed the porch bike!
 *   [ photo ][ photo ]
 *   [📄 Pedalboard plans · Note]            ← files from a vault,
 *   [🔗 The strings I use]                  ← links,
 *   [NOV 20  Free bike repair  Going…]      ← events to RSVP to (as many as the post has)
 *   ♥ 3   💬 2 comments   ↗ Send
 *
 *   renderFeedPost(post, { moduleId, ownerId, where, canManage, onDelete, onSaveText, startOpen, hideMedia, context, menu })
 *   (hideMedia: the photo viewer shows the pictures itself, large, next to the post)
 */

import { liveItem, effectiveAccess, accessLabel, accessNote, renderFileComments } from '../../ui/file-access.js';
import { createItemContext } from '../vault/vault-module-files.js';
import { createRichTextEditor } from '../../ui/rich-text-editor.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { avatar } from '../../ui/avatar.js';
import { icon } from '../../ui/icons.js';
import { onSwipe } from '../../ui/swipe.js';
import { renderText } from '../../ui/text.js';
import { openLightbox } from '../../ui/lightbox.js';
import { blogPostReactions, blogPostSend } from '../../ui/post-reactions.js';
import { autoGrow } from '../../ui/auto-grow.js';
import { postMenu } from '../../feed/post-menu.js';
import { timeAgo } from '../../utils/dates.js';
import { getMember, getCurrentUser, getModule, updateModuleData } from '../../state/store.js';
import { getModuleType } from '../registry.js';
import { renderPoll } from '../../ui/poll-view.js';
import { notifyMentions } from '../../state/notifications.js';
import { renderAttachment } from '../../messages/attachments.js';
import { blogHref } from '../../router.js';
import { renderFilePreview } from './file-preview.js';
import { postKey, postTitle } from './feed-data.js';
import { findEvent, updateEvent } from '../../state/events.js';
import { applyRsvp, colorValue, timeRangeLabel } from '../calendar/calendar-data.js';
import { eventHref } from '../../events/event-details.js';
import { rsvpButtons, rsvpSummary } from '../../events/rsvp.js';
import { monthName } from '../../utils/dates.js';


export function renderFeedPost(post, { moduleId, ownerId, spaceId = null, where = '', canManage = false, onDelete = null, onSaveText = null, startOpen = false, hideMedia = false, context = null, menu = null }) {
  // menu: the "…" button (js/feed/post-menu.js), at the right of the header: a function
  // (extras) => element, given Send, Edit, and Delete to include. Without one, a plain
  // menu with just those is made, so every post has its … in the same place.
  // context: in the Feed, where it was posted ("Porch Lights · Photos"), shown under the
  // name with the time, so every Feed item has the same header (js/feed/feed-page.js).
  const author = getMember(post.authorId);
  const article = h('article', { class: 'feed-post', id: `post-${post.id}` });

  const share = {
    title: postTitle(post),
    attachment: {
      kind: 'post', moduleId, itemId: post.id, authorId: post.authorId, where,
      title: postTitle(post), excerpt: post.text.slice(0, 120),
      image: post.media.find((m) => m.kind === 'image')?.src ?? null,
      fullText: post.text, // for the Instagram card (share-dialog.js); not sent in the message
    },
  };
  function menuButton() {
    const extras = {
      send: blogPostSend({ ownerId, share, spaceId }),
      actions: canManage ? [
        onSaveText ? ['pencil', 'Edit', () => draw(true)] : null,
        onDelete ? ['trash', 'Delete', onDelete, true] : null,
      ] : [],
    };
    if (typeof menu === 'function') return menu(extras);
    if (menu) return menu;
    return extras.send || extras.actions.some(Boolean) ? postMenu({ title: 'this post', ...extras }) : null;
  }

  function draw(isEditing = false) {
    const hasPictures = post.media.length > 0 && !hideMedia;
    replaceChildren(article,
      h('header', { class: `feed-post__header${context ? ' feed-post__header--context' : ''}` },
        author ? h('a', { href: blogHref(author), class: 'feed-post__avatar', tabindex: '-1', 'aria-hidden': 'true' }, avatar(author, context ? 36 : 32)) : null,
        context
          ? h('span', { class: 'feed-post__who feed-item__who' },
            h('span', { class: 'feed-item__headline' }, author ? h('a', { href: blogHref(author), class: 'feed-post__name' }, author.name) : 'Someone'),
            h('span', { class: 'feed-item__meta', title: new Date(post.createdAt).toLocaleString() }, context, ` · ${timeAgo(post.createdAt)}${post.editedAt ? ' · edited' : ''}`, audienceNote(post)))
          : h('span', { class: 'feed-post__who' },
            author ? h('a', { href: blogHref(author), class: 'feed-post__name' }, author.name) : 'Someone',
            h('span', { class: 'feed-post__time', title: new Date(post.createdAt).toLocaleString() }, ` · ${timeAgo(post.createdAt)}${post.editedAt ? ' · edited' : ''}`, audienceNote(post)),
            post.source?.kind === 'instagram' ? h('span', { class: 'feed-post__source', title: 'Copied from Instagram' }, ' · from Instagram') : null),
        isEditing ? null : menuButton()),
      // Pictures first, then the words under them (a caption), like a photo in an album.
      post.media.length && !hideMedia ? renderMedia(post.media) : null,
      // An event connected to the pictures sits right under them, small.
      hasPictures ? post.attachments.filter((a) => a.kind === 'event').map((a) => renderEventStrip(a.eventId, () => draw())) : null,
      isEditing ? null : post.text ? h('p', { class: 'feed-post__text' }, renderText(post.text)) : null,
      renderAttachments(hasPictures ? post.attachments.filter((a) => a.kind !== 'event') : post.attachments, () => draw()),
      renderPostPolls(post, moduleId),
      // Editing: everything attached stays above, and the words are edited underneath it.
      isEditing ? renderEditor() : null,
      blogPostReactions({
        key: postKey(post.id),
        ownerId,
        spaceId,
        about: { title: postTitle(post), moduleId, itemId: post.id },
        share,
        startOpen,
      }));
  }

  function renderEditor() {
    const field = h('textarea', { class: 'input feed-post__edit-text', rows: '2', 'aria-label': 'Edit post', placeholder: 'Write something about it (optional)' });
    field.value = post.text;
    autoGrow(field);
    requestAnimationFrame(() => field.focus());
    return h('form', {
      class: 'feed-post__editor',
      onSubmit: (event) => {
        event.preventDefault();
        notifyMentions({ moduleId, itemId: post.id, before: post.text, after: field.value, where: 'a post' });
        onSaveText(field.value.trim());
      },
    }, field, h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Save'),
      h('button', { type: 'button', class: 'link-button', onClick: () => draw() }, 'Cancel')));
  }

  draw();
  return article;
}

/** The narrowest and widest a post's picture frame gets (4:5 upright to 1.91:1 across). */
const TALLEST = 0.8;
const WIDEST = 1.91;

/**
 * Pictures and videos, one at a time: the first shows, and arrows, dots,
 * a swipe, or the arrow keys flip through the rest. The frame takes the
 * first picture's shape (upright, square, or wide, within limits) and
 * keeps it, so the post doesn't jump as you flip; a picture whose shape
 * is very different is shown whole rather than cropped. Clicking a
 * picture opens it full size.
 */
export function renderMedia(media) {
  const photos = media.filter((m) => m.kind === 'image').map((m) => ({ id: m.id, src: m.src, caption: m.caption ?? '' }));
  const many = media.length > 1;
  let index = 0;

  const frame = h('div', { class: `feed-post__media${many ? ' feed-post__media--many' : ''}` });
  const setFrame = (ratio) => {
    frame.dataset.ratio = String(ratio);
    frame.style.setProperty('--shape', String(Math.min(WIDEST, Math.max(TALLEST, ratio))));
    for (const slide of slides) fitSlide(slide);
  };
  /** Crop a little to fill the frame, or show the whole picture when it's a very different shape. */
  const fitSlide = (slide) => {
    const frameShape = Math.min(WIDEST, Math.max(TALLEST, Number(frame.dataset.ratio) || 4 / 3));
    const own = Number(slide.dataset.ratio) || frameShape;
    // The first picture sets the frame, so it always fills it.
    slide.classList.toggle('is-whole', slide !== slides[0] && Math.abs(Math.log(own / frameShape)) > 0.4);
  };

  const slides = media.map((item, i) => {
    let element;
    let slide;
    const onShape = (width, height) => {
      if (!width || !height) return;
      slide.dataset.ratio = String(width / height);
      if (i === 0) setFrame(width / height); else fitSlide(slide);
    };
    if (item.kind === 'video') {
      element = h('video', { class: 'feed-post__video', src: item.src, controls: true, preload: 'metadata', 'aria-label': item.caption || 'Video' });
      slide = h('div', { class: 'feed-post__slide feed-post__slide--video' }, element);
      element.addEventListener('loadedmetadata', () => onShape(element.videoWidth, element.videoHeight));
    } else {
      element = h('img', { src: item.src, alt: item.caption ?? '', loading: i === 0 ? 'eager' : 'lazy', draggable: 'false' });
      slide = h('button', {
        type: 'button', class: 'feed-post__slide',
        'aria-label': item.caption ? `Open photo: ${item.caption}` : 'Open photo',
        onClick: () => openLightbox(photos, Math.max(0, photos.findIndex((p) => p.id === item.id))),
      }, element);
      element.addEventListener('load', () => onShape(element.naturalWidth, element.naturalHeight));
    }
    if (many) { slide.setAttribute('aria-roledescription', 'slide'); slide.setAttribute('aria-hidden', String(i !== 0)); if (i !== 0) slide.tabIndex = -1; }
    if (item.width && item.height) slide.dataset.ratio = String(item.width / item.height);
    return slide;
  });
  setFrame(media[0].width && media[0].height ? media[0].width / media[0].height : 4 / 3);
  // Pictures already loaded (from memory) don't fire "load" again.
  slides.forEach((slide, i) => {
    const element = slide.firstChild;
    if (element.tagName === 'IMG' && element.complete && element.naturalWidth) { slide.dataset.ratio = String(element.naturalWidth / element.naturalHeight); if (i === 0) setFrame(element.naturalWidth / element.naturalHeight); else fitSlide(slide); }
  });

  const track = h('div', { class: 'feed-post__track' }, slides);
  if (!many) { frame.append(track); return frame; }

  const counter = h('span', { class: 'feed-post__count', 'aria-hidden': 'true' });
  // Screen readers hear "Photo 2 of 3" when it changes (the counter itself is visual only).
  const announce = h('span', { class: 'visually-hidden', 'aria-live': 'polite' });
  const dots = media.length <= 10 ? h('span', { class: 'feed-post__dots', 'aria-hidden': 'true' }, media.map(() => h('span', { class: 'feed-post__dot' }))) : null;
  const arrow = (direction) => h('button', {
    type: 'button', class: `feed-post__arrow feed-post__arrow--${direction < 0 ? 'previous' : 'next'}`,
    'aria-label': direction < 0 ? 'Previous photo' : 'Next photo',
    onClick: (event) => { event.stopPropagation(); go(index + direction); },
  }, icon(direction < 0 ? 'chevronLeft' : 'chevronRight', 18));
  const previous = arrow(-1);
  const next = arrow(1);

  function go(to, { quiet = false } = {}) {
    const hadFocus = document.activeElement;
    index = Math.max(0, Math.min(media.length - 1, to));
    track.style.transform = `translateX(${-index * 100}%)`;
    slides.forEach((slide, i) => {
      slide.setAttribute('aria-hidden', String(i !== index));
      slide.tabIndex = i === index ? 0 : -1;
      if (i !== index && slide.firstChild.tagName === 'VIDEO') slide.firstChild.pause();
    });
    previous.hidden = index === 0;
    next.hidden = index === media.length - 1;
    counter.textContent = `${index + 1} / ${media.length}`;
    dots?.childNodes.forEach((dot, i) => dot.classList.toggle('is-on', i === index));
    frame.setAttribute('aria-label', `Photo ${index + 1} of ${media.length}`);
    if (!quiet) announce.textContent = `Photo ${index + 1} of ${media.length}${media[index].caption ? `: ${media[index].caption}` : ''}`;
    // An arrow that just hid can't keep focus: hand it to the other one.
    if ((hadFocus === previous && previous.hidden) || (hadFocus === next && next.hidden)) (previous.hidden ? next : previous).focus();
  }

  frame.setAttribute('role', 'group');
  frame.setAttribute('aria-roledescription', 'carousel');
  frame.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); slides[index].focus?.({ preventScroll: true }); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); slides[index].focus?.({ preventScroll: true }); }
    if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); go(event.key === 'Home' ? 0 : media.length - 1); slides[index].focus?.({ preventScroll: true }); }
  });
  // Flipping pictures shouldn't also flip to the next module on phones (js/editor/module-swiper.js).
  frame.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
  onSwipe(frame, { onNext: () => go(index + 1), onPrevious: () => go(index - 1) });
  frame.append(track, previous, next, counter, dots, announce);
  go(0, { quiet: true });
  return frame;
}

/**
 * A connected event, condensed: the date, the name, when and where on one
 * line, and the RSVP buttons.
 *
 *   ┌ DEC ┐  Porch Lights at the Juniper Street Fair      [Going] [Maybe] [Can’t go]
 *   └  7  ┘  2:00 – 2:40pm · Main stage · 5 going
 */
export function renderEventStrip(eventId, onChange) {
  const found = findEvent(eventId);
  if (!found) return h('p', { class: 'event-strip event-strip--missing' }, 'The event connected to this post was deleted.');
  const { event } = found;
  const me = getCurrentUser();
  const [, month, day] = event.date.split('-').map(Number);
  const going = rsvpSummary(event);
  return h('div', { class: 'event-strip', style: { '--event-color': colorValue(event.color) } },
    h('a', { class: 'event-strip__date', href: eventHref(event.id), tabindex: '-1', 'aria-hidden': 'true' },
      h('span', { class: 'event-strip__month' }, monthName(month - 1).slice(0, 3)),
      h('span', { class: 'event-strip__day' }, String(day))),
    h('div', { class: 'event-strip__text' },
      h('a', { class: 'event-strip__title', href: eventHref(event.id) }, event.title),
      h('span', { class: 'event-strip__meta' }, [timeRangeLabel(event), event.location, going].filter(Boolean).join(' · '))),
    h('div', { class: 'event-strip__rsvp' }, rsvpButtons(event, me.id, (answer) => {
      updateEvent(event.id, (saved) => applyRsvp(saved, me.id, answer));
      onChange();
    }, { compact: true })));
}

/**
 * What else the post carries, in order: files from a vault (copies),
 * links and events to RSVP to. Documents open as a preview you can start
 * reading in place (file-preview.js); links, and files with nothing to
 * show, share one list of rows.
 */
function renderAttachments(attachments, redraw) {
  if (!attachments.length) return null;
  // Every file and link gets a preview card (file-preview.js), whatever it is.
  const previews = [];
  for (const a of attachments) {
    if (a.kind === 'link') { previews.push(renderFilePreview({ id: a.url, kind: 'link', name: a.name || a.url, url: a.url })); continue; }
    if (a.kind !== 'file') continue;
    // Shared to comment on or edit: the file as it is now (js/ui/file-access.js).
    previews.push((a.access && a.access !== 'view' ? renderLiveFile(a) : null) ?? renderFilePreview(a.item));
  }
  const events = attachments.filter((a) => a.kind === 'event');
  if (!previews.length && !events.length) return null;
  return h('div', { class: 'feed-post__attachments' },
    previews,
    events.map((a) => h('div', { class: 'feed-post__event' }, renderAttachment({ kind: 'event', eventId: a.eventId }, { me: getCurrentUser(), onChange: redraw }))));
}

/**
 * A vault file shared with "Can comment" or "Can edit": the file as it is
 * now. Editing a document or a module file works right here; comments go
 * under it. Null if the original is gone (the copy shows instead).
 */
function renderLiveFile(attachment) {
  const found = liveItem(attachment.item.from);
  if (!found) return null;
  const { vault, item } = found;
  const me = getCurrentUser();
  const access = effectiveAccess(item, attachment.access);
  const canAct = Boolean(me) && !me.isGuest;
  const box = h('div', { class: 'file-preview file-live' },
    h('div', { class: 'file-preview__head' }, icon(item.kind === 'module' ? (getModuleTypeSafe(item.moduleType)?.icon ?? 'file') : 'note', 15), h('strong', {}, ` ${item.name}`),
      h('span', { class: 'file-access__badge' }, accessLabel(access))));
  if (access === 'edit' && canAct && item.kind === 'note') {
    const editor = createRichTextEditor({
      html: item.html,
      label: `${item.name} text`,
      onChange: (html) => {
        const data = structuredClone(getModule(vault.id).data);
        Object.assign(data.items.find((i) => i.id === item.id), { html, updatedBy: me.id, updatedAt: Date.now() });
        updateModuleData(vault.id, data);
      },
    });
    box.append(editor.toolbar, editor.content, editor.statusBar);
  } else if (item.kind === 'module' && getModuleTypeSafe(item.moduleType)) {
    const body = h('div', { class: 'file-live__module' });
    getModuleTypeSafe(item.moduleType).render(body, createItemContext(vault.id, item.id, { access: canAct ? access : 'view' }));
    box.append(body);
  } else {
    box.append(renderFilePreview({ ...item, ...(item.file ? { mimeType: item.file.mimeType, size: item.file.size, dataUrl: item.file.dataUrl } : {}) }) ?? h('p', { class: 'module-empty' }, item.name));
  }
  if (canAct) box.append(accessNote(access));
  box.append(renderFileComments({ vaultModuleId: vault.id, itemId: item.id, canComment: canAct }));
  return box;
}

function getModuleTypeSafe(type) {
  try { return getModuleType(type); } catch { return null; }
}

/** A post's poll(s). Votes are saved on the post, wherever it lives (anyone signed in can vote). */
function renderPostPolls(post, moduleId) {
  const polls = post.attachments.filter((a) => a.kind === 'poll');
  if (!polls.length) return null;
  const me = getCurrentUser();
  const findPoll = (pollId) => {
    const saved = (getModule(moduleId)?.data.posts ?? []).find((p) => p.id === post.id);
    return (saved?.attachments ?? []).find((a) => a.kind === 'poll' && a.poll.id === pollId)?.poll ?? null;
  };
  return polls.map(({ poll }) => renderPoll({
    getPoll: () => findPoll(poll.id) ?? poll,
    savePoll: (next) => {
      const module = getModule(moduleId);
      if (!module) return;
      const data = structuredClone(module.data);
      const saved = data.posts.find((p) => p.id === post.id);
      saved.attachments = (saved.attachments ?? []).map((a) => (a.kind === 'poll' && a.poll.id === next.id ? { kind: 'poll', poll: next } : a));
      updateModuleData(moduleId, data);
    },
    me,
    canVote: Boolean(me),
    canManage: me?.id === post.authorId,
  }));
}

/** " · 👥 Friends" on a post only some people can see, so nobody is surprised. */
function audienceNote(post) {
  const label = { friends: 'Friends', members: 'Members' }[post.audience];
  return label ? h('span', { class: 'feed-post__audience', title: `Only ${label.toLowerCase()} can see this` }, ' · ', icon(post.audience === 'friends' ? 'people' : 'lock', 11), ` ${label}`) : null;
}
