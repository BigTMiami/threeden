/**
 * todo-data.js — task data, plus the filtering, sorting and grouping rules
 * shared by the homepage card and the full-page view.
 *
 * Task shape:
 *   {
 *     id, text, done,
 *     assigneeIds,       // member ids; [] = unassigned. A task can have several people.
 *     acceptedIds,       // which of them said yes (✓ on the notification, or "I'll take it");
 *                        // missing on older tasks = everyone on it (js/ui/task-people.js)
 *     due,               // 'YYYY-MM-DD', or ''
 *     priority,          // 'high' | 'medium' | 'low' | ''
 *     notes,             // free text
 *     subtasks: [{ id, text, done }],
 *     createdAt          // ms timestamp
 *   }
 *
 * Older saved tasks may be missing the newer fields (priority, notes,
 * subtasks, createdAt) or use the old single `assigneeId`. `normalizeTask`
 * fills in defaults and converts `assigneeId` to `assigneeIds`, so the rest
 * of the code can rely on every field being there.
 *
 * When changing a saved task, use `applyTaskChanges` so the old
 * `assigneeId` field is cleaned up at the same time.
 */

import { makeId } from '../../ui/dom.js';
import { todayKey, toDateKey, formatShortDate, addDays } from '../../utils/dates.js';

export const PRIORITIES = [
  { id: 'high', label: 'High', rank: 0 },
  { id: 'medium', label: 'Medium', rank: 1 },
  { id: 'low', label: 'Low', rank: 2 },
];
const NO_PRIORITY_RANK = 3;

export function priorityLabel(priorityId) {
  return PRIORITIES.find((p) => p.id === priorityId)?.label ?? '';
}

function priorityRank(priorityId) {
  return PRIORITIES.find((p) => p.id === priorityId)?.rank ?? NO_PRIORITY_RANK;
}

/**
 * The changes for giving a task these people: whoever was already on it and
 * had accepted stays accepted; anyone new waits until they accept (✓ on the
 * notification). Older tasks without acceptedIds count everyone on them.
 */
export function assignChanges(task, assigneeIds) {
  const accepted = task.acceptedIds ?? task.assigneeIds ?? [];
  return { assigneeIds, acceptedIds: accepted.filter((id) => assigneeIds.includes(id)) };
}

// ─── Creating and reading tasks ──────────────────────────────────────────────

export function normalizeTask(task) {
  const { assigneeId, ...rest } = task;
  return {
    due: '',
    priority: '',
    notes: '',
    subtasks: [],
    createdAt: 0,
    ...rest,
    assigneeIds: task.assigneeIds ?? (assigneeId ? [assigneeId] : []),
  };
}

