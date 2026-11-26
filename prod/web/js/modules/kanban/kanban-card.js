// @ts-check
/**
 * kanban-card.js — the Tasks module's Board view as it appears on the homepage.
 * (The board code here works on { columns, cards }; js/modules/todo/tasks-board.js
 * turns a Tasks list into that shape and back.)
 *
 * A compact board whose columns scroll sideways inside the module. Cards
 * can be dragged between columns and added right here. Clicking a card
 * opens the full page with that card's details showing.
 *
 * On a personal homepage, group cards assigned to you are listed under the
 * board (see js/editor/linked-items.js).
 */

import { h } from '../../ui/dom.js';
import { createKanbanBoard, renderLinkedCards } from './kanban-board.js';
import { createCard, createColumn, moveCard, moveColumn } from './kanban-data.js';

export function renderKanbanCard(container, context) {
  const isSolo = context.members.length <= 1;

  function update(changeFn) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    board.draw();
  }

  const board = createKanbanBoard({
    getData: () => context.getData(),
    getMember: context.getMember,
    isSolo,
    compact: true,
    onOpenCard: (cardId) => context.openFullPage(cardId),
    onMoveCard: (cardId, columnId, beforeCardId) => update((data) => moveCard(data, cardId, columnId, beforeCardId)),
    onMoveColumn: (columnId, beforeColumnId) => update((data) => moveColumn(data, columnId, beforeColumnId)),
    onAddColumn: (title) => update((data) => data.columns.push(createColumn(title))),
    onAddCard: (columnId, title) => update((data) => {
      // On a personal homepage, new cards are yours.
      data.cards.push(createCard({ columnId, title, assigneeIds: isSolo ? [context.currentUser.id] : [] }));
    }),
  });

  container.append(h('div', { class: 'kanban-card-view' },
    board.element,
    renderLinkedCards(context.getLinkedItems(), { onOpen: context.openLinkedItem, compact: true }),
  ));
  board.draw();
}
