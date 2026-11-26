// @ts-check
/**
 * publish-dialog.js — "Publish" (or "Post") vault files somewhere people
 * will see them, as a post with a preview, likes, and comments.
 *
 *   1. Where?                                  2. The post
 *   ┌ Publish “Tour costs” ─────────── × ┐     ┌ ← Choose another place ───────┐
 *   │ YOUR BLOG                          │     │ Leo’s blog · Posts             │
 *   │  ▦ Posts · General feed          › │     │ [the post editor, with the     │
 *   │  ▭ On stage · Carousel           › │     │  files attached: ↑↓ to reorder;│
 *   │  📰 Articles · Articles (notes)   › │     │  the first is the preview]     │
 *   │ YOUR GROUPS                        │     │                        [Post]  │
 *   │  ▸ Porch Lights · 2 places         │     └────────────────────────────────┘
 *   │  ▾ Juniper Tenants Union · 1 place │
 *   │      ▦ Updates · General feed    › │     (a folder: first a cover photo, if you like)
 *   └────────────────────────────────────┘
 *
 * Places: your blog's General feeds and Carousels first, then each group
 * you can post in, folded until you open it. A single note (or article)
 * can also go to an Articles module, as a draft there (from-note.js).
 *
 * Documents, spreadsheets, articles, relationship maps, presentations, and
 * folders say "Publish"; photos, videos, and other files say "Post"
 * (publishVerb). Several files at once say "Publish" only if all of them would.
 *
 *   publishVerb(items)                         → 'Publish' | 'Post'
 *   openPublishDialog({ entries: [{ vaultModuleId, item }] })
 */

import { h, replaceChildren, makeId } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { audienceFor } from './audience-chip.js';
import { getSpaces, getBlogOf, getModule, getCurrentUser, updateModuleData } from '../state/store.js';
import { can } from '../state/permissions.js';
import { notifyMentions } from '../state/notifications.js';
import { createPost, normalizeFeed } from '../modules/blog-feeds/feed-data.js';
import { renderComposer } from '../modules/blog-feeds/feed-composer.js';
import { snapshotVaultItem } from '../modules/submissions/submission-items.js';
import { turnNoteIntoArticle } from '../modules/articles/from-note.js';
import { openModulePage } from '../router.js';
import { requestModuleFocus } from '../editor/module-context.js';
import { readImages } from './image-upload.js';

const PUBLISHED_MODULE_TYPES = new Set(['sheet', 'presentation', 'relationship']);
const PLACE_LABELS = { generalfeed: 'General feed', carousel: 'Carousel', articles: 'Articles' };
const PLACE_ICONS = { generalfeed: 'announcements', carousel: 'slides', articles: 'newspaper' };

/** "Publish" for documents, articles, spreadsheets, presentations, maps, and folders; "Post" for the rest. */
export function publishVerb(items) {
  const publishes = (item) => item.kind === 'note' || item.kind === 'folder' || (item.kind === 'module' && PUBLISHED_MODULE_TYPES.has(item.moduleType));
  return items.length && items.every(publishes) ? 'Publish' : 'Post';
}

/** Where these files can go: your blog's places, then your groups' (each with its places). */
function placesFor(me, entries) {
  const oneNote = entries.length === 1 && entries[0].item.kind === 'note';
  const fits = (m) => m.type === 'generalfeed' || m.type === 'carousel' || (oneNote && m.type === 'articles');
  const blog = getBlogOf(me.id);
  const blogPlaces = (blog?.modules ?? []).filter(fits).map((module) => ({ module, space: blog }));
  const groups = getSpaces()
    .filter((space) => space.kind === 'group' && space.memberIds.includes(me.id))
    .map((space) => ({
      space,
      places: space.modules
        .filter((m) => fits(m) && (m.type === 'articles' || can(space, me.id, 'postToFeeds')))
        .map((module) => ({ module, space })),
    }))
    .filter((g) => g.places.length);
  return { blog, blogPlaces, groups };
}

/** A copy of a vault item for a post; a folder carries copies of its files and its cover. */
function attachmentFor({ vaultModuleId, item }, cover = null) {
  if (item.kind !== 'folder') return { kind: 'file', item: snapshotVaultItem(item, vaultModuleId), access: 'view' };
  const all = getModule(vaultModuleId)?.data.items ?? [];
  const children = all.filter((i) => i.parentId === item.id && i.kind !== 'folder').map((child) => snapshotVaultItem(child, vaultModuleId));
  return { kind: 'file', item: { id: makeId('item'), kind: 'folder', name: item.name, from: { vaultModuleId, itemId: item.id }, children, cover }, access: 'view' };
}

