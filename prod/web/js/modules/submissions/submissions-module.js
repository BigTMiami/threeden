// @ts-check
/**
 * submissions-module.js — the Submissions module: assignments, and the
 * work people turn in for them (from their vault, an upload, a link, or
 * a written answer). Made for classes, but works for any group that
 * collects things: applications, reports, photos for a contest…
 *
 * Files in this folder:
 *   submissions-module.js   ← this file: the module definition and the homepage card
 *   submissions-page.js     the full page: assignments, your work, reviewing
 *   submission-items.js     attaching work (vault, upload, link, text) and viewing it
 *   submissions-data.js     the data shape, statuses, due dates
 *
 * Data shape: { assignments: [...] }, see submissions-data.js.
 */

import { h, appendChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { formatLongDate } from '../../utils/dates.js';
import { statusOf, progressOf, sortAssignments, isPastDue } from './submissions-data.js';
import { renderSubmissionsPage, studentsOf, statusChip } from './submissions-page.js';

const CARD_LIMIT = 5;

export const submissionsModule = {
  type: 'submissions',
  label: 'Submissions',
  description: 'Assignments people turn work in for, from their vault or anywhere',
  icon: 'upload',
  defaultSpan: 6,
  defaultRows: 12,
  available: true,
  // Groups only since Nov 17: not something to add to your own homepage.
  spaceKinds: ['group'],

  createInitialData: () => ({ assignments: [] }),
  render: renderSubmissionsCard,
  renderFullPage: renderSubmissionsPage,
};

/**
 *   Reading response 3     Due Fri, Nov 20     Turned in       ← everyone else
 *   Reading response 3     Due Fri, Nov 20     4 of 6 in · 2 to review   ← reviewers
 */
function renderSubmissionsCard(container, context) {
  const me = context.currentUser;
  const isReviewer = context.can('manageSubmissions');
  const assignments = sortAssignments(context.getData().assignments ?? []);
  const studentIds = studentsOf(context).map((m) => m.id);

  const todo = assignments.filter((a) => ['missing', 'draft'].includes(statusOf(a, me.id)) && !isPastDue(a)).length;
  const toReview = assignments.reduce((n, a) => n + progressOf(a, studentIds).toReview, 0);

  appendChildren(container, [
    h('p', { class: 'sub-card__summary' }, isReviewer
      ? (toReview ? `${toReview} ${toReview === 1 ? 'submission' : 'submissions'} to review` : 'Nothing waiting for review')
      : (todo ? `${todo} to turn in` : 'You’re all caught up')),
    assignments.length === 0
      ? h('p', { class: 'module-empty' }, isReviewer ? 'No assignments yet. ' : 'Nothing assigned yet.',
        isReviewer ? h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage() }, 'Post one') : null)
      : h('ul', { class: 'sub-card__list' }, assignments.slice(0, CARD_LIMIT).map((assignment) => {
        const progress = progressOf(assignment, studentIds);
        return h('li', {},
          h('button', { type: 'button', class: 'sub-card__row', onClick: () => context.openFullPage(assignment.id) },
            h('span', { class: 'sub-card__title' }, assignment.title),
            h('span', { class: 'sub-card__due' }, icon('calendar', 11), assignment.due ? ` ${formatLongDate(assignment.due).replace(/^\w+, /, '')}` : ' No due date'),
            isReviewer
              ? h('span', { class: 'sub-card__progress' }, `${progress.turnedIn}/${progress.total} in${progress.toReview ? ` · ${progress.toReview} to review` : ''}`)
              : statusChip(statusOf(assignment, me.id))));
      })),
    assignments.length > CARD_LIMIT ? h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage() }, `All ${assignments.length} assignments →`) : null,
  ]);
}
