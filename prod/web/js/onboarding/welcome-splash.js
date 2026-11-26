// @ts-check
/**
 * welcome-splash.js — the first thing a new account sees: the page's own
 * background, "Welcome to 3den" (the onboarding board's E1; "Welcome back" until Nov 21), and a small drawing of an apple
 * hanging on a tree. After two seconds it fades away, leaving them on their
 * homepage (it replaced "What brought you here?" on Nov 15).
 *
 *   showWelcomeSplash()   draws it over the page; it takes itself away
 *
 * Clicking it or pressing a key ends it early. With "reduce motion" on, it
 * goes without the fade.
 */

import { h } from '../ui/dom.js';

const SHOW_MS = 2000;
const FADE_MS = 600;
const SVG = 'http://www.w3.org/2000/svg';

/** A tree with one apple hanging from a branch, in a few flat shapes. */
function appleTree() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('class', 'welcome-splash__tree');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <path d="M96 196 L98 128 Q98 116 90 106 M98 128 Q104 112 116 104" fill="none" stroke="var(--splash-trunk)" stroke-width="9" stroke-linecap="round"/>
    <circle cx="70" cy="78" r="34" fill="var(--splash-leaves)"/>
    <circle cx="104" cy="56" r="40" fill="var(--splash-leaves)"/>
    <circle cx="138" cy="82" r="32" fill="var(--splash-leaves)"/>
    <circle cx="102" cy="96" r="30" fill="var(--splash-leaves)"/>
    <path d="M136 104 Q146 112 148 124" fill="none" stroke="var(--splash-trunk)" stroke-width="3" stroke-linecap="round"/>
    <line x1="148" y1="124" x2="148" y2="134" stroke="var(--splash-trunk)" stroke-width="2" stroke-linecap="round"/>
    <path d="M148 130 Q156 124 160 128 Q154 134 148 130 Z" fill="var(--splash-leaves)"/>
    <path d="M148 136 C140 130 130 136 131 147 C132 158 140 164 148 160 C156 164 164 158 165 147 C166 136 156 130 148 136 Z" fill="var(--splash-apple)"/>
    <ellipse cx="141" cy="145" rx="3" ry="5" fill="#ffffff" opacity="0.35"/>`;
  return svg;
}

export function showWelcomeSplash() {
  document.querySelector('.welcome-splash')?.remove();
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const splash = h('div', { class: 'welcome-splash', role: 'status', 'aria-live': 'polite' },
    appleTree(),
    h('p', { class: 'welcome-splash__text' }, 'Welcome to 3den'));
  let done = false;
  function finish() {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', finish);
    if (reduce) { splash.remove(); return; }
    splash.classList.add('is-leaving');
    setTimeout(() => splash.remove(), FADE_MS);
  }
  splash.addEventListener('click', finish);
  window.addEventListener('keydown', finish);
  document.body.append(splash);
  setTimeout(finish, SHOW_MS);
}
