/**
 * feed-modules.js — the three feed modules for personal blogs. They're
 * listed first in a blog's module library, under "Feeds": what you post
 * in them shows up in your friends' Feeds (js/feed/), with likes,
 * comments and "Send".
 *
 *   Photo & video feed   a grid of squares, newest first (like a photo
 *                        app's profile); every post has photos or a video,
 *                        with a caption. Tapping a square opens the post
 *                        over the page (photo-viewer.js)
 *   Text feed            short posts, up to 500 characters (like X)
 *   General feed         anything: text with pictures, a file from your
 *                        vault, or an invitation to an event, shown as a
 *                        list or a grid where every post gets the same size
 *                        (feed-layouts.js; the owner picks under "Layout")
 *
 * On your own blog a "New post" button sits on the module's title line
 * (left of the expand arrows) and opens the composer in a pop-up over the
 * page (js/ui/modal.js); visitors just see the posts.
 *
 * Groups can have feeds too (a band's photo feed on its public Home tab).
 * There, members with the "Post in the group's feeds" permission get the
 * composer, each post's author (or a moderator) can edit or delete it,
 * members comment, and anyone who can see the tab can like.
 * The card shows the latest few; the full page shows them all, and opens
 * at a post when you come from the Feed, a notification or a message.
 *
 * Files in this folder:
 *   feed-modules.js   ← this file: the three module definitions and how they draw
 *   feed-composer.js  writing a post
 *   feed-post.js      one post (also used by the Feed)
 *   photo-viewer.js   a photo post opened from the grid
 *   feed-move.js      dragging a post to another feed on the page (or "Move to" in its menu)
 *   feed-data.js      the data shape and small helpers
 */

import { emptyState } from '../../ui/empty-state.js';
import { postMenu } from '../../feed/post-menu.js';
import { audienceFor, canSeePost } from '../../ui/audience-chip.js';
import { h, replaceChildren, debounce } from '../../ui/dom.js';
import { openModal } from '../../ui/modal.js';
import { icon } from '../../ui/icons.js';
import { timeAgo } from '../../utils/dates.js';
import { showToast } from '../../ui/toast.js';
import { getSpace, updateModuleData, getTabs } from '../../state/store.js';
import { notifyMentions } from '../../state/notifications.js';
import { createEvent, addMinutesToTime } from '../calendar/calendar-data.js';
import { normalizeFeed, normalizePost, sortedPosts, createPost, postTitle } from './feed-data.js';
import { renderComposer } from './feed-composer.js';
import { draftsFor, saveDraft, deleteDraft, restoreDraft, hasContent } from '../../state/post-drafts.js';
import { renderFeedPost } from './feed-post.js';
import { openPhotoPost } from './photo-viewer.js';
import { displayOf, renderLayout, renderLayoutControls } from './feed-layouts.js';
import { otherFeeds, fitsFeed, movePost, makePostDraggable, makeFeedDropTarget } from './feed-move.js';

const CARD_POSTS = 3;
const CARD_PHOTOS = 9;
const CARD_LIST_ROWS = 4;
const EVENT_LENGTH_MINUTES = 120;
const DRAFT_SAVE_MS = 700;
/** @type {Map<string, { draftId: string | null }>} which feeds have the composer open, across redraws */
const composeState = new Map();

function feedModule({ type, variant, label, description, icon, defaultSpan, defaultRows }) {
  return {
    type,
    label,
    description,
    icon,
    defaultSpan,
    defaultRows,
    available: true,
    spaceKinds: ['blog', 'group'],
    isFeed: true, // listed first, under "Feeds", in a blog's library
    createInitialData: () => ({ posts: [], events: [] }),
    render: (container, context) => renderFeed(container, context, variant, false),
    renderFullPage: (container, context) => renderFeed(container, context, variant, true),
  };
}

