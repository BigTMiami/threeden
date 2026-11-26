/**
 * appearance.js — a group's, blog's, or homepage's cover photo.
 *
 * Since Nov 14 the cover is the only part of a page's look it chooses:
 * every page is shown in the visitor's own theme (Account settings →
 * Theme). Old saved looks (themes, fonts, accents, backgrounds, corners)
 * are ignored by normalizeAppearance. The field list below is the old
 * shape, kept for reading saved data.
 *
 * Saved on each space as `appearance` (missing fields use the defaults):
 *
 *   {
 *     theme: null,                     ← a whole theme to start from (js/ui/themes.js
 *                                        PAGE_THEMES), or null for the classic base.
 *                                        With a theme, font, accent, background, and
 *                                        corners can each be 'theme' (or accent '')
 *                                        to use the theme's own.
 *     font: 'classic',                 ← one of FONTS
 *     accent: '#3366cc',               ← buttons, links, highlights
 *     background: 'plain',             ← one of BACKGROUNDS, or 'custom'
 *     backgroundColor: '#f8f9fa',      ← used when background is 'custom'
 *     cover: {
 *       kind: 'none' | 'preset' | 'image',
 *       preset: 'meadow',              ← one of COVER_PRESETS
 *       image: 'data:image/jpeg;…',    ← an uploaded photo, shrunk to fit storage
 *       focus: 50,                     ← which part of the photo shows, 0 = top … 100 = bottom
 *       height: 'short' | 'tall',
 *     },
 *     cards: 'bordered' | 'raised' | 'flat',
 *     corners: 'square' | 'rounded',
 *   }
 *
 * `applyAppearance(space)` puts it on the page, by setting CSS custom
 * properties on the page and body, so every module picks it up without
 * knowing about it. Only the top bar keeps the standard 3den look, unless
 * the space uses a theme (js/ui/themes.js), which covers the whole page.
 *
 * Fonts are font stacks already on people's computers, so nothing has to
 * be downloaded (and the prototype works offline).
 */

import { showPageTheme } from '../ui/themes.js';

