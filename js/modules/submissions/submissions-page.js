// @ts-check
/**
 * submissions-page.js — Submissions as a full page.
 *
 *   [+ New assignment]                                   ← reviewers only
 *   ┌ assignments ─────────┐ ┌ the chosen assignment ───────────────────────┐
 *   │ Reading response 3   │ │ Reading response 3 · due Fri, Nov 20 · 10 pts│
 *   │ due Nov 20 · 4/6 in  │ │ instructions…                                │
 *   │ Field notes          │ │                                              │
 *   │ due Nov 13 · Returned│ │ Reviewer: everyone's status, their work,     │
 *   └──────────────────────┘ │   a grade and feedback, "Return"             │
 *                            │ Everyone else: "Your work": attach from a    │
 *                            │   vault, upload, link or write; Turn in      │
 *                            └──────────────────────────────────────────────┘
 *
 * Reviewers are people whose role has "Create assignments and review
 * submissions" (admins by default; see js/state/permissions.js).
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { showToast } from '../../ui/toast.js';
import { renderText } from '../../ui/text.js';
import { timeAgo, formatLongDate, formatTime } from '../../utils/dates.js';
import { getSpace } from '../../state/store.js';
import { can } from '../../state/permissions.js';
import { notify } from '../../state/notifications.js';
import {
  STATUS_LABELS, createAssignment, emptySubmission, submissionOf, statusOf, progressOf, sortAssignments, isPastDue,
} from './submissions-data.js';
import { renderAttachChooser, renderSubmittedItem } from './submission-items.js';

/** "Due Fri, Nov 20, 11:59pm" */
export function dueLabel(assignment) {
  if (!assignment.due) return 'No due date';
  return `Due ${formatLongDate(assignment.due)}${assignment.dueTime ? `, ${formatTime(assignment.dueTime)}` : ''}`;
}

/** The people in the group who turn work in (everyone who can't review). */
export function studentsOf(context) {
  const space = getSpace(context.spaceId);
  return context.members.filter((m) => !can(space, m.id, 'manageSubmissions'));
}

export function statusChip(status) {
  return h('span', { class: `sub-status sub-status--${status}` }, STATUS_LABELS[status]);
}

