// @ts-check
/**
 * forum-parts.js — pieces of forum UI used by both the card and the page.
 */

import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { timeAgo } from '../../utils/dates.js';
import { scoreOf } from './forum-data.js';

/**
 * The ▲ score ▼ column. `onVote(direction)` gets +1 or -1; null = read-only.
 * With `downvotes: false` (a forum setting) there's only ▲.
 */
export function voteControls(item, myId, onVote, { downvotes = true } = {}) {
  const myVote = item.votes?.[myId] ?? 0;
  const button = (direction, iconName, label) => h('button', {
    type: 'button',
    class: `vote__button${direction < 0 ? ' vote__button--down' : ''}${myVote === direction ? ' is-active' : ''}`,
    'aria-label': label,
    'aria-pressed': String(myVote === direction),
    disabled: !onVote,
    onClick: () => onVote?.(direction),
  }, icon(iconName, 16));

  return h('div', { class: 'vote' },
    button(1, 'upvote', 'Upvote'),
    h('span', { class: 'vote__score' }, String(scoreOf(item))),
    downvotes ? button(-1, 'downvote', 'Downvote') : null,
  );
}

/**
 * "(AA) Anna A · 3h ago · edited"
 * For an anonymous post: "Anonymous" for most people, "You (anonymous)"
 * for its author, and "Anonymous (Anna A)" for moderators.
 */
export function byline(getMember, authorId, createdAt, editedAt = null, { anonymous = false, viewerId = null, isModerator = false } = {}) {
  const author = getMember(authorId);
  const name = !anonymous ? author?.name ?? 'Former member'
    : authorId === viewerId ? 'You (anonymous)'
      : isModerator ? `Anonymous (${author?.name ?? 'former member'})`
        : 'Anonymous';
  const showFace = !anonymous || authorId === viewerId || isModerator;
  return h('span', { class: `forum__byline${anonymous ? ' is-anonymous' : ''}` },
    showFace ? avatar(author, 18) : h('span', { class: 'avatar avatar--empty forum__anon-face', 'aria-hidden': 'true' }, '?'),
    ` ${name} · ${timeAgo(createdAt)}`,
    editedAt ? h('span', { title: `Edited ${timeAgo(editedAt)}` }, ' · edited') : null);
}

/** Small labels: pinned, locked, and (in a Q&A forum) answered. */
export function threadFlags(thread, { qa = false } = {}) {
  return [
    thread.pinned ? h('span', { class: 'tag forum__flag' }, icon('pin', 11), ' Pinned') : null,
    thread.locked ? h('span', { class: 'tag forum__flag' }, icon('lock', 11), ' Locked') : null,
    qa && thread.answerId ? h('span', { class: 'tag forum__flag forum__flag--answered' }, icon('check', 11), ' Answered') : null,
    thread.pending ? h('span', { class: 'tag forum__flag forum__flag--pending' }, 'Waiting for approval') : null,
    thread.poll ? h('span', { class: 'tag forum__flag' }, icon('list', 11), ' Poll') : null,
  ];
}
