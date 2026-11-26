// @ts-check
/**
 * jump.js — Ctrl+K (⌘K on a Mac) jumps anywhere.
 *
 *   ┌────────────────────────────────────────────────┐
 *   │ 🔍 Jump to…  porch                             │
 *   ├────────────────────────────────────────────────┤
 *   │ ▸ Porch Lights               Group             │
 *   │   Set list · Porch Lights    Module            │
 *   │   Porch Lights settings      Settings          │
 *   │   Rehearsal                  Thu, Nov 19 · …   │
 *   └────────────────────────────────────────────────┘
 *
 * Every place you can go (your groups, their tabs and modules, the Feed,
 * Messages, each part of Account, settings you can change), a few things
 * to make ("New event"), plus people and events. With nothing typed it
 * shows where you've been lately. ↑ ↓ to move, Enter to go, Esc to close.
 *
 * Phones have no keyboard shortcut, so the same places also come up in the
 * search box (search-box.js uses `matchPlaces`).
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getCurrentUser, getSpaces, getTabs, getBlogOf, isGuestBrowsing } from '../state/store.js';
import { can } from '../state/permissions.js';
import { searchPeople, searchEvents } from '../state/search.js';
import { getRecents } from '../state/recents.js';
import { getModuleType } from '../modules/registry.js';
import { goTo, spaceHref, settingsHref } from '../router.js';
import { ACCOUNT_SECTIONS } from '../account/account-page.js';
import { openQuickCreate } from './quick-create.js';

const MAX_RESULTS = 9;

/**
 * Every place the signed-in person can go, as
 * { title, detail, href?, run?, icon, words }.
 */
export function jumpPlaces() {
  const me = getCurrentUser();
  if (!me || me.isGuest) return [];
  const places = [
    { title: 'Home', detail: 'Your homepage', href: '#', icon: 'home', words: 'start my homepage dashboard' },
    { title: 'Feed', detail: 'Page', href: '#feed', icon: 'heart', words: 'news posts friends' },
    { title: 'Friends', detail: 'Page', href: '#feed-friends', icon: 'people', words: 'requests people' },
    { title: 'Groups', detail: 'Page', href: '#groups', icon: 'people', words: 'my groups list' },
    { title: 'Explore groups', detail: 'Page', href: '#groups-explore', icon: 'compass', words: 'find join discover public' },
    { title: 'Messages', detail: 'Page', href: '#messages', icon: 'chat', words: 'inbox chat dm' },
    { title: 'Saved', detail: 'Page', href: '#saved', icon: 'bookmark', words: 'bookmarks later' },
    { title: 'Your week', detail: 'Page', href: '#week', icon: 'calendar', words: 'week sunday coming up summary' },
    { title: 'Bring your people', detail: 'Page', href: '#bring', icon: 'people', words: 'invite friends contacts whatsapp group chat import' },
    { title: 'Help', detail: 'Page', href: '#help', icon: 'help', words: 'questions how faq support' },
    ...ACCOUNT_SECTIONS.map((s) => ({ title: `Account: ${s.label}`, detail: 'Your settings', href: `#account-${s.id}`, icon: 'settings', words: `settings preferences ${s.id}` })),
    { title: 'Download or delete my data', detail: 'Your settings', href: '#account-data', icon: 'settings', words: 'export privacy delete account' },
    { title: 'New event', detail: 'Make', run: () => goTo('#new-event'), icon: 'plus', words: 'create plan event' },
    { title: 'New post', detail: 'Make', run: () => openQuickCreate('post'), icon: 'plus', words: 'create write post' },
    { title: 'New task', detail: 'Make', run: () => openQuickCreate('task'), icon: 'plus', words: 'create todo task' },
    { title: 'New message', detail: 'Make', run: () => openQuickCreate('message'), icon: 'plus', words: 'create send message' },
    { title: 'New group', detail: 'Make', href: '#new-group', icon: 'plus', words: 'create start group' },
  ];
  const blog = getBlogOf(me.id);
  if (blog) places.push({ title: 'Your blog', detail: 'Blog', href: `#blog-${me.username}`, icon: 'pencil', words: 'blog profile posts' });

  for (const space of getSpaces()) {
    if (!space.memberIds.includes(me.id) || space.kind === 'blog') continue;
    const where = space.kind === 'personal' ? 'Your homepage' : space.name;
    if (space.kind === 'group') {
      places.push({ title: space.name, detail: 'Group', href: spaceHref(space.id), icon: 'people', words: `${space.groupType ?? ''} ${space.description ?? ''}` });
      if (can(space, me.id, 'editDetails')) places.push({ title: `${space.name} settings`, detail: 'Settings', href: settingsHref(space.id), icon: 'settings', words: 'settings members roles' });
    }
    for (const tab of getTabs(space).slice(1)) {
      places.push({ title: `${tab.name} · ${where}`, detail: 'Tab', href: spaceHref(space.id, tab.id), icon: 'dashboard', words: '' });
    }
    for (const module of space.modules) {
      let type = null;
      try { type = getModuleType(module.type); } catch { /* an old module type */ }
      if (!type?.renderFullPage) continue;
      places.push({ title: `${module.title} · ${where}`, detail: type.label, href: `#module-${module.id}`, icon: type.icon ?? 'dashboard', words: type.label });
    }
  }
  return places;
}

