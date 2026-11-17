/**
 * share-card.js — a picture to post on Instagram (or anywhere) for an event
 * or a group's public page, drawn in the browser.
 *
 *   openShareCard({ kind: 'event' | 'group', title, emoji, color, lines: ['Sat, Nov 21 · 9pm', 'Alphaville, Bushwick'],
 *                   byline: 'Paper Lanterns', link, cover })   ← cover: an event's cover photo, behind the card
 *
 * Opens a dialog with the picture (1080 × 1350, Instagram's portrait size),
 * a Download button (a PNG), and Copy link. The link is the event or the
 * group's link-in-bio page, so a story or bio can point people straight to it.
 */

import { h } from './dom.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';

const WIDTH = 1080;
const HEIGHT = 1350;

/** Wrap words onto lines that fit `maxWidth` (at most `maxLines`, the last one with "…"). */
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s+\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

export function drawShareCard({ title, emoji = '✨', color = '#3366cc', lines = [], byline = '', link = '', photo = null, focus = 50 }) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  // Background: the event's color, fading darker toward the bottom.
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, '#111111');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // An event's cover photo fills the background instead, darkened so the
  // footer stays readable, and takes the emoji's place.
  if (photo) {
    const scale = Math.max(WIDTH / photo.naturalWidth, HEIGHT / photo.naturalHeight);
    const w = photo.naturalWidth * scale;
    const h2 = photo.naturalHeight * scale;
    ctx.drawImage(photo, (WIDTH - w) / 2, (HEIGHT - h2) * (focus / 100), w, h2);
    const shade = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    shade.addColorStop(0, 'rgba(0,0,0,0.05)');
    shade.addColorStop(0.6, 'rgba(0,0,0,0.25)');
    shade.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // A soft white card.
  const pad = 80;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  const cardTop = 300;
  roundRect(ctx, pad, cardTop, WIDTH - pad * 2, HEIGHT - cardTop - 220, 48);
  ctx.fill();

  ctx.textBaseline = 'alphabetic';
  ctx.font = '180px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  if (!photo) ctx.fillText(emoji, WIDTH / 2, 250);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 84px Georgia, "Times New Roman", serif';
  let y = cardTop + 140;
  for (const line of wrap(ctx, title, WIDTH - pad * 2 - 120, 3)) { ctx.fillText(line, pad + 60, y); y += 96; }

  y += 20;
  ctx.font = '46px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = '#333333';
  for (const text of lines.filter(Boolean)) {
    for (const line of wrap(ctx, text, WIDTH - pad * 2 - 120, 2)) { ctx.fillText(line, pad + 60, y); y += 62; }
    y += 10;
  }
  if (byline) {
    ctx.font = 'italic 40px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = '#666666';
    ctx.fillText(byline, pad + 60, Math.min(y + 30, HEIGHT - 300));
  }

  // Footer: where to RSVP.
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 48px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText('RSVP on 3den', WIDTH / 2, HEIGHT - 130);
  ctx.font = '34px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText(link.replace(/^https?:\/\//, '').slice(0, 60), WIDTH / 2, HEIGHT - 80);
  return canvas;
}

function roundRect(ctx, x, y, w, h2, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h2, r);
  ctx.arcTo(x + w, y + h2, x, y + h2, r);
  ctx.arcTo(x, y + h2, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Open the share card. `options.cover` (an event's { image, focus }) puts
 * its photo behind the card; the photo is loaded first.
 */
export function openShareCard(options) {
  if (!options.cover?.image) { showCard(options); return; }
  const photo = new Image();
  photo.onload = () => showCard({ ...options, photo, focus: options.cover.y ?? options.cover.focus ?? 50 });
  photo.onerror = () => showCard(options);
  photo.src = options.cover.image;
}

function showCard(options) {
  const previousFocus = document.activeElement;
  const canvas = drawShareCard(options);
  const src = canvas.toDataURL('image/png');
  const filename = `${options.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || '3den'}.png`;

  const overlay = h('div', { class: 'sub-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Share card' },
    h('div', { class: 'sub-viewer__panel share-card' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, icon('image', 18), ' Share card'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => close() }, icon('close', 18))),
      h('img', { class: 'share-card__image', src, alt: `A picture for “${options.title}”, ready to post` }),
      h('p', { class: 'settings-field__hint' }, 'Sized for an Instagram post or story. Put the link in your bio or story so people can RSVP.'),
      h('div', { class: 'form-row form-row--end' },
        h('button', {
          type: 'button', class: 'button',
          onClick: async () => {
            try { await navigator.clipboard.writeText(options.link); showToast('Link copied.'); } catch { showToast(options.link); }
          },
        }, icon('link', 14), ' Copy link'),
        h('a', { class: 'button button--primary', href: src, download: filename }, icon('upload', 14), ' Download image'))));

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    previousFocus?.focus?.();
  }
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  overlay.querySelector('button')?.focus();
}
