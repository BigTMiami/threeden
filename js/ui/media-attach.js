// @ts-check
/**
 * media-attach.js — adding photos and videos to what you write: forum
 * threads and replies, announcements, and (through the editor) documents.
 * Chat has its own "+" menu with the same Photo and Video choices
 * (js/messages/attachments.js).
 *
 *   const media = mediaAttacher();
 *   form.append(textarea, media.slot, media.button);   ← [+ Photo or video ▾]
 *   media.read()  → [{ kind: 'image', src, width, height } | { kind: 'video', src, name }]
 *   media.clear()
 *
 *   renderMediaList(items)   → the pictures (tap to see large) and players, for showing them
 *   pickMedia(kind, onPicked)  open the device's picker for 'image' or 'video'
 *
 * On a phone, the picker offers the camera too ("Take Photo or Video"),
 * so a video can be recorded right there. Photos are shrunk to fit the
 * browser's storage (js/ui/image-upload.js); videos can be up to 3 MB in
 * this prototype.
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';
import { readImages } from './image-upload.js';
import { openLightbox } from './lightbox.js';
import { photoEditButton } from './photo-editor.js';

export const MAX_VIDEO_BYTES = 3 * 1024 * 1024;

export function readVideo(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_VIDEO_BYTES) { reject(new Error(`“${file.name}” is too big. In this prototype videos can be up to 3 MB.`)); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ kind: 'video', src: reader.result, name: file.name });
    reader.onerror = () => reject(new Error(`“${file.name}” couldn’t be read.`));
    reader.readAsDataURL(file);
  });
}

/** Photos and videos from a file list, in order. */
export async function readMedia(files) {
  const list = [...files];
  const results = [];
  for (const file of list.filter((f) => f.type.startsWith('video/'))) {
    try { results.push(await readVideo(file)); } catch (problem) { showToast(problem.message); }
  }
  for (const photo of await readImages(list.filter((f) => f.type.startsWith('image/')))) {
    results.push({ kind: 'image', src: photo.src, width: photo.width, height: photo.height });
  }
  return results;
}

/** Open the device's picker for photos ('image') or a video ('video'). */
export function pickMedia(kind, onPicked) {
  const input = h('input', { type: 'file', accept: kind === 'video' ? 'video/*' : 'image/*', multiple: kind !== 'video', hidden: true });
  input.addEventListener('change', async () => {
    const media = await readMedia(input.files);
    input.remove();
    if (media.length) onPicked(media);
  });
  document.body.append(input);
  input.click();
}

/**
 * A "+ Photo or video" menu and the chosen items (each with ×), for a
 * form. `label` changes the button text.
 */
export function mediaAttacher({ label = 'Photo or video', initial = [] } = {}) {
  let items = [...initial];
  const slot = h('div', { class: 'media-attach__items', hidden: !items.length });
  const menu = h('div', { class: 'media-attach__menu', role: 'menu', hidden: true });
  const toggle = h('button', {
    type: 'button', class: 'button button--small media-attach__button', 'aria-haspopup': 'true', 'aria-expanded': 'false',
    onClick: () => setOpen(menu.hidden),
  }, icon('plus', 14), ` ${label}`);

  const closeIfOutside = (event) => { if (!button.contains(event.target)) setOpen(false); };
  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) document.addEventListener('pointerdown', closeIfOutside);
    else document.removeEventListener('pointerdown', closeIfOutside);
  }
  const choice = (kind, iconName, text, hint) => h('button', {
    type: 'button', role: 'menuitem', class: 'media-attach__choice',
    onClick: () => {
      setOpen(false);
      pickMedia(kind, (media) => { items = [...items, ...media]; draw(); });
    },
  }, icon(iconName, 16), h('span', {}, h('strong', {}, text), h('span', { class: 'media-attach__hint' }, hint)));
  replaceChildren(menu,
    choice('image', 'image', 'Photo', 'From your device or camera'),
    choice('video', 'video', 'Video', 'Record one, or pick from your device (up to 3 MB)'));

  function draw() {
    slot.hidden = !items.length;
    replaceChildren(slot, items.map((item, index) => h('span', { class: 'media-attach__item' },
      item.kind === 'video'
        ? h('video', { src: item.src, muted: true, preload: 'metadata', 'aria-label': item.name ?? 'Video' })
        : h('img', { src: item.src, alt: '' }),
      item.kind === 'video' ? h('span', { class: 'media-attach__badge', 'aria-hidden': 'true' }, '▶') : photoEditButton(() => item.src, (edited) => { Object.assign(item, edited); draw(); }),
      h('button', {
        type: 'button', class: 'media-attach__remove', 'aria-label': `Remove ${item.kind === 'video' ? 'video' : 'photo'}`,
        onClick: () => { items = items.filter((_, i) => i !== index); draw(); },
      }, icon('close', 12)))));
  }
  draw();

  const button = h('span', { class: 'media-attach' }, toggle, menu);
  return {
    button,
    slot,
    read: () => items.map((item) => ({ ...item })),
    clear: () => { items = []; draw(); },
  };
}

/** Pictures and videos, for showing them under a thread, reply, or announcement. */
export function renderMediaList(items = []) {
  if (!items.length) return null;
  const photos = items.filter((m) => m.kind === 'image').map((m, i) => ({ id: `m${i}`, src: m.src, caption: '' }));
  let photoIndex = -1;
  return h('div', { class: `media-list media-list--${Math.min(items.length, 3)}` }, items.map((item) => {
    if (item.kind === 'video') return h('video', { class: 'media-list__video', src: item.src, controls: true, preload: 'metadata', playsinline: true, 'aria-label': item.name ?? 'Video' });
    photoIndex += 1;
    const index = photoIndex;
    return h('button', { type: 'button', class: 'media-list__photo', 'aria-label': 'Open photo', onClick: () => openLightbox(photos, index) },
      h('img', { src: item.src, alt: '', loading: 'lazy' }));
  }));
}
