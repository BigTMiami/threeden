// @ts-check
/**
 * announcements-card.js — announcements as they appear on the homepage.
 *
 * "+ New post" (opens a quick form) and the list of posts, pinned ones first.
 * Posts you haven't seen yet get a "New" tag. Each post links to its
 * comments, which (with editing, search and "seen by") live in the full
 * page, announcements-page.js.
 */

import { firstFew } from '../../ui/more-link.js';
import { emptyState } from '../../ui/empty-state.js';
import { renderMediaList } from '../../ui/media-attach.js';
import { announcementAttacher, renderAnnouncementFiles } from './announcement-attach.js';
import { composeToggle } from '../../ui/compose-toggle.js';
import { h, replaceChildren, appendChildren } from '../../ui/dom.js';
import { audienceChipForModule } from '../../ui/audience-chip.js';
import { icon } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { showToast } from '../../ui/toast.js';
import { timeAgo } from '../../utils/dates.js';
import { renderText } from '../../ui/text.js';
import { renderPoll } from '../../ui/poll-view.js';
import { renderAsks } from '../../ui/asks.js';
import { attachMentionPicker } from '../../ui/mention-picker.js';
import { notifyMentions } from '../../state/notifications.js';
import { normalizePost, createPost, sortPosts, hasSeen } from './announcements-data.js';

export function renderAnnouncementsCard(container, context) {
  const me = context.currentUser;
  const isSolo = context.members.length <= 1;
  const canPost = context.can('postAnnouncements');
  const canPin = context.can('pinPosts');
  const canModerate = context.can('moderate');
  const postList = h('div', { class: 'announcements__list' });

  /** Save new data and redraw the list (the form above is left alone). */
  function update(changeFn) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    drawPosts();
  }

  function deletePost(post) {
    const before = structuredClone(context.getData());
    update((data) => { data.posts = data.posts.filter((p) => p.id !== post.id); });
    showToast(`Deleted "${post.title}".`, {
      actionLabel: 'Undo',
      onAction: () => { context.saveData(before); drawPosts(); },
    });
  }

  function drawPosts() {
    const posts = sortPosts(context.getData().posts.map(normalizePost));
    if (posts.length === 0) {
      replaceChildren(postList, emptyState({ icon: 'announcements', title: 'No announcements yet', text: 'News for the whole group goes here, and everyone sees it.', action: context.openFullPage && !context.isVisitor ? { label: 'Post the first one', onClick: () => context.openFullPage() } : null }));
      return;
    }
    // The first three, then "4 more" to the full page (more-link.js).
    const { shown, more } = firstFew(posts, context.openFullPage ? () => context.openFullPage() : null);
    replaceChildren(postList, shown.map(renderPost), more);
  }

  function renderPost(post) {
    const author = context.getMember(post.authorId);
    const isNew = !isSolo && !hasSeen(post, me.id);
    const commentCount = post.comments.length;

    return h('article', { class: `announcement${post.pinned ? ' announcement--pinned' : ''}` },
      h('div', { class: 'announcement__meta' },
        avatar(author, 22),
        h('span', {}, `${author?.name ?? 'Someone'} · ${timeAgo(post.createdAt)}`),
        post.pinned ? h('span', { class: 'tag' }, icon('pin', 12), ' Pinned') : null,
        isNew ? h('span', { class: 'tag tag--new' }, 'New') : null,
      ),
      h('h3', { class: 'announcement__title' }, post.title),
      post.body ? h('p', { class: 'announcement__body' }, renderText(post.body)) : null,
      renderMediaList(post.media),
      renderAnnouncementFiles(post.files),
      post.poll ? renderPoll({
        getPoll: () => context.getData().posts.find((p) => p.id === post.id)?.poll,
        savePoll: (poll) => update((data) => { data.posts.find((p) => p.id === post.id).poll = poll; }),
        me,
        canManage: post.authorId === me.id || canModerate,
      }) : null,
      renderAsks({
        getPost: () => context.getData().posts.find((p) => p.id === post.id),
        savePost: (fn) => update((data) => fn(data.posts.find((p) => p.id === post.id))),
        me, canAnswer: !context.isVisitor, collapse: true, // sign-ups as one line in the card
      }),
      h('div', { class: 'announcement__actions' },
        h('button', {
          type: 'button',
          class: 'link-button',
          onClick: () => context.openFullPage(post.id),
        }, icon('reply', 12), commentCount ? ` ${commentCount} ${commentCount === 1 ? 'comment' : 'comments'}` : ' Comment'),
        canPin ? h('button', {
          type: 'button',
          class: 'link-button',
          onClick: () => update((data) => {
            const target = data.posts.find((p) => p.id === post.id);
            target.pinned = !target.pinned;
          }),
        }, post.pinned ? 'Unpin' : 'Pin') : null,
        post.authorId === me.id || canModerate
          ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => deletePost(post) }, 'Delete')
          : null,
      ),
    );
  }

  // ─── New post form ─────────────────────────────────────────────────────────

  const titleInput = h('input', { type: 'text', class: 'input', placeholder: 'Title', 'aria-label': 'Announcement title' });
  const bodyInput = h('textarea', { class: 'input', rows: '2', placeholder: isSolo ? 'A note to yourself' : 'Write an update for the group', 'aria-label': 'Announcement text' });
  attachMentionPicker(bodyInput, { getCandidates: () => context.members, excludeId: me.id });
  const errorText = h('p', { class: 'form-error', role: 'alert' });
  const add = announcementAttacher({ me, moduleId: context.moduleId });

  const form = h('form', {
    class: 'announcements__form',
    onSubmit: (event) => {
      event.preventDefault();
      const title = titleInput.value.trim();
      if (!title) {
        errorText.textContent = 'Add a title first.';
        titleInput.focus();
        return;
      }
      const { poll, media, files, error } = add.read();
      if (error) { errorText.textContent = error; return; }
      const post = createPost({ authorId: me.id, title, body: bodyInput.value.trim(), poll, media, files });
      update((data) => data.posts.push(post));
      notifyMentions({ moduleId: context.moduleId, itemId: post.id, after: post.body, where: `the announcement “${title}”` });
      form.reset();
      add.reset();
      errorText.textContent = '';
      toggle.close();
    },
  },
    titleInput,
    // What's attached (photos, files, a poll) above the words.
    add.slots,
    bodyInput,
    errorText,
    h('div', { class: 'form-row form-row--end' },
      add.button,
      audienceChipForModule(context.moduleId),
      h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Post'),
    ),
  );

  titleInput.addEventListener('input', () => { errorText.textContent = ''; });

  // A "+ New post" button opens the form (js/ui/compose-toggle.js).
  const toggle = composeToggle(form, { label: 'New post', className: 'announcements__compose' });
  appendChildren(container, [canPost ? toggle.element : null, postList]);
  drawPosts();
}
