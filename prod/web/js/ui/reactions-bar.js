// @ts-check
/**
 * reactions-bar.js — the Like · Comment · Send row under a post, and its
 * comments.
 *
 *   ♥ 3     💬 2 comments     ↗ Send
 *   ─────────────────────────────────
 *   (NL) Nora · 2h  So good!                       Delete
 *   [ Write a comment…                ] [Post]
 *
 * It doesn't know where likes and comments are kept: the caller passes
 * `getModel()`, which returns the current numbers and what to do on each
 * click. Blog posts keep theirs in js/state/reactions.js; forum threads in
 * the Feed use votes and replies instead (see js/feed/feed-page.js).
 *
 *   reactionsBar(() => ({
 *     liked, likeCount, showLikes, canLike, onLike,
 *     comments: [{ id, authorId, body, createdAt }], showComments, canComment,
 *     cantCommentReason, onComment(body), canDelete(comment), onDelete(comment),
 *     onShare,                     ← null hides "Send"
 *     likeLabel, commentNoun,      ← optional wording ('Upvote', 'reply')
 *     moreLink,                    ← optional link at the end of the row ("Open the thread →")
 *   }), { startOpen })
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { avatar } from './avatar.js';
import { renderText } from './text.js';
import { timeAgo } from '../utils/dates.js';
import { getMember, isGuestBrowsing } from '../state/store.js';
import { requireAccount } from '../onboarding/guest.js';

export function reactionsBar(getModel, { startOpen = false } = {}) {
  let open = startOpen;
  const root = h('div', { class: 'reactions' });

  function draw() {
    const model = getModel();
    const noun = model.commentNoun ?? 'comment';
    const count = model.comments.length;

    const likeButton = model.showLikes ? h('button', {
      type: 'button',
      class: `reactions__button reactions__like${model.liked ? ' is-active' : ''}`,
      'aria-pressed': String(Boolean(model.liked)),
      disabled: !model.canLike,
      title: model.canLike ? (model.liked ? 'Unlike' : (model.likeLabel ?? 'Like')) : 'Sign in to like',
      onClick: () => {
        // Not signed in: sign up first, then the like goes through.
        if (requireAccount({ reason: 'to like this post', action: 'like it', arrival: model.arrival, then: () => model.onLike() })) return;
        model.onLike();
        draw();
      },
    }, icon(model.likeLabel === 'Upvote' ? 'upvote' : 'heart', 15), ` ${model.likeCount ? model.likeCount : model.likeLabel ?? 'Like'}`) : null;

    const commentButton = model.showComments ? h('button', {
      type: 'button',
      class: `reactions__button${open ? ' is-active' : ''}`,
      'aria-expanded': String(open),
      onClick: () => { open = !open; draw(); },
    }, icon('chat', 15), ` ${count ? `${count} ${count === 1 ? noun : `${noun}s`}` : `${noun[0].toUpperCase()}${noun.slice(1)}`}`) : null;

    const shareButton = model.onShare && !isGuestBrowsing() ? h('button', {
      type: 'button',
      class: 'reactions__button',
      onClick: () => model.onShare(),
    }, icon('send', 15), ' Send') : null;

    replaceChildren(root,
      h('div', { class: 'reactions__row' }, likeButton, commentButton, shareButton,
        model.moreLink ? h('span', { class: 'reactions__more' }, model.moreLink) : null),
      open && model.showComments ? renderComments(model, noun) : null);
  }

  function renderComments(model, noun) {
    const input = h('input', { type: 'text', class: 'input input--compact', placeholder: `Write a ${noun}…`, 'aria-label': `Write a ${noun}` });
    return h('div', { class: 'reactions__comments' },
      model.comments.length ? h('ul', { class: 'reactions__list' }, model.comments.map((comment) => {
        const author = getMember(comment.authorId);
        return h('li', { class: 'reactions__comment' },
          avatar(author, 22),
          h('div', { class: 'reactions__comment-main' },
            h('span', { class: 'reactions__meta' }, h('strong', {}, author?.name ?? 'Someone'), ` · ${timeAgo(comment.createdAt)}`,
              model.canDelete?.(comment) ? [' · ', h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { model.onDelete(comment); draw(); } }, 'Delete')] : null),
            h('p', { class: 'reactions__body' }, renderText(comment.body))));
      })) : null,
      model.canComment
        ? h('form', {
            class: 'reactions__form',
            onSubmit: (event) => {
              event.preventDefault();
              if (!input.value.trim()) return;
              const body = input.value;
              if (requireAccount({ reason: 'to comment', action: 'post it', arrival: model.arrival, then: () => model.onComment(body) })) return;
              model.onComment(body);
              draw();
              root.querySelector('.reactions__form input')?.focus();
            },
          }, input, h('button', { type: 'submit', class: 'button button--small' }, 'Post'))
        : h('p', { class: 'reactions__closed' }, model.cantCommentReason ?? 'Comments are limited on this post.'));
  }

  draw();
  return root;
}
