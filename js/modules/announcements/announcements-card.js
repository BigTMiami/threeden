// @ts-check
/**
 * announcements-card.js — the group's Board as a card (Nov 18; it was
 * Announcements). Design 1 from the board mockups:
 *
 *                                                   [+ Post]
 *   ┌ 📌 PINNED UNTIL FRI, NOV 20 ─────────────────────────────┐
 *   │ House meeting Sunday at 7                                │
 *   │ Living room. I'll make dumplings.                        │
 *   │ Maya Chen · 5h · Seen by 3 of 4          [Mark as seen]  │
 *   └──────────────────────────────────────────────────────────┘
 *   1 more pinned: Plumber coming Wednesday            Show
 *   (TR) Theo R. · 2h                                  New
 *        Biscuit found the new radiator.  [photo]
 *        ♡ 4 · 2 comments · Pin · Delete
 *   …                                                  3 more ›
 *
 * Anyone can post ("+ Post") unless admins changed "Post on the board"
 * (Group settings → Permissions, or the board's full page). Admins pin, for
 * a while or until unpinned (board-parts.js). Posts show in members' Feeds
 * unless the poster unticked it (feed-items.js). Comments, editing, search,
 * and Seen by live on the full page (announcements-page.js).
 */

import { firstFew } from '../../ui/more-link.js';
import { emptyState } from '../../ui/empty-state.js';
import { renderMediaList } from '../../ui/media-attach.js';
import { renderAnnouncementFiles } from './announcement-attach.js';
import { composeToggle } from '../../ui/compose-toggle.js';
import { h, replaceChildren, appendChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { showToast } from '../../ui/toast.js';
import { timeAgo } from '../../utils/dates.js';
import { renderText } from '../../ui/text.js';
import { renderPoll } from '../../ui/poll-view.js';
import { renderAsks } from '../../ui/asks.js';
import { normalizePost, sortPosts, hasSeen, isPinned, pinLabel, makePin, postName } from './announcements-data.js';
import { boardComposer, likeButton, toggleLike, pinChooser } from './board-parts.js';

/** Which boards show all their pinned posts (instead of "1 more pinned"). */
const showingAllPins = new Set();

export function renderAnnouncementsCard(container, context) {
  const me = context.currentUser;
  const isSolo = context.members.length <= 1;
  const canPost = context.can('postAnnouncements') && !context.isVisitor;
  const canPin = context.can('pinPosts') && !context.isVisitor;
  const canModerate = context.can('moderate');
  const body = h('div', { class: 'board__body' });

  /** Save new data and redraw the posts (the form is left alone). */
  function update(changeFn) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    draw();
  }
  const changePost = (postId, fn) => update((data) => {
    const index = data.posts.findIndex((p) => p.id === postId);
    if (index === -1) return;
    data.posts[index] = normalizePost(data.posts[index]);
    fn(data.posts[index]);
  });

  function deletePost(post) {
    const before = structuredClone(context.getData());
    update((data) => { data.posts = data.posts.filter((p) => p.id !== post.id); });
    showToast(`Deleted “${postName(post)}”.`, { actionLabel: 'Undo', onAction: () => { context.saveData(before); draw(); } });
  }

  const pin = (post, durationId) => {
    changePost(post.id, (p) => { p.pin = makePin(durationId, me.id); });
    showToast(`Pinned “${postName(post)}”.`);
  };
  const unpin = (post) => changePost(post.id, (p) => { p.pin = null; });

  function actions(post) {
    const comments = post.comments.length;
    return h('div', { class: 'board-post__actions' },
      likeButton(post, me, () => changePost(post.id, (p) => toggleLike(p, me.id)), { disabled: context.isVisitor }),
      h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage(post.id) },
        icon('reply', 12), comments ? ` ${comments} ${comments === 1 ? 'comment' : 'comments'}` : ' Comment'),
      canPin ? pinChooser({ post, onPin: (d) => pin(post, d), onUnpin: () => unpin(post) }) : null,
      post.authorId === me.id || canModerate ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => deletePost(post) }, 'Delete') : null);
  }

  /** What's in a post, below its byline. */
  const contents = (post) => [
    post.title ? h('h3', { class: 'board-post__title' }, post.title) : null,
    post.body ? h('p', { class: 'board-post__text' }, renderText(post.body)) : null,
    renderMediaList(post.media),
    renderAnnouncementFiles(post.files),
    post.poll ? renderPoll({
      getPoll: () => context.getData().posts.find((p) => p.id === post.id)?.poll,
      savePoll: (poll) => changePost(post.id, (p) => { p.poll = poll; }),
      me,
      canManage: post.authorId === me.id || canModerate,
    }) : null,
    renderAsks({
      getPost: () => context.getData().posts.find((p) => p.id === post.id),
      savePost: (fn) => changePost(post.id, fn),
      me, canAnswer: !context.isVisitor, collapse: true,
    }),
  ];

  /** The pinned post on top, in the accent box. */
  function renderPinned(post) {
    const author = context.getMember(post.authorId);
    const seenCount = new Set([post.authorId, ...post.seenBy]).size;
    const seen = hasSeen(post, me.id);
    return h('article', { class: 'board-pinned', dataset: { postId: post.id } },
      h('span', { class: 'board-pinned__kicker' }, icon('pin', 13), ` ${pinLabel(post)}`),
      contents(post),
      h('div', { class: 'board-pinned__foot' },
        h('span', { class: 'board-pinned__meta' }, `${author?.name ?? 'Someone'} · ${timeAgo(post.createdAt)}${isSolo ? '' : ` · Seen by ${seenCount} of ${context.members.length}`}`),
        !isSolo && !seen && !context.isVisitor
          ? h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => changePost(post.id, (p) => { p.seenBy = [...new Set([...p.seenBy, me.id])]; }) }, 'Mark as seen') : null),
      actions(post));
  }

  function renderPost(post) {
    const author = context.getMember(post.authorId);
    const isNew = !isSolo && !hasSeen(post, me.id);
    return h('article', { class: 'board-post', dataset: { postId: post.id } },
      h('div', { class: 'board-post__byline' },
        avatar(author, 28),
        h('span', { class: 'board-post__who' }, h('strong', {}, author?.name ?? 'Someone'), ` · ${timeAgo(post.createdAt)}`),
        isNew ? h('span', { class: 'tag tag--new' }, 'New') : null),
      contents(post),
      actions(post));
  }

  function draw() {
    const all = sortPosts((context.getData().posts ?? []).map(normalizePost));
    if (!all.length) {
      replaceChildren(body, emptyState({
        icon: 'announcements', title: 'Nothing on the board yet',
        text: 'Photos, news, questions, anything for the whole group. Admins can pin what matters.',
        action: canPost ? { label: 'Post the first thing', onClick: () => toggle.open() } : null,
      }));
      return;
    }
    const pinned = all.filter((p) => isPinned(p));
    const rest = all.filter((p) => !isPinned(p));
    const showAll = showingAllPins.has(context.moduleId);
    const extraPins = pinned.slice(1);
    const { shown, more } = firstFew(rest, context.openFullPage ? () => context.openFullPage() : null);
    replaceChildren(body,
      pinned.length ? renderPinned(pinned[0]) : null,
      extraPins.length ? (showAll
        ? [extraPins.map(renderPinned), h('button', { type: 'button', class: 'link-button board__more-pins', onClick: () => { showingAllPins.delete(context.moduleId); draw(); } }, 'Show fewer pinned')]
        : h('p', { class: 'board__more-pins' },
          h('span', {}, `${extraPins.length} more pinned: ${extraPins.map(postName).join(' · ')}`),
          h('button', { type: 'button', class: 'link-button', onClick: () => { showingAllPins.add(context.moduleId); draw(); } }, 'Show'))) : null,
      h('div', { class: 'board__stream' }, shown.map(renderPost)),
      more);
  }

  // "+ Post" opens the form (js/ui/compose-toggle.js).
  const composer = boardComposer({
    context, me, canPin,
    onPosted: (post) => { update((data) => { data.posts = [...(data.posts ?? []), post]; }); toggle.close(); showToast(post.pin ? 'Posted and pinned.' : 'Posted.'); },
  });
  const toggle = composeToggle(composer.form, { label: 'Post', className: 'board__compose' });
  appendChildren(container, [canPost ? toggle.element : null, body]);
  draw();
}