const isPhoto = (item) => item.kind === 'file' && item.file?.dataUrl && item.file.mimeType?.startsWith('image/');

export function openPublishDialog({ entries }) {
  const me = getCurrentUser();
  if (!me || !entries.length) return null;
  const verb = publishVerb(entries.map((e) => e.item));
  const title = entries.length === 1 ? `${verb} “${entries[0].item.name}”` : `${verb} ${entries.length} files`;
  const body = h('div', { class: 'publish-dialog__body' });
  const heading = h('h2', { class: 'publish-dialog__title' }, title);
  const content = h('div', { class: 'publish-dialog' },
    h('div', { class: 'publish-dialog__header' }, heading,
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => modal.close() }, icon('close', 18))),
    body);
  const modal = openModal(content, { label: title, className: 'publish-dialog-modal' });
  const openGroups = new Set();

  // ─── 1. Where? ─────────────────────────────────────────────────────────────

  function placeButton(place) {
    const { module, space } = place;
    return h('li', {}, h('button', {
      type: 'button', class: 'publish-dialog__place',
      onClick: () => choose(place),
    },
      h('span', { class: 'publish-dialog__place-icon' }, icon(PLACE_ICONS[module.type], 16)),
      h('span', { class: 'publish-dialog__place-text' },
        h('span', { class: 'publish-dialog__place-name' }, module.title),
        h('span', { class: 'publish-dialog__place-kind' }, module.type === 'articles' ? 'Articles: as a draft to finish there' : `${PLACE_LABELS[module.type]}${space.kind === 'group' ? ` in ${space.name}` : ''}`)),
      icon('chevronRight', 14)));
  }

  function drawPlaces() {
    heading.textContent = title;
    const { blog, blogPlaces, groups } = placesFor(me, entries);
    replaceChildren(body,
      h('p', { class: 'publish-dialog__hint' }, 'Where should it go? It shows as a post with a preview, and people can like and comment on it.'),
      h('h3', { class: 'publish-dialog__section' }, 'Your blog'),
      blogPlaces.length
        ? h('ul', { class: 'publish-dialog__places' }, blogPlaces.map(placeButton))
        : h('p', { class: 'publish-dialog__hint' }, blog ? 'Your blog has no General feed or Carousel yet. Add one while editing your blog.' : 'You don’t have a blog yet.'),
      h('h3', { class: 'publish-dialog__section' }, 'Your groups'),
      groups.length
        ? h('ul', { class: 'publish-dialog__groups' }, groups.map(({ space, places }) => {
          const isOpen = openGroups.has(space.id);
          return h('li', { class: 'publish-dialog__group' },
            h('button', {
              type: 'button', class: 'publish-dialog__group-toggle', 'aria-expanded': String(isOpen),
              onClick: () => { if (isOpen) openGroups.delete(space.id); else openGroups.add(space.id); drawPlaces(); },
            }, icon(isOpen ? 'chevronDown' : 'chevronRight', 14), h('span', { class: 'publish-dialog__group-name' }, space.name),
            h('span', { class: 'publish-dialog__place-kind' }, `${places.length} ${places.length === 1 ? 'place' : 'places'}`)),
            isOpen ? h('ul', { class: 'publish-dialog__places publish-dialog__places--nested' }, places.map(placeButton)) : null);
        }))
        : h('p', { class: 'publish-dialog__hint' }, 'None of your groups has a feed you can post in.'));
  }

  function choose(place) {
    if (place.module.type === 'articles') {
      const { vaultModuleId, item } = entries[0];
      modal.close();
      turnNoteIntoArticle(getModule(vaultModuleId)?.data.items.find((i) => i.id === item.id) ?? item, { vaultModuleId, targetModuleId: place.module.id, me });
      return;
    }
    const folder = entries.length === 1 && entries[0].item.kind === 'folder' ? entries[0] : null;
    if (folder) drawCover(place, folder);
    else drawComposer(place, entries.map((e) => attachmentFor(e)));
  }

  function backLink() {
    return h('button', { type: 'button', class: 'link-button publish-dialog__back', onClick: drawPlaces }, icon('arrowLeft', 14), ' Choose another place');
  }

  // ─── A folder: a cover photo first, if you like ───────────────────────────

  function drawCover(place, folder) {
    const photos = (getModule(folder.vaultModuleId)?.data.items ?? []).filter((i) => i.parentId === folder.item.id && isPhoto(i));
    let cover = null;
    const choices = h('div', { class: 'publish-dialog__covers', role: 'radiogroup', 'aria-label': 'Cover photo' });
    const drawChoices = (uploaded = []) => replaceChildren(choices,
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(cover === null), class: `publish-dialog__cover publish-dialog__cover--none${cover === null ? ' is-current' : ''}`, onClick: () => { cover = null; drawChoices(uploaded); } }, 'No cover'),
      [...photos.map((p) => p.file.dataUrl), ...uploaded].map((src, i) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(cover === src), 'aria-label': `Cover photo ${i + 1}`,
        class: `publish-dialog__cover${cover === src ? ' is-current' : ''}`, onClick: () => { cover = src; drawChoices(uploaded); },
      }, h('img', { src, alt: '' }))));
    const upload = h('input', { type: 'file', accept: 'image/*', hidden: true, onChange: async (event) => {
      const [photo] = await readImages([...event.target.files]);
      if (photo) { cover = photo.src; drawChoices([photo.src]); }
    } });
    drawChoices();
    replaceChildren(body,
      backLink(),
      h('p', { class: 'publish-dialog__where' }, `${place.space.kind === 'group' ? place.space.name : 'Your blog'} · ${place.module.title}`),
      h('h3', { class: 'publish-dialog__section' }, 'Cover photo (optional)'),
      h('p', { class: 'publish-dialog__hint' }, 'It’s the picture on the post’s preview. Pick one of the folder’s photos, or upload one.'),
      choices,
      h('div', { class: 'form-row' },
        h('button', { type: 'button', class: 'button button--small', onClick: () => upload.click() }, icon('upload', 14), ' Upload a cover'),
        h('span', { class: 'publish-dialog__spacer' }),
        h('button', { type: 'button', class: 'button button--primary', onClick: () => drawComposer(place, [attachmentFor(folder, cover)]) }, 'Next')),
      upload);
  }

  // ─── 2. The post ───────────────────────────────────────────────────────────

  function drawComposer(place, attachments) {
    const { module, space } = place;
    const composer = renderComposer({
      variant: 'general',
      spaceId: space.id,
      audience: audienceFor(space, module),
      initial: { text: '', media: [], attachments },
      onPost: (fields) => {
        const created = createPost({ authorId: me.id, ...fields });
        const live = getModule(module.id);
        if (!live) return;
        const data = normalizeFeed(structuredClone(live.data));
        data.posts.push(created);
        updateModuleData(module.id, data);
        notifyMentions({ moduleId: module.id, itemId: created.id, after: created.text, where: 'a post' });
        modal.close();
        showToast(`${verb === 'Publish' ? 'Published' : 'Posted'} in ${space.kind === 'group' ? space.name : 'your blog'} · ${module.title}.`, {
          actionLabel: 'Open', onAction: () => { requestModuleFocus(module.id, created.id); openModulePage(module.id); },
        });
      },
      onCreateEvent: (fields) => {
        // An event made from here lives on the feed (as it would from the feed's own composer without an events module).
        const event = { id: makeId('ev'), kind: 'event', ...fields, createdBy: me.id, attendeeIds: [me.id], rsvps: { [me.id]: 'going' }, visibility: 'public', color: 'purple' };
        const live = getModule(module.id);
        if (live) updateModuleData(module.id, { ...live.data, events: [...(live.data.events ?? []), event] });
        return event;
      },
    });
    heading.textContent = `${verb} to ${space.kind === 'group' ? space.name : 'your blog'}`;
    replaceChildren(body,
      backLink(),
      h('p', { class: 'publish-dialog__where' }, `${space.kind === 'group' ? space.name : 'Your blog'} · ${module.title} (${PLACE_LABELS[module.type]})`),
      attachments.length > 1 ? h('p', { class: 'publish-dialog__hint' }, 'Use ↑ ↓ to put them in order. The first one is the post’s preview.') : null,
      composer);
    requestAnimationFrame(() => content.querySelector('textarea')?.focus());
  }

  drawPlaces();
  return modal;
}

/** Where a vault file was published: posts in feeds that carry it (directly, or inside a published folder). */
export function publishedPostsOf(vaultModuleId, itemId) {
  const found = [];
  const same = (from) => from?.vaultModuleId === vaultModuleId && from?.itemId === itemId;
  for (const space of getSpaces()) {
    for (const module of space.modules ?? []) {
      if (!['generalfeed', 'textfeed', 'carousel'].includes(module.type)) continue;
      for (const post of module.data?.posts ?? []) {
        const attachment = (post.attachments ?? []).find((a) => a.kind === 'file' && same(a.item?.from));
        if (attachment) found.push({ space, module, post, attachment });
      }
    }
  }
  return found;
}