export function renderSubmissionsPage(container, context) {
  const me = context.currentUser;
  const isReviewer = context.can('manageSubmissions');
  const view = { assignmentId: context.takeFocusRequest(), editing: null, openStudentId: null };

  const data = () => context.getData();
  const assignments = () => sortAssignments(data().assignments ?? []);
  const reviewers = () => context.members.filter((m) => can(getSpace(context.spaceId), m.id, 'manageSubmissions'));

  function update(changeFn) {
    const next = structuredClone(data());
    next.assignments = next.assignments ?? [];
    changeFn(next);
    context.saveData(next);
    drawAll();
  }
  const findIn = (next, id) => next.assignments.find((a) => a.id === id);

  /** Change your own submission (creating it if needed). */
  function updateMine(assignmentId, changeFn) {
    update((next) => {
      const assignment = findIn(next, assignmentId);
      let mine = submissionOf(assignment, me.id);
      if (!mine) { mine = emptySubmission(me.id); assignment.submissions.push(mine); }
      changeFn(mine);
    });
  }

  // ─── The list ──────────────────────────────────────────────────────────────

  const list = h('nav', { class: 'sub-page__list', 'aria-label': 'Assignments' });

  function drawList() {
    const all = assignments();
    if (!view.assignmentId && all.length && !view.editing) view.assignmentId = all[0].id;
    const students = studentsOf(context).map((m) => m.id);
    replaceChildren(list,
      isReviewer ? h('button', { type: 'button', class: 'button button--primary sub-page__new', onClick: () => { view.editing = 'new'; view.assignmentId = null; drawAll(); } }, icon('plus', 14), ' New assignment') : null,
      all.length === 0 ? h('p', { class: 'module-empty' }, isReviewer ? 'No assignments yet.' : 'Nothing assigned yet.') : null,
      h('ul', { class: 'sub-page__assignments' }, all.map((assignment) => {
        const progress = progressOf(assignment, students);
        return h('li', {},
          h('button', {
            type: 'button',
            class: `sub-page__assignment${assignment.id === view.assignmentId ? ' is-current' : ''}`,
            onClick: () => { Object.assign(view, { assignmentId: assignment.id, editing: null, openStudentId: null }); drawAll(); },
          },
            h('span', { class: 'sub-page__assignment-title' }, assignment.title),
            h('span', { class: 'sub-page__assignment-meta' },
              assignment.due ? `${formatLongDate(assignment.due).replace(/^\w+, /, '')} · ` : '',
              isReviewer
                ? `${progress.turnedIn}/${progress.total} in${progress.toReview ? ` · ${progress.toReview} to review` : ''}`
                : statusChip(statusOf(assignment, me.id)))));
      })));
  }

  // ─── The chosen assignment ─────────────────────────────────────────────────

  const detail = h('section', { class: 'sub-page__detail' });

  function drawDetail() {
    if (view.editing) { replaceChildren(detail, renderEditor(view.editing === 'new' ? null : assignments().find((a) => a.id === view.editing))); return; }
    const assignment = assignments().find((a) => a.id === view.assignmentId);
    if (!assignment) { replaceChildren(detail, h('p', { class: 'module-empty' }, 'Choose an assignment.')); return; }
    replaceChildren(detail,
      h('header', { class: 'sub-page__header' },
        h('h2', { class: 'sub-page__title' }, assignment.title),
        h('p', { class: 'sub-page__due' },
          icon('calendar', 13), ` ${dueLabel(assignment)}`,
          isPastDue(assignment) ? h('span', { class: 'sub-page__past' }, ' · past due') : null,
          assignment.points ? ` · ${assignment.points} points` : '',
          ` · posted by ${context.getMember(assignment.createdBy)?.name ?? 'someone'} ${timeAgo(assignment.createdAt)}`),
        isReviewer ? h('p', { class: 'sub-page__header-tools' },
          h('button', { type: 'button', class: 'link-button', onClick: () => { view.editing = assignment.id; drawAll(); } }, 'Edit'),
          h('button', {
            type: 'button',
            class: 'link-button link-button--danger',
            onClick: () => {
              const before = structuredClone(data());
              view.assignmentId = null;
              update((next) => { next.assignments = next.assignments.filter((a) => a.id !== assignment.id); });
              showToast(`Deleted “${assignment.title}” and its submissions.`, { actionLabel: 'Undo', onAction: () => { context.saveData(before); drawAll(); } });
            },
          }, 'Delete')) : null),
      assignment.instructions ? h('div', { class: 'sub-page__instructions' }, assignment.instructions.split(/\n{2,}/).map((p) => h('p', {}, renderText(p)))) : null,
      isReviewer ? renderReview(assignment) : renderMyWork(assignment),
    );
  }

  // Everyone else: your own work.

  function renderMyWork(assignment) {
    const mine = submissionOf(assignment, me.id) ?? emptySubmission(me.id);
    const status = statusOf(assignment, me.id);
    const canChange = mine.status === 'draft' || mine.status === 'returned';
    const note = h('textarea', {
      class: 'input',
      rows: '2',
      placeholder: 'A note to your teacher (optional)',
      'aria-label': 'Note',
      disabled: !canChange,
      onChange: (event) => updateMine(assignment.id, (s) => { s.note = event.target.value.trim(); }),
    });
    note.value = mine.note;

    return h('section', { class: 'sub-work' },
      h('div', { class: 'sub-work__top' }, h('h3', { class: 'sub-work__title' }, 'Your work'), statusChip(status)),
      mine.status === 'returned' ? h('div', { class: 'sub-work__feedback' },
        h('strong', {}, mine.grade !== null && assignment.points ? `Grade: ${mine.grade} / ${assignment.points}` : 'Returned'),
        mine.feedback ? h('p', {}, renderText(mine.feedback)) : null,
        h('p', { class: 'sub-work__meta' }, `Returned ${timeAgo(mine.returnedAt)}. You can change your work and turn it in again.`)) : null,
      mine.items.length
        ? h('ul', { class: 'sub-items' }, mine.items.map((item) => renderSubmittedItem(item, {
          onRemove: canChange ? () => updateMine(assignment.id, (s) => { s.items = s.items.filter((i) => i.id !== item.id); }) : null,
        })))
        : h('p', { class: 'module-empty' }, 'Nothing attached yet.'),
      canChange ? renderAttachChooser({ spaceId: context.spaceId, onAdd: (item) => updateMine(assignment.id, (s) => { s.items.push(item); }) }) : null,
      note,
      h('div', { class: 'sub-work__actions' },
        canChange ? h('button', {
          type: 'button',
          class: 'button button--primary',
          disabled: mine.items.length === 0,
          title: mine.items.length ? '' : 'Attach something first',
          onClick: () => {
            updateMine(assignment.id, (s) => { Object.assign(s, { status: 'turned-in', turnedInAt: Date.now() }); });
            notify({ recipientIds: reviewers().map((m) => m.id), actorId: me.id, kind: 'submission', text: `${me.name} turned in “${assignment.title}”${isPastDue(assignment) ? ' (late)' : ''}`, moduleId: context.moduleId, itemId: assignment.id });
            showToast(isPastDue(assignment) ? 'Turned in (late).' : 'Turned in. Nice work!');
          },
        }, mine.status === 'returned' ? 'Turn in again' : 'Turn in') : null,
        mine.status === 'turned-in' ? [
          h('span', { class: 'sub-work__meta' }, `Turned in ${timeAgo(mine.turnedInAt)}.`),
          h('button', { type: 'button', class: 'button', onClick: () => updateMine(assignment.id, (s) => { Object.assign(s, { status: 'draft', turnedInAt: null }); }) }, 'Unsubmit to change it'),
        ] : null),
    );
  }

  // Reviewers: everyone's work.

  function renderReview(assignment) {
    const students = studentsOf(context);
    const progress = progressOf(assignment, students.map((m) => m.id));
    return h('section', { class: 'sub-review' },
      h('h3', { class: 'sub-work__title' }, `Submissions: ${progress.turnedIn} of ${progress.total} turned in${progress.toReview ? ` · ${progress.toReview} to review` : ''}`),
      students.length === 0 ? h('p', { class: 'module-empty' }, 'No one in the group turns work in yet. (Everyone here can review.)') : null,
      h('ul', { class: 'sub-review__list' }, students.map((student) => {
        const submission = submissionOf(assignment, student.id);
        const status = statusOf(assignment, student.id);
        const isOpen = view.openStudentId === student.id;
        return h('li', { class: `sub-review__row${isOpen ? ' is-open' : ''}` },
          h('button', {
            type: 'button',
            class: 'sub-review__summary',
            'aria-expanded': String(isOpen),
            onClick: () => { view.openStudentId = isOpen ? null : student.id; drawDetail(); },
          },
            avatar(student, 26),
            h('span', { class: 'sub-review__name' }, student.name),
            statusChip(status),
            h('span', { class: 'sub-review__meta' },
              submission?.turnedInAt && status !== 'draft' ? `${timeAgo(submission.turnedInAt)} · ${submission.items.length} ${submission.items.length === 1 ? 'item' : 'items'}` : '',
              submission?.grade !== null && submission?.grade !== undefined && assignment.points ? ` · ${submission.grade}/${assignment.points}` : ''),
            icon(isOpen ? 'chevronDown' : 'chevronRight', 14)),
          isOpen ? renderStudentWork(assignment, student, submission, status) : null);
      })),
    );
  }

  function renderStudentWork(assignment, student, submission, status) {
    if (!submission || status === 'missing' || status === 'draft') {
      return h('div', { class: 'sub-review__work' }, h('p', { class: 'module-empty' }, `${student.name.split(' ')[0]} hasn’t turned this in yet.`));
    }
    const grade = assignment.points ? h('input', {
      type: 'number', class: 'input input--compact sub-review__grade', min: '0', max: String(assignment.points), step: '0.5',
      value: submission.grade ?? '', 'aria-label': `Grade out of ${assignment.points}`,
    }) : null;
    const feedback = h('textarea', { class: 'input', rows: '3', placeholder: `Feedback for ${student.name.split(' ')[0]}`, 'aria-label': 'Feedback' });
    feedback.value = submission.feedback;

    return h('div', { class: 'sub-review__work' },
      h('ul', { class: 'sub-items' }, submission.items.map((item) => renderSubmittedItem(item))),
      submission.note ? h('p', { class: 'sub-review__note' }, h('strong', {}, 'Note: '), renderText(submission.note)) : null,
      h('div', { class: 'sub-review__grading' },
        grade ? h('label', { class: 'page-control' }, h('span', { class: 'page-control__label' }, 'Grade'), grade, h('span', {}, ` / ${assignment.points}`)) : null,
        feedback,
        h('div', { class: 'form-row' },
          h('button', {
            type: 'button',
            class: 'button button--primary button--small',
            onClick: () => {
              const value = grade && grade.value !== '' ? Number(grade.value) : null;
              update((next) => {
                const target = submissionOf(findIn(next, assignment.id), student.id);
                Object.assign(target, { status: 'returned', grade: value, feedback: feedback.value.trim(), returnedAt: Date.now() });
              });
              notify({
                recipientIds: [student.id], actorId: me.id, kind: 'submission',
                text: `${me.name} returned “${assignment.title}”${value !== null ? `: ${value}/${assignment.points}` : ''}`,
                moduleId: context.moduleId, itemId: assignment.id,
              });
              showToast(`Returned to ${student.name}.`);
            },
          }, status === 'returned' ? 'Update and return again' : 'Return to student'),
          status === 'returned' ? h('span', { class: 'sub-work__meta' }, `Returned ${timeAgo(submission.returnedAt)}`) : null)));
  }

  // Reviewers: making or changing an assignment.

  function renderEditor(assignment) {
    const isNew = !assignment;
    const title = h('input', { type: 'text', class: 'input', value: assignment?.title ?? '', placeholder: 'e.g. Reading response 4', 'aria-label': 'Title' });
    const instructions = h('textarea', { class: 'input', rows: '6', placeholder: 'What to do, how long, what to attach…', 'aria-label': 'Instructions' });
    instructions.value = assignment?.instructions ?? '';
    const due = h('input', { type: 'date', class: 'input input--compact', value: assignment?.due ?? '', 'aria-label': 'Due date' });
    const time = h('input', { type: 'time', class: 'input input--compact', value: assignment?.dueTime ?? '23:59', 'aria-label': 'Due time' });
    const points = h('input', { type: 'number', class: 'input input--compact', min: '0', value: assignment?.points ?? '', placeholder: 'No grade', 'aria-label': 'Points' });
    const error = h('p', { class: 'form-error', role: 'alert' });
    requestAnimationFrame(() => title.focus());

    return h('form', {
      class: 'sub-editor',
      onSubmit: (event) => {
        event.preventDefault();
        if (!title.value.trim()) { error.textContent = 'Give it a title.'; title.focus(); return; }
        const fields = {
          title: title.value.trim(), instructions: instructions.value.trim(), due: due.value, dueTime: due.value ? time.value : '',
          points: points.value === '' ? null : Number(points.value),
        };
        if (isNew) {
          const created = createAssignment({ ...fields, createdBy: me.id });
          view.assignmentId = created.id;
          view.editing = null;
          update((next) => next.assignments.push(created));
          notify({
            recipientIds: studentsOf(context).map((m) => m.id), actorId: me.id, kind: 'submission',
            text: `${me.name} posted a new assignment: “${created.title}”${created.due ? ` (${dueLabel(created).toLowerCase()})` : ''}`,
            moduleId: context.moduleId, itemId: created.id,
          });
          showToast(`Posted “${created.title}”.`);
        } else {
          view.editing = null;
          update((next) => Object.assign(findIn(next, assignment.id), fields));
        }
      },
    },
      h('h2', { class: 'sub-page__title' }, isNew ? 'New assignment' : 'Edit assignment'),
      h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Title'), title),
      h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Instructions'), instructions),
      h('div', { class: 'form-row' },
        h('label', { class: 'page-control' }, h('span', { class: 'page-control__label' }, 'Due'), due, time),
        h('label', { class: 'page-control' }, h('span', { class: 'page-control__label' }, 'Points'), points)),
      error,
      h('div', { class: 'form-row' },
        h('button', { type: 'submit', class: 'button button--primary' }, isNew ? 'Post assignment' : 'Save'),
        h('button', { type: 'button', class: 'button button--quiet', onClick: () => { view.editing = null; drawAll(); } }, 'Cancel')));
  }

  function drawAll() {
    drawList();
    drawDetail();
  }

  container.append(h('div', { class: 'sub-page' }, list, detail));
  drawAll();
}
