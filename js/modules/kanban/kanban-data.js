// @ts-check
/**
 * kanban-data.js — the shape of a kanban board, and the rules for changing it.
 *
 * Data saved for a Kanban module:
 *
 *   {
 *     columns: [ { id, title } ],              ← left to right
 *     cards:   [ {
 *       id, columnId,
 *       title, description,
 *       assigneeIds: ['m-leo'],
 *       acceptedIds: ['m-leo'],      ← which of them said yes (missing = everyone; js/ui/task-people.js)
 *       due: '2026-11-20' | '',
 *       color: 'blue' | '' ,                   ← a label color, see CARD_COLORS
 *       createdAt,                              ← ms timestamp
 *     } ],
 *   }
 *
 * A card's position within its column is its order in the `cards` array,
 * so moving a card means taking it out of the array and putting it back
 * in the right place (see `moveCard`).
 *
 * Every function here works on plain data and never touches the page, so
 * the card and the full page can share them.
 */

import { makeId } from '../../ui/dom.js';
import { todayKey, formatShortDate, daysBetween } from '../../utils/dates.js';

/** Label colors a card can have. '' means no label. */
export const CARD_COLORS = [
  { id: '', label: 'No label' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'orange', label: 'Orange' },
  { id: 'red', label: 'Red' },
  { id: 'purple', label: 'Purple' },
];

export const DEFAULT_COLUMNS = ['To do', 'Doing', 'Done'];

// ─── Creating ────────────────────────────────────────────────────────────────

export function createColumn(title) {
  return { id: makeId('col'), title };
}

export function createCard(fields) {
  return normalizeCard({ id: makeId('card'), createdAt: Date.now(), ...fields });
}

/** Fill in any missing fields, so older or hand-written data still works. */
export function normalizeCard(card) {
  return {
    title: '',
    description: '',
    assigneeIds: [],
    due: '',
    color: '',
    createdAt: 0,
    ...card,
  };
}

/** A fresh board: the default columns and no cards. */
export function createBoard() {
  return { columns: DEFAULT_COLUMNS.map(createColumn), cards: [] };
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export function cardsInColumn(data, columnId) {
  return data.cards.filter((card) => card.columnId === columnId).map(normalizeCard);
}

/**
 * Should this card be shown, given the board's filters?
 *   search:   matches title or description (case-insensitive)
 *   personId: '' for anyone, 'unassigned', or a member id
 */
export function matchesFilters(card, { search = '', personId = '' }) {
  const query = search.trim().toLowerCase();
  if (query && !`${card.title} ${card.description}`.toLowerCase().includes(query)) return false;
  if (personId === 'unassigned') return card.assigneeIds.length === 0;
  if (personId) return card.assigneeIds.includes(personId);
  return true;
}

/** Due before today, and not in the last column (which we treat as "done"). */
export function isOverdue(card, data) {
  const lastColumn = data.columns[data.columns.length - 1];
  return Boolean(card.due) && card.due < todayKey() && card.columnId !== lastColumn?.id;
}

/** "Today", "Tomorrow", "Nov 20". */
export function dueLabel(card) {
  if (!card.due) return '';
  const days = daysBetween(todayKey(), card.due);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return formatShortDate(card.due);
}

// ─── Changing (these change `data` in place; callers clone first) ───────────

/**
 * Move a card to `columnId`, just before the card `beforeCardId`, or to the
 * end of the column when `beforeCardId` is null.
 *
 * (We place cards *relative to another card* rather than at a number
 * position, so it still works when filters hide some of the cards.)
 */
export function moveCard(data, cardId, columnId, beforeCardId = null) {
  const card = data.cards.find((c) => c.id === cardId);
  if (!card || cardId === beforeCardId) return;

  const others = data.cards.filter((c) => c.id !== cardId);
  card.columnId = columnId;

  const before = beforeCardId ? others.find((c) => c.id === beforeCardId) : null;
  if (before) {
    others.splice(others.indexOf(before), 0, card);
  } else {
    // After the column's last card (or at the very end, if it's empty).
    const columnCards = others.filter((c) => c.columnId === columnId);
    const lastCard = columnCards[columnCards.length - 1];
    others.splice(lastCard ? others.indexOf(lastCard) + 1 : others.length, 0, card);
  }
  data.cards = others;
}

/** Move a column one step left (-1) or right (+1). */
export function shiftColumn(data, columnId, direction) {
  const from = data.columns.findIndex((c) => c.id === columnId);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= data.columns.length) return;
  const [column] = data.columns.splice(from, 1);
  data.columns.splice(to, 0, column);
}

/** Move a column to just before another one (null = to the far right). */
export function moveColumn(data, columnId, beforeColumnId) {
  const column = data.columns.find((c) => c.id === columnId);
  if (!column || columnId === beforeColumnId) return;
  data.columns = data.columns.filter((c) => c.id !== columnId);
  const index = beforeColumnId ? data.columns.findIndex((c) => c.id === beforeColumnId) : -1;
  data.columns.splice(index === -1 ? data.columns.length : index, 0, column);
}

/** Remove a column and every card in it. */
export function deleteColumn(data, columnId) {
  data.columns = data.columns.filter((c) => c.id !== columnId);
  data.cards = data.cards.filter((c) => c.columnId !== columnId);
}