export const FONTS = [
  { id: 'classic', label: 'Classic', description: 'Serif headings, plain text (the 3den default)', heading: "Georgia, 'Linux Libertine', 'Times New Roman', serif", body: 'Arial, Helvetica, sans-serif' },
  { id: 'modern', label: 'Modern', description: 'Clean and even', heading: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  { id: 'book', label: 'Book', description: 'Warm, like a printed page', heading: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif", body: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif" },
  { id: 'friendly', label: 'Friendly', description: 'Round and easy to read', heading: "'Trebuchet MS', 'Gill Sans', 'Segoe UI', sans-serif", body: "Verdana, Geneva, 'DejaVu Sans', sans-serif" },
  { id: 'newspaper', label: 'Newspaper', description: 'Bold headlines', heading: "'Times New Roman', Times, serif", body: "Georgia, 'Times New Roman', serif" },
  { id: 'typewriter', label: 'Typewriter', description: 'Zine energy', heading: "'Courier New', Courier, monospace", body: "'Courier New', Courier, monospace" },
];

export const ACCENTS = ['#3366cc', '#14866d', '#7b3fa0', '#ac6600', '#b32424', '#2f5d8a', '#c2185b', '#202122'];

export const BACKGROUNDS = [
  { id: 'plain', label: 'Plain', css: '#f8f9fa' },
  { id: 'white', label: 'White', css: '#ffffff' },
  { id: 'paper', label: 'Paper', css: '#fbf7ee' },
  { id: 'mint', label: 'Mint', css: '#eef7f2' },
  { id: 'sky', label: 'Sky', css: '#eef4fb' },
  { id: 'lavender', label: 'Lavender', css: '#f4f0fa' },
  { id: 'dots', label: 'Dots', css: 'radial-gradient(#d0d5db 1px, transparent 1.5px) 0 0 / 18px 18px, #f8f9fa' },
  { id: 'graph', label: 'Graph paper', css: 'linear-gradient(#e2e7ee 1px, transparent 1px) 0 0 / 24px 24px, linear-gradient(90deg, #e2e7ee 1px, transparent 1px) 0 0 / 24px 24px, #fbfcfd' },
  { id: 'dusk', label: 'Dusk', css: 'linear-gradient(180deg, #e8e2f4 0, #f8f9fa 480px) no-repeat, #f8f9fa' },
];

/** Cover designs made from CSS, for groups without a photo of their own. */
export const COVER_PRESETS = [
  { id: 'meadow', label: 'Meadow', css: 'linear-gradient(170deg, #cfe8c4 0%, #8cc084 45%, #3f7f50 100%)' },
  { id: 'sunrise', label: 'Sunrise', css: 'linear-gradient(135deg, #ffe0a8 0%, #f7a086 50%, #a66cb9 100%)' },
  { id: 'harbor', label: 'Harbor', css: 'linear-gradient(180deg, #b8dcf2 0%, #4c8ec6 60%, #1f4a78 100%)' },
  { id: 'brick', label: 'Brick', css: 'linear-gradient(335deg, rgba(255,255,255,.06) 23px, transparent 23px), linear-gradient(155deg, rgba(0,0,0,.08) 23px, transparent 23px), linear-gradient(335deg, rgba(255,255,255,.06) 23px, transparent 23px), linear-gradient(155deg, rgba(0,0,0,.08) 23px, transparent 23px), #b4563c', size: '58px 58px', position: '0 2px, 4px 35px, 29px 31px, 34px 6px' },
  { id: 'blueprint', label: 'Blueprint', css: 'linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px), #23558f', size: '22px 22px' },
  { id: 'night', label: 'Night sky', css: 'radial-gradient(circle at 15% 30%, #fff 0 1px, transparent 2px), radial-gradient(circle at 70% 60%, #fff 0 1px, transparent 2px), radial-gradient(circle at 40% 80%, #dfe8ff 0 1px, transparent 2px), linear-gradient(#0d1b36, #2b3a66)', size: '90px 70px, 120px 90px, 70px 60px, 100% 100%' },
  { id: 'sand', label: 'Sand', css: 'linear-gradient(160deg, #f6e7c8 0%, #e2c48f 60%, #c49a5a 100%)' },
  { id: 'stripes', label: 'Stripes', css: 'repeating-linear-gradient(-45deg, #f2c94c 0 18px, #f6d77a 18px 36px)' },
];

export const CARD_STYLES = [
  { id: 'bordered', label: 'Outlined' },
  { id: 'raised', label: 'Shadow' },
  { id: 'flat', label: 'Flat' },
];

export const CORNER_STYLES = [
  { id: 'square', label: 'Square' },
  { id: 'rounded', label: 'Rounded' },
];

export const DEFAULT_APPEARANCE = {
  theme: null,
  font: 'classic',
  accent: '#3366cc',
  background: 'plain',
  backgroundColor: '#f8f9fa',
  cover: { kind: 'none', preset: 'meadow', image: null, focus: 50, height: 'short' },
  cards: 'bordered',
  corners: 'square',
};

/** A space's appearance with every field filled in. */
export function normalizeAppearance(appearance = {}) {
  const look = {
    ...DEFAULT_APPEARANCE,
    ...appearance,
    cover: { ...DEFAULT_APPEARANCE.cover, ...appearance.cover },
  };
  // Only the cover is a page's own now: the rest is the default (each visitor's theme shows).
  return { ...DEFAULT_APPEARANCE, cover: look.cover };
}

/** What picking a theme sets: the theme, with its own font, colors, and corners. */
export function startFromTheme(themeId) {
  return { theme: themeId, font: 'theme', accent: '', background: 'theme', corners: 'theme' };
}

/** Is this space using the default look? */
export function isDefaultAppearance(appearance) {
  return JSON.stringify(normalizeAppearance(appearance)) === JSON.stringify(DEFAULT_APPEARANCE);
}

// ─── Putting it on the page ──────────────────────────────────────────────────

/**
 * Style `element` (and the page background) for a space. Pass null to go
 * back to the default look (e.g. on the account page).
 */
export function applyAppearance(space, element = document.querySelector('.page')) {
  const look = normalizeAppearance(space?.appearance);
  element.dataset.cards = look.cards;
  // Every page is in the visitor's own theme (pages keep only their cover photo).
  showPageTheme(null);
  for (const name of [...Object.keys(appearanceVars(look)), ...Object.keys(CLASSIC_BASE)]) element.style.removeProperty(name);
  element.style.colorScheme = '';
  element.style.color = '';
  delete document.documentElement.dataset.ownLook;
  document.body.style.background = '';
  document.body.style.backgroundAttachment = '';
}

/** css/tokens.css's own base colors, for a group's look under any theme. */
export const CLASSIC_BASE = {
  '--color-text': '#202122', '--color-text-muted': '#54595d', '--color-text-faint': '#72777d',
  '--color-page': '#f8f9fa', '--color-surface': '#ffffff', '--color-surface-muted': '#f8f9fa',
  '--color-border': '#c8ccd1', '--color-border-strong': '#a2a9b1', '--color-border-faint': '#eaecf0',
  '--color-on-accent': '#ffffff', '--shadow-raised': '0 2px 4px rgba(0, 0, 0, 0.2)',
  '--ui-font': 'Arial, Helvetica, sans-serif', '--ui-link': '#0645ad',
};

/** The CSS custom properties for a look (also used by the settings preview). */
export function appearanceVars(look) {
  const vars = {};
  // With a theme, anything left as "the theme's" isn't set: the theme's tokens show.
  const usesThemeFont = look.theme && look.font === 'theme';
  const usesThemeAccent = look.theme && !look.accent;
  const usesThemeCorners = look.theme && look.corners === 'theme';
  if (!usesThemeFont) {
    const font = FONTS.find((f) => f.id === look.font) ?? FONTS[0];
    vars['--font-serif'] = font.heading;
    vars['--font-sans'] = font.body;
  }
  if (!usesThemeAccent) {
    const accent = look.accent || DEFAULT_APPEARANCE.accent;
    // On a dark theme, tints mix toward the page instead of white.
    const light = look.theme ? 'var(--color-surface)' : '#fff';
    Object.assign(vars, {
      '--color-accent': accent,
      '--color-link': look.theme ? accent : `color-mix(in srgb, ${accent} 80%, #000)`,
      '--color-accent-hover': `color-mix(in srgb, ${accent} 75%, #000)`,
      '--color-accent-soft': `color-mix(in srgb, ${accent} 10%, ${light})`,
      '--color-accent-border': `color-mix(in srgb, ${accent} 35%, ${light})`,
    });
  }
  if (!usesThemeCorners) vars['--radius'] = look.corners === 'rounded' ? '8px' : '2px';
  return vars;
}

export function backgroundCss(look) {
  if (look.background === 'theme') return 'var(--color-page)';
  if (look.background === 'custom') return look.backgroundColor;
  return (BACKGROUNDS.find((b) => b.id === look.background) ?? BACKGROUNDS[0]).css;
}

/** Inline styles for a cover banner, or null when there's no cover. */
export function coverStyle(cover) {
  if (cover.kind === 'image' && cover.image) {
    return { backgroundImage: `url("${cover.image}")`, backgroundSize: 'cover', backgroundPosition: `center ${cover.focus}%` };
  }
  if (cover.kind === 'preset') {
    const preset = COVER_PRESETS.find((p) => p.id === cover.preset) ?? COVER_PRESETS[0];
    return { background: preset.css, backgroundSize: preset.size ?? 'cover', backgroundPosition: preset.position ?? 'center' };
  }
  return null;
}


// ─── Cover photos ────────────────────────────────────────────────────────────

const COVER_MAX_WIDTH = 1600;
const COVER_JPEG_QUALITY = 0.82;

/**
 * Turn an uploaded image into a cover photo small enough to keep in the
 * browser's storage: at most 1600px wide, saved as a JPEG.
 * Resolves to a data URL.
 */
export function readCoverImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file isn’t an image.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, COVER_MAX_WIDTH / image.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', COVER_JPEG_QUALITY));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image couldn’t be opened.'));
    };
    image.src = url;
  });
}
