/**
 * poll-view.js — showing a poll, voting, and the small form for making one.
 *
 *   Where should the spring retreat be?
 *   ( ) The lake cabin                     ← before you vote: tap an option
 *   ( ) Ingrid’s
 *
 *   Where should the spring retreat be?
 *   The lake cabin  ████████████░░░░  3 ✓  ← after: results, your pick ticked
 *   Ingrid’s        █████░░░░░░░░░░░  1
 *   4 votes · closes Nov 20 · Change vote · Close poll
 *
 * The data side (shape, voting, results) is js/utils/polls.js. Callers say
 * where a poll is saved:
 *
 *   renderPoll({ getPoll, savePoll, me, canVote, canManage, onChoose })
 *     getPoll()          → the poll as it is now
 *     savePoll(poll)     ← save a changed poll where it lives
 *     canManage          the poll's maker (or a moderator): close / reopen
 *     onChoose(option)   time polls only: the host picks the time ("Use this time")
 *
 *   pollBuilder({ kind: 'text' | 'time', me }) → { element, read() }
 *     The fields for a new poll, to put inside another form (an
 *     announcement, a thread, a post, an event). read() returns
 *     { poll } or { error }.
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { getMember } from '../state/store.js';
import { formatShortDate, formatTime, fromDateKey, weekdayName, todayKey, addDays } from '../utils/dates.js';
import { createPoll, isClosed, myVote, castVote, setClosed, pollResults } from '../utils/polls.js';

const MAX_OPTIONS = 12;
const MIN_OPTIONS = 2;

/** "Sat, Nov 21 · 7:00pm" for a time poll's option. */
export function whenLabel(when) {
  const day = `${weekdayName(fromDateKey(when.date).getDay(), true)}, ${formatShortDate(when.date)}`;
  return when.time ? `${day} · ${formatTime(when.time)}` : `${day} (all day)`;
}

const optionLabel = (option) => (option.when ? whenLabel(option.when) : option.text);

// ─── Showing a poll ──────────────────────────────────────────────────────────

