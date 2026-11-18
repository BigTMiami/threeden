// @ts-check
/**
 * announcements-page.js — the group's Board as a full page (it was
 * Announcements until Nov 18; see announcements-card.js for the card).
 *
 * Admins also get "Who can post: Everyone / Admins and owners" here (the
 * "Post on the board" permission). The … menu pins a post for 1 day, 3 days,
 * 1 week, 2 weeks, or until unpinned; titles are optional; ♡ likes.
 *
 * Layout:
 *
 *   [ Search posts and comments ][ All | Unread | Pinned | Mine ]  2 unread · Mark all as seen
 *   ┌ New announcement ───────────────────────────────────────┐
 *   │ Title / text / ☐ Pin to the top              [ Post ]   │
 *   └─────────────────────────────────────────────────────────┘
 *   ┌ post ───────────────────────────────────────────────────┐
 *   │ (AA) Anna A · 3h ago · edited          📌 Pinned  New   │
 *   │ House meeting this Sunday at 6                          │
 *   │ Living room, I'll make dinner…                          │
 *   │ (… menu: Pin, Edit, Delete, Save, Report)  Seen by (WW)(LL) ✓│
 *   │ ── 1 comment ─────────────────────────────────────────  │
 *   │ (WW) I'll bring dessert…                                │
 *   │ [ Write a comment ]                                     │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Anyone can comment and mark posts as seen. Who can post, pin, and remove
 * other people's posts depends on the group's permissions (context.can);
 * only a post's author can edit it. On a personal homepage, "seen by" and the
 * Unread / Mine filters are hidden (it's just you).
 */

import { renderMediaList } from '../../ui/media-attach.js';
import { renderAnnouncementFiles } from './announcement-attach.js';
import { composeToggle } from '../../ui/compose-toggle.js';
import { h, replaceChildren, debounce } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { postMenu } from '../../feed/post-menu.js';
import { getSpaceOfModule } from '../../state/store.js';
import { avatar, avatarStack } from '../../ui/avatar.js';
import { showToast } from '../../ui/toast.js';
import { timeAgo } from '../../utils/dates.js';
import { renderText } from '../../ui/text.js';
import { renderPoll } from '../../ui/poll-view.js';
import { renderAsks } from '../../ui/asks.js';
import { attachMentionPicker } from '../../ui/mention-picker.js';
import { notifyMentions, notify } from '../../state/notifications.js';
import {
  FILTERS, normalizePost, createComment, sortPosts, filterPosts, hasSeen, isPinned, pinLabel, makePin, postName, PIN_DURATIONS,
} from './announcements-data.js';
import { boardComposer, likeButton, toggleLike } from './board-parts.js';
import { canManageRoles, requiredRole } from '../../state/permissions.js';
import { setPermission } from '../../state/groups.js';

const SEARCH_DELAY_MS = 200;

