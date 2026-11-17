// @ts-check
/**
 * search-box.js — the search box in the top bar, right of Messages.
 *
 *   [🔍 Search 3den…            ] [Everything ▾]
 *   ┌──────────────────────────────────────────┐
 *   │ ON THIS PAGE · 237 Hart Street           │
 *   │   Fix the sink    House to-do · …        │
 *   │ PEOPLE                                   │
 *   │   (RP) Rosa P     @rosa · Garden coord…  │
 *   │ GROUPS                                   │
 *   │   Elm St Community Garden  You're a member│
 *   │ EVENTS                                   │
 *   │   Seed swap       Sun, Nov 29 · …        │
 *   └──────────────────────────────────────────┘
 *
 * The menu next to it narrows the search: Everything, People, Groups,
 * Events, or This page (the homepage, blog or module you're on).
 * ↑ ↓ move through results, Enter opens one, Esc closes. Results come
 * from js/state/search.js.
 *
 * It lives in its own spot in the top bar (not inside app-bar.js's
 * redrawn parts) so a new message arriving doesn't wipe what you typed.
 */

import { h, replaceChildren, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { getCurrentSpace, getCurrentUser, getSpaceOfModule, subscribe } from '../state/store.js';
import { searchPeople, searchGroups, searchEvents, searchSpace } from '../state/search.js';
import { requestModuleFocus } from './module-context.js';
import { getRoute, goTo, openModulePage } from '../router.js';
import { groupInitials } from '../utils/initials.js';
import { openDirectConversation } from '../state/messages.js';
import { searchHref, getSavedSearches } from '../search/search-page.js';
import { matchPlaces } from './jump.js';

const SCOPES = [
  { id: 'all', label: 'Everything' },
  { id: 'page', label: 'This page' },
  { id: 'people', label: 'People' },
  { id: 'groups', label: 'Groups' },
  { id: 'events', label: 'Events' },
  { id: 'advanced', label: 'Advanced search…' }, // goes to #search (js/search/search-page.js)
];
const SEARCH_DELAY_MS = 120;
const PAGE_RESULTS_IN_EVERYTHING = 4;

export function initSearchBox(container) {
  let scope = 'all';
  let results = [];
  let activeIndex = -1;

  const input = h('input', {
    type: 'search',
    class: 'app-search__input',
    placeholder: 'Search or jump to…',
    title: 'Search 3den, or jump to a page. Ctrl+K opens Jump from anywhere.',
    'aria-label': 'Search',
    autocomplete: 'off',
    role: 'combobox',
    'aria-expanded': 'false',
    'aria-controls': 'app-search-results',
    onInput: debounce(() => run(), SEARCH_DELAY_MS),
    onFocus: () => { if (input.value.trim()) run(); else showSaved(); },
    onKeydown: handleKeydown,
  });
  const scopeSelect = h('select', {
    class: 'app-search__scope',
    'aria-label': 'Search in',
    onChange: (event) => {
      if (event.target.value === 'advanced') {
        event.target.value = scope;
        close();
        goTo(searchHref(input.value.trim()));
        return;
      }
      scope = event.target.value; run(); input.focus();
    },
  }, SCOPES.map((s) => h('option', { value: s.id }, s.label)));
  const panel = h('div', { class: 'app-search__results', id: 'app-search-results', role: 'listbox', hidden: true });

  const box = h('div', { class: 'app-search', role: 'search' },
    h('label', { class: 'app-search__field' }, icon('search', 15), input),
    scopeSelect,
    panel);

  // ─── Searching ─────────────────────────────────────────────────────────────

  /** The space "This page" means: the homepage, blog or module page showing. */
  function pageSpace() {
    const route = getRoute();
    if (route.page === 'module') return getSpaceOfModule(route.moduleId);
    if (route.page === 'home') return getCurrentSpace();
    return null;
  }

  function run() {
    const query = input.value.trim();
    if (!query) { close(); return; }
    const space = pageSpace();
    const sections = [];
    const want = (kind) => scope === 'all' || scope === kind;
    // In "Everything", a few page results leave room for people, groups and events.
    const pageLimit = scope === 'page' ? Infinity : PAGE_RESULTS_IN_EVERYTHING;
    // Places to go ("settings", "porch lights to-do") come first: on a phone
    // this is how you jump around, since there's no Ctrl+K.
    if (scope === 'all') {
      const places = matchPlaces(query).filter((p) => p.detail !== 'Group').slice(0, 3)
        .map((p) => ({ kind: 'place', id: p.href ?? p.title, title: p.title, detail: p.detail, href: p.href, run: p.run, placeIcon: p.icon }));
      if (places.length) sections.push({ title: 'Go to', items: places });
    }
    if (want('page') && space) sections.push({ title: `On this page · ${space.kind === 'personal' ? 'your homepage' : space.name}`, items: searchSpace(space, query).slice(0, pageLimit) });
    if (want('people')) sections.push({ title: 'People', items: searchPeople(query) });
    if (want('groups')) sections.push({ title: 'Groups', items: searchGroups(query) });
    if (want('events')) sections.push({ title: 'Events', items: searchEvents(query) });
    if (scope === 'page' && !space) sections.push({ title: 'This page', items: [], empty: 'There’s nothing to search on this page. Try Everything.' });

    results = sections.flatMap((section) => section.items);
    activeIndex = results.length ? 0 : -1;
    draw(sections, query);
  }

  /** Nothing typed yet: saved searches, if there are any. */
  function showSaved() {
    const me = getCurrentUser();
    const saved = me ? getSavedSearches(me.id) : [];
    if (!saved.length) return;
    results = saved.map((s) => ({ kind: 'saved', id: s.id, title: s.name, detail: 'Saved search', href: searchHref(s.query, { sort: s.sort }) }));
    activeIndex = -1;
    draw([{ title: 'Saved searches', items: results }], '');
  }

  function draw(sections, query) {
    let index = -1;
    const shown = sections.filter((section) => section.items.length || section.empty);
    const advanced = h('a', {
      class: 'app-search__advanced',
      href: searchHref(query),
      onMousedown: (event) => event.preventDefault(),
      onClick: (event) => { event.preventDefault(); close(); input.blur(); goTo(searchHref(query)); },
    }, icon('settings', 13), query ? ` Advanced search for “${query}” →` : ' Advanced search →');
    replaceChildren(panel,
      shown.length === 0 ? h('p', { class: 'app-search__empty' }, `Nothing found for “${query}”.`) : null,
      shown.map((section) => h('section', { class: 'app-search__section' },
        h('h3', { class: 'app-search__heading' }, section.title),
        section.empty ? h('p', { class: 'app-search__empty' }, section.empty) : null,
        section.items.map((result) => {
          index += 1;
          const myIndex = index;
          return h('a', {
            href: result.href ?? '#messages',
            role: 'option',
            id: `search-result-${myIndex}`,
            class: `app-search__result${myIndex === activeIndex ? ' is-active' : ''}`,
            'aria-selected': String(myIndex === activeIndex),
            onMousedown: (event) => event.preventDefault(), // keep focus until the click lands
            onClick: (event) => { event.preventDefault(); open(result); },
            onMouseenter: () => setActive(myIndex),
          },
            resultIcon(result),
            h('span', { class: 'app-search__text' },
              h('span', { class: 'app-search__title' }, result.title),
              result.detail ? h('span', { class: 'app-search__detail' }, result.detail) : null));
        }))),
      advanced,
    );
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', activeIndex >= 0 ? `search-result-${activeIndex}` : '');
  }

  function resultIcon(result) {
    if (result.kind === 'person') return avatar(result.member, 24);
    if (result.kind === 'group') return h('span', { class: 'groups-menu__badge app-search__badge' }, groupInitials(result.title));
    if (result.kind === 'place') return h('span', { class: 'app-search__icon' }, icon(result.placeIcon, 15));
    const iconName = { event: 'calendar', module: 'expand', item: 'file', saved: 'flag' }[result.kind] ?? 'search';
    return h('span', { class: 'app-search__icon' }, icon(iconName, 15));
  }

  function setActive(index) {
    activeIndex = index;
    panel.querySelectorAll('.app-search__result').forEach((el, i) => {
      el.classList.toggle('is-active', i === index);
      el.setAttribute('aria-selected', String(i === index));
    });
    panel.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', index >= 0 ? `search-result-${index}` : '');
  }

  function open(result) {
    close();
    input.blur();
    if (result.run) {
      result.run();
    } else if (result.messageId) {
      goTo(`#messages-${openDirectConversation(getCurrentUser().id, result.messageId).id}`);
    } else if (result.moduleId) {
      if (result.itemId) requestModuleFocus(result.moduleId, result.itemId);
      openModulePage(result.moduleId);
    } else {
      goTo(result.href);
    }
  }

  function close() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') { close(); input.select(); return; }
    // Enter with nothing picked: see everything in Advanced search.
    if (event.key === 'Enter' && input.value.trim() && (panel.hidden || activeIndex < 0 || results.length === 0)) {
      event.preventDefault();
      close();
      input.blur();
      goTo(searchHref(input.value.trim()));
      return;
    }
    if (panel.hidden || results.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      open(results[activeIndex]);
    }
  }

  input.addEventListener('blur', () => setTimeout(close, 150));

  // Signed out: no search.
  const sync = () => { box.hidden = !getCurrentUser(); };
  subscribe('account', sync);
  sync();

  container.append(box);
}
