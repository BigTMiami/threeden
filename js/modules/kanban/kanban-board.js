// @ts-check
/**
 * kanban-board.js — draws a kanban board and lets people drag cards around.
 *
 * Used by both the homepage card (compact) and the full page:
 *
 *   ┌ To do  3 ─────┐ ┌ Doing  1 ─────┐ ┌ Done  2 ──────┐
 *   │ ▌Fix the gate │ │ ▌Paint fence  │ │ ▌Order seeds  │
 *   │   Nov 20 (LL) │ │       (AA)(TM)│ │               │
 *   │ …             │ │               │ │               │
 *   │ + Add a card  │ │ + Add a card  │ │ + Add a card  │
 *   └───────────────┘ └───────────────┘ └───────────────┘
 *
 * The board doesn't save anything itself. It reads through getter functions
 * and reports what the person did through callbacks, and the caller saves
 * and then calls `board.draw()`:
 *
 *   const board = createKanbanBoard({
 *     getData, getFilters, getSelectedId,     ← read on every draw
 *     members, getMember, isSolo, compact,
 *     onOpenCard(cardId),
 *     onMoveCard(cardId, columnId, beforeCardId),
 *     onAddCard(columnId, title),
 *     onMoveColumn(columnId, beforeColumnId), ← optional; null = to the end
 *     onAddColumn(title),                     ← optional; shows a "+" column at the end
 *     renderColumnHeader(column, cards),      ← optional, full page only
 *   });
 *   container.append(board.element);
 *   board.draw();
 *
 * Dragging: press a card and move. A copy of the card follows the pointer,
 * and a dashed gap shows where it will land. Release to drop, Escape to
 * cancel. (For keyboard users, the details panel has a Column select.)
 * Columns move the same way: drag one by its header.
 */

import { emptyState } from '../../ui/empty-state.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatarStack } from '../../ui/avatar.js';
import { trackPointer } from '../../ui/pointer-tracker.js';
import { sourceLabel } from '../../ui/source-tag.js';
import { cardsInColumn, matchesFilters, isOverdue, dueLabel } from './kanban-data.js';

/** While dragging within this many px of the board's left/right edge, it scrolls. */
const EDGE_SCROLL_PX = 48;
const EDGE_SCROLL_STEP = 14;

