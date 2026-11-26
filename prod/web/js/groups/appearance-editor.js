// @ts-check
/**
 * appearance-editor.js — the Cover tab of space settings.
 *
 *   ┌ choices ─────────────────────┐ ┌ preview ─────────────────────┐
 *   │ Cover photo  [none][▦][▦]… ⬆  │ │ ▓▓▓▓▓▓▓▓ cover ▓▓▓▓▓▓▓▓▓▓▓▓▓ │
 *   │ Which part shows ───●─────   │ │ 237 Hart Street              │
 *   │ Height  [Short | Tall]       │ │ ┌ card ┐ ┌ card ┐            │
 *   └──────────────────────────────┘ └──────────────────────────────┘
 *
 * A page's cover is the only part of its look it chooses: everything else
 * follows each visitor's own theme (Account settings → Theme). Groups and
 * blogs used to have their own themes, fonts, colors, and backgrounds;
 * those were removed (Nov 14) so 3den always looks the way you set it.
 *
 * Changes go into the settings draft (settings-drafts.js) and show in the
 * preview right away; nothing is saved until you press Save changes at
 * the bottom of the page. "Preview" there shows the real homepage with
 * them.
 * People without the "Change how the group looks" permission see the
 * choices greyed out. The settings themselves are described in
 * appearance.js.
 */

import { accessLabel } from '../state/group-access.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { can } from '../state/permissions.js';
import { getDraft, setDraft } from './settings-drafts.js';
import { COVER_PRESETS, normalizeAppearance, coverStyle, readCoverImage } from './appearance.js';
import { section, lockedNote } from './settings-page.js';

/** Data URLs longer than this probably won't fit in browser storage with everything else. */
const MAX_COVER_DATA_URL_LENGTH = 1_500_000;

