// @ts-check
/**
 * note.js — Document: a page of writing anyone who can edit the page can
 * change. Shared notes and blog Documents were merged into this one module
 * on Nov 15 (old 'document' modules are moved over by
 * js/data/module-migrations.js).
 *
 * Data shape:
 *   {
 *     title: 'Why our block needs the garden' | '',   // optional
 *     html: '<h3>…</h3><p>…</p>',                     // the text, sanitized
 *     lastEditedBy: 'm-sam', lastEditedAt: 1731300000000,
 *     updatedAt: 1731300000000,                        // lets the Feed show friends' new writing
 *     poll: null | {…}                                 // blogs only (js/utils/polls.js)
 *   }
 *
 * The editor itself lives in js/ui/rich-text-editor.js (shared with the
 * Vault's notes): a toolbar with paragraph styles, bold/italic/underline,
 * links, lists and checklists (more under "⋯"), a word count and a save
 * indicator. Type "@" to mention someone; they get a notification.
 *
 *   Card       a compact editor (the title field shows on blogs, or once there's a title)
 *   Full page  a page of "paper" with every tool showing, and a Contents
 *              list of the headings beside it (click one to jump there)
 *   On a blog  a byline (the blog's owner · updated Nov 10), and the owner
 *              can end it with a poll anyone signed in can vote on
 *
 * Visitors (a group's public tab, someone else's blog) read it; they can't edit.
 *
 * Since Nov 17 a new Document isn't added from the module list: File from
 * vault (js/modules/vaultfile/) shows a vault note through this same code,
 * with a context that reads and writes the note in its vault.
 */

import { h, replaceChildren, debounce, appendChildren } from '../ui/dom.js';
import { sanitizeHtml } from '../utils/sanitize.js';
import { createRichTextEditor } from '../ui/rich-text-editor.js';
import { timeAgo, formatShortDate, toDateKey } from '../utils/dates.js';
import { notifyMentions } from '../state/notifications.js';
import { getModule, getSpace, updateModuleData } from '../state/store.js';
import { getAccounts } from '../state/accounts.js';
import { renderPoll, pollBuilder } from '../ui/poll-view.js';
import { icon } from '../ui/icons.js';
import { decorateMentions } from '../ui/mentions.js';

const FOOTER_REFRESH_MS = 60 * 1000;
const TITLE_SAVE_DELAY_MS = 400;

export const noteModule = {
  type: 'note',
  label: 'Document',
  description: 'Writing anyone can edit: a title if you like, headings, lists, checklists, and links',
  icon: 'note',
  defaultSpan: 6,
  defaultRows: 11,
  available: true,
  spaceKinds: ['group', 'personal', 'blog'],
  // Not in the module list since Nov 17: added with File from vault from a vault file.
  hiddenFromLibrary: true,

  createInitialData(state) {
    return { title: '', html: '<p></p>', lastEditedBy: state?.currentUserId ?? null, lastEditedAt: null, updatedAt: null };
  },

  render(container, context) {
    return renderNote(container, context, false);
  },

  renderFullPage(container, context) {
    return renderNote(container, context, true);
  },
};

const isEmpty = (html) => !String(html ?? '').replace(/<[^>]*>/g, '').trim();