export function renderPoll({ getPoll, savePoll, me, canVote = true, canManage = false, onChoose = null }) {
  const root = h('div', { class: 'poll' });
  let changing = false; // "Change vote" pressed

  function save(poll) {
    savePoll(poll);
    draw();
  }

  function draw() {
    const poll = getPoll();
    if (!poll) { replaceChildren(root); return; }
    const closed = isClosed(poll);
    const mine = myVote(poll, me?.id);
    const showBallot = canVote && !closed && (mine.length === 0 || changing);
    const { voterCount, rows } = pollResults(poll);

    replaceChildren(root,
      h('p', { class: 'poll__question' }, icon('list', 14), ` ${poll.question}`,
        poll.multiple ? h('span', { class: 'poll__hint' }, ' · pick any') : null),
      showBallot ? renderBallot(poll, mine) : h('ul', { class: 'poll__results' }, rows.map((row) => renderResult(poll, row, mine))),
      h('p', { class: 'poll__footer' },
        `${voterCount} ${voterCount === 1 ? 'vote' : 'votes'}`,
        poll.anonymous ? ' · anonymous' : '',
        poll.chosenId ? ' · time picked' : closed ? ' · closed' : poll.closesOn ? ` · closes ${formatShortDate(poll.closesOn)}` : '',
        !showBallot && canVote && !closed && mine.length ? [' · ', h('button', { type: 'button', class: 'link-button', onClick: () => { changing = true; draw(); } }, 'Change vote')] : null,
        showBallot && changing ? [' · ', h('button', { type: 'button', class: 'link-button', onClick: () => { changing = false; draw(); } }, 'Cancel')] : null,
        canManage && !poll.chosenId ? [' · ', h('button', { type: 'button', class: 'link-button', onClick: () => save(setClosed(poll, !poll.closed)) }, poll.closed ? 'Reopen poll' : 'Close poll')] : null));
  }

  /** The options to vote on: tap one (single choice), or tick several and press Vote. */
  function renderBallot(poll, mine) {
    if (!poll.multiple) {
      return h('ul', { class: 'poll__options' }, poll.options.map((option) => h('li', {},
        h('button', {
          type: 'button',
          class: `poll__option${mine.includes(option.id) ? ' is-mine' : ''}`,
          onClick: () => { changing = false; save(castVote(poll, me.id, [option.id])); },
        }, h('span', { class: 'poll__radio', 'aria-hidden': 'true' }), optionLabel(option)))));
    }
    const picked = new Set(mine);
    const voteButton = h('button', { type: 'button', class: 'button button--small button--primary', disabled: picked.size === 0 }, 'Vote');
    voteButton.addEventListener('click', () => { changing = false; save(castVote(poll, me.id, [...picked])); });
    return h('div', {},
      h('ul', { class: 'poll__options' }, poll.options.map((option) => h('li', {},
        h('label', { class: 'poll__option' },
          h('input', {
            type: 'checkbox',
            checked: picked.has(option.id),
            onChange: (event) => {
              if (event.target.checked) picked.add(option.id); else picked.delete(option.id);
              voteButton.disabled = picked.size === 0;
            },
          }),
          optionLabel(option))))),
      voteButton);
  }

  function renderResult(poll, row, mine) {
    const isMine = mine.includes(row.option.id);
    const isChosen = poll.chosenId === row.option.id;
    const names = poll.anonymous ? '' : row.voterIds.map((id) => (id === me?.id ? 'You' : getMember(id)?.name.split(' ')[0])).filter(Boolean).join(', ');
    return h('li', { class: `poll__result${isMine ? ' is-mine' : ''}${isChosen ? ' is-chosen' : ''}`, title: names },
      h('span', { class: 'poll__bar', style: { width: `${Math.round(row.share * 100)}%` } }),
      h('span', { class: 'poll__label' }, optionLabel(row.option), isMine ? h('span', { class: 'poll__check', 'aria-label': 'your vote' }, ' ✓') : null),
      h('span', { class: 'poll__count' }, String(row.count)),
      isChosen ? h('span', { class: 'tag poll__chosen' }, 'Picked') : null,
      onChoose && canManage && !poll.chosenId && row.option.when
        ? h('button', { type: 'button', class: 'link-button poll__use', onClick: () => onChoose(row.option) }, 'Use this time') : null);
  }

  draw();
  return root;
}

// ─── Making a poll ───────────────────────────────────────────────────────────

/**
 * The fields for a new poll. Text polls start with two empty options;
 * time polls with two dates a few days apart.
 */
