// @ts-check
/**
 * forum-page.js — the forum as a full page.
 *
 *   ┌ tags ─────────┐ ┌ [ Search threads ]  [ Hot | New | Top | Recently active ] ┐
 *   │ All        6  │ │ ▲3▼ 📌 Can we agree on a thermostat setting?              │
 *   │ Money      2  │ │      Money · William W · 22h ago · 3 replies · active 2h │
 *   │ Ideas      3  │ │ …                                                        │
 *   │ [New thread]  │ └──────────────────────────────────────────────────────────┘
 *   │ Manage tags   │
 *   └───────────────┘
 *
 * Opening a thread shows the post and its replies as a tree: reply to the
 * thread or to any reply, and replies nest underneath (collapse a branch
 * with [–]). Sort replies Best or Oldest first.
 *
 * Also: follow a thread to be notified of replies (you follow what you
 * start or reply to); "3 new" marks replies since you last looked; report
 * a post to the moderators; in a Q&A forum, mark a reply as the best answer.
 *
 * Who can do what (js/state/permissions.js, via context.can):
 *   - everyone: post, reply, vote, follow, report, edit and delete their own
 *     (starting threads can be limited to admins in Forum settings)
 *   - "Pin announcements and forum threads": pin (admins, by default)
 *   - "Remove other people's posts and files": delete anyone's, lock threads,
 *     manage tags, review reports, and Forum settings
 *   - the thread's author (and moderators): choose the best answer
 *
 * Forum settings can also limit replies to admins, turn off editing,
 * allow anonymous posts, and make new threads wait for a moderator's
 * approval (see forum-settings.js; notifications in forum-actions.js).
 */

import { getSpaceOfModule } from '../../state/store.js';
import { postMenu } from '../../feed/post-menu.js';
import { mediaAttacher, renderMediaList } from '../../ui/media-attach.js';
import { audienceChipForModule } from '../../ui/audience-chip.js';
import { h, replaceChildren, debounce } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { renderText } from '../../ui/text.js';
import { renderPoll, pollAttacher } from '../../ui/poll-view.js';
import { attachMentionPicker } from '../../ui/mention-picker.js';
import { notifyMentions, notify } from '../../state/notifications.js';
import { timeAgo } from '../../utils/dates.js';
import {
  SORT_OPTIONS, REPLY_SORTS, MAX_DEPTH, createThread, createReply, sortThreads, filterThreads,
  replyTree, toggleVote, findThread, findReply, deleteReply, lastActivity, replyCount, renameTag, removeTag,
  settingsOf, canStartThread, canReply, newReplyCount, isUnseen, reportCount, markSeen, setFollowing, report,
} from './forum-data.js';
import { visibleThreads, announceThread, authorLabel, notifyApproved, notifyDeclined } from './forum-actions.js';
import { renderForumSettings } from './forum-settings.js';
import { voteControls, byline, threadFlags } from './forum-parts.js';

const SEARCH_DELAY_MS = 200;

