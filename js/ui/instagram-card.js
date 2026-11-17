/**
 * instagram-card.js — turn a photo post into an image sized for Instagram
 * (1080 × 1350, the 4:5 portrait size), to post there yourself.
 *
 *   ┌──────────────────┐
 *   │                  │
 *   │     the photo    │   (fills the square, cropped from the middle)
 *   │                  │
 *   ├──────────────────┤
 *   │ “Caption, up to  │
 *   │  three lines…”   │
 *   │ @leo · on 3den   │
 *   └──────────────────┘
 *
 *   openInstagramCard({ src, caption, author })
 *
 * 3den doesn't post to Instagram for you: this makes the picture and copies
 * the caption, and you post it. The card says where it came from, so people
 * can find the rest on 3den. Nothing about who liked or commented goes on it.
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';

const W = 1080;
const H = 1350;
const PHOTO_H = 1080;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Wrap text into lines that fit `maxWidth`, at most `maxLines` (the last gets "…"). */
function wrap(ctx, text, maxWidth, maxLines) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) { line = next; continue; }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

/** Draw the card; resolves to the canvas. */
export async function drawInstagramCard({ src, caption, author, accent = '#2f5bd3' }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fbfaf7';
  ctx.fillRect(0, 0, W, H);
  const img = await loadImage(src);
  const scale = Math.max(W / img.width, PHOTO_H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, PHOTO_H);
  ctx.clip(); // the photo stays in its square
  ctx.drawImage(img, (W - dw) / 2, (PHOTO_H - dh) / 2, dw, dh);
  ctx.restore();
  ctx.fillStyle = accent;
  ctx.fillRect(0, PHOTO_H, W, 8);
  ctx.fillStyle = '#1d1f23';
  ctx.font = '500 40px system-ui, -apple-system, "Segoe UI", sans-serif';
  const clean = (caption ?? '').replace(/#\w+/g, '').trim();
  const lines = clean ? wrap(ctx, clean, W - 120, 3) : [];
  lines.forEach((l, i) => ctx.fillText(l, 60, PHOTO_H + 74 + i * 52));
  ctx.fillStyle = '#5f6670';
  ctx.font = '500 32px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.fillText(`@${author?.username ?? 'someone'} · on 3den`, 60, H - 44);
  ctx.font = '600 44px Georgia, "Times New Roman", serif';
  ctx.fillStyle = '#1d1f23';
  const mark = '3den';
  ctx.fillText(mark, W - 60 - ctx.measureText(mark).width, H - 40);
  return canvas;
}

export function openInstagramCard({ src, caption = '', author }) {
  const previousFocus = document.activeElement;
  const preview = h('div', { class: 'ig-card__preview' }, h('p', { class: 'event-details__muted' }, 'Making the picture…'));
  let url = null;
  const download = h('a', { class: 'button button--primary', download: `3den-${author?.username ?? 'post'}.png`, 'aria-disabled': 'true' }, icon('download', 14), ' Download image');
  const copy = h('button', {
    type: 'button', class: 'button',
    onClick: async () => {
      const text = `${caption}${caption ? '\n\n' : ''}Also on 3den: @${author?.username ?? ''}`;
      try { await navigator.clipboard.writeText(text); showToast('Caption copied. Paste it when you post.'); } catch { showToast('Couldn’t copy. Select the caption and copy it yourself.'); }
    },
  }, icon('file', 14), ' Copy caption');
  const overlay = h('div', { class: 'sub-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Instagram card' },
    h('div', { class: 'sub-viewer__panel ig-card' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, 'Share to Instagram'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => close() }, icon('close', 18))),
      preview,
      h('p', { class: 'event-details__muted' }, 'Download the picture, then post it on Instagram with the caption. 3den doesn’t post for you or see your Instagram account.'),
      h('div', { class: 'form-row form-row--end' }, copy, download)));
  function close() {
    overlay.remove();
    if (url) URL.revokeObjectURL(url);
    document.removeEventListener('keydown', onKey, true);
    previousFocus?.focus?.();
  }
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  download.focus();

  drawInstagramCard({ src, caption, author, accent: getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || undefined })
    .then((canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png')))
    .then((blob) => {
      url = URL.createObjectURL(blob);
      download.href = url;
      download.removeAttribute('aria-disabled');
      replaceChildren(preview, h('img', { src: url, alt: 'The Instagram card: your photo with the caption underneath' }));
    })
    .catch(() => replaceChildren(preview, h('p', { class: 'form-error' }, 'Couldn’t make the picture from this photo.')));
}
