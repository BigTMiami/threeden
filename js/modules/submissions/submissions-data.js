// @ts-check
/**
 * submissions-data.js — assignments, and the work people turn in for them.
 *
 * Data saved for a Submissions module:
 *
 *   {
 *     assignments: [ {
 *       id, title, instructions,
 *       due: '2026-11-20' | '', dueTime: '23:59' | '',
 *       points: 10 | null,              ← out of how many (null = no grade)
 *       createdBy, createdAt,
 *       submissions: [ {
 *         memberId,
 *         items: [ … ],                 ← what they attached (see below)
 *         note: '',                     ← a message to the teacher
 *         status: 'draft' | 'turned-in' | 'returned',
 *         turnedInAt: null | time,
 *         grade: null | number, feedback: '', returnedAt: null | time,
 *       } ],
 *     } ],
 *   }
 *
 * An attached item is a copy of what was turned in, so later edits to the
 * original (say, a note in your vault) don't change the submission:
 *   { id, kind: 'note',   name, html }                ← from a vault
 *   { id, kind: 'file',   name, mimeType, size, dataUrl }   ← a vault file or an upload
 *   { id, kind: 'module', name, moduleType, data }    ← a vault module file (a kanban, a map…)
 *   { id, kind: 'link',   name, url }
 *   { id, kind: 'text',   name: 'Written answer', text }
 * Items from a vault also keep `from: { vaultModuleId, itemId }`.
 *
 * Who sees what (permission "Create assignments and review submissions",
 * admins by default): reviewers see every submission; everyone else sees
 * only their own.
 */

import { makeId } from '../../ui/dom.js';
import { todayKey } from '../../utils/dates.js';

export const STATUS_LABELS = {
  missing: 'Not turned in',
  draft: 'Draft',
  'turned-in': 'Turned in',
  late: 'Turned in late',
  returned: 'Returned',
};

export function createAssignment(fields) {
  return { id: makeId('assignment'), title: '', instructions: '', due: '', dueTime: '', points: null, submissions: [], createdAt: Date.now(), ...fields };
}

export function emptySubmission(memberId) {
  return { memberId, items: [], note: '', status: 'draft', turnedInAt: null, grade: null, feedback: '', returnedAt: null };
}

export function submissionOf(assignment, memberId) {
  return assignment.submissions.find((s) => s.memberId === memberId) ?? null;
}

/** When it's due, as a timestamp (end of the day if there's no time), or null. */
export function dueTime(assignment) {
  if (!assignment.due) return null;
  const [h, m] = (assignment.dueTime || '23:59').split(':').map(Number);
  const date = new Date(`${assignment.due}T00:00:00`);
  date.setHours(h, m, 0, 0);
  return date.getTime();
}

export function isPastDue(assignment, at = Date.now()) {
  const due = dueTime(assignment);
  return due !== null && at > due;
}

/**
 * Where someone's work stands:
 *   'missing' | 'draft' | 'turned-in' | 'late' | 'returned'
 */
export function statusOf(assignment, memberId) {
  const submission = submissionOf(assignment, memberId);
  if (!submission || (submission.status === 'draft' && submission.items.length === 0 && !submission.note)) return 'missing';
  if (submission.status === 'returned') return 'returned';
  if (submission.status === 'turned-in') return isPastDue(assignment, submission.turnedInAt) ? 'late' : 'turned-in';
  return 'draft';
}

/** For reviewers: how many of these people turned it in, and how many wait for review. */
export function progressOf(assignment, studentIds) {
  const statuses = studentIds.map((id) => statusOf(assignment, id));
  return {
    turnedIn: statuses.filter((s) => s === 'turned-in' || s === 'late' || s === 'returned').length,
    toReview: statuses.filter((s) => s === 'turned-in' || s === 'late').length,
    total: studentIds.length,
  };
}

/** Assignments in order: upcoming by due date, then no due date, then past due (newest first). */
export function sortAssignments(assignments) {
  const today = todayKey();
  const rank = (a) => (!a.due ? 1 : a.due >= today ? 0 : 2);
  return [...assignments].sort((a, b) => rank(a) - rank(b)
    || (rank(a) === 2 ? b.due.localeCompare(a.due) : (a.due || '').localeCompare(b.due || ''))
    || b.createdAt - a.createdAt);
}

export const newItemId = () => makeId('sub-item');