export function renderForumPage(container, context) {
  const me = context.currentUser;
  const canPin = context.can('pinPosts');
  const canModerate = context.can('moderate');
  const settings = () => settingsOf(context.getData());
  const canStart = () => canStartThread(settings(), context.role);
  const canAnswer = () => canReply(settings(), context.role);
  const canEditOwn = (authorId) => authorId === me.id && settings().allowEditing;

  // View settings (not saved).
  const view = {
    tag: '',
    search: '',
    sortId: settingsOf(context.getData()).defaultSort,
    show: '',              // '' | 'following' | 'unanswered' | 'reported' | 'pending'
    settingsOpen: false,   // the Forum settings form
    threadId: context.takeFocusRequest(), // opened from a thread on the card
    replySort: 'best',
    composing: false,      // the New thread form
    editingId: null,       // a thread or reply being edited
    replyingToId: null,    // a reply whose inline reply box is open
    managingTags: false,
    collapsed: new Set(),  // reply ids whose branches are folded away
  };

  // Threads waiting for approval are only shown to their author and the moderators.
  const threads = () => visibleThreads(context);
  /** "(LL) Leo L · 3h ago", or "Anonymous" for anonymous posts. */
  const by = (post) => byline(context.getMember, post.authorId, post.createdAt, post.editedAt, { anonymous: post.anonymous, viewerId: me.id, isModerator: canModerate });
  const canChange = (authorId) => authorId === me.id || canModerate;

  function update(changeFn) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    drawAll();
  }

  function updateWithUndo(message, changeFn) {
    const before = structuredClone(context.getData());
    update(changeFn);
    showToast(message, { actionLabel: 'Undo', onAction: () => { context.saveData(before); drawAll(); } });
  }

  function openThread(threadId) {
    Object.assign(view, { threadId, composing: false, editingId: null, replyingToId: null, settingsOpen: false });
    if (threadId) markThreadSeen(threadId);
    drawAll();
    window.scrollTo(0, 0);
  }

  /** Saved quietly (no redraw): you've now seen every reply in this thread. */
  function markThreadSeen(threadId) {
    const data = structuredClone(context.getData());
    markSeen(data, threadId, me.id);
    context.saveData(data);
  }

  /** Tell a thread's followers (except you) about your reply. */
  function notifyFollowers(thread, reply) {
    notify({
      recipientIds: thread.followers,
      actorId: me.id,
      kind: 'reply',
      text: `${authorLabel(reply, me)} replied in “${thread.title}”`,
      moduleId: context.moduleId,
      itemId: thread.id,
      anonymous: reply.anonymous,
    });
  }

  // ─── Sidebar: tags ─────────────────────────────────────────────────────────

  const sidebar = h('aside', { class: 'forum-page__sidebar', 'aria-label': 'Tags' });

  function drawSidebar() {
    const all = threads();
    const { tags } = context.getData();
    const tagButton = (value, label, count) => h('button', {
      type: 'button',
      class: `forum-page__tag${view.tag === value && value && !view.threadId && !view.settingsOpen ? ' is-current' : ''}`,
      onClick: () => { Object.assign(view, { tag: value, show: '', threadId: null, composing: false, settingsOpen: false }); drawAll(); },
    }, h('span', {}, label), h('span', { class: 'forum-page__tag-count' }, String(count)));

    const showButton = (value, label, count) => h('button', {
      type: 'button',
      class: `forum-page__tag${view.show === value && !view.tag && !view.threadId && !view.settingsOpen ? ' is-current' : ''}`,
      onClick: () => { Object.assign(view, { show: value, tag: '', threadId: null, composing: false, settingsOpen: false }); drawAll(); },
    }, h('span', {}, label), h('span', { class: 'forum-page__tag-count' }, String(count)));
    const reported = all.filter((t) => reportCount(t) > 0).length;
    const pending = all.filter((t) => t.pending).length;

    replaceChildren(sidebar,
      canStart() ? h('button', {
        type: 'button',
        class: 'button button--primary forum-page__new',
        onClick: () => { Object.assign(view, { composing: true, threadId: null, settingsOpen: false }); drawAll(); },
      }, icon('plus', 14), ' New thread') : h('p', { class: 'forum-page__note' }, icon('lock', 12), ' Only admins start threads here. Everyone can reply.'),
      h('h2', { class: 'forum-page__sidebar-title' }, 'Show'),
      showButton('', 'All threads', all.length),
      showButton('following', 'Following', all.filter((t) => t.followers.includes(me.id)).length),
      settings().qa ? showButton('unanswered', 'Unanswered', all.filter((t) => !t.answerId).length) : null,
      canModerate && pending ? showButton('pending', 'Waiting for approval', pending) : null,
      canModerate && reported ? showButton('reported', 'Needs review', reported) : null,
      h('h2', { class: 'forum-page__sidebar-title' }, 'Tags'),
      tags.map((tag) => tagButton(tag, tag, all.filter((t) => t.tag === tag).length)),
      canModerate ? h('button', { type: 'button', class: 'link-button forum-page__manage', onClick: () => { view.managingTags = !view.managingTags; drawSidebar(); } },
        view.managingTags ? 'Done managing tags' : 'Manage tags') : null,
      view.managingTags ? renderTagManager(tags) : null,
      canModerate ? h('button', {
        type: 'button',
        class: 'link-button forum-page__manage',
        onClick: () => { Object.assign(view, { settingsOpen: true, threadId: null, composing: false }); drawAll(); },
      }, icon('settings', 12), ' Forum settings') : null,
    );
  }

  function renderTagManager(tags) {
    const input = h('input', { type: 'text', class: 'input input--compact', placeholder: 'New tag', 'aria-label': 'New tag' });
    return h('div', { class: 'forum-page__tag-manager' },
      tags.map((tag) => h('div', { class: 'forum-page__tag-edit' },
        h('input', {
          type: 'text',
          class: 'input input--compact',
          value: tag,
          'aria-label': `Rename tag ${tag}`,
          onChange: (event) => {
            const name = event.target.value.trim();
            if (!name || tags.includes(name)) { event.target.value = tag; return; }
            update((data) => renameTag(data, tag, name));
          },
        }),
        h('button', {
          type: 'button',
          class: 'icon-button icon-button--subtle',
          'aria-label': `Remove tag ${tag}`,
          disabled: tags.length <= 1,
          onClick: () => updateWithUndo(`Removed the “${tag}” tag.`, (data) => removeTag(data, tag)),
        }, icon('trash', 14)))),
      h('form', {
        class: 'forum-page__tag-edit',
        onSubmit: (event) => {
          event.preventDefault();
          const name = input.value.trim();
          if (!name || tags.includes(name)) return;
          update((data) => data.tags.push(name));
        },
      }, input, h('button', { type: 'submit', class: 'button button--small' }, 'Add')),
    );
  }

  // ─── Main: list, new thread, or one thread ─────────────────────────────────

  const main = h('section', { class: 'forum-page__main' });

  function drawMain() {
    if (view.settingsOpen && canModerate) {
      replaceChildren(main, renderForumSettings(context, {
        onSave: (next) => update((data) => { data.settings = next; }),
        onClose: () => { view.settingsOpen = false; drawAll(); },
      }));
    } else if (view.composing && canStart()) replaceChildren(main, renderNewThread());
    else if (view.threadId && threads().some((t) => t.id === view.threadId)) replaceChildren(main, renderThread());
    else {
      view.threadId = null;
      replaceChildren(main, renderList());
    }
  }

  // List

  const searchInput = h('input', {
    type: 'search',
    class: 'input page-search__input',
    placeholder: 'Search threads and replies',
    'aria-label': 'Search the forum',
    onInput: debounce((event) => { view.search = event.target.value; drawMain(); }, SEARCH_DELAY_MS),
  });

  function renderList() {
    const shown = sortThreads(filterThreads(threads(), { ...view, memberId: me.id }), view.sortId);
    const { guidelines, downvotes } = settings();
    const showTitle = { following: 'Threads you follow', unanswered: 'Unanswered questions', reported: 'Reported to moderators', pending: 'Waiting for approval' }[view.show];
    return [
      guidelines ? h('details', { class: 'forum-page__guidelines' }, h('summary', {}, 'Forum guidelines'), h('p', {}, renderText(guidelines))) : null,
      h('div', { class: 'page-toolbar' },
        h('label', { class: 'page-search' }, icon('search', 16), searchInput),
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Sort threads' }, SORT_OPTIONS.map((option) => h('button', {
          type: 'button',
          class: `segmented__option${option.id === view.sortId ? ' is-active' : ''}`,
          'aria-pressed': String(option.id === view.sortId),
          onClick: () => { view.sortId = option.id; drawMain(); },
        }, option.label)))),
      view.tag ? h('h2', { class: 'forum-page__heading' }, `Tagged “${view.tag}”`) : null,
      showTitle ? h('h2', { class: 'forum-page__heading' }, showTitle) : null,
      h('div', { class: 'forum-page__list' }, shown.length
        ? shown.map((thread) => {
            const fresh = newReplyCount(thread, me.id);
            const unseen = isUnseen(thread, me.id);
            return h('article', { class: `forum-thread${thread.pinned ? ' forum-thread--pinned' : ''}${unseen || fresh ? ' is-unread' : ''}` },
              voteControls(thread, me.id, (direction) => update((data) => toggleVote(findThread(data, thread.id), me.id, direction)), { downvotes }),
              h('div', { class: 'forum-thread__main' },
                h('button', { type: 'button', class: 'forum-thread__title', onClick: () => openThread(thread.id) }, thread.title),
                h('div', { class: 'forum-thread__meta' },
                  threadFlags(thread, { qa: settings().qa }),
                  unseen ? h('span', { class: 'tag tag--new' }, 'New') : fresh ? h('span', { class: 'tag tag--new' }, `${fresh} new`) : null,
                  h('span', { class: 'tag' }, thread.tag),
                  by({ ...thread, editedAt: null }),
                  h('span', {}, `${replyCount(thread)} ${replyCount(thread) === 1 ? 'reply' : 'replies'}`),
                  replyCount(thread) ? h('span', { class: 'forum-page__active' }, `active ${timeAgo(lastActivity(thread))}`) : null,
                  canModerate && reportCount(thread) ? h('span', { class: 'forum__reported' }, icon('flag', 11), ` ${reportCount(thread)} reported`) : null)),
              // Save, Pin, and Lock, for the people allowed to use them, in the … menu.
              context.isVisitor ? null : threadMenu(thread),
            );
          })
        : h('p', { class: 'module-empty forum-page__empty' }, view.search ? `Nothing matches “${view.search.trim()}”.` : 'No threads here yet.')),
    ];
  }

  /** Typing "@" in this box offers the group's members. */
  function withMentions(field) {
    attachMentionPicker(field, { getCandidates: () => context.members, excludeId: me.id });
    return field;
  }

  /** "[ ] Post anonymously", when the forum allows it (null otherwise). */
  function anonymousToggle() {
    if (!settings().anonymous) return null;
    const input = h('input', { type: 'checkbox' });
    const label = h('label', { class: 'page-control forum__anonymous' }, input,
      h('span', {}, 'Post anonymously ', h('span', { class: 'settings-field__hint' }, '(moderators can still see it’s you)')));
    return { input, label };
  }

  // New thread

  function renderNewThread() {
    const { tags } = context.getData();
    const title = h('input', { type: 'text', class: 'input', placeholder: 'Title', 'aria-label': 'Thread title' });
    const tagSelect = h('select', { class: 'input input--compact', 'aria-label': 'Tag' },
      tags.map((t) => h('option', { value: t, selected: t === view.tag }, t)));
    const body = withMentions(h('textarea', { class: 'input', rows: '8', placeholder: 'What do you want to discuss? Type @ to mention someone.', 'aria-label': 'Thread text' }));
    const error = h('p', { class: 'form-error', role: 'alert' });
    const anonymous = anonymousToggle();
    const pollField = pollAttacher({ me });
    const media = mediaAttacher();
    const needsApproval = settings().requireApproval && !canModerate;
    requestAnimationFrame(() => title.focus());

    return h('form', {
      class: 'forum-page__composer',
      onSubmit: (event) => {
        event.preventDefault();
        if (!title.value.trim()) { error.textContent = 'Give your thread a title.'; title.focus(); return; }
        const { poll, error: pollError } = pollField.read();
        if (pollError) { error.textContent = pollError; return; }
        const thread = createThread({
          authorId: me.id, title: title.value, body: body.value, tag: tagSelect.value,
          anonymous: Boolean(anonymous?.input.checked), pending: needsApproval, poll, media: media.read(),
        });
        view.composing = false;
        view.threadId = thread.id;
        update((data) => data.threads.push(thread));
        announceThread(context, thread);
        if (thread.pending) showToast('Posted. Others will see it once a moderator approves it.');
      },
    },
      h('h2', { class: 'forum-page__heading' }, 'New thread'),
      title,
      h('label', { class: 'page-control' }, h('span', { class: 'page-control__label' }, 'Tag'), tagSelect),
      // What's attached (photos, a poll) above the words.
      media.slot,
      pollField.slot,
      body,
      h('div', { class: 'form-row' }, media.button, pollField.button, anonymous?.label),
      needsApproval ? h('p', { class: 'forum-page__hint' }, 'New threads here are checked by a moderator before others can see them.') : null,
      error,
      h('div', { class: 'form-row' },
        audienceChipForModule(context.moduleId),
        h('button', { type: 'submit', class: 'button button--primary' }, 'Post'),
        h('button', { type: 'button', class: 'button button--quiet', onClick: () => { view.composing = false; drawAll(); } }, 'Cancel')),
    );
  }

  // One thread

  function renderThread() {
    const thread = threads().find((t) => t.id === view.threadId);
    const isEditing = view.editingId === thread.id;
    const tree = replyTree(thread, view.replySort);
    const { downvotes, qa } = settings();
    const isFollowing = thread.followers.includes(me.id);
    const answer = qa && thread.answerId ? thread.replies.find((r) => r.id === thread.answerId && !r.deleted) : null;

    const actions = h('div', { class: 'forum-post__actions' },
      h('button', {
        type: 'button',
        class: `link-button forum__follow${isFollowing ? ' is-following' : ''}`,
        title: isFollowing ? 'You’re told about new replies. Click to stop.' : 'Get a notification when someone replies',
        onClick: () => update((data) => setFollowing(findThread(data, thread.id), me.id, !isFollowing)),
      }, icon('bell', 12), isFollowing ? ' Following' : ' Follow'),
      thread.authorId !== me.id ? reportButton(thread, (data) => findThread(data, thread.id)) : null,
      // Edit, Pin, Lock, and Delete: in the … menu.
      isEditing || context.isVisitor ? null : threadMenu(thread, {
        edit: canEditOwn(thread.authorId) ? () => { view.editingId = thread.id; drawMain(); } : null,
        remove: canChange(thread.authorId) ? () => {
          view.threadId = null;
          updateWithUndo(`Deleted “${thread.title}”.`, (data) => { data.threads = data.threads.filter((t) => t.id !== thread.id); });
        } : null,
      }),
    );

    return [
      h('button', { type: 'button', class: 'link-button forum__back', onClick: () => openThread(null) }, icon('arrowLeft', 14), view.tag ? ` ${view.tag}` : ' All threads'),
      h('article', { class: 'forum-post forum-page__post' },
        voteControls(thread, me.id, (direction) => update((data) => toggleVote(findThread(data, thread.id), me.id, direction)), { downvotes }),
        h('div', { class: 'forum-post__main' },
          isEditing ? renderThreadEditor(thread) : [
            h('h2', { class: 'forum-page__title' }, thread.title),
            h('div', { class: 'forum-thread__meta' }, threadFlags(thread, { qa }), h('span', { class: 'tag' }, thread.tag), by(thread)),
            thread.body ? h('p', { class: 'forum-post__body' }, renderText(thread.body)) : null,
            renderMediaList(thread.media),
            thread.poll ? renderPoll({
              getPoll: () => threads().find((t) => t.id === thread.id)?.poll,
              savePoll: (poll) => update((data) => { findThread(data, thread.id).poll = poll; }),
              me,
              canVote: !thread.pending,
              canManage: thread.authorId === me.id || canModerate,
            }) : null,
          ],
          thread.pending ? renderApproval(thread) : null,
          canModerate ? renderReports(thread, (data) => findThread(data, thread.id)) : null,
          actions,
        ),
      ),
      replyArea(thread),
      h('div', { class: 'forum-page__replies-header' },
        h('h3', { class: 'forum__replies-title' }, `${replyCount(thread)} ${replyCount(thread) === 1 ? 'reply' : 'replies'}`),
        replyCount(thread) > 1 ? h('label', { class: 'page-control' },
          h('span', { class: 'page-control__label' }, 'Sort'),
          h('select', {
            class: 'input input--compact',
            onChange: (event) => { view.replySort = event.target.value; drawMain(); },
          }, REPLY_SORTS.map((s) => h('option', { value: s.id, selected: s.id === view.replySort }, s.label)))) : null),
      // Q&A: the best answer, shown first.
      answer ? h('div', { class: 'forum__answer' },
        h('p', { class: 'forum__answer-label' }, icon('check', 13), ' Best answer'),
        by(answer),
        h('p', { class: 'forum-post__body' }, renderText(answer.body))) : null,
      qa && !answer && replyCount(thread) && (thread.authorId === me.id || canModerate)
        ? h('p', { class: 'forum-page__hint' }, 'Got a good answer? Choose “Best answer” under it, so others can find it.') : null,
      h('div', { class: 'forum-page__tree' }, tree.map((node) => renderNode(thread, node, 0))),
    ];
  }

  /** The reply box, or why there isn't one. */
  function replyArea(thread) {
    if (thread.locked) return h('p', { class: 'settings-locked' }, icon('lock', 13), ' This thread is locked. No new replies.');
    if (thread.pending) return h('p', { class: 'settings-locked' }, 'Replies open once a moderator approves this thread.');
    if (!canAnswer()) return h('p', { class: 'settings-locked' }, icon('lock', 13), ' Only admins and the owner reply in this forum.');
    return renderReplyBox(thread.id, null, 'Write a reply');
  }

  /** A thread waiting for approval: Approve / Decline for moderators, a note for its author. */
  function renderApproval(thread) {
    if (!canModerate) {
      return h('p', { class: 'forum__approval' }, 'Only you and the moderators can see this until a moderator approves it.');
    }
    return h('div', { class: 'forum__approval' },
      h('span', {}, h('strong', {}, 'Waiting for approval. '), 'Nobody else can see it yet.'),
      h('button', {
        type: 'button',
        class: 'button button--primary button--small',
        onClick: () => {
          update((data) => { findThread(data, thread.id).pending = false; });
          notifyApproved(context, { ...thread, pending: false });
          showToast('Approved. Everyone in the group can see it now.');
        },
      }, icon('check', 14), ' Approve'),
      h('button', {
        type: 'button',
        class: 'button button--small',
        onClick: () => {
          view.threadId = null;
          updateWithUndo(`Declined “${thread.title}”.`, (data) => { data.threads = data.threads.filter((t) => t.id !== thread.id); });
          notifyDeclined(context, thread);
        },
      }, 'Decline'));
  }

  /** "Report" → a short reason → flagged for the moderators. */
  /** The … on a thread: Save, Edit, Pin, Lock, and Delete, for whoever may use them. */
  function threadMenu(thread, { edit = null, remove = null } = {}) {
    return postMenu({
      title: 'this thread',
      save: { key: `thread:${thread.id}`, kind: 'thread', title: thread.title, href: `#module-${context.moduleId}`, where: getSpaceOfModule(context.moduleId)?.name ?? '' },
      actions: [
        edit ? ['pencil', 'Edit', edit] : null,
        canPin ? ['pin', thread.pinned ? 'Unpin' : 'Pin to the top', () => update((data) => { findThread(data, thread.id).pinned = !thread.pinned; })] : null,
        canModerate ? ['lock', thread.locked ? 'Unlock' : 'Lock replies', () => update((data) => { findThread(data, thread.id).locked = !thread.locked; })] : null,
        remove ? ['trash', 'Delete', remove, true] : null,
      ],
      info: [['Started by', thread.anonymous ? 'Someone (anonymous)' : context.getMember(thread.authorId)?.name ?? 'Someone'], ['When', new Date(thread.createdAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })]],
      link: `${window.location.origin}${window.location.pathname}#module-${context.moduleId}`,
    });
  }

  function reportButton(item, findInData) {
    if (item.reports.some((r) => r.memberId === me.id)) {
      return h('span', { class: 'forum__reported-mine' }, icon('flag', 11), ' Reported');
    }
    const button = h('button', { type: 'button', class: 'link-button forum__report' }, icon('flag', 11), ' Report');
    button.addEventListener('click', () => {
      const reason = h('input', { type: 'text', class: 'input input--compact', placeholder: 'e.g. spam, unkind, off-topic', 'aria-label': 'Why are you reporting this?' });
      const form = h('form', {
        class: 'forum__report-form',
        onSubmit: (event) => {
          event.preventDefault();
          update((data) => report(findInData(data), me.id, reason.value || 'No reason given'));
          showToast('Reported. The group’s moderators will take a look.');
        },
      },
        h('span', {}, 'Why are you reporting this?'),
        reason,
        h('button', { type: 'submit', class: 'button button--small' }, 'Report'),
        h('button', { type: 'button', class: 'link-button', onClick: () => form.replaceWith(button) }, 'Cancel'));
      button.replaceWith(form);
      reason.focus();
    });
    return button;
  }

  /** For moderators: what people reported about a post, with Dismiss. */
  function renderReports(item, findInData) {
    if (!item.reports.length) return null;
    return h('div', { class: 'forum__reports' },
      h('strong', {}, icon('flag', 12), ` Reported ${item.reports.length === 1 ? 'once' : `${item.reports.length} times`}`),
      h('ul', {}, item.reports.map((r) => h('li', {}, `${context.getMember(r.memberId)?.name ?? 'Someone'}: “${r.reason}” · ${timeAgo(r.at)}`))),
      h('button', { type: 'button', class: 'link-button', onClick: () => update((data) => { findInData(data).reports = []; }) }, 'Dismiss reports'),
      ' · Delete the post below if it breaks the group’s rules.');
  }

  function renderThreadEditor(thread) {
    const title = h('input', { type: 'text', class: 'input', value: thread.title, 'aria-label': 'Title' });
    const body = withMentions(h('textarea', { class: 'input', rows: '6', 'aria-label': 'Text' }));
    body.value = thread.body;
    const tagSelect = h('select', { class: 'input input--compact', 'aria-label': 'Tag' },
      context.getData().tags.map((t) => h('option', { value: t, selected: t === thread.tag }, t)));
    return h('form', {
      class: 'forum-page__composer',
      onSubmit: (event) => {
        event.preventDefault();
        if (!title.value.trim()) return;
        view.editingId = null;
        update((data) => Object.assign(findThread(data, thread.id), {
          title: title.value.trim(), body: body.value.trim(), tag: tagSelect.value, editedAt: Date.now(),
        }));
        notifyMentions({ moduleId: context.moduleId, itemId: thread.id, before: thread.body, after: body.value, where: `the thread “${title.value.trim()}”`, anonymous: thread.anonymous });
      },
    }, title, tagSelect,
    // Editing: what's attached stays above, as it shows; the words underneath it.
    renderMediaList(thread.media),
    thread.poll ? renderPoll({
      getPoll: () => threads().find((t) => t.id === thread.id)?.poll,
      savePoll: (poll) => update((data) => { findThread(data, thread.id).poll = poll; }),
      me,
      canVote: false,
      canManage: false,
    }) : null,
    body, h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Save'),
      h('button', { type: 'button', class: 'link-button', onClick: () => { view.editingId = null; drawMain(); } }, 'Cancel')));
  }

  /** A reply box: for the thread (parentId null) or under a reply. */
  function renderReplyBox(threadId, parentId, placeholder) {
    const input = withMentions(h('textarea', { class: 'input', rows: parentId ? '2' : '3', placeholder, 'aria-label': placeholder }));
    const anonymous = anonymousToggle();
    const media = mediaAttacher({ label: 'Add' });
    if (parentId) requestAnimationFrame(() => input.focus());
    return h('form', {
      class: `forum__form forum-page__reply-box${parentId ? ' forum-page__reply-box--inline' : ''}`,
      onSubmit: (event) => {
        event.preventDefault();
        const attached = media.read();
        if (!input.value.trim() && !attached.length) { input.focus(); return; }
        view.replyingToId = null;
        if (parentId) view.collapsed.delete(parentId);
        const reply = createReply({ authorId: me.id, body: input.value, parentId, anonymous: Boolean(anonymous?.input.checked), media: attached });
        update((data) => {
          const target = findThread(data, threadId);
          target.replies.push(reply);
          setFollowing(target, me.id, true); // you follow what you reply to
          markSeen(data, threadId, me.id);
        });
        notifyFollowers(threads().find((t) => t.id === threadId), reply);
        notifyMentions({ moduleId: context.moduleId, itemId: threadId, after: reply.body, where: `a reply in “${threads().find((t) => t.id === threadId)?.title}”`, anonymous: reply.anonymous });
      },
    }, input, media.slot, h('div', { class: 'form-row form-row--end' },
      media.button,
      anonymous?.label,
      parentId ? h('button', { type: 'button', class: 'link-button', onClick: () => { view.replyingToId = null; drawMain(); } }, 'Cancel') : null,
      h('button', { type: 'submit', class: 'button button--primary button--small' }, icon('reply', 14), ' Post')));
  }

  /** One reply and (unless folded) the replies under it. */
  function renderNode(thread, { reply, children }, depth) {
    const isCollapsed = view.collapsed.has(reply.id);
    const isEditing = view.editingId === reply.id;
    const countUnder = (nodes) => nodes.reduce((n, child) => n + 1 + countUnder(child.children), 0);

    const toggle = children.length ? h('button', {
      type: 'button',
      class: 'forum-reply__toggle',
      'aria-expanded': String(!isCollapsed),
      'aria-label': isCollapsed ? `Show ${countUnder(children)} more replies` : 'Hide replies',
      onClick: () => {
        if (isCollapsed) view.collapsed.delete(reply.id);
        else view.collapsed.add(reply.id);
        drawMain();
      },
    }, isCollapsed ? `[+${countUnder(children)}]` : '[–]') : null;

    const body = reply.deleted
      ? h('p', { class: 'forum-post__body forum-reply--deleted' }, '[deleted]')
      : isEditing ? renderReplyEditor(thread.id, reply) : [reply.body ? h('p', { class: 'forum-post__body' }, renderText(reply.body)) : null, renderMediaList(reply.media)];

    return h('div', { class: `forum-page__node${depth > 0 ? ' forum-page__node--nested' : ''}` },
      h('div', { class: 'forum-reply' },
        reply.deleted ? h('div', { class: 'vote' }) : voteControls(reply, me.id, (direction) => update((data) => toggleVote(findReply(data, thread.id, reply.id), me.id, direction)), { downvotes: settings().downvotes }),
        h('div', { class: 'forum-post__main' },
          h('div', { class: 'forum-reply__head' }, toggle, reply.deleted ? h('span', { class: 'forum__byline' }, 'deleted') : by(reply),
            thread.answerId === reply.id && settings().qa ? h('span', { class: 'tag forum__answer-tag' }, icon('check', 11), ' Best answer') : null),
          body,
          canModerate && !reply.deleted ? renderReports(reply, (data) => findReply(data, thread.id, reply.id)) : null,
          reply.deleted || isEditing ? null : h('div', { class: 'forum-post__actions' },
            thread.locked || !canAnswer() ? null : h('button', { type: 'button', class: 'link-button', onClick: () => { view.replyingToId = reply.id; drawMain(); } }, icon('reply', 12), ' Reply'),
            canEditOwn(reply.authorId) ? h('button', { type: 'button', class: 'link-button', onClick: () => { view.editingId = reply.id; drawMain(); } }, 'Edit') : null,
            // Q&A: the thread's author (or a moderator) picks the best answer.
            settings().qa && (thread.authorId === me.id || canModerate) && reply.authorId !== thread.authorId
              ? h('button', {
                type: 'button',
                class: 'link-button',
                onClick: () => update((data) => { const t = findThread(data, thread.id); t.answerId = t.answerId === reply.id ? null : reply.id; }),
              }, icon('check', 12), thread.answerId === reply.id ? ' Not the best answer' : ' Best answer') : null,
            reply.authorId !== me.id ? reportButton(reply, (data) => findReply(data, thread.id, reply.id)) : null,
            canChange(reply.authorId) ? h('button', {
              type: 'button',
              class: 'link-button link-button--danger',
              onClick: () => updateWithUndo('Reply deleted.', (data) => deleteReply(data, thread.id, reply.id)),
            }, 'Delete') : null,
          ),
          view.replyingToId === reply.id ? renderReplyBox(thread.id, reply.id, reply.anonymous ? 'Reply' : `Reply to ${context.getMember(reply.authorId)?.name.split(' ')[0] ?? 'this'}`) : null,
        ),
      ),
      isCollapsed || children.length === 0 ? null : h('div', {
        class: `forum-page__children${depth + 1 >= MAX_DEPTH ? ' forum-page__children--flat' : ''}`,
      }, children.map((child) => renderNode(thread, child, depth + 1))),
    );
  }

  function renderReplyEditor(threadId, reply) {
    const input = withMentions(h('textarea', { class: 'input', rows: '3', 'aria-label': 'Edit reply' }));
    input.value = reply.body;
    requestAnimationFrame(() => input.focus());
    return h('form', {
      class: 'forum__form',
      onSubmit: (event) => {
        event.preventDefault();
        if (!input.value.trim()) return;
        view.editingId = null;
        update((data) => Object.assign(findReply(data, threadId, reply.id), { body: input.value.trim(), editedAt: Date.now() }));
        notifyMentions({ moduleId: context.moduleId, itemId: threadId, before: reply.body, after: input.value, where: `a reply in “${threads().find((t) => t.id === threadId)?.title}”`, anonymous: reply.anonymous });
      },
    }, renderMediaList(reply.media), input, h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Save'),
      h('button', { type: 'button', class: 'link-button', onClick: () => { view.editingId = null; drawMain(); } }, 'Cancel')));
  }

  // ─── Layout ────────────────────────────────────────────────────────────────

  function drawAll() {
    drawSidebar();
    drawMain();
  }

  container.append(h('div', { class: 'forum-page' }, sidebar, main));
  drawAll();
}
