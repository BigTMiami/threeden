// @ts-check
/**
 * search-page.js — Advanced search (#search?q=…&sort=…&show=…).
 *
 * One search box that understands the query language in
 * js/state/advanced-search.js, and a form beside it that fills the same
 * query in for you. Change either one and the other follows, and the link
 * updates, so a search can be bookmarked, shared, or saved.
 *
 *   ┌ Search ───────────────────────────────────────────────────────────┐
 *   │ [ heat OR boiler from:@owen is:upcoming          ] [Search]       │
 *   │ from:@owen ×   is:upcoming ×                                      │
 *   ├ Filters ──────────┬ 12 results ───────────────────────────────────┤
 *   │ All of these words│ [All 12] [Events 3] [Posts 6] [Messages 3]     │
 *   │ Exact phrase      │ ▤ Boiler is out again                          │
 *   │ Any of these      │   Post · Heat log · Juniper Tenants · 3 days   │
 *   │ None of these     │   ago · by Owen                                │
 *   │ Type ☐ People …   │   …the [boiler] in building A is out…          │
 *   │ Where [Anywhere▾] │ [Show more]                                    │
 *   │ From  [@…      ]  │                                                │
 *   │ When  [Any time▾] │                                                │
 *   │ Events ☐ Upcoming ☐ Near me  Tag [▾]                               │
 *   │ Groups ( ) Any (•) Public ( ) Private ☐ I'm in it                  │
 *   │ ☐ Only things I made · Sort [Best match▾]                          │
 *   │ [Save this search]  Saved: Heat complaints ×                       │
 *   └───────────────────┴────────────────────────────────────────────────┘
 *
 * Saved searches are kept on the person (member.savedSearches =
 * [{ id, name, query, sort }]) and also show in the top bar's search menu.
 */

import { h, replaceChildren, debounce, makeId } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { groupInitials } from '../utils/initials.js';
import { timeAgo, formatShortDate, addDays, todayKey } from '../utils/dates.js';
import { changeState, getCurrentUser, getMember, getSpaces } from '../state/store.js';
import { getAccounts } from '../state/accounts.js';
import { EVENT_TAGS } from '../events/event-tags.js';
import { parseQuery, buildQuery, advancedSearch, countByKind, isEmptyQuery, RESULT_KINDS } from '../state/advanced-search.js';
import { requestModuleFocus } from '../editor/module-context.js';
import { goTo, openModulePage } from '../router.js';
import { openDirectConversation } from '../state/messages.js';

const PAGE_SIZE = 25;
const SORTS = [
  { id: 'best', label: 'Best match' },
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'soonest', label: 'Coming up soonest (events)' },
];
const WHEN = [
  { id: 'any', label: 'Any time' },
  { id: 'week', label: 'Past week', days: 7 },
  { id: 'month', label: 'Past month', days: 31 },
  { id: 'year', label: 'Past year', days: 365 },
  { id: 'custom', label: 'Between dates…' },
];
const KIND_LABEL = Object.fromEntries(RESULT_KINDS.map((k) => [k.id, k.label.replace(/s$/, '')]));

/** '#search?q=…' for a query (used by the top bar's search too). */
export function searchHref(query = '', { sort = 'best', show = 'all' } = {}) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (sort !== 'best') params.set('sort', sort);
  if (show !== 'all') params.set('show', show);
  const text = params.toString();
  return `#search${text ? `?${text}` : ''}`;
}

export function getSavedSearches(memberId) {
  return getMember(memberId)?.savedSearches ?? [];
}