export function renderAnnouncementsPage(container, context) {
  const me = context.currentUser;
  const isSolo = context.members.length <= 1;
  const canPost = context.can('postAnnouncements');
  const canPin = context.can('pinPosts');
  const canModerate = context.can('moderate'); // remove other people's posts and comments

  // View settings (not saved).
  const view = {
    filter: 'all',
    search: '',
    editingPostId: null,
    focusedPostId: context.takeFocusRequest(), // opened from a post's "comments" link
  };

  const posts = () => context.getData().posts.map(normalizePost);

  function update(changeFn) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    drawAll();
  }

  /** Change one post in place: `changeFn(post)`. */
  function updatePost(postId, changeFn) {
    update((data) => {
      const index = data.posts.findIndex((p) => p.id === postId);
      const post = normalizePost(data.posts[index]);
      changeFn(post);
      data.posts[index] = post;
    });
  }

  function markSeen(postIds) {
    update((data) => {
      data.posts = data.posts.map((saved) => {
        const post = normalizePost(saved);
        if (postIds.includes(post.id) && !hasSeen(post, me.id)) post.seenBy = [...post.seenBy, me.id];
        return post;
      });
    });
  }

  function deletePost(post) {
    const before = structuredClone(context.getData());
    update((data) => { data.posts = data.posts.filter((p) => p.id !== post.id); });
    showToast(`Deleted “${postName(post)}”.`, {
      actionLabel: 'Undo',
      onAction: () => { context.saveData(before); drawAll(); },
    });
  }

  // ─── Toolbar ───────────────────────────────────────────────────────────────

  const filterBar = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Show' });
  const unreadNote = h('span', { class: 'announcements-page__unread' });

  function drawToolbar() {
    const shownFilters = FILTERS.filter((f) => !(isSolo && (f.id === 'unread' || f.id === 'mine')));
    replaceChildren(filterBar, shownFilters.map((filter) => h('button', {
      type: 'button',
      class: `segmented__option${filter.id === view.filter ? ' is-active' : ''}`,
      'aria-pressed': String(filter.id === view.filter),
      onClick: () => { view.filter = filter.id; drawAll(); },
    }, filter.label)));

    const unread = posts().filter((post) => !hasSeen(post, me.id));
    replaceChildren(unreadNote, isSolo || unread.length === 0 ? null : [
      `${unread.length} unread · `,
      h('button', { type: 'button', class: 'link-button', onClick: () => markSeen(unread.map((p) => p.id)) }, 'Mark all as seen'),
    ]);
  }

  // Admins: who can post on the board (the "Post on the board" permission, permissions.js).
  const space = getSpaceOfModule(context.moduleId);
  const whoCanPost = space?.kind === 'group' && canManageRoles(space, me.id) ? h('label', { class: 'page-control board-who' },
    h('span', {}, 'Who can post'),
    h('select', {
      class: 'input input--compact',
      onChange: (event) => {
        setPermission(space.id, 'postAnnouncements', event.target.value);
        showToast(event.target.value === 'member' ? 'Everyone in the group can post on the board.' : 'Only admins and the owner can post on the board now.');
      },
    },
      h('option', { value: 'member', selected: requiredRole(space, 'postAnnouncements') === 'member' }, 'Everyone'),
      h('option', { value: 'admin', selected: requiredRole(space, 'postAnnouncements') !== 'member' }, 'Admins and owners'))) : null;

  const toolbar = h('div', { class: 'page-toolbar' },
    h('label', { class: 'page-search' }, icon('search', 16), h('input', {
      type: 'search',
      class: 'input page-search__input',
      placeholder: 'Search posts and comments',
      'aria-label': 'Search the board',
      onInput: debounce((event) => { view.search = event.target.value; drawFeed(); }, SEARCH_DELAY_MS),
    })),
    filterBar,
    h('span', { class: 'page-toolbar__spacer' }),
    unreadNote,
    whoCanPost,
  );

  // ─── Composer (behind "+ Post": js/ui/compose-toggle.js; board-parts.js) ───

  const withMentions = (field) => { attachMentionPicker(field, { getCandidates: () => context.members, excludeId: me.id }); return field; };
  const { form: composer } = boardComposer({
    context, me, canPin, withAsks: true,
    onPosted: (post) => {
      update((data) => { data.posts = [...(data.posts ?? []), post]; });
      composeOpen.close();
      showToast(post.pin ? 'Posted and pinned.' : 'Posted.');
    },
  });

  // ─── Feed ──────────────────────────────────────────────────────────────────

  const feed = h('div', { class: 'announcements-page__feed' });

  function drawFeed() {
    const shown = sortPosts(filterPosts(posts(), view, me.id));
    if (shown.length === 0) {
      replaceChildren(feed, h('p', { class: 'module-empty announcements-page__empty' },
        view.search ? `No posts match "${view.search}".` : 'Nothing here. Try another filter, or post something above.'));
      return;
    }
    replaceChildren(feed, shown.map((post) => (post.id === view.editingPostId ? renderEditor(post) : renderPost(post))));
  }

  function renderPost(post) {
    const author = context.getMember(post.authorId);
    const isMine = post.authorId === me.id;
    const seen = hasSeen(post, me.id);
    // Everyone who has seen it, author first.
    const seenBy = [post.authorId, ...post.seenBy.filter((id) => id !== post.authorId)].map(context.getMember).filter(Boolean);

    return h('article', {
      class: [
        'announcement-post',
        isPinned(post) ? 'announcement-post--pinned' : '',
        post.id === view.focusedPostId ? 'is-focused' : '',
      ].filter(Boolean).join(' '),
      dataset: { postId: post.id },
    },
      h('div', { class: 'announcement__meta' },
        avatar(author, 26),
        h('span', {},
          h('strong', {}, author?.name ?? 'Someone'),
          ` · ${timeAgo(post.createdAt)}`,
          post.editedAt ? h('span', { title: `Edited ${timeAgo(post.editedAt)}` }, ' · edited') : null),
        h('span', { class: 'announcement__tags' },
          isPinned(post) ? h('span', { class: 'tag' }, icon('pin', 12), ` ${pinLabel(post)}`) : null,
          !isSolo && !seen ? h('span', { class: 'tag tag--new' }, 'New') : null,
        ),
        // Pin, Edit, Delete, Save, and Report live in the … menu (post-menu.js).
        context.isVisitor ? null : postMenu({
          title: 'this post',
          save: { key: `announcement:${post.id}`, kind: 'post', title: postName(post), href: `#module-${context.moduleId}`, where: getSpaceOfModule(context.moduleId)?.name ?? '' },
          actions: [
            // Pin for a while, or until unpinned (announcements-data.js PIN_DURATIONS).
            ...(canPin ? (isPinned(post)
              ? [['pin', 'Unpin', () => updatePost(post.id, (p) => { p.pin = null; })]]
              : PIN_DURATIONS.map((d) => ['pin', d.ms == null ? 'Pin until unpinned' : `Pin for ${d.label}`, () => updatePost(post.id, (p) => { p.pin = makePin(d.id, me.id); })])) : []),
            isMine ? ['pencil', 'Edit', () => { view.editingPostId = post.id; drawFeed(); }] : null,
            isMine || canModerate ? ['trash', 'Delete', () => deletePost(post), true] : null,
          ],
          info: [['Posted by', author?.name ?? 'Someone'], ['When', new Date(post.createdAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })]],
          link: `${window.location.origin}${window.location.pathname}#module-${context.moduleId}`,
          report: isMine ? null : { key: `announcement:${post.id}`, kind: 'announcement', spaceId: getSpaceOfModule(context.moduleId)?.id ?? null, moduleId: context.moduleId, itemId: post.id, authorId: post.authorId },
        }),
      ),
      post.title ? h('h2', { class: 'announcement-post__title' }, post.title) : null,
      post.body ? h('p', { class: 'announcement-post__body' }, renderText(post.body)) : null,
      renderMediaList(post.media),
      renderAnnouncementFiles(post.files),
      post.poll ? renderPoll({
        getPoll: () => posts().find((p) => p.id === post.id)?.poll,
        savePoll: (poll) => updatePost(post.id, (p) => { p.poll = poll; }),
        me,
        canManage: isMine || canModerate,
      }) : null,
      renderAsks({ getPost: () => posts().find((p) => p.id === post.id), savePost: (fn) => updatePost(post.id, fn), me, canAnswer: !context.isVisitor }),
      h('div', { class: 'announcement-post__footer' },
        likeButton(post, me, () => updatePost(post.id, (p) => toggleLike(p, me.id)), { disabled: context.isVisitor }),
        isSolo ? null : h('span', { class: 'announcement-post__seen' },
          h('span', { class: 'announcement-post__seen-label' }, `Seen by ${seenBy.length} of ${context.members.length}`),
          avatarStack(seenBy, 22, 5),
          seen ? null : h('button', { type: 'button', class: 'button button--small', onClick: () => markSeen([post.id]) }, icon('check', 14), ' Mark as seen'),
        ),
      ),
      renderComments(post),
    );
  }

  /** Editing a post in place: title, text, Save / Cancel. */
  function renderEditor(post) {
    const title = h('input', { type: 'text', class: 'input', value: post.title, placeholder: 'Title (optional)', 'aria-label': 'Title (optional)' });
    const body = withMentions(h('textarea', { class: 'input', rows: '4', 'aria-label': 'Text' }));
    body.value = post.body;
    const error = h('p', { class: 'form-error', role: 'alert' });
    requestAnimationFrame(() => title.focus());

    return h('form', {
      class: 'announcement-post announcement-post--editing',
      onSubmit: (event) => {
        event.preventDefault();
        if (!title.value.trim() && !body.value.trim() && !post.media?.length && !post.files?.length && !post.poll) {
          error.textContent = 'Write something first.';
          return;
        }
        view.editingPostId = null;
        notifyMentions({ moduleId: context.moduleId, itemId: post.id, before: post.body, after: body.value, where: `the board post “${title.value.trim() || postName(post)}”` });
        updatePost(post.id, (p) => {
          p.title = title.value.trim();
          p.body = body.value.trim();
          p.editedAt = Date.now();
        });
      },
    },
      // Editing: the title, then what's attached (as it shows), then the words underneath it.
      title,
      renderMediaList(post.media),
      renderAnnouncementFiles(post.files),
      post.poll ? renderPoll({
        getPoll: () => posts().find((p) => p.id === post.id)?.poll,
        savePoll: (poll) => updatePost(post.id, (p) => { p.poll = poll; }),
        me,
        canManage: false,
      }) : null,
      body, error,
      h('div', { class: 'form-row form-row--end' },
        h('button', { type: 'button', class: 'link-button', onClick: () => { view.editingPostId = null; drawFeed(); } }, 'Cancel'),
        h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Save'),
      ),
    );
  }

  function renderComments(post) {
    const input = withMentions(h('input', { type: 'text', class: 'input', placeholder: 'Write a comment', 'aria-label': `Comment on “${postName(post)}”` }));

    return h('section', { class: 'announcement-comments', 'aria-label': 'Comments' },
      post.comments.length
        ? h('h3', { class: 'announcement-comments__title' }, `${post.comments.length} ${post.comments.length === 1 ? 'comment' : 'comments'}`)
        : null,
      h('ul', { class: 'announcement-comments__list' }, post.comments.map((comment) => {
        const author = context.getMember(comment.authorId);
        return h('li', { class: 'announcement-comment' },
          avatar(author, 22),
          h('div', { class: 'announcement-comment__main' },
            h('span', { class: 'announcement-comment__meta' },
              h('strong', {}, author?.name ?? 'Someone'), ` · ${timeAgo(comment.createdAt)}`,
              comment.authorId === me.id || canModerate
                ? [' · ', h('button', {
                    type: 'button',
                    class: 'link-button link-button--danger',
                    onClick: () => updatePost(post.id, (p) => { p.comments = p.comments.filter((c) => c.id !== comment.id); }),
                  }, 'Delete')]
                : null,
            ),
            h('p', { class: 'announcement-comment__body' }, renderText(comment.body)),
          ),
        );
      })),
      h('form', {
        class: 'announcement-comments__form',
        onSubmit: (event) => {
          event.preventDefault();
          const text = input.value.trim();
          if (!text) return;
          view.focusedPostId = post.id; // keep the focus on this post after redrawing
          updatePost(post.id, (p) => {
            p.comments = [...p.comments, createComment(me.id, text)];
            // Commenting on a post means you've seen it.
            if (!hasSeen(p, me.id)) p.seenBy = [...p.seenBy, me.id];
          });
          notifyMentions({ moduleId: context.moduleId, itemId: post.id, after: text, where: `a comment on “${postName(post)}”` });
          notifyAboutReply(post, text);
          feed.querySelector(`[data-post-id="${post.id}"] .announcement-comments__form input`)?.focus();
        },
      }, input, h('button', { type: 'submit', class: 'button button--small' }, 'Post')),
    );
  }

  /**
   * Someone replied to an announcement: its author is told, and so is
   * anyone else who already replied (people never hear about their own reply).
   */
  function notifyAboutReply(post, text) {
    const preview = text.length > 60 ? `${text.slice(0, 59)}…` : text;
    const common = { actorId: me.id, kind: 'comment', moduleId: context.moduleId, itemId: post.id };
    notify({ ...common, recipientIds: [post.authorId], text: `${me.name} replied to your post “${postName(post)}”: “${preview}”` });
    const others = post.comments.map((c) => c.authorId).filter((id) => id !== post.authorId);
    notify({ ...common, recipientIds: others, text: `${me.name} also replied to “${postName(post)}”: “${preview}”` });
  }

  // ─── Layout ────────────────────────────────────────────────────────────────

  function drawAll() {
    drawToolbar();
    drawFeed();
  }

  const composeOpen = composeToggle(composer, { label: 'Post', className: 'announcements-page__compose' });
  container.append(toolbar, h('div', { class: 'announcements-page' },
    canPost ? composeOpen.element : h('p', { class: 'settings-locked' }, 'Only admins can post on this board, but you can like and comment.'),
    feed));
  drawAll();

  // Opened from a post on the homepage: scroll to it.
  if (view.focusedPostId) {
    requestAnimationFrame(() => feed.querySelector(`[data-post-id="${view.focusedPostId}"]`)?.scrollIntoView({ block: 'start' }));
  }
}
