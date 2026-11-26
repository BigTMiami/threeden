/**
 * themes.js — the look of the whole app, picked in Account settings → Theme.
 *
 * Four themes: Daylight (soft rounded cards and DM Sans, in blue and gray;
 * the default, DEFAULT_THEME), Match my device (Daylight or Midnight,
 * following the device), Midnight (dark), and High contrast. The other 14
 * were cut on Nov 15 to keep 3den plain; anyone who had picked one gets
 * Daylight. css/tokens.css holds the base tokens; each theme overrides those
 * same tokens on <html>, so nothing else has to know about themes.
 * The "3den" wordmark never changes (it has its own --font-wordmark).
 *
 *   THEMES            [{ id, label, description, dark, swatch, vars, fonts }]
 *   themeOf(member)   → the theme id they picked (DEFAULT_THEME, 'daylight', if none)
 *   applyTheme(member)  put it on the page (main.js calls this on load and
 *                       whenever the account changes); 'auto' follows the
 *                       device's light or dark setting, live
 *   setTheme(memberId, id) / setThemeInGroups(memberId, on)
 *   themeWinsInGroups(member)  whether their theme replaces a group's own look
 *   PAGE_THEMES, showPageTheme(id)  a group's, blog's, or homepage's own theme
 *                       (Settings → Appearance → Theme), shown while you're on it
 *
 * <html> gets data-theme="<id>" (css/themes.css has a few extras per theme,
 * like Daylight's card edges) and data-dark for the dark ones. Fonts come
 * from Google Fonts when the theme is picked; each has a system fallback.
 */

import { changeState, getMember } from '../state/store.js';

const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

/** A theme's token overrides from its palette. */
function palette({
  page, surface, surfaceMuted = page, text, muted, faint = muted, border, borderStrong, borderFaint,
  accent, onAccent = '#ffffff', link = accent, head, body, radius = '2px', shadow, fontSize,
}) {
  const mix = (a, pct, b) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
  return {
    '--color-page': page,
    '--color-surface': surface,
    '--color-surface-muted': surfaceMuted,
    '--color-text': text,
    '--color-text-muted': muted,
    '--color-text-faint': faint,
    '--color-border': border,
    '--color-border-strong': borderStrong,
    '--color-border-faint': borderFaint,
    '--color-accent': accent,
    '--color-on-accent': onAccent,
    '--color-accent-hover': mix(accent, 82, text),
    '--color-accent-soft': mix(accent, 14, surface),
    '--color-accent-border': mix(accent, 40, surface),
    '--color-link': link,
    '--color-link-hover': mix(link, 75, text),
    '--ui-link': link,
    '--font-serif': head,
    '--font-sans': body,
    '--ui-font': body,
    '--radius': radius,
    ...(shadow ? { '--shadow-raised': shadow } : {}),
    ...(fontSize ? { '--font-size-body': fontSize.body, '--font-size-small': fontSize.small, '--font-size-large': fontSize.large } : {}),
  };
}
const gf = (families) => `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;

export const THEMES = [
  {
    // The default. Commons' friendly type and soft, rounded, floating cards,
    // in Encyclopedia's colors: white on pale gray, link blue, gray rules.
    id: 'daylight', label: 'Daylight', description: 'The 3den default: friendly type and soft rounded cards, in clear blue and gray.',
    dark: false, swatch: ['#f0f2f5', '#ffffff', '#2a56b8', '#16181a'],
    fonts: gf(['DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700']),
    vars: palette({
      // A step up in contrast from Encyclopedia's grays: darker text and rules, a deeper blue, a grayer page behind white cards.
      page: '#f0f2f5', surface: '#ffffff', surfaceMuted: '#f4f5f7', text: '#16181a', muted: '#40454a', faint: '#5c6166',
      border: '#c8cdd3', borderStrong: '#858c94', borderFaint: '#e0e3e7', accent: '#2a56b8', link: '#2a56b8',
      head: `'DM Sans', ${SANS}`, body: `'DM Sans', ${SANS}`, radius: '14px',
      shadow: '0 1px 2px rgba(22,24,26,0.08), 0 6px 20px rgba(22,24,26,0.09)',
    }),
  },
  {
    id: 'auto', label: 'Match my device', description: 'Daylight by day, Midnight when your device is in dark mode.',
    dark: null, swatch: ['#f6f7f9', '#16213a', '#3366cc', '#e6ebf5'], vars: {},
  },
  {
    id: 'midnight', label: 'Midnight', description: 'Deep blue and calm. Easy on the eyes at night.',
    dark: true, swatch: ['#0f1729', '#16213a', '#6ea8ff', '#e6ebf5'],
    vars: palette({
      page: '#0f1729', surface: '#16213a', surfaceMuted: '#1b2846', text: '#e6ebf5', muted: '#a5b0c6', faint: '#8e9ab3',
      border: '#26334f', borderStrong: '#3a4a70', borderFaint: '#1e2a45', accent: '#6ea8ff', onAccent: '#0b1220', link: '#8fbaff',
      head: SANS, body: SANS, radius: '8px', shadow: '0 8px 24px rgba(0,0,0,0.45)',
    }),
  },
  {
    id: 'contrast', label: 'High contrast', description: 'Black on white, bigger text, underlined links, strong outlines.',
    dark: false, swatch: ['#ffffff', '#ffffff', '#0000c8', '#000000'],
    vars: palette({
      page: '#ffffff', surface: '#ffffff', surfaceMuted: '#f2f2f2', text: '#000000', muted: '#1a1a1a', faint: '#2b2b2b',
      border: '#000000', borderStrong: '#000000', borderFaint: '#4d4d4d', accent: '#0000c8', link: '#0000c8',
      head: 'Arial, Helvetica, sans-serif', body: 'Arial, Helvetica, sans-serif', radius: '0px',
      fontSize: { body: '16px', small: '14px', large: '18px' },
    }),
  },
];

const AUTO_DARK = 'midnight';
const media = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : null;

/** What everyone sees until they pick another theme (signed out too). */
export const DEFAULT_THEME = 'daylight';

export const themeOf = (member) => (THEMES.some((t) => t.id === member?.theme) ? member.theme : DEFAULT_THEME);
export const themeWinsInGroups = (member) => Boolean(member?.themeInGroups);

/** The theme actually showing (for 'auto', light or dark by the device). */
export function resolvedTheme(member) {
  const id = themeOf(member);
  if (id !== 'auto') return THEMES.find((t) => t.id === id);
  return THEMES.find((t) => t.id === (media?.matches ? AUTO_DARK : DEFAULT_THEME));
}

const applied = { vars: [], member: null };
let pageThemeId = null; // a group's or blog's own theme, while you're on it

/** Put a theme's tokens on <html> (and load its fonts). */
function paint(theme) {
  const root = document.documentElement;
  for (const name of applied.vars) root.style.removeProperty(name);
  for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value);
  applied.vars = Object.keys(theme.vars);
  root.dataset.theme = theme.id;
  if (theme.dark) root.dataset.dark = ''; else delete root.dataset.dark;
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  loadThemeFonts(theme);
}

export function loadThemeFonts(theme) {
  if (theme?.fonts && !document.querySelector(`link[data-theme-font="${theme.id}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = theme.fonts;
    link.dataset.themeFont = theme.id;
    document.head.append(link);
  }
}