export function createKanbanBoard(options) {
  const {
    getData, getFilters = () => ({}), getSelectedId = () => null,
    getMember, isSolo, compact = false,
    onOpenCard, onMoveCard, onAddCard, onMoveColumn, onAddColumn, renderColumnHeader,
  } = options;

  // Which column's "Add a card" form is open. Kept across redraws, so you
  // can add several cards in a row.
  let addingColumnId = null;
  let shouldFocusAddInput = false; // only right after opening it or adding a card
  let isAddingColumn = false;       // the "+" column's name box is open

  const element = h('div', { class: `kanban${compact ? ' kanban--compact' : ''}` });

  // ─── Drawing ───────────────────────────────────────────────────────────────

  function draw() {
    const data = getData();
    const filters = getFilters();

    if (data.columns.length === 0 && !onAddColumn) {
      replaceChildren(element, emptyState({ icon: 'kanban', title: 'No columns yet', text: 'A board needs a few columns, like To do, Doing, and Done.' }));
      return;
    }

    replaceChildren(element, data.columns.map((column) => {
      const allCards = cardsInColumn(data, column.id);
      const shownCards = allCards.filter((card) => matchesFilters(card, filters));

      const header = renderColumnHeader
        ? renderColumnHeader(column, allCards)
        : h('header', { class: 'kanban__column-header' },
            h('h3', { class: 'kanban__column-title' }, column.title),
            h('span', { class: 'kanban__count' }, String(allCards.length)));
      const columnElement = h('section', { class: 'kanban__column', dataset: { columnId: column.id }, 'aria-label': column.title },
        header,
        h('ul', { class: 'kanban__cards' }, shownCards.map((card) => renderCard(card, data))),
        renderAddCard(column),
      );
      if (onMoveColumn) {
        header.classList.add('is-draggable');
        header.title = 'Drag to move this column';
        header.addEventListener('pointerdown', (event) => {
          // Typing in the title or clicking a button isn't a drag.
          if (event.target.closest('input, button')) return;
          startColumnDrag(event, columnElement);
        });
      }
      return columnElement;
    }), renderNewColumn());

    if (shouldFocusAddInput) {
      element.querySelector('.kanban__add-input, .kanban__new-column-input')?.focus();
      shouldFocusAddInput = false;
    }
  }

  /** The last "column": a + button that opens a box for a new column's name. */
  function renderNewColumn() {
    if (!onAddColumn) return null;
    if (!isAddingColumn) {
      return h('button', {
        type: 'button',
        class: 'kanban__new-column',
        title: 'Add a column',
        'aria-label': 'Add a column',
        onClick: () => { isAddingColumn = true; shouldFocusAddInput = true; draw(); },
      }, icon('plus', 16), compact ? null : ' Add column');
    }
    const input = h('input', {
      type: 'text',
      class: 'input kanban__new-column-input',
      placeholder: 'Column name',
      'aria-label': 'New column name',
      onKeydown: (event) => { if (event.key === 'Escape') { isAddingColumn = false; draw(); } },
    });
    return h('form', {
      class: 'kanban__new-column-form',
      onSubmit: (event) => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) { input.focus(); return; }
        isAddingColumn = false;
        onAddColumn(title); // the caller saves, then calls draw()
        element.scrollLeft = element.scrollWidth;
      },
    },
      input,
      h('span', { class: 'kanban__add-actions' },
        h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Add'),
        h('button', { type: 'button', class: 'link-button', onClick: () => { isAddingColumn = false; draw(); } }, 'Cancel')),
    );
  }

  function renderCard(card, data) {
    const people = card.assigneeIds.map(getMember).filter(Boolean);
    const due = dueLabel(card);
    const isSelected = card.id === getSelectedId();

    const cardElement = h('li', {
      class: `kanban-card${card.color ? ` tint--${card.color}` : ''}${isSelected ? ' is-selected' : ''}`,
      dataset: { cardId: card.id },
      tabindex: '0',
      role: 'button',
      'aria-label': `${card.title}. Open card`,
      onClick: () => onOpenCard(card.id),
      onKeydown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenCard(card.id);
        }
      },
      onPointerdown: (event) => startCardDrag(event, cardElement),
    },
      h('span', { class: 'kanban-card__title' }, card.title),
      (due || card.description || (!isSolo && people.length))
        ? h('span', { class: 'kanban-card__meta' },
            due ? h('span', { class: `kanban-card__due${isOverdue(card, data) ? ' is-overdue' : ''}` }, due) : null,
            card.description ? h('span', { class: 'kanban-card__has-notes', title: 'Has a description' }, icon('note', 12)) : null,
            !isSolo && people.length ? avatarStack(people, compact ? 18 : 20) : null,
          )
        : null,
    );
    return cardElement;
  }

  function renderAddCard(column) {
    if (addingColumnId !== column.id) {
      return h('button', {
        type: 'button',
        class: 'kanban__add-button',
        onClick: () => { addingColumnId = column.id; shouldFocusAddInput = true; draw(); },
      }, icon('plus', 14), ' Add a card');
    }

    const input = h('input', {
      type: 'text',
      class: 'input kanban__add-input',
      placeholder: 'Card title',
      'aria-label': `New card in ${column.title}`,
      onKeydown: (event) => {
        if (event.key === 'Escape') { addingColumnId = null; draw(); }
      },
    });

    return h('form', {
      class: 'kanban__add-form',
      onSubmit: (event) => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) { input.focus(); return; }
        shouldFocusAddInput = true; // ready for the next card
        onAddCard(column.id, title); // The caller saves, then calls draw().
      },
    },
      input,
      h('span', { class: 'kanban__add-actions' },
        h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Add'),
        h('button', {
          type: 'button',
          class: 'link-button',
          onClick: () => { addingColumnId = null; draw(); },
        }, 'Cancel'),
      ),
    );
  }

  // ─── Dragging cards ────────────────────────────────────────────────────────

  function startCardDrag(downEvent, cardElement) {
    let ghost = null;
    let placeholder = null;
    let grabOffset = { x: 0, y: 0 };

    trackPointer(downEvent, {
      onStart: (point) => {
        const rect = cardElement.getBoundingClientRect();
        grabOffset = { x: point.x - rect.left, y: point.y - rect.top };

        ghost = cardElement.cloneNode(true);
        ghost.classList.add('kanban-card--ghost');
        ghost.style.width = `${rect.width}px`;
        document.body.append(ghost);

        placeholder = h('li', { class: 'kanban__placeholder', style: { height: `${rect.height}px` }, 'aria-hidden': 'true' });
        cardElement.after(placeholder);
        cardElement.hidden = true;
      },

      onMove: (point) => {
        ghost.style.transform = `translate(${point.x - grabOffset.x}px, ${point.y - grabOffset.y}px)`;
        scrollNearEdges(point);
        movePlaceholderTo(point);
      },

      onEnd: () => {
        const list = placeholder.parentElement;
        const columnId = list?.closest('.kanban__column')?.dataset.columnId;
        const nextCard = nextCardAfter(placeholder);
        cleanUp();
        if (columnId) onMoveCard(cardElement.dataset.cardId, columnId, nextCard?.dataset.cardId ?? null);
        else draw();
      },

      onCancel: () => {
        cleanUp();
        cardElement.hidden = false;
      },
    });

    function cleanUp() {
      ghost?.remove();
      placeholder?.remove();
    }

    /** Put the gap in the column under the pointer, between the right cards. */
    function movePlaceholderTo(point) {
      const column = document.elementFromPoint(point.x, point.y)?.closest('.kanban__column');
      if (!column || !element.contains(column)) return;

      const list = column.querySelector('.kanban__cards');
      const cards = [...list.querySelectorAll('.kanban-card:not([hidden])')];
      const cardBelow = cards.find((card) => {
        const rect = card.getBoundingClientRect();
        return point.y < rect.top + rect.height / 2;
      });

      if (cardBelow) {
        if (cardBelow.previousElementSibling !== placeholder) list.insertBefore(placeholder, cardBelow);
      } else if (list.lastElementChild !== placeholder) {
        list.append(placeholder);
      }
    }
  }

  // ─── Dragging columns ──────────────────────────────────────────────────────

  function startColumnDrag(downEvent, columnElement) {
    let dropLine = null;
    let beforeColumnId; // undefined until the pointer is over the board

    trackPointer(downEvent, {
      onStart: () => {
        columnElement.classList.add('is-dragging');
        dropLine = h('div', { class: 'kanban__column-drop', 'aria-hidden': 'true' });
        element.append(dropLine);
      },
      onMove: (point) => {
        scrollNearEdges(point);
        const columns = [...element.querySelectorAll('.kanban__column')];
        const after = columns.find((col) => point.x < col.getBoundingClientRect().left + col.offsetWidth / 2);
        const boardRect = element.getBoundingClientRect();
        const x = after
          ? after.getBoundingClientRect().left - 6
          : columns[columns.length - 1].getBoundingClientRect().right + 4;
        dropLine.style.left = `${x - boardRect.left + element.scrollLeft}px`;
        beforeColumnId = after ? after.dataset.columnId : null;
      },
      onEnd: () => {
        columnElement.classList.remove('is-dragging');
        dropLine?.remove();
        const columnId = columnElement.dataset.columnId;
        if (beforeColumnId === undefined || beforeColumnId === columnId) return;
        onMoveColumn(columnId, beforeColumnId);
      },
      onCancel: () => {
        columnElement.classList.remove('is-dragging');
        dropLine?.remove();
      },
    });
  }

  /** The next visible card after `node` in the same list, if any. */
  function nextCardAfter(node) {
    let next = node.nextElementSibling;
    while (next && (next.hidden || !next.classList.contains('kanban-card'))) next = next.nextElementSibling;
    return next;
  }

  /** Scroll the board sideways when dragging near its left or right edge. */
  function scrollNearEdges(point) {
    const rect = element.getBoundingClientRect();
    if (point.x < rect.left + EDGE_SCROLL_PX) element.scrollLeft -= EDGE_SCROLL_STEP;
    else if (point.x > rect.right - EDGE_SCROLL_PX) element.scrollLeft += EDGE_SCROLL_STEP;
  }

  return { element, draw };
}