/** Places whose words all start a word in the title, detail, or keywords; best first. */
export function matchPlaces(query, places = jumpPlaces()) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  for (const place of places) {
    const title = place.title.toLowerCase();
    const haystack = ` ${title} ${place.detail.toLowerCase()} ${place.words.toLowerCase()}`.replace(/[^\p{L}\p{N}]+/gu, ' ');
    if (!words.every((w) => haystack.includes(` ${w}`))) continue;
    const score = (title.startsWith(words[0]) ? 0 : 2) + (` ${title}`.includes(` ${words[0]}`) ? 0 : 1) + title.length / 200;
    scored.push({ place, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.place);
}

let dialog = null;
let previousFocus = null;

export function initJump() {
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      // In a text editor, Ctrl+K adds a link instead.
      if (/** @type {HTMLElement} */ (event.target).closest?.('[contenteditable="true"]')) return;
      if (isGuestBrowsing() || getCurrentUser()?.isGuest) return;
      event.preventDefault();
      if (dialog) closeJump(); else openJump();
    }
  });
}

export function openJump() {
  if (dialog) return;
  previousFocus = /** @type {HTMLElement | null} */ (document.activeElement);
  const places = jumpPlaces();
  let results = [];
  let active = 0;

  const input = /** @type {HTMLInputElement} */ (h('input', {
    class: 'jump__input', type: 'text', placeholder: 'Jump to a group, page, person, or event…',
    'aria-label': 'Jump to', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'jump-results', autocomplete: 'off',
  }));
  const list = h('ul', { class: 'jump__results', id: 'jump-results', role: 'listbox', 'aria-label': 'Places' });

  const go = (result) => {
    closeJump({ restoreFocus: false });
    if (result.run) result.run(); else goTo(result.href);
  };

  const draw = () => {
    const q = input.value.trim();
    if (!q) {
      const me = getCurrentUser();
      results = getRecents(me.id).slice(0, 6).map((r) => ({ title: r.title, detail: r.detail, href: r.href, icon: 'clock' }));
      if (!results.length) results = places.slice(0, 6);
    } else {
      const people = searchPeople(q).filter((p) => p.href).slice(0, 2).map((p) => ({ title: p.title, detail: `@${p.member.username}`, href: p.href, icon: 'user' }));
      const events = searchEvents(q).slice(0, 2).map((e) => ({ title: e.title, detail: e.detail, href: e.href, icon: 'calendar' }));
      results = [...matchPlaces(q, places).slice(0, MAX_RESULTS - people.length - events.length), ...people, ...events];
    }
    active = Math.min(active, Math.max(0, results.length - 1));
    replaceChildren(list, results.length
      ? results.map((r, i) => h('li', {
          id: `jump-${i}`, role: 'option', class: `jump__result${i === active ? ' is-active' : ''}`, 'aria-selected': String(i === active),
          onClick: () => go(r), onMouseMove: () => { if (active !== i) { active = i; draw(); } },
        },
        h('span', { class: 'jump__icon', 'aria-hidden': 'true' }, icon(r.icon, 15)),
        h('span', { class: 'jump__title' }, r.title),
        h('span', { class: 'jump__detail' }, r.detail)))
      : h('li', { class: 'jump__empty' }, `Nothing called “${q}”. Try the search page for posts and messages.`));
    input.setAttribute('aria-activedescendant', results.length ? `jump-${active}` : '');
  };

  input.addEventListener('input', () => { active = 0; draw(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); active = (active + 1) % Math.max(1, results.length); draw(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); active = (active - 1 + results.length) % Math.max(1, results.length); draw(); }
    else if (event.key === 'Enter' && results[active]) { event.preventDefault(); go(results[active]); }
    else if (event.key === 'Escape') { event.preventDefault(); closeJump(); }
  });

  dialog = h('div', { class: 'jump-backdrop', onClick: (event) => { if (event.target === dialog) closeJump(); } },
    h('div', { class: 'jump', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Jump to' },
      h('div', { class: 'jump__bar' }, icon('search', 16), input, h('kbd', { class: 'jump__kbd' }, 'Esc')),
      list,
      h('p', { class: 'jump__foot' }, '↑ ↓ to move · Enter to go · Ctrl+K anytime')));
  document.body.append(dialog);
  draw();
  input.focus();
}

export function closeJump({ restoreFocus = true } = {}) {
  dialog?.remove();
  dialog = null;
  if (restoreFocus) previousFocus?.focus?.();
}
