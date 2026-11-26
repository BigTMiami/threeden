// @ts-check
/**
 * forum-card.js — the forum as it appears on the homepage.
 *
 *   [ Hot | New | Top ][ All tags ▾ ]                    [+ New thread]
 *   ▲ 3 ▼  Can we agree on a thermostat setting?
 *          Money · (WW) William W · 22h ago · 2 replies
 *
 * Votes and new threads work right here. Clicking a thread opens it on
 * the full page (forum-page.js), where the replies are.
 */

import { firstFew } from '../../ui/more-link.js';
import { emptyState } from '../../ui/empty-state.js';
import { mediaAttacher } from '../../ui/media-attach.js';
import { attachMentionPicker } from '../../ui/mention-picker.js';
import { showToast } from '../../ui/toast.js';
import { audienceChipForModule } from '../../ui/audience-chip.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import {
  createThread, sortThreads, filterThreads, toggleVote, findThread, replyCount,
  settingsOf, canStartThread, newReplyCount, isUnseen,
} from './forum-data.js';
import { voteControls, byline, threadFlags } from './forum-parts.js';
import { visibleThreads, announceThread } from './forum-actions.js';

const CARD_SORTS = [
  { id: 'hot', label: 'Hot' },
  { id: 'new', label: 'New' },
  { id: 'top', label: 'Top' },
];

export function renderForumCard(container, context) {
  const me = context.currentUser;
  const canPin = context.can('pinPosts');
  let sortId = settingsOf(context.getData()).defaultSort;
  if (!CARD_SORTS.some((s) => s.id === sortId)) sortId = 'hot';
  let tag = '';

  const canModerate = context.can('moderate');
  const threads = () => visibleThreads(context); // pending threads only for their author and moderators

  function update(changeFn) {
    const data = structuredClone(context.getData());
    changeFn(data);
    context.saveData(data);
    draw();
  }

  const sortBar = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Sort threads' });
  const tagSelect = h('select', {
    class: 'input input--compact forum__tag-filter',
    'aria-label': 'Filter by tag',
    onChange: (event) => { tag = event.target.value; draw(); },
  });
  const list = h('div', { class: 'forum__threads' });

  function draw() {
    replaceChildren(sortBar, CARD_SORTS.map((option) => h('button', {
      type: 'button',
      class: `segmented__option${option.id === sortId ? ' is-active' : ''}`,
      'aria-pressed': String(option.id === sortId),
      onClick: () => { sortId = option.id; draw(); },
    }, option.label)));

    const { tags } = context.getData();
    replaceChildren(tagSelect,
      h('option', { value: '', selected: tag === '' }, 'All tags'),
      tags.map((t) => h('option', { value: t, selected: t === tag }, t)));
    replaceChildren(newTagSelect, tags.map((t) => h('option', { value: t }, t)));

    const all = sortThreads(filterThreads(threads(), { tag }), sortId);
    // The first three, then "4 more" to the full page (more-link.js).
    const { shown, more } = firstFew(all, context.openFullPage ? () => context.openFullPage() : null);
    const settings = settingsOf(context.getData());
    replaceChildren(list, shown.length
      ? shown.map((thread) => h('article', { class: `forum-thread${thread.pinned ? ' forum-thread--pinned' : ''}${isUnseen(thread, me.id) || newReplyCount(thread, me.id) ? ' is-unread' : ''}` },
          voteControls(thread, me.id, (direction) => update((data) => toggleVote(findThread(data, thread.id), me.id, direction)), { downvotes: settings.downvotes }),
          h('div', { class: 'forum-thread__main' },
            h('button', { type: 'button', class: 'forum-thread__title', onClick: () => context.openFullPage(thread.id) }, thread.title),
            h('div', { class: 'forum-thread__meta' },
              threadFlags(thread, { qa: settings.qa }),
              newReplyCount(thread, me.id) && !isUnseen(thread, me.id) ? h('span', { class: 'tag tag--new' }, `${newReplyCount(thread, me.id)} new`) : null,
              h('span', { class: 'tag' }, thread.tag),
              byline(context.getMember, thread.authorId, thread.createdAt, null, { anonymous: thread.anonymous, viewerId: me.id, isModerator: canModerate }),
              h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage(thread.id) },
                `${replyCount(thread)} ${replyCount(thread) === 1 ? 'reply' : 'replies'}`),
              // Admins (anyone allowed to pin) can pin right from the card.
              canPin ? h('button', {
                type: 'button',
                class: 'link-button forum-thread__pin',
                title: thread.pinned ? 'Unpin' : 'Pin to the top',
                onClick: () => update((data) => { findThread(data, thread.id).pinned = !thread.pinned; }),
              }, icon('pin', 11), thread.pinned ? ' Unpin' : ' Pin') : null),
          )))
      : tag ? h('p', { class: 'module-empty' }, `No threads tagged “${tag}”.`) : emptyState({ icon: 'forum', title: 'No threads yet', text: 'Ask a question or start a discussion with New thread.' }), more);
  }

  // ─── New thread (tucked into a <details> until needed) ─────────────────────

  const titleInput = h('input', { type: 'text', class: 'input', placeholder: 'Thread title', 'aria-label': 'Thread title' });
  const bodyInput = h('textarea', { class: 'input', rows: '3', placeholder: 'What do you want to discuss?', 'aria-label': 'Thread text' });
  attachMentionPicker(bodyInput, { getCandidates: () => context.members, excludeId: me.id });
  const newTagSelect = h('select', { class: 'input input--compact', 'aria-label': 'Tag' });
  const anonymousInput = h('input', { type: 'checkbox' });
  const anonymousLabel = settingsOf(context.getData()).anonymous
    ? h('label', { class: 'page-control forum__anonymous' }, anonymousInput, h('span', {}, 'Anonymous'))
    : null;
  const error = h('p', { class: 'form-error', role: 'alert' });
  const media = mediaAttacher({ label: 'Add' });
  const details = h('details', { class: 'forum__new-thread' },
    h('summary', { class: 'button button--primary button--small' }, icon('plus', 14), ' New thread'),
    h('form', {
      class: 'forum__form',
      onSubmit: (event) => {
        event.preventDefault();
        if (!titleInput.value.trim()) {
          error.textContent = 'Give your thread a title first.';
          titleInput.focus();
          return;
        }
        sortId = 'new';
        const settings = settingsOf(context.getData());
        const thread = createThread({
          authorId: me.id, title: titleInput.value, body: bodyInput.value, tag: newTagSelect.value,
          anonymous: settings.anonymous && anonymousInput.checked,
          pending: settings.requireApproval && !canModerate,
          media: media.read(),
        });
        update((data) => data.threads.push(thread));
        announceThread(context, thread);
        if (thread.pending) showToast('Posted. Others will see it once a moderator approves it.');
        titleInput.value = '';
        bodyInput.value = '';
        media.clear();
        error.textContent = '';
        details.open = false;
      },
    },
      titleInput, bodyInput, media.slot, error,
      h('div', { class: 'form-row form-row--end' }, media.button, anonymousLabel, newTagSelect, audienceChipForModule(context.moduleId), h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Post'))),
  );
  titleInput.addEventListener('input', () => { error.textContent = ''; });

  // "Only admins start threads" (Forum settings): others don't get the New thread button.
  const canStart = canStartThread(settingsOf(context.getData()), context.role);
  container.append(h('div', { class: 'forum__toolbar' }, sortBar, tagSelect, canStart ? details : null), list);
  draw();
}