export function applyTheme(member) {
  applied.member = member;
  const root = document.documentElement;
  if (themeWinsInGroups(member)) root.dataset.themeEverywhere = ''; else delete root.dataset.themeEverywhere;
  // On a page with its own theme, that theme shows (unless they chose theirs everywhere).
  const page = pageThemeId && !themeWinsInGroups(member) ? THEMES.find((t) => t.id === pageThemeId) : null;
  paint(page ?? resolvedTheme(member));
}

/**
 * Themes a group, a blog, or a homepage can use for its own look (Settings →
 * Appearance → Theme). Everyone visiting sees it, top bar included, unless
 * they turned on "Use my theme everywhere" (Account settings → Theme).
 */
export const PAGE_THEMES = THEMES.filter((t) => t.id !== 'auto');

/** Show a page's own theme (an id), or go back to the person's own (null). js/groups/appearance.js calls this. */
export function showPageTheme(id) {
  const next = PAGE_THEMES.some((t) => t.id === id) ? id : null;
  if (next === pageThemeId) return;
  pageThemeId = next;
  applyTheme(applied.member);
}

// "Match my device": follow the switch while the page is open.
media?.addEventListener?.('change', () => { if (themeOf(applied.member) === 'auto') applyTheme(applied.member); });

export function setTheme(memberId, id) {
  changeState((state) => { state.members.find((m) => m.id === memberId).theme = id; }, 'account');
  applyTheme(getMember(memberId));
}

export function setThemeInGroups(memberId, on) {
  changeState((state) => { state.members.find((m) => m.id === memberId).themeInGroups = on; }, 'account');
  applyTheme(getMember(memberId));
}
