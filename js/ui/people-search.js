// @ts-check
/**
 * people-search.js — a "To" field: type a name or @username, pick people.
 *
 *   To  [(PN) Priya Nair ×] [(JW) Jamal W ×]  Search by name or @username
 *       ┌───────────────────────────────────────────────┐
 *       │ (GA) Grace Adeyemi   @grace · Friend          │  ← arrow keys or tap
 *       │ (GO) Grace Okafor    @graceo · Porch Lights   │
 *       └───────────────────────────────────────────────┘
 *
 * With nothing typed, focusing the box shows suggestions (people you
 * talked to lately, then friends). Results rank names that start with what
 * you typed first; every word you type has to match the name or username.
 * Chosen people become chips (× or Backspace removes them). With
 * `multiple: false` one chip replaces the box until it's removed.
 *
 * The results open in the page flow under the box, so a scrolling panel or
 * a phone screen can't cut them off.
 *
 *   const to = createPeopleSearch({
 *     people, suggestedIds, describe: (p) => 'Porch Lights',
 *     multiple: true, label: 'To', onChange: (ids) => …,
 *   });
 *   form.append(to.element);   to.getSelected();   to.focus();
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { avatar } from './avatar.js';

const MAX_RESULTS = 8;
let nextId = 0;

/**
 * @param {{
 *   people: Array<{ id: string, name: string, username?: string }>,
 *   suggestedIds?: string[],
 *   selectedIds?: string[],
 *   describe?: (person: any) => string | null,
 *   multiple?: boolean,
 *   label?: string,
 *   placeholder?: string,
 *   emptyHint?: string,
 *   onChange?: (ids: string[]) => void,
 * }} options
 */
export function createPeopleSearch({
  people, suggestedIds = [], selectedIds = [], describe = () => null, multiple = true,
  label = 'To', placeholder = 'Search by name or @username', emptyHint = '', onChange = () => {},
}) {
  const uid = `people-search-${nextId++}`;
  const byId = new Map(people.map((p) => [p.id, p]));
  let selected = selectedIds.filter((id) => byId.has(id));
  let results = [];
  let active = -1;

  const input = h('input', {
    type: 'text',
    class: 'people-search__input',
    placeholder,
    autocomplete: 'off',
    spellcheck: 'false',
    role: 'combobox',
    'aria-label': label,
    'aria-autocomplete': 'list',
    'aria-expanded': 'false',
    'aria-controls': `${uid}-list`,
  });
  const chips = h('span', { class: 'people-search__chips' });
  const field = h('div', { class: 'people-search__field', onClick: (event) => { if (event.target === field) input.focus(); } }, chips, input);
  const list = h('ul', { class: 'people-search__results', id: `${uid}-list`, role: 'listbox', 'aria-label': `${label}: people`, hidden: true });
  const element = h('div', { class: 'people-search' }, field, list);

  function emit() { onChange([...selected]); }

  function drawChips() {
    replaceChildren(chips, selected.map((id) => {
      const person = byId.get(id);
      return h('span', { class: 'people-search__chip' },
        avatar(person, 20),
        h('span', { class: 'people-search__chip-name' }, person.name),
        h('button', {
          type: 'button', class: 'people-search__remove', 'aria-label': `Remove ${person.name}`,
          onClick: () => { remove(id); input.focus(); },
        }, icon('close', 12)));
    }));
    // One person only: the chip stands in for the box until it's removed.
    input.hidden = !multiple && selected.length > 0;
    input.placeholder = selected.length && multiple ? 'Add someone else' : placeholder;
  }

  function pick(id) {
    selected = multiple ? [...selected, id] : [id];
    input.value = '';
    drawChips();
    emit();
    if (multiple) { input.focus(); search(); } else close();
  }

  function remove(id) {
    selected = selected.filter((s) => s !== id);
    drawChips();
    emit();
  }

  /** People matching what's typed, best first; suggestions when nothing is typed. */
  function match(query) {
    const words = query.toLowerCase().replace(/^@/, '').split(/\s+/).filter(Boolean);
    const open = people.filter((p) => !selected.includes(p.id));
    if (!words.length) {
      const suggested = suggestedIds.map((id) => byId.get(id)).filter((p) => p && !selected.includes(p.id));
      return suggested.slice(0, MAX_RESULTS);
    }
    const scored = [];
    for (const person of open) {
      const name = person.name.toLowerCase();
      const username = (person.username ?? '').toLowerCase();
      if (!words.every((w) => name.includes(w) || username.includes(w))) continue;
      const first = words[0];
      const score = name.startsWith(first) ? 0
        : name.split(/\s+/).some((part) => part.startsWith(first)) ? 1
          : username.startsWith(first) ? 2 : 3;
      scored.push({ person, score });
    }
    scored.sort((a, b) => a.score - b.score || a.person.name.localeCompare(b.person.name));
    return scored.slice(0, MAX_RESULTS).map((s) => s.person);
  }

  function search() {
    const query = input.value.trim();
    results = match(query);
    active = results.length ? 0 : -1;
    drawResults(query);
  }

  function drawResults(query) {
    if (!results.length && !query) { close(); return; }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    replaceChildren(list,
      !query ? h('li', { class: 'people-search__heading', role: 'presentation' }, 'Suggested') : null,
      results.length
        ? results.map((person, i) => {
          const context = describe(person);
          return h('li', {
            id: `${uid}-opt-${i}`,
            role: 'option',
            class: `people-search__option${i === active ? ' is-active' : ''}`,
            'aria-selected': String(i === active),
            // pointerdown, not click: picking mustn't blur the box first.
            onPointerdown: (event) => { event.preventDefault(); pick(person.id); },
          },
          avatar(person, 28),
          h('span', { class: 'people-search__text' },
            h('span', { class: 'people-search__name' }, person.name),
            h('span', { class: 'people-search__detail' }, [person.username ? `@${person.username}` : null, context].filter(Boolean).join(' · '))));
        })
        : h('li', { class: 'people-search__empty', role: 'presentation' },
          `No one matches “${query}”.`, emptyHint ? h('span', { class: 'people-search__hint' }, ` ${emptyHint}`) : null));
    if (active >= 0) input.setAttribute('aria-activedescendant', `${uid}-opt-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function move(step) {
    if (!results.length) return;
    active = (active + step + results.length) % results.length;
    drawResults(input.value.trim());
    list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', search);
  input.addEventListener('focus', search);
  input.addEventListener('blur', () => setTimeout(close, 0));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (list.hidden) search(); else move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter' && !list.hidden && active >= 0) { event.preventDefault(); pick(results[active].id); }
    else if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Backspace' && !input.value && selected.length) remove(selected[selected.length - 1]);
  });

  drawChips();
  return {
    element,
    getSelected: () => [...selected],
    focus: () => input.focus(),
    clear: () => { selected = []; input.value = ''; drawChips(); close(); },
  };
}
