// @ts-check
/**
 * kanban-page.js — the Tasks module's Board view as a full page (js/modules/todo/tasks-board.js adapts the tasks).
 *
 * Layout:
 *
 *   14 cards · 2 overdue · 3 assigned to you
 *   [ Search cards ][ Person ▾ ]
 *
 *   ┌ board (scrolls sideways) ─────────────────────┐ ┌ card details ─────┐
 *   │ To do ‹ › 🗑   Doing ‹ › 🗑   Done ‹ › 🗑   [+] │ │ title             │
 *   │ cards…         cards…         cards…          │ │ column, due, label│
 *   │                                               │ │ people, notes     │
 *   └───────────────────────────────────────────────┘ └───────────────────┘
 *
 * Column titles are edited in place. Clicking a card opens its details
 * panel, where edits save as you type.
 *
 * On a personal homepage, group cards assigned to you are listed under the
 * board; clicking one opens it on the group's board.
 */

import { h, replaceChildren, debounce } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { renderTaskPeople } from '../../ui/task-people.js';
import { formatShortDate, toDateKey } from '../../utils/dates.js';
import { createKanbanBoard, renderLinkedCards } from './kanban-board.js';
import { trackedTaskFor, trackOnMyList, untrack, restoreTracked, myTodoModule } from '../todo/tracking.js';
import {
  CARD_COLORS, createCard, createColumn, normalizeCard, moveCard, moveColumn, shiftColumn, deleteColumn, isOverdue,
} from './kanban-data.js';

const SEARCH_DELAY_MS = 200;
const TEXT_SAVE_DELAY_MS = 400;