export const photoFeedModule = feedModule({
  type: 'photofeed', variant: 'photo', label: 'Photo & video feed', icon: 'image', defaultSpan: 8, defaultRows: 16,
  description: 'Share pictures and short videos, with a caption. Shows in your friends’ (or members’) Feeds.',
});
export const textFeedModule = feedModule({
  type: 'textfeed', variant: 'text', label: 'Text feed', icon: 'chat', defaultSpan: 6, defaultRows: 16,
  description: 'Short posts, just words. Shows in your friends’ (or members’) Feeds.',
});
export const generalFeedModule = feedModule({
  type: 'generalfeed', variant: 'general', label: 'General feed', icon: 'announcements', defaultSpan: 8, defaultRows: 16,
  description: 'Anything: words with pictures, a file from your vault, an event invitation.',
});

export const FEED_MODULES = [photoFeedModule, textFeedModule, generalFeedModule];

function renderFeed(container, context, variant, isFullPage) {
  const space = getSpace(context.spaceId);
  const inGroup = space?.kind === 'group';
  const me = context.currentUser;
  const blogOwnerId = space?.memberIds[0];
  // Who can post: the blogger on a blog; in a group, members allowed to.
  const isOwner = inGroup
    ? !context.isVisitor && context.can('postToFeeds')
    : !context.isVisitor && me?.id === blogOwnerId;
  // Likes and comments notify the blogger, or in a group the post's author.
  const ownerIdOf = (p) => (inGroup ? p.authorId : blogOwnerId);
  const canManagePost = (p) => (inGroup ? !context.isVisitor && (p.authorId === me?.id || context.can('moderate')) : isOwner);
  // Is this feed on a tab anyone can see? Then events made from it are public.
  const onPublicTab = () => {
    const module = space?.modules.find((m) => m.id === context.moduleId);
    return getTabs(space).find((t) => t.id === (module?.tabId ?? 'home'))?.visibility === 'public';
  };
  const focusId = isFullPage ? context.takeFocusRequest() : null;
  const list = h('div', { class: `feed-module__posts feed-module__posts--${variant}` });

  function update(changeFn) {
    const data = normalizeFeed(structuredClone(context.getData()));
    changeFn(data);
    context.saveData(data);
    draw();
  }

  function post(fields) {
    const created = createPost({ authorId: context.currentUser.id, ...fields });
    update((data) => { data.posts.push(created); });
    notifyMentions({ moduleId: context.moduleId, itemId: created.id, after: created.text, where: 'a post' });
    showToast(inGroup ? `Posted in ${space.name}.` : 'Posted. Your friends will see it in their Feeds.');
  }

  /**
   * An event made from the composer: public, with you going. It's saved in
   * the blog's Upcoming events (so it's listed there too), or on this feed
   * if the blog has none.
   */
  function createFeedEvent(fields) {
    const event = createEvent({
      kind: 'event',
      ...fields, endTime: fields.time ? addMinutesToTime(fields.time, EVENT_LENGTH_MINUTES) : '', allDay: !fields.time,
      color: 'purple', createdBy: me.id, visibility: !inGroup || onPublicTab() ? 'public' : 'group', attendeeIds: [me.id], rsvps: { [me.id]: 'going' },
    });
    const eventsModule = getSpace(context.spaceId)?.modules.find((m) => m.type === 'events')
      ?? (inGroup ? getSpace(context.spaceId)?.modules.find((m) => m.type === 'calendar') : null);
    if (eventsModule) updateModuleData(eventsModule.id, { ...eventsModule.data, events: [...(eventsModule.data.events ?? []), event] });
    else update((data) => { data.events.push(event); });
    return event;
  }

  function remove(postToRemove) {
    const before = structuredClone(context.getData());
    update((data) => { data.posts = data.posts.filter((p) => p.id !== postToRemove.id); });
    showToast('Post deleted.', { actionLabel: 'Undo', onAction: () => { context.saveData(before); draw(); } });
  }

  /** The "…" on a post here: Save, Send, Edit and Delete (renderFeedPost adds those), More information, and Report. */
  const menuForPost = (p, afterMove = () => draw()) => (extras = {}) => postMenu({
    ...extras,
    // "Move to <feed>" for each other feed here that can hold it (feed-move.js).
    actions: [...(extras.actions ?? []), ...(canManagePost(p) ? otherFeeds(space, context.moduleId)
      .filter((f) => !fitsFeed(p, f.variant))
      .map((f) => ['arrowRight', `Move to ${f.label}`, () => { if (movePost(context.moduleId, f.module.id, p.id)) afterMove(); }]) : [])],
    save: { key: `post:${p.id}`, kind: 'post', title: postTitle(p), href: `#module-${context.moduleId}`, where: space?.name ?? '' },
    title: 'this post',
    info: [
      ['Posted by', context.getMember(p.authorId)?.name ?? 'Someone'],
      ['Where', [space?.name, space?.modules.find((m) => m.id === context.moduleId)?.title].filter(Boolean).join(' · ')],
      ['When', new Date(p.createdAt).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })],
      ['Edited', p.editedAt ? new Date(p.editedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null],
      ['Who can see it', inGroup ? (onPublicTab() ? 'Anyone with the link (a public tab)' : `Members of ${space.name}`) : 'Anyone on 3den (a public blog)'],
    ],
    link: `${window.location.origin}${window.location.pathname}#module-${context.moduleId}`,
    report: p.authorId === me?.id ? null : { key: `feedpost:${p.id}`, kind: 'feedpost', spaceId: space?.id ?? null, moduleId: context.moduleId, itemId: p.id, authorId: p.authorId },
  });

  const postView = (p, extra = {}) => renderFeedPost(p, {
    menu: menuForPost(p),
    moduleId: context.moduleId,
    ownerId: ownerIdOf(p),
    spaceId: inGroup ? space.id : null,
    where: space?.name ?? '',
    canManage: canManagePost(p),
    onDelete: () => remove(p),
    onSaveText: (text) => update((data) => Object.assign(data.posts.find((x) => x.id === p.id), { text, editedAt: Date.now() })),
    ...extra,
  });

  /** Open a photo post over the page; after a change it closes, and the grid redraws. */
  function openViewer(posts, index) {
    openPhotoPost(posts.map(normalizePost), index, (p, close) => ({
      menu: menuForPost(p, () => { close(); draw(); }),
      moduleId: context.moduleId,
      ownerId: ownerIdOf(p),
      spaceId: inGroup ? space.id : null,
      where: space?.name ?? '',
      canManage: canManagePost(p),
      onDelete: () => { close(); remove(p); },
      onSaveText: (text) => { close(); update((data) => Object.assign(data.posts.find((x) => x.id === p.id), { text, editedAt: Date.now() })); },
    }));
  }

  /** Drag a post you can manage to another feed on this page (feed-move.js). */
  const draggable = (el, p) => {
    if (canManagePost(p) && otherFeeds(space, context.moduleId).length) makePostDraggable(el, { spaceId: context.spaceId, moduleId: context.moduleId, post: p });
    return el;
  };

  let layoutOpen = false; // the owner's "Layout" panel stays open while they try options

  function draw() {
    const posts = sortedPosts(context.getData()).filter((p) => canSeePost(p, space, me?.id));
    // General and photo feeds: a grid of tiles (or a list), one per post.
    if (variant === 'general' || variant === 'photo') { drawGeneral(posts); return; }
    if (posts.length === 0) {
      replaceChildren(list, emptyState({ icon: 'note', title: 'No posts yet', text: isOwner ? 'Tap New post to write your first.' : null }));
      return;
    }

    // A photo feed is a grid of squares, newest first; tap one to open the post.
    if (variant === 'photo') {
      const shownPosts = isFullPage ? posts : posts.slice(0, CARD_PHOTOS);
      replaceChildren(list,
        isFullPage ? h('p', { class: 'feed-module__count-line' }, `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}`) : null,
        h('div', { class: 'feed-module__grid' }, shownPosts.map((p, index) => {
          const cover = p.media[0];
          return draggable(h('button', {
            type: 'button',
            class: 'feed-module__square',
            'aria-label': p.text ? `Open post: ${p.text.slice(0, 60)}` : 'Open post',
            onClick: () => openViewer(posts, index),
          },
            cover?.kind === 'video' ? h('video', { src: cover.src, muted: true, preload: 'metadata' }) : cover ? h('img', { src: cover.src, alt: '', loading: 'lazy' }) : null,
            p.media.length > 1 ? h('span', { class: 'feed-module__count' }, String(p.media.length)) : null,
            cover?.kind === 'video' ? h('span', { class: 'feed-module__count' }, '▶') : null), p);
        })),
        !isFullPage && posts.length > CARD_PHOTOS ? h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage() }, `See all ${posts.length} posts`) : null);
      return;
    }

    const shown = isFullPage ? posts : posts.slice(0, CARD_POSTS);
    replaceChildren(list,
      shown.map((p) => draggable(postView(normalizePost(p), { startOpen: p.id === focusId }), p)),
      !isFullPage && posts.length > CARD_POSTS ? h('button', { type: 'button', class: 'link-button feed-module__all', onClick: () => context.openFullPage() }, `See all ${posts.length} posts`) : null);
  }

  /**
   * A General feed: every post in the same list row or grid tile, whatever
   * it holds; tap one to open it whole (feed-layouts.js).
   */
  function drawGeneral(posts) {
    const display = displayOf(context.getData());
    const controls = isOwner && posts.length ? renderLayoutControls(display, (next) => {
      const data = normalizeFeed(structuredClone(context.getData()));
      context.saveData({ ...data, display: next });
      draw();
    }, { open: layoutOpen, onToggle: (open) => { layoutOpen = open; } }) : null;
    if (posts.length === 0) {
      replaceChildren(list, h('p', { class: 'module-empty' }, isOwner ? 'Nothing here yet. Tap New post to write your first.' : 'No posts yet.'));
      return;
    }
    const limit = isFullPage ? Infinity : display.layout === 'grid' ? display.columns * 2 : CARD_LIST_ROWS;
    replaceChildren(list,
      controls,
      renderLayout({ posts: posts.map(normalizePost), display, limit, onOpen: (index) => openViewer(posts, index), decorate: draggable }),
      !isFullPage && posts.length > limit ? h('button', { type: 'button', class: 'link-button feed-module__all', onClick: () => context.openFullPage() }, `See all ${posts.length} posts`) : null);
  }

  // ─── Writing: "New post" (on the module's title line) opens the composer in a pop-up
  //     over the page; what you write is kept as a draft ───
  const composerSlot = h('div', { class: 'feed-module__compose' });
  let composing = composeState.get(context.moduleId) ?? null; // null, or { draftId }
  let showDrafts = false;
  let modal = null;

  /** "+ New post" on the module's title line (left of the expand arrows), or on the full page's title row. */
  function placeNewPostButton() {
    const frameHeader = container.closest('.module-frame')?.querySelector(':scope > .module-frame__header');
    const header = frameHeader ?? container.closest('.module-page')?.querySelector('.module-page__title-row');
    if (!header) return false;
    header.querySelector('.feed-module__new-post')?.remove();
    if (!isOwner || header.querySelector('.module-frame__title-input')) return true; // editing the page: the header is for that
    const button = h('button', {
      type: 'button', class: 'button button--primary button--small feed-module__new-post',
      onClick: (event) => { event.stopPropagation(); openComposer(null); },
    }, icon('plus', 14), ' New post');
    const expand = header.querySelector('.module-frame__open');
    if (expand) header.insertBefore(button, expand); else header.append(button);
    return true;
  }

  function drawCompose() {
    if (!isOwner) { replaceChildren(composerSlot); return; }
    const drafts = draftsFor(me, context.moduleId);
    if (!composing) {
      modal?.close();
      modal = null;
      replaceChildren(composerSlot, drafts.length ? h('div', { class: 'feed-module__compose-bar' },
        h('button', {
          type: 'button', class: 'link-button feed-module__drafts-toggle', 'aria-expanded': String(showDrafts),
          onClick: () => { showDrafts = !showDrafts; drawCompose(); },
        }, `Drafts (${drafts.length})`)) : null,
      showDrafts && drafts.length ? h('ul', { class: 'feed-drafts' }, drafts.map((d) => h('li', { class: 'feed-drafts__row' },
        h('button', { type: 'button', class: 'feed-drafts__open', onClick: () => openComposer(d.id) },
          h('span', { class: 'feed-drafts__text' }, d.text.trim() ? d.text.trim().slice(0, 90) : d.media.length ? `${d.media.length} ${d.media.length === 1 ? 'picture' : 'pictures'}` : 'Untitled draft'),
          h('span', { class: 'feed-drafts__meta' }, [d.media.length && d.text.trim() ? `${d.media.length} ${d.media.length === 1 ? 'picture' : 'pictures'}` : null, d.attachments.length ? `${d.attachments.length} attached` : null, `saved ${timeAgo(d.updatedAt)}`].filter(Boolean).join(' · '))),
        h('button', {
          type: 'button', class: 'link-button link-button--danger', 'aria-label': 'Delete this draft',
          onClick: () => { const gone = deleteDraft(me, d.id); drawCompose(); showToast('Draft deleted.', { actionLabel: 'Undo', onAction: () => { restoreDraft(me, gone); drawCompose(); } }); },
        }, 'Delete')))) : null);
      return;
    }
    const existing = composing.draftId ? draftsFor(me, context.moduleId).find((d) => d.id === composing.draftId) : null;
    const saveSoon = debounce((fields) => {
      if (!composing) return;
      if (!hasContent(fields)) return;
      composing.draftId = saveDraft(me, { id: composing.draftId, moduleId: context.moduleId, ...fields });
    }, DRAFT_SAVE_MS);
    const composer = renderComposer({
      variant, spaceId: context.spaceId, audience: audienceFor(space, space?.modules.find((m) => m.id === context.moduleId)),
      initial: existing,
      onPost: (fields) => {
        post(fields);
        if (composing?.draftId) deleteDraft(me, composing.draftId);
        closeComposer();
      },
      onCreateEvent: createFeedEvent,
      onChange: saveSoon,
      onClose: (fields) => {
        if (hasContent(fields)) {
          composing.draftId = saveDraft(me, { id: composing.draftId, moduleId: context.moduleId, ...fields });
          showToast('Saved to your drafts.');
        } else if (composing.draftId) deleteDraft(me, composing.draftId);
        closeComposer();
      },
      onDiscard: () => {
        const gone = composing.draftId ? deleteDraft(me, composing.draftId) : null;
        closeComposer();
        if (gone) showToast('Draft discarded.', { actionLabel: 'Undo', onAction: () => { restoreDraft(me, gone); openComposer(gone.id); } });
      },
    });
    // A pop-up over the page, dimming what's behind it; Esc or a click outside closes it like its × (keeping a draft).
    modal?.close();
    modal = openModal(composer, {
      label: 'New post', className: 'feed-compose-modal',
      onDismiss: () => composer.querySelector('.feed-composer__top [aria-label^="Close"]')?.click(),
    });
    requestAnimationFrame(() => composer.querySelector('textarea')?.focus());
  }

  function openComposer(draftId) {
    composing = { draftId };
    composeState.set(context.moduleId, composing);
    showDrafts = false;
    drawCompose();
  }
  function closeComposer() {
    composing = null;
    composeState.delete(context.moduleId);
    drawCompose();
  }

  container.append(h('div', { class: `feed-module${isFullPage ? ' feed-module--page' : ''}` },
    composerSlot,
    list));
  drawCompose();
  draw();
  // Posts dragged here from another feed on the page (feed-move.js).
  if (isOwner) makeFeedDropTarget(container, { spaceId: context.spaceId, moduleId: context.moduleId, variant, frameOf: () => container.closest('.module-frame') ?? container });
  // The frame's header may only be in place once this card is (later on a busy page): try a few times.
  if (!placeNewPostButton()) {
    let tries = 0;
    const retry = () => { if (!placeNewPostButton() && ++tries < 8) setTimeout(retry, 60 * tries); };
    requestAnimationFrame(retry);
  } else requestAnimationFrame(placeNewPostButton);

  // Opened at a post (from the Feed, a notification or a message): open it
  // (photo feeds) or scroll to it.
  if (focusId && (variant === 'photo' || variant === 'general')) {
    const posts = sortedPosts(context.getData()).filter((p) => canSeePost(p, space, me?.id));
    const index = posts.findIndex((p) => p.id === focusId);
    if (index !== -1) requestAnimationFrame(() => openViewer(posts, index));
  } else if (focusId) {
    requestAnimationFrame(() => {
      const target = container.querySelector(`#post-${CSS.escape(focusId)}`);
      target?.scrollIntoView({ block: 'center' });
      target?.classList.add('is-focused');
    });
  }
}
