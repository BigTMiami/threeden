// @ts-check
/**
 * polls.js — the data side of polls, used by every module that can carry
 * one: announcements, forum threads, blog posts and documents, and events
 * ("Which time works?"). The page side is js/ui/poll-view.js.
 *
 * A poll:
 *   {
 *     id, question,
 *     options: [ {
 *       id, text,
 *       when: null | { date, time },   ← time polls: a date ('YYYY-MM-DD') and a start time ('' = all day)
 *     } ],
 *     votes: { [memberId]: [optionId, …] },
 *     multiple: false,                 ← people can pick more than one option
 *     anonymous: false,                ← results show counts, never names
 *     closesOn: null | 'YYYY-MM-DD',   ← voting ends at the end of this day
 *     closed: false,                   ← closed by hand
 *     chosenId: null | optionId,       ← time polls: the time the host picked
 *     createdBy, createdAt,
 *   }
 *
 * Every function returns a new poll and never changes the one passed in,
 * so callers can save the result straight into their module's data.
 */

import { makeId } from '../ui/dom.js';
import { todayKey } from './dates.js';

export function createPoll({ question, options, multiple = false, anonymous = false, closesOn = null, createdBy }) {
  return {
    id: makeId('poll'),
    question: question.trim(),
    options: options.map((option) => ({
      id: makeId('opt'),
      text: typeof option === 'string' ? option.trim() : option.text,
      when: option.when ?? null,
    })),
    votes: {},
    multiple,
    anonymous,
    closesOn,
    closed: false,
    chosenId: null,
    createdBy,
    createdAt: Date.now(),
  };
}

/** Is voting over (closed by hand, or past its closing day)? */
export function isClosed(poll) {
  return poll.closed || Boolean(poll.closesOn && todayKey() > poll.closesOn);
}

/** The option ids this person picked ([] if they haven't voted). */
export function myVote(poll, memberId) {
  return poll.votes?.[memberId] ?? [];
}

/** Vote (or change your vote). An empty list takes your vote back. */
export function castVote(poll, memberId, optionIds) {
  const votes = { ...poll.votes };
  const picked = poll.multiple ? optionIds : optionIds.slice(0, 1);
  if (picked.length) votes[memberId] = picked;
  else delete votes[memberId];
  return { ...poll, votes };
}

/** Close it now, or reopen it. */
export function setClosed(poll, closed) {
  return { ...poll, closed };
}

/** Time polls: the host picks the winning time (and voting stops). */
export function chooseOption(poll, optionId) {
  return { ...poll, chosenId: optionId, closed: true };
}

/**
 * The results, option by option:
 *   { voterCount, rows: [{ option, count, voterIds, share }] }
 * `share` is the fraction of voters who picked it (0–1).
 */
export function pollResults(poll) {
  const voterIds = Object.keys(poll.votes ?? {});
  const rows = poll.options.map((option) => {
    const ids = voterIds.filter((id) => poll.votes[id].includes(option.id));
    return { option, count: ids.length, voterIds: ids, share: voterIds.length ? ids.length / voterIds.length : 0 };
  });
  return { voterCount: voterIds.length, rows };
}

/** The option(s) with the most votes (ties included), or [] before anyone votes. */
export function leaders(poll) {
  const { rows } = pollResults(poll);
  const best = Math.max(0, ...rows.map((r) => r.count));
  return best ? rows.filter((r) => r.count === best).map((r) => r.option) : [];
}