export function renderSearchPage(container, params = new URLSearchParams()) {
  const me = getCurrentUser();
  let parsed = parseQuery(params.get('q') ?? '');
  let sort = params.get('sort') ?? 'best';
  let show = params.get('show') ?? 'all';
  let shownCount = PAGE_SIZE;

  // ─── The search box ─────────────────────────────────────────────────────────
  const queryInput = h('input', {
    type: 'search', class: 'input search-page__input', value: buildQuery(parsed), placeholder: 'Search everything you can see on 3den',
    'aria-label': 'Search', autocomplete: 'off', spellcheck: 'false',
    onInput: debounce(() => { parsed = parseQuery(queryInput.value); shownCount = PAGE_SIZE; fillForm(); run(); }, 250),
  });
  const activeChips = h('div', { class: 'search-page__active', 'aria-label': 'Filters in use' });

  // ─── The form ───────────────────────────────────────────────────────────────
  const wordsAll = h('input', { type: 'text', class: 'input', 'aria-label': 'All of these words' });
  const wordsPhrase = h('input', { type: 'text', class: 'input', 'aria-label': 'This exact phrase' });
  const wordsAny = h('input', { type: 'text', class: 'input', 'aria-label': 'Any of these words' });
  const wordsNone = h('input', { type: 'text', class: 'input', 'aria-label': 'None of these words' });
  const typeBoxes = RESULT_KINDS.map((k) => h('input', { type: 'checkbox', value: k.id }));
  const myGroups = getSpaces().filter((s) => s.kind === 'group' && s.memberIds.includes(me.id)).sort((a, b) => a.name.localeCompare(b.name));
  const whereSelect = h('select', { class: 'input', 'aria-label': 'Where' },
    h('option', { value: '' }, 'Anywhere'),
    h('option', { value: 'homepage' }, 'My homepage'),
    h('option', { value: 'blogs' }, 'Blogs'),
    h('option', { value: 'messages' }, 'My messages'),
    myGroups.length ? h('optgroup', { label: 'My groups' }, myGroups.map((g) => h('option', { value: g.name.toLowerCase() }, g.name))) : null);
  const fromInput = h('input', { type: 'text', class: 'input', list: 'search-people', placeholder: '@username or a name', 'aria-label': 'From' });
  const peopleList = h('datalist', { id: 'search-people' }, getAccounts().filter((m) => !m.quick).slice(0, 400).map((m) => h('option', { value: `@${m.username}` }, m.name)));
  const whenSelect = h('select', { class: 'input', 'aria-label': 'When' }, WHEN.map((w) => h('option', { value: w.id }, w.label)));
  const afterInput = h('input', { type: 'date', class: 'input input--compact', 'aria-label': 'From date' });
  const beforeInput = h('input', { type: 'date', class: 'input input--compact', 'aria-label': 'To date' });
  const datesRow = h('div', { class: 'form-row search-page__dates' }, afterInput, h('span', {}, 'to'), beforeInput);
  const upcomingBox = h('input', { type: 'checkbox' });
  const nearBox = h('input', { type: 'checkbox' });
  const tagSelect = h('select', { class: 'input input--compact', 'aria-label': 'Event tag' }, h('option', { value: '' }, 'Any tag'), EVENT_TAGS.map((t) => h('option', { value: t.id }, `${t.emoji ?? ''} ${t.label}`.trim())));
  const groupKind = ['', 'public', 'private'].map((v) => h('input', { type: 'radio', name: 'search-group-kind', value: v }));
  const memberBox = h('input', { type: 'checkbox' });
  const mineBox = h('input', { type: 'checkbox' });
  const sortSelect = h('select', { class: 'input', 'aria-label': 'Sort' }, SORTS.map((s) => h('option', { value: s.id }, s.label)));

  const words = (text) => text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const setIs = (flag, on) => { parsed.filters.is = parsed.filters.is.filter((f) => f !== flag); if (on) parsed.filters.is.push(flag); };

  /** Form → query. */
  function readForm() {
    parsed.terms = words(wordsAll.value);
    const phrase = wordsPhrase.value.trim().toLowerCase();
    parsed.phrases = [phrase, ...parsed.phrases.slice(1)].filter(Boolean);
    const any = words(wordsAny.value);
    parsed.any = [any, ...parsed.any.slice(1)].filter((g) => g.length);
    parsed.exclude = words(wordsNone.value);
    parsed.filters.type = typeBoxes.filter((b) => b.checked).map((b) => b.value);
    parsed.filters.in = whereSelect.value ? [whereSelect.value] : [];
    parsed.filters.from = fromInput.value.trim() ? [fromInput.value.trim().replace(/^@/, '').toLowerCase()] : [];
    const preset = WHEN.find((w) => w.id === whenSelect.value);
    if (preset?.days) { parsed.filters.after = addDays(todayKey(), -preset.days); parsed.filters.before = null; }
    else if (preset?.id === 'any') { parsed.filters.after = null; parsed.filters.before = null; }
    else { parsed.filters.after = afterInput.value || null; parsed.filters.before = beforeInput.value || null; }
    setIs('upcoming', upcomingBox.checked);
    setIs('near', nearBox.checked);
    parsed.filters.tag = tagSelect.value ? [tagSelect.value] : [];
    const kind = groupKind.find((r) => r.checked)?.value ?? '';
    setIs('public', kind === 'public');
    setIs('private', kind === 'private');
    setIs('member', memberBox.checked);
    setIs('mine', mineBox.checked);
    sort = sortSelect.value;
    queryInput.value = buildQuery(parsed);
    shownCount = PAGE_SIZE;
    run();
  }

  /** Query → form. */
  function fillForm() {
    wordsAll.value = parsed.terms.join(' ');
    wordsPhrase.value = parsed.phrases[0] ?? '';
    wordsAny.value = (parsed.any[0] ?? []).join(' ');
    wordsNone.value = parsed.exclude.join(' ');
    typeBoxes.forEach((b) => { b.checked = parsed.filters.type.includes(b.value); });
    const where = parsed.filters.in[0] ?? '';
    if (where && ![...whereSelect.options].some((o) => o.value === where)) whereSelect.append(h('option', { value: where }, `In “${where}”`));
    whereSelect.value = where;
    fromInput.value = parsed.filters.from[0] ? `@${parsed.filters.from[0]}` : '';
    const { after, before } = parsed.filters;
    const preset = !before && after ? WHEN.find((w) => w.days && addDays(todayKey(), -w.days) === after) : null;
    whenSelect.value = !after && !before ? 'any' : preset ? preset.id : 'custom';
    afterInput.value = after ?? '';
    beforeInput.value = before ?? '';
    datesRow.hidden = whenSelect.value !== 'custom';
    upcomingBox.checked = parsed.filters.is.includes('upcoming');
    nearBox.checked = parsed.filters.is.includes('near');
    tagSelect.value = parsed.filters.tag[0] ?? '';
    const kind = parsed.filters.is.includes('public') ? 'public' : parsed.filters.is.includes('private') ? 'private' : '';
    groupKind.forEach((r) => { r.checked = r.value === kind; });
    memberBox.checked = parsed.filters.is.includes('member');
    mineBox.checked = parsed.filters.is.includes('mine');
    sortSelect.value = sort;
  }

  for (const control of [wordsAll, wordsPhrase, wordsAny, wordsNone, fromInput]) control.addEventListener('input', debounce(readForm, 250));
  for (const control of [...typeBoxes, whereSelect, afterInput, beforeInput, upcomingBox, nearBox, tagSelect, ...groupKind, memberBox, mineBox, sortSelect]) control.addEventListener('change', readForm);
  whenSelect.addEventListener('change', () => { datesRow.hidden = whenSelect.value !== 'custom'; readForm(); });

  const checkbox = (box, label) => h('label', { class: 'search-page__check' }, box, h('span', {}, label));
  const field = (label, ...controls) => h('div', { class: 'settings-field search-page__field' }, h('span', { class: 'settings-field__label' }, label), ...controls);

  // ─── Saved searches ─────────────────────────────────────────────────────────
  const savedBox = h('div', { class: 'search-page__saved' });
  function drawSaved() {
    const saved = getSavedSearches(me.id);
    replaceChildren(savedBox,
      h('button', {
        type: 'button', class: 'button button--small', disabled: isEmptyQuery(parsed),
        onClick: () => {
          const name = buildQuery(parsed).slice(0, 60);
          changeState((state) => {
            const member = state.members.find((m) => m.id === me.id);
            member.savedSearches = [{ id: makeId('ss'), name, query: buildQuery(parsed), sort }, ...(member.savedSearches ?? [])].slice(0, 20);
          });
          showToast('Saved. It’s here and in the top bar’s search menu.');
          drawSaved();
        },
      }, icon('flag', 13), ' Save this search'),
      saved.length ? h('ul', { class: 'search-page__saved-list', 'aria-label': 'Saved searches' }, saved.map((s) => h('li', {},
        h('a', { href: searchHref(s.query, { sort: s.sort }) }, s.name),
        h('button', {
          type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': `Remove saved search “${s.name}”`,
          onClick: () => {
            changeState((state) => { const member = state.members.find((m) => m.id === me.id); member.savedSearches = (member.savedSearches ?? []).filter((x) => x.id !== s.id); });
            drawSaved();
          },
        }, icon('close', 12))))) : null);
  }

  const form = h('form', { class: 'search-page__form', onSubmit: (e) => e.preventDefault(), 'aria-label': 'Filters' },
    h('fieldset', { class: 'search-page__group' }, h('legend', {}, 'Words'),
      field('All of these words', wordsAll),
      field('This exact phrase', wordsPhrase),
      field('Any of these words', wordsAny),
      field('None of these words', wordsNone)),
    h('fieldset', { class: 'search-page__group' }, h('legend', {}, 'What'),
      h('div', { class: 'search-page__types' }, RESULT_KINDS.map((k, i) => checkbox(typeBoxes[i], k.label)))),
    h('fieldset', { class: 'search-page__group' }, h('legend', {}, 'Where, who, and when'),
      field('Where', whereSelect),
      field('From', fromInput, peopleList),
      field('When', whenSelect, datesRow)),
    h('fieldset', { class: 'search-page__group' }, h('legend', {}, 'Events'),
      checkbox(upcomingBox, 'Coming up only'),
      checkbox(nearBox, `Near me (within ${me.location?.radiusMiles ?? 10} miles)`),
      field('Tag', tagSelect)),
    h('fieldset', { class: 'search-page__group' }, h('legend', {}, 'Groups and more'),
      h('div', { class: 'search-page__radios', role: 'radiogroup', 'aria-label': 'Group or event visibility' },
        checkbox(groupKind[0], 'Public or private'), checkbox(groupKind[1], 'Public only'), checkbox(groupKind[2], 'Private only')),
      checkbox(memberBox, 'Only in groups I’m in'),
      checkbox(mineBox, 'Only things I made')),
    field('Sort', sortSelect),
    savedBox);

  // ─── Results ────────────────────────────────────────────────────────────────
  const resultsBox = h('div', { class: 'search-page__results', 'aria-live': 'polite' });

  function run() {
    history.replaceState(null, '', searchHref(buildQuery(parsed), { sort, show }));
    drawActive();
    drawSaved();
    if (isEmptyQuery(parsed)) {
      replaceChildren(resultsBox, tips());
      return;
    }
    const all = advancedSearch(parsed, { sort });
    const counts = countByKind(all);
    if (show !== 'all' && !counts[show]) show = 'all';
    const list = show === 'all' ? all : all.filter((r) => r.kind === show);
    replaceChildren(resultsBox,
      h('p', { class: 'search-page__summary' }, all.length ? `${all.length} ${all.length === 1 ? 'result' : 'results'}` : 'Nothing matched.'),
      all.length ? h('div', { class: 'search-page__tabs', role: 'group', 'aria-label': 'Show' },
        h('button', { type: 'button', class: `chip${show === 'all' ? ' is-active' : ''}`, 'aria-pressed': String(show === 'all'), onClick: () => { show = 'all'; shownCount = PAGE_SIZE; run(); } }, `All ${all.length}`),
        RESULT_KINDS.filter((k) => counts[k.id]).map((k) => h('button', {
          type: 'button', class: `chip${show === k.id ? ' is-active' : ''}`, 'aria-pressed': String(show === k.id),
          onClick: () => { show = k.id; shownCount = PAGE_SIZE; run(); },
        }, `${k.label} ${counts[k.id]}`))) : null,
      all.length === 0 ? h('p', { class: 'module-empty' }, 'Try fewer words, a shorter phrase, or remove a filter above.') : null,
      h('ul', { class: 'search-results' }, list.slice(0, shownCount).map(renderResult)),
      list.length > shownCount ? h('button', { type: 'button', class: 'button', onClick: () => { shownCount += PAGE_SIZE; run(); } }, `Show more (${list.length - shownCount} left)`) : null);
  }

  /** The filters in use, as chips you can remove one by one. */
  function drawActive() {
    const chips = [];
    const add = (label, remove) => chips.push(h('span', { class: 'search-page__chip' }, label,
      h('button', { type: 'button', class: 'search-page__chip-x', 'aria-label': `Remove ${label}`, onClick: () => { remove(); queryInput.value = buildQuery(parsed); fillForm(); run(); } }, '×')));
    const f = parsed.filters;
    f.type.forEach((t) => add(`type: ${KIND_LABEL[t] ?? t}`, () => { f.type = f.type.filter((x) => x !== t); }));
    f.from.forEach((w) => add(`from: @${w}`, () => { f.from = f.from.filter((x) => x !== w); }));
    f.in.forEach((w) => add(`in: ${w}`, () => { f.in = f.in.filter((x) => x !== w); }));
    if (f.after) add(`after ${formatShortDate(f.after)}`, () => { f.after = null; });
    if (f.before) add(`before ${formatShortDate(f.before)}`, () => { f.before = null; });
    f.tag.forEach((t) => add(`tag: ${t}`, () => { f.tag = f.tag.filter((x) => x !== t); }));
    f.is.forEach((t) => add(`is: ${t}`, () => { f.is = f.is.filter((x) => x !== t); }));
    parsed.exclude.forEach((t) => add(`not “${t}”`, () => { parsed.exclude = parsed.exclude.filter((x) => x !== t); }));
    replaceChildren(activeChips, chips.length ? [...chips, h('button', {
      type: 'button', class: 'link-button search-page__clear',
      onClick: () => { parsed = parseQuery([...parsed.terms, ...parsed.phrases.map((p) => `"${p}"`)].join(' ')); queryInput.value = buildQuery(parsed); fillForm(); run(); },
    }, 'Clear filters')] : []);
  }

  function renderResult(result) {
    const kind = RESULT_KINDS.find((k) => k.id === result.kind);
    const leading = result.kind === 'person' ? avatar(result.member, 32)
      : result.kind === 'group' ? h('span', { class: 'groups-menu__badge search-results__badge', 'aria-hidden': 'true' }, groupInitials(result.title))
        : result.thumb ? h('img', { class: 'search-results__thumb', src: result.thumb, alt: '' })
          : h('span', { class: 'search-results__icon', 'aria-hidden': 'true' }, icon(kind?.icon ?? 'search', 16));
    const author = result.authorId && result.kind !== 'person' && result.kind !== 'group' ? getMember(result.authorId) : null;
    const when = result.date == null || result.kind === 'event' || result.kind === 'person' ? null
      : typeof result.date === 'number' ? timeAgo(result.date) : formatShortDate(result.date);
    return h('li', { class: 'search-results__row' },
      leading,
      h('div', { class: 'search-results__text' },
        h('a', { class: 'search-results__title', href: result.href ?? '#messages', onClick: (e) => { e.preventDefault(); open(result); } }, highlight(result.title, result.marks)),
        h('span', { class: 'search-results__meta' }, [KIND_LABEL[result.kind], result.where, when, author ? `by ${author.name}` : null].filter(Boolean).join(' · ')),
        result.snippet && result.kind !== 'page' ? h('span', { class: 'search-results__snippet' }, highlight(result.snippet, result.marks)) : null));
  }

  function open(result) {
    if (result.messageId) goTo(`#messages-${openDirectConversation(me.id, result.messageId).id}`);
    else if (result.moduleId) {
      if (result.itemId) requestModuleFocus(result.moduleId, result.itemId);
      openModulePage(result.moduleId);
    } else goTo(result.href);
  }

  function tips() {
    const example = (query, what) => h('li', {}, h('a', { href: searchHref(query), onClick: (e) => { e.preventDefault(); parsed = parseQuery(query); queryInput.value = query; fillForm(); run(); } }, h('code', {}, query)), ` ${what}`);
    return h('div', { class: 'search-page__tips' },
      h('h2', { class: 'event-page__section-title' }, 'Search tips'),
      h('p', { class: 'settings-field__hint' }, 'Type in the box, or use the filters. Both make the same search, and you can mix them.'),
      h('ul', {},
        example('meeting childcare', 'every word, in any order'),
        example('"know your rights"', 'this exact phrase'),
        example('heat OR boiler', 'either word'),
        example('potluck -cancelled', 'leave out a word'),
        example('from:@maya', 'posted, written, or hosted by someone'),
        example('in:"juniper tenants" type:post', 'posts inside one group'),
        example('type:event is:upcoming is:near', 'events coming up near you'),
        example('tag:music after:2026-11-01', 'music events from November on'),
        example('is:mine type:task', 'tasks you made')));
  }

  replaceChildren(container,
    h('header', { class: 'settings-page__header' },
      h('h1', { class: 'settings-page__title' }, 'Advanced search'),
      h('p', { class: 'settings-page__subtitle' }, 'Everything you can see on 3den: people, groups, events, posts, tasks, notes, files, photos, and your messages.')),
    h('form', { class: 'search-page__bar', role: 'search', onSubmit: (e) => { e.preventDefault(); parsed = parseQuery(queryInput.value); fillForm(); run(); } },
      h('label', { class: 'search-page__box' }, icon('search', 16), queryInput),
      h('button', { type: 'submit', class: 'button button--primary' }, 'Search')),
    activeChips,
    h('div', { class: 'search-page__layout' },
      h('details', { class: 'search-page__filters', open: window.innerWidth > 640 },
        h('summary', {}, icon('settings', 14), ' Filters'),
        form),
      resultsBox));
  fillForm();
  run();
  queryInput.focus({ preventScroll: true });
}

function highlight(text, marks) {
  if (!text) return '';
  const terms = [...new Set(marks)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? h('mark', {}, part) : part));
}
