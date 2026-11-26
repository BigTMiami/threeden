// @ts-check
/**
 * survey-module.js — the Survey module: ask the group questions, see the
 * answers add up.
 *
 *   [ Answer ] [ Results · 6 ] [ Edit ]
 *   Which Saturday works for the cleanup?        ← one choice
 *     ○ Nov 21   ○ Nov 28   ○ Dec 5
 *   What should we bring?                        ← checkboxes
 *   How was the last one?   1 2 3 4 5            ← scale
 *   Anything else?          [ short answer ]     ← text
 *
 * Whoever made the survey, and anyone who can edit the page, edits the
 * questions. Members answer once (and can change their answers). Results
 * show bars for choices and scales and a list for text answers, with names
 * unless the survey is anonymous. A closed survey takes no more answers.
 *
 * Works on a page and as a vault file (see js/modules/vault/vault-module-files.js).
 *
 * Data shape:
 *   { createdBy, anonymous, closed,
 *     questions: [{ id, kind: 'choice' | 'checkboxes' | 'scale' | 'text', prompt, options: [string] }],
 *     responses: [{ memberId, at, answers: { [questionId]: string | string[] | number } }] }
 */

import { h, replaceChildren, makeId } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';

const KINDS = [
  { id: 'choice', label: 'One choice' },
  { id: 'checkboxes', label: 'Checkboxes' },
  { id: 'scale', label: 'Scale of 1 to 5' },
  { id: 'text', label: 'Short answer' },
];

const newQuestion = (kind = 'choice') => ({ id: makeId('q'), kind, prompt: '', options: kind === 'choice' || kind === 'checkboxes' ? ['', ''] : [] });

/** Questions with something to ask (empty ones in the editor are skipped elsewhere). */
const asked = (data) => data.questions.filter((q) => q.prompt.trim());

function normalize(data) {
  return { createdBy: null, anonymous: false, closed: false, questions: [], responses: [], ...(data ?? {}) };
}

/** Counts for a choice, checkbox, or scale question: [{ label, count }]. */
export function tally(question, responses) {
  const labels = question.kind === 'scale' ? ['1', '2', '3', '4', '5'] : question.options.filter((o) => o.trim());
  return labels.map((label) => ({
    label,
    count: responses.filter((r) => {
      const answer = r.answers[question.id];
      return Array.isArray(answer) ? answer.includes(label) : String(answer ?? '') === label;
    }).length,
  }));
}

