// @ts-check
/**
 * gallery-module.js — Photo gallery, a blog module: a grid of photos.
 *
 *   ┌ This fall ──────────────────────────────── ↗ ┐
 *   │ [▓▓▓] [▓▓▓] [▓▓▓] [▓▓▓]                       │  click one to see it large
 *   │ [▓▓▓] [▓▓▓]                                   │  (← → to flip through)
 *   │ + Add photos                      6 photos    │  ← only on your own blog
 *   └───────────────────────────────────────────────┘
 *
 * On your own blog, the large view also lets you caption, reorder and
 * delete photos. Photos are shrunk before saving (js/ui/image-upload.js).
 *
 * Data shape: { photos: [{ id, src, caption, addedAt }] }
 * `addedAt` lets the Feed show new photos from friends' blogs.
 */

import { emptyState } from '../../ui/empty-state.js';
import { h, replaceChildren, makeId } from '../../ui/dom.js';
import { showToast } from '../../ui/toast.js';
import { openLightbox } from '../../ui/lightbox.js';
import { photoPicker, readImages } from '../../ui/image-upload.js';

export const galleryModule = {
  type: 'gallery',
  label: 'Photo gallery',
  description: 'A grid of photos; click one to see it large',
  icon: 'image',
  defaultSpan: 6,
  defaultRows: 12,
  available: true,
  spaceKinds: ['blog', 'group'],  // a group's public page only (js/modules/module-lists.js)

  createInitialData: () => ({ photos: [] }),
  render: (container, context) => renderGallery(container, context, false),
  renderFullPage: (container, context) => renderGallery(container, context, true),
};

function renderGallery(container, context, isFullPage) {
  const canEdit = !context.isVisitor;
  const grid = h('div', { class: `gallery${isFullPage ? ' gallery--page' : ''}` });
  const footer = h('div', { class: 'gallery__footer' });

  const photos = () => context.getData().photos ?? [];

  function update(changeFn) {
    const data = structuredClone(context.getData());
    data.photos = data.photos ?? [];
    changeFn(data);
    context.saveData(data);
    draw();
  }

  const lightboxOptions = {
    editable: canEdit,
    getPhotos: photos,
    onCaption: (id, caption) => update((data) => { data.photos.find((p) => p.id === id).caption = caption; }),
    onMove: (id, direction) => update((data) => {
      const from = data.photos.findIndex((p) => p.id === id);
      const [photo] = data.photos.splice(from, 1);
      data.photos.splice(from + direction, 0, photo);
    }),
    onDelete: (id) => {
      const before = structuredClone(context.getData());
      update((data) => { data.photos = data.photos.filter((p) => p.id !== id); });
      showToast('Photo deleted.', { actionLabel: 'Undo', onAction: () => { context.saveData(before); draw(); } });
    },
  };

  function addPhotos(picked) {
    update((data) => {
      for (const photo of picked) data.photos.push({ id: makeId('photo'), src: photo.src, caption: '', addedAt: Date.now() });
    });
    showToast(`Added ${picked.length} ${picked.length === 1 ? 'photo' : 'photos'}.`);
  }

  function draw() {
    const list = photos();
    replaceChildren(grid, list.length === 0
      ? emptyState({ icon: 'image', title: 'No photos yet', text: canEdit ? (context.spaceKind === 'group' ? 'Add some to share them here.' : 'Add some to share them on your blog.') : null })
      : list.map((photo, index) => h('button', {
        type: 'button',
        class: 'gallery__item',
        'aria-label': photo.caption ? `Open photo: ${photo.caption}` : `Open photo ${index + 1}`,
        onClick: () => openLightbox(list, index, lightboxOptions),
      }, h('img', { src: photo.src, alt: photo.caption || '', loading: 'lazy' }))));
    replaceChildren(footer,
      canEdit ? photoPicker({ label: '+ Add photos', onPhotos: addPhotos, buttonClass: 'link-button' }) : h('span'),
      h('span', { class: 'gallery__count' }, `${list.length} ${list.length === 1 ? 'photo' : 'photos'}`));
  }

  // Drop photos straight onto the gallery.
  if (canEdit) {
    grid.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); grid.classList.add('is-drop-target'); } });
    grid.addEventListener('dragleave', () => grid.classList.remove('is-drop-target'));
    grid.addEventListener('drop', async (event) => {
      event.preventDefault();
      grid.classList.remove('is-drop-target');
      const picked = await readImages(event.dataTransfer.files);
      if (picked.length) addPhotos(picked);
    });
  }

  container.append(grid, footer);
  draw();
}
