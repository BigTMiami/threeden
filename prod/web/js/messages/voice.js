// @ts-check
/**
 * voice.js — voice notes and files in messages.
 *
 *   recordVoice()            → a recorder: start(), stop() → { src, duration } | null
 *   renderVoice(attachment)  → ▶ ▂▅▇▃▆▂▅▃  0:04   (a play button, bars, the length)
 *   renderFile(attachment)   → 📎 budget.xlsx · 18 KB   [Download]
 *   readFileAttachment(file) → { kind: 'file', name, size, type, src } (up to MAX_FILE_BYTES)
 *
 * A voice note is recorded with the microphone (MediaRecorder) and saved as
 * a data URL, like photos. The sample voice notes have no recording: they
 * play a short generated tone instead (attachment.demo), so the player can
 * be tried without a microphone.
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

export const MAX_VOICE_SECONDS = 120;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The microphone recorder. start() asks for the microphone; it rejects if there isn't one or it's refused. */
export function recordVoice() {
  let recorder = null;
  let chunks = [];
  let startedAt = 0;
  let stream = null;
  return {
    async start() {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('unsupported');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.start();
      startedAt = Date.now();
    },
    elapsed: () => (startedAt ? (Date.now() - startedAt) / 1000 : 0),
    stop(keep = true) {
      return new Promise((resolve) => {
        if (!recorder) { resolve(null); return; }
        recorder.onstop = () => {
          stream?.getTracks().forEach((t) => t.stop());
          const duration = (Date.now() - startedAt) / 1000;
          if (!keep || !chunks.length) { resolve(null); return; }
          const reader = new FileReader();
          reader.onload = () => resolve({ src: reader.result, duration });
          reader.readAsDataURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
        };
        recorder.stop();
      });
    },
  };
}

/** A soft two-note tone as a WAV blob URL, for the sample voice notes. */
const toneCache = new Map();
function demoTone(seconds) {
  if (toneCache.has(seconds)) return toneCache.get(seconds);
  const rate = 8000;
  const n = Math.round(rate * seconds);
  const buffer = new ArrayBuffer(44 + n);
  const v = new DataView(buffer);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const f = (Math.floor(t * 2) % 2) ? 392 : 330;
    const env = Math.min(1, t * 8, (seconds - t) * 8) * (0.5 + 0.5 * Math.sin(t * 9));
    v.setUint8(44 + i, 128 + Math.round(40 * env * Math.sin(2 * Math.PI * f * t)));
  }
  const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  toneCache.set(seconds, url);
  return url;
}

/** Bars that look like a waveform, the same every time for the same note. */
function bars(seed, count = 28) {
  let x = [...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 7);
  return Array.from({ length: count }, () => { x = (x * 9301 + 49297) % 233280; return 25 + Math.round((x / 233280) * 75); });
}

export function renderVoice(attachment, key = '') {
  const audio = new Audio();
  audio.preload = 'none';
  const play = h('button', { type: 'button', class: 'voice__play', 'aria-label': 'Play voice note' }, icon('play', 16));
  const wave = h('span', { class: 'voice__wave', 'aria-hidden': 'true' }, bars(key || attachment.duration).map((pct) => h('span', { style: { height: `${pct}%` } })));
  const time = h('span', { class: 'voice__time' }, formatDuration(attachment.duration));
  const paint = () => {
    const frac = audio.duration ? audio.currentTime / audio.duration : 0;
    [...wave.children].forEach((bar, i) => bar.classList.toggle('is-played', i / wave.children.length < frac));
    time.textContent = formatDuration(audio.paused && !audio.currentTime ? attachment.duration : audio.currentTime);
  };
  audio.addEventListener('timeupdate', paint);
  audio.addEventListener('ended', () => { audio.currentTime = 0; replaceIcon('play'); paint(); });
  function replaceIcon(name) { play.replaceChildren(icon(name, 16)); play.setAttribute('aria-label', name === 'play' ? 'Play voice note' : 'Pause voice note'); }
  play.addEventListener('click', () => {
    if (!audio.src) audio.src = attachment.demo ? demoTone(Math.max(1, Math.round(attachment.duration))) : attachment.src;
    if (audio.paused) { audio.play().catch(() => {}); replaceIcon('stop'); } else { audio.pause(); replaceIcon('play'); }
  });
  return h('div', { class: 'attachment voice', role: 'group', 'aria-label': `Voice note, ${formatDuration(attachment.duration)}` }, play, wave, time);
}

export function renderFile(attachment) {
  return h('div', { class: 'attachment file-card' },
    h('span', { class: 'file-card__icon', 'aria-hidden': 'true' }, icon('paperclip', 18)),
    h('span', { class: 'file-card__text' },
      h('strong', { class: 'file-card__name' }, attachment.name),
      h('span', { class: 'file-card__meta' }, formatBytes(attachment.size ?? 0))),
    attachment.src
      ? h('a', { class: 'button button--small', href: attachment.src, download: attachment.name }, icon('download', 13), ' Download')
      : h('span', { class: 'file-card__meta' }, 'Sample file'));
}

export function readFileAttachment(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_BYTES) { reject(new Error('too-big')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ kind: 'file', name: file.name, size: file.size, type: file.type, src: reader.result });
    reader.onerror = () => reject(new Error('unreadable'));
    reader.readAsDataURL(file);
  });
}