export function renderAppearanceEditor(space, me, onDraftChange = () => {}) {
  const canEdit = space.kind === 'personal' || space.kind === 'blog' || can(space, me.id, 'customizeAppearance');
  const saved = normalizeAppearance(space.appearance);
  let look = normalizeAppearance(getDraft(space.id).appearance ?? space.appearance);

  const controls = h('div', { class: 'appearance-editor__controls' });
  const preview = h('div', { class: 'appearance-preview', 'aria-label': 'Preview' });

  /** Change the draft look (it's saved with "Save changes", not here). */
  function save(changes) {
    look = normalizeAppearance({ ...look, ...changes, cover: { ...look.cover, ...changes.cover } });
    const isSameAsSaved = JSON.stringify(look) === JSON.stringify(saved);
    setDraft(space.id, 'appearance', isSameAsSaved ? null : look);
    onDraftChange();
    draw();
  }

  // ─── Choices ───────────────────────────────────────────────────────────────

  const fileInput = h('input', {
    type: 'file',
    accept: 'image/*',
    class: 'visually-hidden',
    tabindex: '-1',
    'aria-hidden': 'true',
    onChange: async (event) => {
      const [file] = event.target.files;
      if (!file) return;
      try {
        const image = await readCoverImage(file);
        if (image.length > MAX_COVER_DATA_URL_LENGTH) {
          showToast('That photo is too detailed to store in this prototype. Try a smaller one.');
          return;
        }
        save({ cover: { kind: 'image', image, focus: 50 } });
      } catch (error) {
        showToast(error.message);
      }
    },
  });

  /** A small square (or wide) button showing a choice; `isOn` marks the chosen one. */
  const swatchButton = (label, style, isOn, onClick, extraClass = '') => h('button', {
    type: 'button',
    class: `swatch ${extraClass}${isOn ? ' is-selected' : ''}`,
    style,
    title: label,
    'aria-label': label,
    'aria-pressed': String(isOn),
    disabled: !canEdit,
    onClick,
  });

  const segmented = (options, currentId, onPick, label) => h('div', { class: 'segmented', role: 'group', 'aria-label': label },
    options.map((option) => h('button', {
      type: 'button',
      class: `segmented__option${option.id === currentId ? ' is-active' : ''}`,
      'aria-pressed': String(option.id === currentId),
      disabled: !canEdit,
      onClick: () => onPick(option.id),
    }, option.label)));

  function drawControls() {
    const { cover } = look;

    const coverChoices = h('div', { class: 'swatches swatches--wide' },
      swatchButton('No cover', null, cover.kind === 'none', () => save({ cover: { kind: 'none' } }), 'swatch--none'),
      COVER_PRESETS.map((preset) => swatchButton(preset.label,
        { background: preset.css, backgroundSize: preset.size ?? 'cover', backgroundPosition: preset.position ?? 'center' },
        cover.kind === 'preset' && cover.preset === preset.id,
        () => save({ cover: { kind: 'preset', preset: preset.id } }))),
      cover.image
        ? swatchButton('Your photo', coverStyle({ ...cover, kind: 'image' }), cover.kind === 'image', () => save({ cover: { kind: 'image' } }))
        : null,
    );

    const photoRow = h('div', { class: 'form-row' },
      h('button', {
        type: 'button',
        class: 'button button--small',
        disabled: !canEdit,
        onClick: () => { fileInput.value = ''; fileInput.click(); },
      }, icon('upload', 14), cover.image ? ' Replace photo' : ' Upload a photo'),
      cover.image ? h('button', {
        type: 'button',
        class: 'link-button link-button--danger',
        disabled: !canEdit,
        onClick: () => save({ cover: { kind: cover.kind === 'image' ? 'none' : cover.kind, image: null } }),
      }, 'Remove photo') : null,
    );

    const focusSlider = cover.kind === 'image' ? h('label', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Which part of the photo shows'),
      h('input', {
        type: 'range', min: '0', max: '100', value: String(cover.focus), disabled: !canEdit,
        onInput: (event) => { look.cover.focus = Number(event.target.value); drawPreview(); },
        onChange: (event) => save({ cover: { focus: Number(event.target.value) } }),
      }),
      h('span', { class: 'appearance-editor__range-ends' }, h('span', {}, 'Top'), h('span', {}, 'Bottom')),
    ) : null;

    replaceChildren(controls,
      canEdit ? null : lockedNote(space, 'customizeAppearance'),
      section('Cover', 'A banner across the top of the homepage.',
        coverChoices, photoRow, focusSlider,
        h('div', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Height'),
          segmented([{ id: 'short', label: 'Short' }, { id: 'tall', label: 'Tall' }], cover.height, (height) => save({ cover: { height } }), 'Cover height')),
      ),
      h('p', { class: 'settings-field__hint' }, 'Everything else about how the page looks follows each visitor’s own theme (Account settings → Theme).'),
      fileInput,
    );
  }

  // ─── Preview ───────────────────────────────────────────────────────────────

  function drawPreview() {
    // The preview is in your own theme, like the page: only the cover is the page's.
    const banner = coverStyle(look.cover);
    replaceChildren(preview,
      h('span', { class: 'appearance-preview__label' }, 'Preview'),
      banner ? h('div', { class: `appearance-preview__cover appearance-preview__cover--${look.cover.height}`, style: banner }) : null,
      h('div', { class: 'appearance-preview__header' },
        h('h3', { class: 'appearance-preview__name' }, space.name),
        h('span', { class: 'appearance-preview__meta' }, { personal: 'Only you can see this page', blog: 'Public blog' }[space.kind] ?? accessLabel(space))),
      h('div', { class: 'appearance-preview__cards' },
        h('div', { class: 'appearance-preview__card' },
          h('h4', {}, 'Announcements'),
          h('p', {}, 'House meeting this Sunday at 6. ', h('a', { href: '#', onClick: (e) => e.preventDefault() }, 'See the agenda')),
          h('button', { type: 'button', class: 'button button--primary button--small' }, 'Post')),
        h('div', { class: 'appearance-preview__card' },
          h('h4', {}, 'To-do'),
          h('p', {}, '☐ Take out the recycling'),
          h('p', {}, '☐ Pay the internet bill')),
      ),
    );
  }

  function draw() {
    drawControls();
    drawPreview();
  }

  draw();
  return h('div', { class: 'appearance-editor' }, controls, h('div', { class: 'appearance-editor__preview' }, preview));
}