function renderSurvey(container, context, { compact = false } = {}) {
  const me = context.currentUser;
  const data = () => normalize(context.getData());
  const mayEdit = () => !context.isVisitor && (data().createdBy === me?.id || context.can('editHomepage'));
  const mine = () => data().responses.find((r) => r.memberId === me?.id) ?? null;

  const firstTab = () => {
    const d = data();
    if (!asked(d).length && mayEdit()) return 'edit';
    if (!context.isVisitor && !d.closed && !mine()) return 'answer';
    return 'results';
  };
  let tab = firstTab();

  function save(changeFn, redraw = true) {
    const next = structuredClone(data());
    changeFn(next);
    context.saveData(next);
    if (redraw) draw();
  }

  const root = h('div', { class: `survey${compact ? ' survey--compact' : ''}` });
  container.append(root);

  function tabs() {
    const d = data();
    const button = (id, label) => h('button', {
      type: 'button',
      role: 'tab',
      class: 'survey__tab',
      'aria-selected': String(tab === id),
      onClick: () => { tab = id; draw(); },
    }, label);
    return h('div', { class: 'survey__tabs', role: 'tablist' },
      context.isVisitor || d.closed ? null : button('answer', mine() ? 'Your answers' : 'Answer'),
      button('results', `Results · ${d.responses.length}`),
      mayEdit() ? button('edit', 'Edit') : null,
      d.closed ? h('span', { class: 'survey__closed' }, icon('lock', 12), ' Closed') : null);
  }

  // ── Answering ────────────────────────────────────────────────────────────
  function answerView() {
    const d = data();
    const questions = asked(d);
    if (!questions.length) return h('p', { class: 'survey__empty' }, 'No questions yet.');
    const previous = mine()?.answers ?? {};
    const form = h('form', {
      class: 'survey__form',
      onSubmit: (event) => {
        event.preventDefault();
        const answers = {};
        for (const q of questions) {
          if (q.kind === 'checkboxes') answers[q.id] = [...form.querySelectorAll(`[name="${q.id}"]:checked`)].map((i) => /** @type {HTMLInputElement} */ (i).value);
          else if (q.kind === 'text') answers[q.id] = /** @type {HTMLInputElement} */ (form.querySelector(`[name="${q.id}"]`)).value.trim();
          else answers[q.id] = /** @type {HTMLInputElement | null} */ (form.querySelector(`[name="${q.id}"]:checked`))?.value ?? '';
        }
        const answeredAny = Object.values(answers).some((a) => (Array.isArray(a) ? a.length : a !== ''));
        if (!answeredAny) { showToast('Answer at least one question first.'); return; }
        const changing = Boolean(mine());
        save((next) => {
          next.responses = next.responses.filter((r) => r.memberId !== me.id);
          next.responses.push({ memberId: me.id, at: Date.now(), answers });
        }, false);
        tab = 'results';
        draw();
        showToast(changing ? 'Your answers are updated.' : 'Thanks, your answers are in.');
      },
    });
    questions.forEach((q, index) => {
      const fieldset = h('fieldset', { class: 'survey__question' },
        h('legend', { class: 'survey__prompt' }, `${index + 1}. ${q.prompt}`));
      if (q.kind === 'text') {
        fieldset.append(h('textarea', { class: 'input survey__text', name: q.id, rows: 2, 'aria-label': q.prompt }, String(previous[q.id] ?? '')));
      } else {
        const labels = q.kind === 'scale' ? ['1', '2', '3', '4', '5'] : q.options.filter((o) => o.trim());
        const type = q.kind === 'checkboxes' ? 'checkbox' : 'radio';
        const was = previous[q.id];
        fieldset.append(h('div', { class: `survey__options${q.kind === 'scale' ? ' survey__options--scale' : ''}` },
          labels.map((label) => h('label', { class: 'survey__option' },
            h('input', { type, name: q.id, value: label, checked: Array.isArray(was) ? was.includes(label) : String(was ?? '') === label }),
            h('span', {}, label)))));
        if (q.kind === 'scale') fieldset.append(h('p', { class: 'survey__scale-ends' }, h('span', {}, 'Not at all'), h('span', {}, 'Very')));
      }
      form.append(fieldset);
    });
    form.append(h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--primary button--small' }, mine() ? 'Update my answers' : 'Send answers'),
      h('span', { class: 'survey__note' }, d.anonymous ? 'Answers are anonymous.' : 'Your name shows with your answers.')));
    return form;
  }

  // ── Results ──────────────────────────────────────────────────────────────
  function resultsView() {
    const d = data();
    const questions = asked(d);
    if (!d.responses.length) {
      return h('p', { class: 'survey__empty' }, context.isVisitor ? 'No answers yet.' : 'No answers yet. Share it with the group.');
    }
    const who = (r) => (d.anonymous ? null : context.getMember(r.memberId)?.name ?? 'Someone');
    return h('div', { class: 'survey__results' },
      h('p', { class: 'survey__count' }, `${d.responses.length} ${d.responses.length === 1 ? 'response' : 'responses'}${d.anonymous ? ' · anonymous' : ''}`),
      questions.map((q, index) => {
        const block = h('section', { class: 'survey__result' }, h('h4', { class: 'survey__prompt' }, `${index + 1}. ${q.prompt}`));
        if (q.kind === 'text') {
          const answers = d.responses.filter((r) => String(r.answers[q.id] ?? '').trim());
          block.append(answers.length
            ? h('ul', { class: 'survey__answers' }, answers.map((r) => h('li', {}, String(r.answers[q.id]), who(r) ? h('span', { class: 'survey__who' }, ` — ${who(r)}`) : null)))
            : h('p', { class: 'survey__note' }, 'No answers to this one yet.'));
        } else {
          const counts = tally(q, d.responses);
          const most = Math.max(1, ...counts.map((c) => c.count));
          block.append(h('div', { class: 'survey__bars' }, counts.map((c) => h('div', { class: 'survey__bar-row' },
            h('span', { class: 'survey__bar-label' }, c.label),
            h('span', { class: 'survey__bar' }, h('span', { class: 'survey__bar-fill', style: `width:${(c.count / most) * 100}%` })),
            h('span', { class: 'survey__bar-count' }, `${c.count}`)))));
          if (q.kind === 'scale') {
            const values = d.responses.map((r) => Number(r.answers[q.id])).filter((n) => n >= 1);
            if (values.length) block.append(h('p', { class: 'survey__note' }, `Average ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)} of 5`));
          }
        }
        return block;
      }));
  }

  // ── Editing ──────────────────────────────────────────────────────────────
  function editView() {
    const d = data();
    if (!d.questions.length) d.questions.push(newQuestion());
    const list = h('ol', { class: 'survey__edit-list' });
    d.questions.forEach((q, index) => {
      const setQuestion = (fn, redraw = false) => save((next) => fn(next.questions.find((x) => x.id === q.id)), redraw);
      const options = q.kind === 'choice' || q.kind === 'checkboxes'
        ? h('div', { class: 'survey__edit-options' },
          q.options.map((option, i) => h('div', { class: 'survey__edit-option' },
            h('span', { class: `survey__bullet survey__bullet--${q.kind}` }),
            h('input', {
              type: 'text', class: 'input input--compact', value: option, placeholder: `Option ${i + 1}`, 'aria-label': `Option ${i + 1}`,
              onInput: (event) => setQuestion((x) => { x.options[i] = event.target.value; }),
            }),
            q.options.length > 2 ? h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': `Remove option ${i + 1}`, onClick: () => setQuestion((x) => { x.options.splice(i, 1); }, true) }, icon('close', 12)) : null)),
          h('button', { type: 'button', class: 'link-button survey__add-option', onClick: () => setQuestion((x) => { x.options.push(''); }, true) }, icon('plus', 12), ' Add an option'))
        : h('p', { class: 'survey__note' }, q.kind === 'scale' ? 'People pick 1 to 5.' : 'People type a short answer.');
      list.append(h('li', { class: 'survey__edit-question' },
        h('div', { class: 'survey__edit-top' },
          h('input', {
            type: 'text', class: 'input survey__edit-prompt', value: q.prompt, placeholder: 'Ask a question', 'aria-label': `Question ${index + 1}`,
            onInput: (event) => setQuestion((x) => { x.prompt = event.target.value; }),
          }),
          h('select', {
            class: 'input input--compact', 'aria-label': `Kind of question ${index + 1}`,
            onChange: (event) => setQuestion((x) => {
              x.kind = event.target.value;
              if ((x.kind === 'choice' || x.kind === 'checkboxes') && x.options.length < 2) x.options = ['', ''];
            }, true),
          }, KINDS.map((k) => h('option', { value: k.id, selected: k.id === q.kind }, k.label)))),
        options,
        h('div', { class: 'survey__edit-actions' },
          index > 0 ? h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Move up', onClick: () => save((next) => { const [x] = next.questions.splice(index, 1); next.questions.splice(index - 1, 0, x); }) }, icon('arrowUp', 13)) : null,
          index < d.questions.length - 1 ? h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Move down', onClick: () => save((next) => { const [x] = next.questions.splice(index, 1); next.questions.splice(index + 1, 0, x); }) }, icon('arrowDown', 13)) : null,
          h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Delete question', onClick: () => save((next) => { next.questions.splice(index, 1); }) }, icon('trash', 13)))));
    });
    return h('div', { class: 'survey__edit' },
      list,
      h('button', { type: 'button', class: 'button button--small', onClick: () => save((next) => { next.questions.push(newQuestion()); }) }, icon('plus', 13), ' Add a question'),
      h('div', { class: 'survey__settings' },
        h('label', { class: 'checkbox-row' },
          h('input', { type: 'checkbox', checked: d.anonymous, onChange: (event) => save((next) => { next.anonymous = event.target.checked; }, false) }),
          ' Anonymous answers (results don’t show names)'),
        h('label', { class: 'checkbox-row' },
          h('input', { type: 'checkbox', checked: d.closed, onChange: (event) => save((next) => { next.closed = event.target.checked; }) }),
          ' Closed (no more answers)')),
      d.responses.length ? h('p', { class: 'survey__note' }, `${d.responses.length} ${d.responses.length === 1 ? 'person has' : 'people have'} answered. Changing a question keeps their answers.`) : null);
  }

  function draw() {
    if (tab === 'edit' && !mayEdit()) tab = 'results';
    if (tab === 'answer' && (context.isVisitor || data().closed)) tab = 'results';
    // Keep focus in the editor while typing (inputs redraw only on structural changes).
    replaceChildren(root, tabs(), tab === 'edit' ? editView() : tab === 'answer' ? answerView() : resultsView());
  }
  draw();
}

export const surveyModule = {
  type: 'survey',
  label: 'Survey',
  description: 'Ask the group questions: choices, checkboxes, scales, and short answers, with results as they come in',
  icon: 'survey',
  defaultSpan: 6,
  defaultRows: 12,
  available: true,

  createInitialData(state) {
    return { createdBy: state?.currentUserId ?? null, anonymous: false, closed: false, questions: [newQuestion()], responses: [] };
  },

  render: (container, context) => renderSurvey(container, context, { compact: true }),
  renderFullPage: (container, context) => renderSurvey(container, context),
};