export function renderKanbanPage(container, context) {
  const me = context.currentUser;
  const isSolo = context.members.length <= 1;

  // View settings (not saved).
  const view = {
    search: '',
    personId: '',
    selectedCardId: context.takeFocusRequest(),
  };

  const findCard = (cardId) => {
    const card = context.getData().cards.find((c) => c.id === cardId);
    return card ? normalizeCard(card) : null;
  };

  /**
   * Save a change. Redraws the summary and the board; the details panel is
   * only redrawn when asked, so typing in it isn't interrupted.
   */
  function update(changeFn, { redrawDetails = false } = {}) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    drawSummary();
    board.draw();
    if (redrawDetails) drawDetails();
  }

  function updateCard(cardId, changes, options) {
    update((data) => Object.assign(data.cards.find((c) => c.id === cardId), changes), options);
  }

  function selectCard(cardId) {
    view.selectedCardId = cardId;
    board.draw();
    drawDetails();
  }

  /** Remove something, with an Undo that puts the whole board back. */
  function removeWithUndo(message, changeFn) {
    const before = structuredClone(context.getData());
    update(changeFn);
    if (view.selectedCardId && !findCard(view.selectedCardId)) selectCard(null);
    showToast(message, {
      actionLabel: 'Undo',
      onAction: () => { context.saveData(before); drawAll(); },
    });
  }

  // ─── Summary line ──────────────────────────────────────────────────────────

  const summary = h('p', { class: 'kanban-page__summary' });

  function drawSummary() {
    const data = context.getData();
    const cards = data.cards.map(normalizeCard);
    const overdue = cards.filter((card) => isOverdue(card, data)).length;
    const mine = cards.filter((card) => card.assigneeIds.includes(me.id)).length;
    replaceChildren(summary, [
      `${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`,
      overdue ? h('span', { class: 'is-overdue' }, ` · ${overdue} overdue`) : null,
      isSolo ? null : ` · ${mine} assigned to you`,
    ]);
  }

  // ─── Toolbar ───────────────────────────────────────────────────────────────

  const searchInput = h('input', {
    type: 'search',
    class: 'input page-search__input',
    placeholder: 'Search cards',
    'aria-label': 'Search cards',
    onInput: debounce((event) => { view.search = event.target.value; board.draw(); }, SEARCH_DELAY_MS),
  });

  const personFilter = h('select', {
    class: 'input input--compact',
    'aria-label': 'Show cards for',
    onChange: (event) => { view.personId = event.target.value; board.draw(); },
  },
    h('option', { value: '' }, 'Anyone'),
    h('option', { value: 'unassigned' }, 'Unassigned'),
    context.members.map((m) => h('option', { value: m.id }, m.id === me.id ? `${m.name} (you)` : m.name)),
  );

  const toolbar = h('div', { class: 'page-toolbar' },
    h('label', { class: 'page-search' }, icon('search', 16), searchInput),
    isSolo ? null : h('label', { class: 'page-control' }, h('span', { class: 'page-control__label' }, 'Person'), personFilter),
  );

  // ─── Board ─────────────────────────────────────────────────────────────────

  /** Column header with an editable title and ‹ › 🗑 buttons. */
  function renderColumnHeader(column, cards) {
    const data = context.getData();
    const index = data.columns.findIndex((c) => c.id === column.id);

    const titleInput = h('input', {
      type: 'text',
      class: 'kanban__column-title-input',
      value: column.title,
      'aria-label': 'Column name',
      onKeydown: (event) => { if (event.key === 'Enter') event.target.blur(); },
      onChange: (event) => {
        const title = event.target.value.trim();
        if (!title) { event.target.value = column.title; return; }
        update((d) => { d.columns.find((c) => c.id === column.id).title = title; }, { redrawDetails: true });
      },
    });

    const toolButton = (iconName, label, onClick, disabled = false) => h('button', {
      type: 'button',
      class: 'icon-button icon-button--subtle',
      'aria-label': label,
      title: label,
      disabled,
      onClick,
    }, icon(iconName, 14));

    return h('header', { class: 'kanban__column-header' },
      // A handle to grab: the rest of the header is mostly the title box and buttons.
      h('span', { class: 'kanban__grip', 'aria-hidden': 'true' }, icon('grip', 14)),
      titleInput,
      h('span', { class: 'kanban__count' }, String(cards.length)),
      h('span', { class: 'kanban__column-tools' },
        toolButton('chevronLeft', `Move "${column.title}" left`, () => update((d) => shiftColumn(d, column.id, -1)), index === 0),
        toolButton('chevronRight', `Move "${column.title}" right`, () => update((d) => shiftColumn(d, column.id, 1)), index === data.columns.length - 1),
        toolButton('trash', `Delete column "${column.title}"`, () => removeWithUndo(
          cards.length ? `Deleted "${column.title}" and its ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}.` : `Deleted "${column.title}".`,
          (d) => deleteColumn(d, column.id),
        )),
      ),
    );
  }

  const board = createKanbanBoard({
    getData: () => context.getData(),
    getFilters: () => view,
    getSelectedId: () => view.selectedCardId,
    getMember: context.getMember,
    isSolo,
    onOpenCard: selectCard,
    onMoveCard: (cardId, columnId, beforeCardId) => update(
      (data) => moveCard(data, cardId, columnId, beforeCardId),
      { redrawDetails: cardId === view.selectedCardId }, // its Column select changes
    ),
    onMoveColumn: (columnId, beforeColumnId) => update((data) => moveColumn(data, columnId, beforeColumnId)),
    onAddColumn: (title) => update((data) => data.columns.push(createColumn(title))),
    onAddCard: (columnId, title) => update((data) => {
      data.cards.push(createCard({ columnId, title, assigneeIds: isSolo ? [me.id] : [] }));
    }),
    renderColumnHeader,
  });

  // ─── Details panel ─────────────────────────────────────────────────────────

  const detailsPanel = h('aside', { class: 'side-panel', 'aria-label': 'Card details' });

  function drawDetails() {
    const card = view.selectedCardId ? findCard(view.selectedCardId) : null;
    detailsPanel.hidden = !card;
    layout.classList.toggle('has-panel', Boolean(card));
    if (!card) {
      replaceChildren(detailsPanel);
      return;
    }

    const data = context.getData();
    const field = (labelText, control, wide = false) => h('label', { class: `side-panel__field${wide ? ' side-panel__field--wide' : ''}` },
      h('span', { class: 'side-panel__label' }, labelText), control);

    const titleInput = h('textarea', {
      class: 'side-panel__title',
      rows: '2',
      'aria-label': 'Card title',
      onInput: debounce((event) => {
        const title = event.target.value.trim();
        if (title) updateCard(card.id, { title });
      }, TEXT_SAVE_DELAY_MS),
    });
    titleInput.value = card.title;

    const descriptionInput = h('textarea', {
      class: 'input side-panel__notes',
      rows: '6',
      placeholder: 'Add more detail: links, steps, who to ask',
      onInput: debounce((event) => updateCard(card.id, { description: event.target.value }), TEXT_SAVE_DELAY_MS),
    });
    descriptionInput.value = card.description;

    const columnSelect = h('select', {
      class: 'input',
      onChange: (event) => update((d) => moveCard(d, card.id, event.target.value, null)),
    }, data.columns.map((column) => h('option', { value: column.id, selected: column.id === card.columnId }, column.title)));

    const colorSelect = h('select', {
      class: 'input',
      onChange: (event) => updateCard(card.id, { color: event.target.value }, { redrawDetails: true }),
    }, CARD_COLORS.map((color) => h('option', { value: color.id, selected: color.id === card.color }, color.label)));

    const created = card.createdAt ? `Added ${formatShortDate(toDateKey(new Date(card.createdAt)))}` : '';

    replaceChildren(detailsPanel,
      h('div', { class: 'side-panel__top' },
        h('span', { class: `side-panel__kicker tint-swatch${card.color ? ` tint--${card.color}` : ''}` }, 'Card'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close details', onClick: () => selectCard(null) }, icon('close', 16)),
      ),
      titleInput,
      h('div', { class: 'side-panel__grid' },
        field('Column', columnSelect),
        field('Due date', h('input', {
          type: 'date',
          class: 'input',
          value: card.due,
          onChange: (event) => updateCard(card.id, { due: event.target.value }),
        })),
        field('Label', colorSelect),
        // Who's on it: everyone already on it, "I'll take it", and Assign (js/ui/task-people.js).
        isSolo ? null : h('div', { class: 'side-panel__field side-panel__field--wide' },
          renderTaskPeople({
            key: card.id, members: context.members, assigneeIds: card.assigneeIds, acceptedIds: card.acceptedIds ?? null, me: context.currentUser,
            canTake: !context.isVisitor, canAssign: !context.isVisitor,
            onChange: (changes) => updateCard(card.id, changes),
          }),
        ),
      ),
      field('Description', descriptionInput, true),
      // A group's card can go on your own to-do list (js/modules/todo/tracking.js).
      context.spaceKind === 'personal' || context.isVisitor ? null : renderTrack(card),
      h('div', { class: 'side-panel__footer' },
        h('span', {}, created),
        h('button', {
          type: 'button',
          class: 'link-button link-button--danger',
          onClick: () => removeWithUndo(`Deleted "${card.title}".`, (d) => { d.cards = d.cards.filter((c) => c.id !== card.id); }),
        }, 'Delete card'),
      ),
    );
  }

  /** "Add to my to-do list", or "On your to-do list · Open · Remove". */
  function renderTrack(card) {
    const tracked = trackedTaskFor(me, context.moduleId, card.id);
    if (!tracked) {
      return h('div', { class: 'kanban-track' },
        h('button', {
          type: 'button', class: 'button button--small',
          onClick: () => {
            const { created } = trackOnMyList(me, { moduleId: context.moduleId, itemId: card.id, title: card.title, due: card.due });
            showToast(created ? `Added “${card.title}” to your to-do list.` : 'It’s already on your to-do list.', {
              actionLabel: 'Undo', onAction: () => { untrack(me, context.moduleId, card.id); drawDetails(); },
            });
            drawDetails();
          },
        }, icon('todo', 14), ' Add to my to-do list'));
    }
    const list = myTodoModule(me);
    return h('div', { class: 'kanban-track kanban-track--on' },
      h('span', {}, icon('check', 14), tracked.done ? ' Done on your to-do list' : ' On your to-do list'),
      list ? h('a', { href: `#module-${list.id}`, class: 'link-button' }, 'Open my list') : null,
      h('button', {
        type: 'button', class: 'link-button',
        onClick: () => {
          const removed = untrack(me, context.moduleId, card.id);
          showToast('Taken off your to-do list.', { actionLabel: 'Undo', onAction: () => { restoreTracked(removed); drawDetails(); } });
          drawDetails();
        },
      }, 'Remove'));
  }

  // ─── Layout ────────────────────────────────────────────────────────────────

  const layout = h('div', { class: 'page-layout' },
    h('div', { class: 'page-layout__main kanban-page__board' },
      board.element,
      renderLinkedCards(context.getLinkedItems(), { onOpen: context.openLinkedItem }),
    ),
    detailsPanel,
  );

  function drawAll() {
    drawSummary();
    board.draw();
    drawDetails();
  }

  container.append(summary, toolbar, layout);
  drawAll();

  // Opened from a card on the homepage: bring that card into view.
  if (view.selectedCardId) {
    board.element.querySelector(`[data-card-id="${view.selectedCardId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