/**
 * On a personal homepage: the group cards assigned to you, listed under
 * your own board (they belong to other boards, so they can't sit in your
 * columns). Each shows its group and the column it's in there; clicking
 * opens it on the group's board. Returns null when there are none.
 *
 *   FROM YOUR GROUPS
 *   ▌Fixie: flat tire          In the stand · Today   [↗ Saturday Bike Kitchen]
 */
export function renderLinkedCards(links, { onOpen, compact = false }) {
  if (links.length === 0) return null;

  return h('section', { class: `kanban-linked${compact ? ' kanban-linked--compact' : ''}` },
    h('h3', { class: 'linked-heading' }, 'Assigned to you in your groups'),
    h('ul', { class: 'kanban-linked__list' }, links.map((link) => {
      const card = link.item;
      const details = [link.status, dueLabel(normalizeCardForLabel(card))].filter(Boolean).join(' · ');
      return h('li', {},
        h('button', {
          type: 'button',
          class: `kanban-linked__card${card.color ? ` tint--${card.color}` : ''}`,
          title: `Open on “${link.moduleTitle}” in ${link.spaceName}`,
          onClick: () => onOpen(link),
        },
          h('span', { class: 'kanban-linked__title' }, card.title),
          h('span', { class: 'kanban-linked__details' }, details),
          sourceLabel(link),
        ),
      );
    })),
  );
}

/** dueLabel only needs `due`; this keeps it from tripping on missing fields. */
function normalizeCardForLabel(card) {
  return { due: card.due ?? '' };
}