/** How often a task comes back once it's done. */
export const REPEATS = [
  { id: '', label: 'Doesn’t repeat' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekly', label: 'Every week' },
  { id: 'monthly', label: 'Every month' },
];

/** The next due date after `due` (or today) for a repeat. */
export function nextDue(due, repeat) {
  const from = due || todayKey();
  if (repeat === 'daily') return addDays(from, 1);
  if (repeat === 'weekly') return addDays(from, 7);
  const [y, m, d] = from.split('-').map(Number);
  const next = new Date(y, m, Math.min(d, new Date(y, m + 1, 0).getDate()), 12);
  return toDateKey(next);
}

/**
 * Copy `changes` onto a saved task, dropping the old single-assignee field.
 * Finishing a repeating task ("every Monday: take out recycling") doesn't
 * close it: it comes back with its next due date and its subtasks cleared.
 * `lastDone` keeps the date it was last done, so Undo can put it back.
 */
export function applyTaskChanges(savedTask, changes) {
  if (changes.done === true && savedTask.repeat && !savedTask.done) {
    const { done: _done, ...rest } = changes;
    Object.assign(savedTask, rest);
    savedTask.lastDone = { at: Date.now(), due: savedTask.due };
    savedTask.due = nextDue(savedTask.due, savedTask.repeat);
    savedTask.subtasks = (savedTask.subtasks ?? []).map((s) => ({ ...s, done: false }));
    savedTask.doneCount = (savedTask.doneCount ?? 0) + 1;
  } else if (changes.undoRepeat && savedTask.lastDone) {
    // Undo of a repeat: back to the due date it had.
    savedTask.due = savedTask.lastDone.due;
    savedTask.doneCount = Math.max(0, (savedTask.doneCount ?? 1) - 1);
    delete savedTask.lastDone;
  } else {
    Object.assign(savedTask, changes);
  }
  delete savedTask.undoRepeat;
  if ('assigneeIds' in changes) delete savedTask.assigneeId;
}

/** "↻ Every week" for a repeating task, or ''. */
export const repeatLabel = (task) => REPEATS.find((r) => r.id === task.repeat && r.id)?.label ?? '';

export function isAssignedTo(task, memberId) {
  return task.assigneeIds.includes(memberId);
}

export function createTask(fields) {
  return normalizeTask({
    id: makeId('task'),
    done: false,
    createdAt: Date.now(),
    ...fields,
  });
}

export function createSubtask(text) {
  return { id: makeId('sub'), text, done: false };
}

export function isOverdue(task) {
  return !task.done && Boolean(task.due) && task.due < todayKey();
}

/** 'Due Nov 14', 'Overdue · Nov 2', or '' when there's no due date. */
export function dueLabel(task) {
  if (!task.due) return '';
  return isOverdue(task) ? `Overdue · ${formatShortDate(task.due)}` : `Due ${formatShortDate(task.due)}`;
}

/** '2 of 3' for tasks with subtasks, '' otherwise. */
export function subtaskProgress(task) {
  if (!task.subtasks.length) return '';
  const done = task.subtasks.filter((s) => s.done).length;
  return `${done} of ${task.subtasks.length}`;
}

/** Counts for the summary row at the top of the full page. */
export function summarize(tasks, currentUserId) {
  return {
    open: tasks.filter((t) => !t.done).length,
    done: tasks.filter((t) => t.done).length,
    overdue: tasks.filter(isOverdue).length,
    mine: tasks.filter((t) => !t.done && isAssignedTo(t, currentUserId)).length,
  };
}

// ─── Filtering ───────────────────────────────────────────────────────────────

/**
 * @param {object[]} tasks
 * @param {object}   filters
 * @param {string}   filters.status      'all' | 'open' | 'mine' | 'done'
 * @param {string}   [filters.assigneeId] '' = anyone, 'unassigned', or a member id
 *                                        (matches tasks that person is one of the assignees on)
 * @param {string}   [filters.search]     matched against text and notes
 * @param {string}   currentUserId
 */
export function filterTasks(tasks, { status, assigneeId = '', search = '' }, currentUserId) {
  const query = search.trim().toLowerCase();

  return tasks.filter((task) => {
    if (status === 'open' && task.done) return false;
    if (status === 'done' && !task.done) return false;
    if (status === 'mine' && !isAssignedTo(task, currentUserId)) return false;

    if (assigneeId === 'unassigned' && task.assigneeIds.length > 0) return false;
    if (assigneeId && assigneeId !== 'unassigned' && !isAssignedTo(task, assigneeId)) return false;

    if (query && !`${task.text} ${task.notes}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

export const SORT_OPTIONS = [
  { id: 'due', label: 'Due date' },
  { id: 'priority', label: 'Priority' },
  { id: 'created', label: 'Newest first' },
  { id: 'name', label: 'A–Z' },
];

/** Tasks without a due date go last when sorting by due date. */
const FAR_FUTURE = '9999-12-31';

export function sortTasks(tasks, sortId) {
  const sorted = [...tasks];
  const byName = (a, b) => a.text.localeCompare(b.text);

  if (sortId === 'due') sorted.sort((a, b) => (a.due || FAR_FUTURE).localeCompare(b.due || FAR_FUTURE) || byName(a, b));
  else if (sortId === 'priority') sorted.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || byName(a, b));
  else if (sortId === 'created') sorted.sort((a, b) => b.createdAt - a.createdAt);
  else sorted.sort(byName);

  return sorted;
}

// ─── Grouping ────────────────────────────────────────────────────────────────

export const GROUP_OPTIONS = [
  { id: 'none', label: 'No grouping' },
  { id: 'due', label: 'Due date' },
  { id: 'assignee', label: 'Person' },
  { id: 'priority', label: 'Priority' },
];

/**
 * Split tasks into labeled groups, keeping the order given. Empty groups
 * are left out. Returns [{ key, label, tasks }].
 *
 * Grouping by person puts a shared task under each of its people.
 * Every other grouping puts each task in exactly one group.
 */
export function groupTasks(tasks, groupId, members) {
  if (groupId === 'none') return [{ key: 'all', label: '', tasks }];

  const buckets = bucketDefinitions(groupId, members);
  const allowSeveralGroups = groupId === 'assignee';

  for (const task of tasks) {
    const matching = buckets.filter((b) => b.matches(task));
    const targets = allowSeveralGroups ? matching : matching.slice(0, 1);
    targets.forEach((bucket) => bucket.tasks.push(task));
  }

  // When grouping by due date, finished tasks are matched first (so a done
  // task never shows as overdue) but listed last.
  if (groupId === 'due') buckets.push(buckets.shift());

  return buckets
    .filter((b) => b.tasks.length > 0)
    .map(({ key, label, tasks: groupTasks }) => ({ key, label, tasks: groupTasks }));
}

/** The groups for each grouping option. Each task lands in the first group it matches. */
function bucketDefinitions(groupId, members) {
  const bucket = (key, label, matches) => ({ key, label, matches, tasks: [] });

  if (groupId === 'assignee') {
    return [
      ...members.map((m) => bucket(m.id, m.name, (t) => isAssignedTo(t, m.id))),
      bucket('unassigned', 'Unassigned', (t) => t.assigneeIds.length === 0),
    ];
  }

  if (groupId === 'priority') {
    return [
      ...PRIORITIES.map((p) => bucket(p.id, `${p.label} priority`, (t) => t.priority === p.id)),
      bucket('none', 'No priority', () => true),
    ];
  }

  // groupId === 'due'
  const today = todayKey();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekKey = toDateKey(nextWeek);

  return [
    bucket('done', 'Done', (t) => t.done),
    bucket('overdue', 'Overdue', (t) => isOverdue(t)),
    bucket('today', 'Today', (t) => t.due === today),
    bucket('week', 'Next 7 days', (t) => t.due && t.due <= nextWeekKey),
    bucket('later', 'Later', (t) => Boolean(t.due)),
    bucket('none', 'No due date', () => true),
  ];
}