export function pollBuilder({ kind = 'text', me, question = '' }) {
  const isTime = kind === 'time';
  const questionInput = h('input', {
    type: 'text', class: 'input', value: question || (isTime ? 'Which time works for you?' : ''),
    placeholder: 'Ask a question', 'aria-label': 'Poll question',
  });
  const optionsList = h('ol', { class: 'poll-builder__options' });
  const multiple = h('input', { type: 'checkbox', checked: isTime }); // time polls: tick every time you can make
  const anonymous = h('input', { type: 'checkbox' });
  const closesOn = h('input', { type: 'date', class: 'input input--compact', 'aria-label': 'Voting closes on (optional)' });
  const options = isTime
    ? [{ date: addDays(todayKey(), 3), time: '18:00' }, { date: addDays(todayKey(), 4), time: '18:00' }]
    : [{ text: '' }, { text: '' }];

  function drawOptions() {
    replaceChildren(optionsList, options.map((option, index) => h('li', { class: 'poll-builder__option' },
      isTime
        ? [
            h('input', { type: 'date', class: 'input input--compact', value: option.date, 'aria-label': `Option ${index + 1} date`, onInput: (e) => { option.date = e.target.value; } }),
            h('input', { type: 'time', class: 'input input--compact', value: option.time, 'aria-label': `Option ${index + 1} time`, onInput: (e) => { option.time = e.target.value; } }),
          ]
        : h('input', { type: 'text', class: 'input', value: option.text, placeholder: `Option ${index + 1}`, 'aria-label': `Option ${index + 1}`, onInput: (e) => { option.text = e.target.value; } }),
      options.length > MIN_OPTIONS ? h('button', {
        type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': `Remove option ${index + 1}`,
        onClick: () => { options.splice(index, 1); drawOptions(); },
      }, icon('close', 12)) : null)));
  }
  drawOptions();

  const element = h('div', { class: 'poll-builder' },
    questionInput,
    optionsList,
    h('button', {
      type: 'button',
      class: 'link-button poll-builder__add',
      onClick: () => {
        if (options.length >= MAX_OPTIONS) return;
        const last = options[options.length - 1];
        options.push(isTime ? { date: addDays(last?.date || todayKey(), 1), time: last?.time ?? '18:00' } : { text: '' });
        drawOptions();
        optionsList.querySelector('li:last-child input')?.focus();
      },
    }, icon('plus', 12), isTime ? ' Add a time' : ' Add an option'),
    h('div', { class: 'poll-builder__settings' },
      h('label', { class: 'page-control' }, multiple, h('span', {}, isTime ? 'People can pick several times' : 'People can pick more than one')),
      h('label', { class: 'page-control' }, anonymous, h('span', {}, 'Anonymous votes')),
      h('label', { class: 'page-control' }, h('span', { class: 'page-control__label' }, 'Closes'), closesOn)));

  function read() {
    const text = questionInput.value.trim();
    if (!text) return { error: 'Give the poll a question.' };
    const filled = isTime
      ? options.filter((o) => o.date).map((o) => ({ text: '', when: { date: o.date, time: o.time } }))
      : options.map((o) => o.text.trim()).filter(Boolean);
    if (filled.length < MIN_OPTIONS) return { error: 'A poll needs at least two options.' };
    return {
      poll: createPoll({
        question: text, options: filled, multiple: multiple.checked, anonymous: anonymous.checked,
        closesOn: closesOn.value || null, createdBy: me.id,
      }),
    };
  }

  /** The poll as it stands, for a preview: blanks show as "Your question" and "Option 1". */
  function preview() {
    const filled = isTime
      ? options.map((o, i) => (o.date ? { text: '', when: { date: o.date, time: o.time } } : { text: `Time ${i + 1}` }))
      : options.map((o, i) => o.text.trim() || `Option ${i + 1}`);
    return createPoll({
      question: questionInput.value.trim() || 'Your question', options: filled, multiple: multiple.checked, anonymous: anonymous.checked,
      closesOn: closesOn.value || null, createdBy: me.id,
    });
  }

  requestAnimationFrame(() => (question ? optionsList.querySelector('input') : questionInput).focus());
  return { element, read, preview };
}

/**
 * A "Poll" button for a composer (an announcement, a thread, a post) that
 * opens the poll fields underneath it, or takes them away again.
 *   const poll = pollAttacher({ me });
 *   … poll.button in the toolbar, poll.slot where the fields go …
 *   on submit: const { poll: made, error } = poll.read();  (made is null if no poll was added)
 *   after posting: poll.reset();
 */
export function pollAttacher({ me, kind = 'text', onToggle = null }) {
  let builder = null;
  const slot = h('div', { class: 'poll-attacher' });
  const button = h('button', { type: 'button', class: 'button button--small' }, icon('list', 14), ' Poll');

  function open() {
    builder = pollBuilder({ kind, me });
    replaceChildren(slot, h('div', { class: 'poll-attacher__top' },
      h('strong', {}, 'Poll'),
      h('button', { type: 'button', class: 'link-button link-button--danger', onClick: reset }, 'Remove poll')),
    builder.element);
    button.classList.add('is-active');
    onToggle?.(true);
  }
  function reset() {
    builder = null;
    replaceChildren(slot);
    button.classList.remove('is-active');
    onToggle?.(false);
  }
  button.addEventListener('click', () => (builder ? reset() : open()));

  return {
    button,
    slot,
    read: () => (builder ? builder.read() : { poll: null }),
    preview: () => (builder ? builder.preview() : null),
    isOpen: () => Boolean(builder),
    reset,
  };
}