function renderNote(container, context, isFullPage) {
  const onBlog = context.spaceKind === 'blog';
  const data = context.getData();

  // On a blog: "Leo L · updated Nov 10".
  const byline = h('p', { class: 'blog-doc__byline' });
  const drawByline = () => {
    if (!onBlog) { byline.hidden = true; return; }
    const owner = context.getMember(getSpace(context.spaceId)?.memberIds[0]);
    const { updatedAt, lastEditedAt } = context.getData();
    const when = updatedAt ?? lastEditedAt;
    byline.textContent = `${owner?.name ?? 'Someone'}${when ? ` · updated ${formatShortDate(toDateKey(new Date(when)))}` : ''}`;
  };
  drawByline();

  // ─── Reading only ──────────────────────────────────────────────────────────
  if (context.isVisitor) {
    const body = decorateMentions(h('div', { class: `rich-text__content note__read-only${isFullPage ? ' note-page__paper' : ''}`, html: sanitizeHtml(data.html || '') }));
    const article = h('article', { class: `note-doc${isFullPage ? ' note-doc--page' : ''}` });
    appendChildren(article, [
      data.title ? h('h2', { class: 'blog-doc__title' }, data.title) : null,
      onBlog ? byline : null,
      body,
      !data.title && isEmpty(data.html) ? h('p', { class: 'module-empty' }, 'Nothing here yet.') : null,
    ]);
    container.append(article);
    if (onBlog) appendChildren(container, [renderPollSlot(context, false)]);
    return null;
  }

  // ─── Writing ───────────────────────────────────────────────────────────────
  const lastEdited = h('span', { class: 'note__last-edited' });
  function drawLastEdited() {
    const { lastEditedBy, lastEditedAt } = context.getData();
    // A fresh note (like the starter one) hasn't been edited by anyone yet.
    lastEdited.hidden = !lastEditedAt || onBlog;
    if (lastEdited.hidden) return;
    const member = context.getMember(lastEditedBy);
    lastEdited.textContent = `Last edited by ${member?.id === context.currentUser.id ? 'you' : member?.name ?? 'someone'} · ${timeAgo(lastEditedAt)}`;
  }

  function save(changes) {
    const before = context.getData();
    const now = Date.now();
    context.saveData({ ...before, ...changes, lastEditedBy: context.currentUser.id, lastEditedAt: now, updatedAt: now });
    if (changes.html !== undefined) {
      const name = context.getData().title || getModule(context.moduleId)?.title || 'a document';
      notifyMentions({ moduleId: context.moduleId, before: before.html, after: changes.html, where: `“${name}”` });
    }
    drawLastEdited();
    drawByline();
    drawOutline();
  }

  const editor = createRichTextEditor({
    html: data.html,
    label: 'Document text',
    placeholder: isFullPage || onBlog ? 'Start writing…' : 'Start writing… (type # and a space for a heading, - for a list, [] for a checklist)',
    full: isFullPage,
    mentions: { getCandidates: () => (onBlog ? getAccounts() : context.members), excludeId: context.currentUser.id },
    onChange: (html) => save({ html }),
  });
  // "Last edited by…" sits in the status bar, between the word count and "Saved".
  editor.statusBar.insertBefore(lastEdited, editor.statusBar.lastChild);
  const refreshTimer = setInterval(drawLastEdited, FOOTER_REFRESH_MS);
  drawLastEdited();

  // The title: always on a blog and on the full page; on a card only once there is one.
  const showTitle = onBlog || isFullPage || Boolean(data.title);
  const titleInput = showTitle ? h('input', {
    type: 'text', class: 'blog-doc__title-input', value: data.title ?? '',
    placeholder: onBlog ? 'Title' : 'Title (optional)', 'aria-label': 'Title',
    onInput: debounce((event) => save({ title: event.target.value }), TITLE_SAVE_DELAY_MS),
  }) : null;

  // ─── Contents (full page only) ─────────────────────────────────────────────
  const outline = h('nav', { class: 'note-page__outline', 'aria-label': 'Contents' });
  function drawOutline() {
    if (!isFullPage) return;
    const headings = [...editor.content.querySelectorAll('h2, h3, h4')].filter((el) => el.textContent.trim());
    replaceChildren(outline,
      h('h2', { class: 'note-page__outline-title' }, 'Contents'),
      headings.length
        ? h('ul', {}, headings.map((heading) => h('li', { class: `note-page__outline-item is-${heading.tagName.toLowerCase()}` },
          h('button', {
            type: 'button',
            class: 'link-button',
            onClick: () => {
              heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
              const range = document.createRange();
              range.selectNodeContents(heading);
              range.collapse(false);
              editor.content.focus();
              window.getSelection().removeAllRanges();
              window.getSelection().addRange(range);
            },
          }, heading.textContent.trim()))))
        : h('p', { class: 'note-page__outline-empty' }, 'Headings you add show up here. Pick “Heading 1” from the style menu, or type # and a space.'));
  }

  if (isFullPage) {
    container.append(h('div', { class: 'note-page' },
      editor.toolbar,
      h('div', { class: 'note-page__layout' },
        h('div', { class: 'note-page__paper' }, titleInput, onBlog ? byline : null, editor.content, editor.statusBar, onBlog ? renderPollSlot(context, true) : null),
        outline)));
    drawOutline();
  } else {
    container.append(h('div', { class: 'note' }, titleInput, onBlog ? byline : null, editor.toolbar, editor.content, editor.statusBar));
    if (onBlog) appendChildren(container, [renderPollSlot(context, true)]);
  }

  return () => clearInterval(refreshTimer);
}

/**
 * The poll at the end of a blog's document. The owner gets "Add a poll" and
 * Remove; votes are saved straight to the document, so visitors can vote.
 */
function renderPollSlot(context, isOwner) {
  // A vault document shown through File from vault keeps its words in the vault, not a module: no poll.
  if (getModule(context.moduleId)?.type !== 'note') return null;
  const slot = h('div', { class: 'blog-doc__poll' });
  const me = context.currentUser;
  const savePoll = (poll) => updateModuleData(context.moduleId, { ...getModule(context.moduleId).data, poll });

  function draw() {
    const { poll } = context.getData();
    if (poll) {
      slot.replaceChildren(
        renderPoll({ getPoll: () => getModule(context.moduleId)?.data.poll, savePoll, me, canVote: Boolean(me), canManage: isOwner }),
        isOwner ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { savePoll(null); draw(); } }, 'Remove poll') : '');
      return;
    }
    if (!isOwner) { slot.replaceChildren(); return; }
    slot.replaceChildren(h('button', { type: 'button', class: 'button button--small', onClick: openBuilder }, icon('list', 14), ' Add a poll'));
  }

  function openBuilder() {
    const builder = pollBuilder({ me });
    const error = h('p', { class: 'form-error', role: 'alert' });
    slot.replaceChildren(builder.element, error, h('div', { class: 'form-row' },
      h('button', {
        type: 'button',
        class: 'button button--small button--primary',
        onClick: () => {
          const { poll, error: problem } = builder.read();
          if (problem) { error.textContent = problem; return; }
          savePoll(poll);
          draw();
        },
      }, 'Add poll'),
      h('button', { type: 'button', class: 'link-button', onClick: draw }, 'Cancel')));
  }

  draw();
  return slot;
}
