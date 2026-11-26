// @ts-check
/**
 * grocery-lists.js — one List module, many lists (like Superlist's sidebar
 * of lists): Groceries, Hardware store, Camping gear…
 *
 *   Card:       [Groceries 4] [Hardware 2] [Camping] [+]   ← chips to switch, + for a new list
 *               the open list below (grocery-card.js)
 *   Full page:  the lists down the side, each with what's left on it, and
 *               "+ New list"; the open list beside them (grocery-page.js),
 *               its name editable in place, "Delete list" (with Undo)
 *
 * Which list is open is each person's own (kept for the visit); it starts
 * on `context.defaultListId` when there is one (a list put on a page from a
 * vault opens on that list: vaultfile-module.js), else the first.
 *
 * Data: { lists: [{ id, name, items, history }] }. An older single list,
 * { items, history }, reads as one list and is saved in the new shape the
 * first time it changes.
 *
 * The card and page renderers each get a context for one list
 * (listContext), so they didn't need to change.
 */

import { h, replaceChildren, makeId } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { getModule } from '../../state/store.js';

/** The lists in a module's data, in order. */
export function listsOf(data) {
  if (Array.isArray(data?.lists) && data.lists.length) return data.lists.map((l) => ({ items: [], history: [], ...l }));
  return [{ id: 'list-1', name: '', items: data?.items ?? [], history: data?.history ?? [] }];
}

export const openCount = (list) => (list.items ?? []).filter((i) => !i.bought).length;

const storageKey = (moduleId) => `3den.list-open.${moduleId}`;
function rememberedList(moduleId) {
  try { return sessionStorage.getItem(storageKey(moduleId)); } catch { return null; }
}
function rememberList(moduleId, listId) {
  try { sessionStorage.setItem(storageKey(moduleId), listId); } catch { /* private mode */ }
}

/** A context for one list: getData/saveData see just { items, history }. */
export function listContext(context, listId) {
  return {
    ...context,
    getData: () => {
      const list = listsOf(context.getData()).find((l) => l.id === listId) ?? listsOf(context.getData())[0];
      return { items: list.items, history: list.history };
    },
    saveData: (listData) => {
      const lists = listsOf(context.getData()).map((l) => (l.id === listId ? { ...l, items: listData.items, history: listData.history ?? l.history } : l));
      context.saveData({ lists });
    },
  };
}

/** The list module's card or full page, with a way to move between lists. */
export function renderLists(container, context, { full, renderList }) {
  const moduleId = context.moduleId ?? 'list';
  const moduleTitle = () => context.listTitle ?? getModule(context.moduleId)?.title ?? 'List';
  let openId = null;
  let cleanup = null;
  let adding = false;
  const nav = h(full ? 'nav' : 'div', { class: full ? 'lists__side' : 'lists__chips', 'aria-label': 'Lists' });
  const head = h('div', { class: 'lists__head' });
  const body = h('div', { class: 'lists__body' });
  container.append(h('div', { class: `lists${full ? ' lists--full' : ''}` }, nav, h('div', { class: 'lists__main' }, full ? head : null, body)));

  const lists = () => listsOf(context.getData());
  const nameOf = (list) => list.name || moduleTitle();
  const canEdit = !context.isVisitor;

  function pickOpen() {
    const all = lists();
    const wanted = openId ?? context.defaultListId ?? rememberedList(moduleId);
    return (all.find((l) => l.id === wanted) ?? all.find((l) => l.id === context.defaultListId) ?? all[0]).id;
  }

  function open(listId) {
    openId = listId;
    rememberList(moduleId, listId);
    draw();
  }

  function addList(name) {
    const list = { id: makeId('list'), name: name.trim() || 'New list', items: [], history: [] };
    const current = lists();
    // The first extra list: the existing one gets a name, so the chips make sense.
    if (current.length === 1 && !current[0].name) current[0].name = moduleTitle();
    context.saveData({ lists: [...current, list] });
    adding = false;
    open(list.id);
  }

  function renameList(listId, name) {
    context.saveData({ lists: lists().map((l) => (l.id === listId ? { ...l, name: name.trim() || l.name } : l)) });
  }

  function deleteList(listId) {
    const before = structuredClone(context.getData());
    const list = lists().find((l) => l.id === listId);
    context.saveData({ lists: lists().filter((l) => l.id !== listId) });
    openId = null;
    draw();
    showToast(`Deleted “${nameOf(list)}”.`, { actionLabel: 'Undo', onAction: () => { context.saveData(before); open(listId); } });
  }

  function newListInput() {
    const input = h('input', { type: 'text', class: 'input input--compact lists__new-input', placeholder: 'List name', 'aria-label': 'New list name' });
    const form = h('form', {
      class: 'lists__new-form',
      onSubmit: (event) => { event.preventDefault(); addList(input.value); },
    }, input, h('button', { type: 'submit', class: 'button button--small' }, 'Add'));
    input.addEventListener('keydown', (event) => { if (event.key === 'Escape') { adding = false; drawNav(); } });
    requestAnimationFrame(() => input.focus());
    return form;
  }

  function drawNav() {
    const all = lists();
    const items = all.map((list) => h('button', {
      type: 'button',
      class: `${full ? 'lists__item' : 'lists__chip'}${list.id === openId ? ' is-open' : ''}`,
      'aria-current': list.id === openId ? 'true' : null,
      onClick: () => open(list.id),
    }, full ? icon('list', 14) : null, h('span', { class: 'lists__name' }, nameOf(list)), openCount(list) ? h('span', { class: 'lists__count' }, String(openCount(list))) : null));
    const plus = canEdit ? (adding ? newListInput() : h('button', {
      type: 'button',
      class: full ? 'lists__item lists__item--new' : 'lists__chip lists__chip--new',
      'aria-label': 'New list',
      title: 'New list',
      onClick: () => { adding = true; drawNav(); },
    }, icon('plus', 13), full ? ' New list' : null)) : null;
    // A single list on a card keeps things quiet: just a small + until there's a second list.
    if (!full && all.length === 1 && !adding) {
      replaceChildren(nav, plus ? h('button', { type: 'button', class: 'link-button lists__first-new', onClick: () => { adding = true; drawNav(); } }, icon('plus', 12), ' New list') : null);
      nav.classList.add('is-single');
      return;
    }
    nav.classList.remove('is-single');
    replaceChildren(nav, full ? h('p', { class: 'lists__side-title' }, 'Lists') : null, items, plus);
  }

  function drawHead() {
    if (!full) return;
    const list = lists().find((l) => l.id === openId);
    const name = canEdit
      ? h('input', {
          type: 'text', class: 'lists__title-input', value: nameOf(list), 'aria-label': 'List name',
          onChange: (event) => { renameList(list.id, event.target.value); drawNav(); },
          onKeydown: (event) => { if (event.key === 'Enter') event.target.blur(); },
        })
      : h('h2', { class: 'lists__title' }, nameOf(list));
    replaceChildren(head, name,
      canEdit && lists().length > 1 ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => deleteList(list.id) }, 'Delete list') : null);
  }

  function draw() {
    openId = pickOpen();
    drawNav();
    drawHead();
    if (typeof cleanup === 'function') cleanup();
    replaceChildren(body);
    cleanup = renderList(body, listContext(context, openId));
  }
  draw();
  return () => { if (typeof cleanup === 'function') cleanup(); };
}
