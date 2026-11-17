// @ts-check
/**
 * articles-module.js — Articles: stories laid out the way a news site lays
 * them out, for a blog or a group (a newsletter, a tenant union's bulletin,
 * a band's tour diary).
 *
 * The card, newest first:
 *
 *   HOUSING                                            ┌──────┐
 *   Rents rose 9% this year. Here’s where it went      │ pic  │
 *   The building’s new owner says it’s taxes…          └──────┘
 *   By Maya Chen · Nov 12, 2026 · 4 min read
 *   ─────────────────────────────────────────────
 *   …                                     [✎ Write an article]
 *
 * An article, opened (the full page):
 *
 *   HOUSING
 *   Rents rose 9% this year. Here’s where it went        ← headline
 *   The building’s new owner says it’s taxes. The…       ← dek
 *   (MC) By Maya Chen · November 12, 2026 · 4 min read   ← byline
 *   ┌──────────────────────────────────────────────┐
 *   │                 hero picture                 │
 *   └──────────────────────────────────────────────┘
 *   The boiler room, where the new meters went. Photo: Owen Walsh
 *   Last spring, forty of us signed…                     ← the story, with a drop cap
 *                                                     ■
 *   ♥ Like · 💬 Comment · ↗ Share
 *
 * Views: opening a published article counts a view (once per visit, not by
 * its authors; countView in articles-data.js). Its authors and the people who
 * moderate the page see "214 views" in the byline, and "214 views · 131
 * readers" on the article; readers don't see counts.
 *
 * Writing one: section, headline, dek, a picture with a caption and credit,
 * and the story in the rich-text editor. Save a draft (only you see it) or
 * Publish (it shows in the card, and in friends' or members' Feeds).
 */

import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { showToast } from '../../ui/toast.js';
import { emptyState } from '../../ui/empty-state.js';
import { firstFew } from '../../ui/more-link.js';
import { photoPicker } from '../../ui/image-upload.js';
import { createRichTextEditor } from '../../ui/rich-text-editor.js';
import { sanitizeHtml } from '../../utils/sanitize.js';
import { decorateMentions } from '../../ui/mentions.js';
import { blogPostReactions } from '../../ui/post-reactions.js';
import { getAccounts } from '../../state/accounts.js';
import { getSpace, getModule, updateModuleData } from '../../state/store.js';
import { getFriendIds } from '../../state/friends.js';
import { notify } from '../../state/notifications.js';
import { timeAgo } from '../../utils/dates.js';
import { blogHref } from '../../router.js';
import {
  normalizeArticle, createArticle, visibleArticles, readingTime, summaryOf, canPublish, withHistory, authorsOf, isAuthorOf, joinNames, countView, viewsLabel,
} from './articles-data.js';

/** Articles counted this visit (articleId), so redrawing or coming back doesn't count again. */
const countedThisVisit = new Set();

export const articlesModule = {
  type: 'articles',
  label: 'Articles',
  description: 'Stories laid out like a news site: headline, picture, byline',
  icon: 'newspaper',
  defaultSpan: 8,
  defaultRows: 16,
  available: true,
  spaceKinds: ['blog', 'group'],

  createInitialData: () => ({ articles: [] }),
  render: (container, context) => renderArticles(container, context, false),
  renderFullPage: (container, context) => renderArticles(container, context, true),
};

const longDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const whenScheduled = (ts) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** A datetime-local value for a time (this device's time zone). */
const localInput = (ts) => { const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

function renderArticles(container, context, isFullPage) {
  const me = context.currentUser;
  const space = getSpace(context.spaceId);
  const canWrite = !context.isVisitor && Boolean(me) && !me.isGuest;
  // Co-authors can edit even on someone else's blog (where they're a visitor).
  const canChange = (article) => Boolean(me) && !me.isGuest && (isAuthorOf(article, me.id) || (canWrite && context.can('moderate')));
  // Full page: the list, one article, or the editor. ('new' opens a fresh one; 'edit:<id>' opens one to edit.)
  const focus = isFullPage ? context.takeFocusRequest() : null;
  const editFocus = typeof focus === 'string' && focus.startsWith('edit:') ? focus.slice(5) : null;
  let view = { articleId: editFocus ?? (focus && focus !== 'new' ? focus : null), editing: focus === 'new' ? 'new' : editFocus };

  const articles = () => visibleArticles(context.getData(), me?.id);
  const find = (id) => (context.getData().articles ?? []).map(normalizeArticle).find((a) => a.id === id);

  function save(article) {
    const data = structuredClone(context.getData());
    data.articles = data.articles ?? [];
    const at = data.articles.findIndex((a) => a.id === article.id);
    if (at >= 0) data.articles[at] = article; else data.articles.unshift(article);
    // A co-author on someone else's blog is a visitor there: save straight to the module.
    if (context.isVisitor) updateModuleData(context.moduleId, data); else context.saveData(data);
  }

  function remove(article) {
    const before = structuredClone(context.getData());
    context.saveData({ ...before, articles: before.articles.filter((a) => a.id !== article.id) });
    view = { articleId: null, editing: null };
    draw();
    showToast(`Deleted “${article.headline || 'Untitled'}”.`, { actionLabel: 'Undo', onAction: () => { context.saveData(before); draw(); } });
  }

  const memberOf = (id) => context.getMember(id) ?? getAccounts().find((m) => m.id === id);

  function byline(article, { withAvatar = false, long = false } = {}) {
    const authors = authorsOf(article).map(memberOf).filter(Boolean);
    const when = article.status === 'draft' ? 'Draft' : article.status === 'scheduled' ? `Goes up ${whenScheduled(article.publishAt)}` : (long ? longDate : shortDate)(article.publishedAt);
    const names = authors.map((a) => h('a', { href: blogHref(a), class: 'article-byline__name' }, a.name));
    // "By Maya Chen and Leo L", "By A, B, and C".
    const joined = names.length <= 1 ? names : names.length === 2 ? [names[0], ' and ', names[1]]
      : names.flatMap((n, i) => (i === 0 ? [n] : i === names.length - 1 ? [', and ', n] : [', ', n]));
    return h('p', { class: 'article-byline' },
      withAvatar && authors.length ? h('span', { class: 'article-byline__faces' }, authors.slice(0, 3).map((a) => avatar(a, 32))) : null,
      h('span', {},
        'By ', authors.length ? joined : 'Someone',
        ` · ${when} · ${readingTime(article)}`,
        // Views: for its authors and moderators only.
        article.status === 'published' && canChange(article) && !long ? h('span', { class: 'article-byline__views', title: 'Only the authors and moderators see this' }, ` · ${viewsLabel(article.views)}`) : null,
        article.updatedAt && article.publishedAt && article.updatedAt - article.publishedAt > 3600000 && long ? ` · Updated ${shortDate(article.updatedAt)}` : ''));
  }

  // ─── The list (card and full page) ─────────────────────────────────────────

  function teaser(article, index) {
    const open = () => (isFullPage ? (view = { articleId: article.id, editing: null }, draw(), window.scrollTo(0, 0)) : context.openFullPage(article.id));
    const lead = isFullPage && index === 0 && article.hero;
    return h('li', { class: `article-teaser${lead ? ' article-teaser--lead' : ''}${article.status === 'draft' ? ' is-draft' : ''}` },
      h('button', { type: 'button', class: 'article-teaser__link', onClick: open },
        h('span', { class: 'article-teaser__text' },
          article.status === 'draft' ? h('span', { class: 'article-kicker article-kicker--draft' }, 'Draft')
            : article.status === 'scheduled' ? h('span', { class: 'article-kicker article-kicker--draft' }, 'Scheduled')
              : article.kicker ? h('span', { class: 'article-kicker' }, article.kicker) : null,
          h('span', { class: 'article-teaser__headline' }, article.headline || 'Untitled'),
          summaryOf(article) ? h('span', { class: 'article-teaser__dek' }, summaryOf(article, 140)) : null),
        article.hero ? h('img', { class: 'article-teaser__image', src: article.hero.src, alt: '' }) : null),
      byline(article));
  }

  function drawList() {
    const list = articles();
    const startNew = () => (isFullPage ? (view = { articleId: null, editing: 'new' }, draw()) : context.openFullPage('new'));
    const newButton = canWrite ? h('button', { type: 'button', class: 'button button--small', onClick: startNew }, icon('pencil', 14), ' Write an article') : null;
    if (!list.length) {
      return [emptyState({ icon: 'newspaper', title: 'No articles yet', text: canWrite ? 'Write the first one: a headline, a picture, and the story.' : null, action: canWrite ? { label: 'Write an article', onClick: startNew } : null })];
    }
    const { shown, more } = isFullPage ? { shown: list, more: null } : firstFew(list, () => context.openFullPage(), { tag: 'li' });
    return [
      newButton ? h('div', { class: 'articles__bar' }, newButton) : null,
      h('ul', { class: `articles__list${isFullPage ? ' articles__list--page' : ''}` }, shown.map(teaser), more),
    ];
  }

  // ─── One article, as a news site shows it ──────────────────────────────────

  /** Opening a published article counts a view (not by its authors, once per visit). */
  function recordView(article) {
    if (countedThisVisit.has(article.id)) return;
    const counted = countView(article, me && !me.isGuest ? me.id : null);
    if (!counted) return;
    countedThisVisit.add(article.id);
    const data = structuredClone(getModule(context.moduleId)?.data ?? context.getData());
    const at = (data.articles ?? []).findIndex((a) => a.id === article.id);
    if (at < 0) return;
    data.articles[at] = { ...data.articles[at], views: counted.views, readers: counted.readers, viewerIds: counted.viewerIds };
    updateModuleData(context.moduleId, data); // readers are often visitors here, so straight to the module
  }

  function drawReader(article) {
    recordView(article);
    const share = {
      title: article.headline,
      attachment: { kind: 'post', moduleId: context.moduleId, itemId: article.id, authorId: article.authorId, where: space?.name ?? '', title: article.headline, excerpt: summaryOf(article), image: article.hero?.src ?? null },
    };
    return h('article', { class: 'news-article' },
      h('button', { type: 'button', class: 'link-button news-article__back', onClick: () => { view = { articleId: null, editing: null }; draw(); } }, icon('arrowLeft', 14), ` All articles`),
      h('header', { class: 'news-article__header' },
        article.status === 'draft' ? h('p', { class: 'article-kicker article-kicker--draft' }, article.coauthorIds.length ? 'Draft · only its authors can see this' : 'Draft · only you can see this')
          : article.status === 'scheduled' ? h('p', { class: 'article-kicker article-kicker--draft' }, `Scheduled · goes up ${whenScheduled(article.publishAt)} · only its ${article.coauthorIds.length ? 'authors' : 'author'} can see it until then`)
            : article.kicker ? h('p', { class: 'article-kicker' }, article.kicker) : null,
        h('h1', { class: 'news-article__headline' }, article.headline || 'Untitled'),
        article.dek ? h('p', { class: 'news-article__dek' }, article.dek) : null,
        h('div', { class: 'news-article__meta' },
          byline(article, { withAvatar: true, long: true }),
          article.status === 'published' && canChange(article) ? h('p', { class: 'news-article__views' }, icon('eye', 13), ` ${viewsLabel(article.views)} · ${(article.readers ?? 0).toLocaleString('en-US')} ${article.readers === 1 ? 'reader' : 'readers'}`, h('span', { class: 'news-article__views-hint' }, ' · only authors and moderators see this')) : null,
          canChange(article) ? h('span', { class: 'news-article__tools' },
            h('button', { type: 'button', class: 'button button--small', onClick: () => { view = { articleId: article.id, editing: article.id }; draw(); } }, icon('pencil', 13), ' Edit'),
            h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => remove(article) }, 'Delete')) : null)),
      article.hero ? h('figure', { class: 'news-article__hero' },
        h('img', { src: article.hero.src, alt: article.hero.caption || '' }),
        article.hero.caption || article.hero.credit ? h('figcaption', {},
          article.hero.caption || '',
          article.hero.credit ? h('span', { class: 'news-article__credit' }, ` ${article.hero.credit}`) : null) : null) : null,
      decorateMentions(h('div', { class: 'news-article__body rich-text__content', html: sanitizeHtml(article.html) })),
      h('p', { class: 'news-article__end', 'aria-hidden': 'true' }, '■'),
      article.history?.length ? renderHistory(article) : null,
      article.status === 'published' ? blogPostReactions({
        key: `article:${article.id}`, ownerId: article.authorId, share,
        about: { title: article.headline, moduleId: context.moduleId, itemId: article.id },
        spaceId: space?.kind === 'group' ? space.id : null,
      }) : null);
  }

  // ─── Earlier versions ──────────────────────────────────────────────────────

  /** "Edited · 2 earlier versions": each one readable, and authors can put one back. */
  function renderHistory(article) {
    let showing = null; // the version open for reading
    const root = h('details', { class: 'article-history' });
    const paint = () => replaceChildren(root,
      h('summary', {}, `Edited · ${article.history.length} earlier ${article.history.length === 1 ? 'version' : 'versions'}`),
      h('ul', { class: 'article-history__list' }, article.history.map((v, i) => h('li', { class: 'article-history__row' },
        h('span', {}, `${shortDate(v.at)}, ${new Date(v.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`, h('span', { class: 'event-details__muted' }, ` · ${v.headline}`)),
        h('button', { type: 'button', class: 'link-button', onClick: () => { showing = showing === i ? null : i; paint(); } }, showing === i ? 'Hide' : 'Read'),
        canChange(article) ? h('button', {
          type: 'button', class: 'link-button',
          onClick: () => {
            const current = find(article.id);
            const restored = withHistory(current, { ...current, kicker: v.kicker, headline: v.headline, dek: v.dek, html: v.html, updatedAt: Date.now() }, me.id);
            save(restored);
            showToast('Put that version back. The one it replaced is in the list.');
            view = { articleId: article.id, editing: null };
            draw();
          },
        }, 'Put this back') : null))),
      showing !== null ? h('div', { class: 'article-history__version' },
        h('p', { class: 'article-kicker article-kicker--draft' }, `As of ${shortDate(article.history[showing].at)}`),
        h('h2', {}, article.history[showing].headline),
        article.history[showing].dek ? h('p', { class: 'news-article__dek' }, article.history[showing].dek) : null,
        h('div', { class: 'news-article__body rich-text__content', html: sanitizeHtml(article.history[showing].html) })) : null);
    paint();
    return root;
  }

  // ─── Writing ───────────────────────────────────────────────────────────────

  /** People who could co-write: the group's members, or (on a blog) the owner's friends. */
  function coauthorCandidates(article) {
    const ids = space?.kind === 'group' ? space.memberIds : [...new Set([space?.memberIds?.[0], ...getFriendIds(space?.memberIds?.[0] ?? me.id)])];
    return ids.filter((id) => id && !authorsOf(article).includes(id)).map(memberOf).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The co-authors row in the editor: who's writing it, add someone, remove (or leave). */
  function renderCoauthors(draft, redraw) {
    const lead = memberOf(draft.authorId);
    const others = draft.coauthorIds.map(memberOf).filter(Boolean);
    const candidates = coauthorCandidates(draft);
    const isLead = draft.authorId === me.id;
    const pick = h('select', {
      class: 'input input--compact', 'aria-label': 'Add a co-author',
      onChange: (e) => {
        const id = e.target.value;
        if (!id) return;
        draft.coauthorIds = [...draft.coauthorIds, id];
        draft.invitedCoauthors = [...(draft.invitedCoauthors ?? []), id];
        redraw();
      },
    }, h('option', { value: '' }, '+ Add a co-author…'), candidates.map((m) => h('option', { value: m.id }, m.name)));
    return h('div', { class: 'article-coauthors' },
      h('span', { class: 'article-coauthors__label' }, 'Written by'),
      lead ? h('span', { class: 'article-coauthors__person' }, avatar(lead, 22), lead.name, h('span', { class: 'settings-field__hint' }, ' (lead)')) : null,
      others.map((m) => h('span', { class: 'article-coauthors__person' }, avatar(m, 22), m.name,
        isLead || m.id === me.id ? h('button', {
          type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': m.id === me.id ? 'Leave as co-author' : `Remove ${m.name}`,
          title: m.id === me.id ? 'Leave: you won’t see the draft any more' : `Remove ${m.name}`,
          onClick: () => { draft.coauthorIds = draft.coauthorIds.filter((id) => id !== m.id); redraw(); },
        }, icon('close', 12)) : null)),
      candidates.length ? pick : null,
      draft.lastEditedBy && draft.updatedAt && draft.lastEditedBy !== me.id
        ? h('span', { class: 'article-coauthors__last' }, `Last saved by ${memberOf(draft.lastEditedBy)?.name.split(' ')[0] ?? 'someone'}, ${timeAgo(draft.updatedAt)}`) : null);
  }

  function drawEditor(existing) {
    const draft = existing ? structuredClone(existing) : createArticle(me.id);
    const openedAt = existing?.updatedAt ?? 0; // to notice a co-author saving meanwhile
    const coauthorSlot = h('div', {});
    const drawCoauthors = () => replaceChildren(coauthorSlot, renderCoauthors(draft, drawCoauthors));
    drawCoauthors();
    const kicker = h('input', { type: 'text', class: 'input article-editor__kicker', value: draft.kicker, placeholder: 'Section (Housing, News, Tour diary…)', 'aria-label': 'Section', maxlength: '40' });
    const headline = h('textarea', { class: 'article-editor__headline', rows: '2', placeholder: 'Headline', 'aria-label': 'Headline', maxlength: '160' }, draft.headline);
    const dek = h('textarea', { class: 'article-editor__dek', rows: '2', placeholder: 'A sentence or two on what it’s about (optional)', 'aria-label': 'Summary under the headline', maxlength: '300' }, draft.dek);
    const caption = h('input', { type: 'text', class: 'input', value: draft.hero?.caption ?? '', placeholder: 'Caption', 'aria-label': 'Picture caption' });
    const credit = h('input', { type: 'text', class: 'input', value: draft.hero?.credit ?? '', placeholder: 'Photo: who took it', 'aria-label': 'Picture credit' });
    const heroSlot = h('div', { class: 'article-editor__hero' });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const drawHero = () => replaceChildren(heroSlot,
      draft.hero ? h('img', { src: draft.hero.src, alt: '' }) : null,
      h('div', { class: 'form-row' },
        photoPicker({ label: draft.hero ? 'Change picture' : 'Add a picture', multiple: false, onPhotos: ([photo]) => { draft.hero = { src: photo.src, caption: caption.value, credit: credit.value }; drawHero(); } }),
        draft.hero ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { draft.hero = null; drawHero(); } }, 'Remove picture') : null),
      draft.hero ? h('div', { class: 'form-row article-editor__caption' }, caption, credit) : null);
    drawHero();
    const editor = createRichTextEditor({
      html: draft.html, label: 'The story', placeholder: 'Write the story…', full: true,
      mentions: { getCandidates: getAccounts, excludeId: me.id },
      onChange: (html) => { draft.html = html; },
    });

    const collect = () => {
      draft.kicker = kicker.value.trim();
      draft.headline = headline.value.trim();
      draft.dek = dek.value.trim();
      if (draft.hero) draft.hero = { ...draft.hero, caption: caption.value.trim(), credit: credit.value.trim() };
      draft.html = editor.getHtml();
      draft.updatedAt = Date.now();
    };
    const laterInput = h('input', { type: 'datetime-local', class: 'input input--compact', 'aria-label': 'When it goes up', value: localInput(draft.publishAt ?? Date.now() + 864e5) });
    let force = false;
    const finish = (status) => {
      collect();
      if (status !== 'draft' && !canPublish(draft)) { error.textContent = 'A headline and some of the story first.'; return; }
      if (status === 'scheduled') {
        const at = new Date(laterInput.value).getTime();
        if (!at || at <= Date.now()) { error.textContent = 'Pick a time in the future.'; return; }
        draft.publishAt = at;
      }
      // A co-author saved since this was opened: don't overwrite their work by surprise.
      const stored = existing ? find(existing.id) : null;
      if (stored && (stored.updatedAt ?? 0) > openedAt && stored.lastEditedBy && stored.lastEditedBy !== me.id && !force) {
        replaceChildren(error,
          `${memberOf(stored.lastEditedBy)?.name.split(' ')[0] ?? 'A co-author'} saved a newer version ${timeAgo(stored.updatedAt)}. `,
          h('button', { type: 'button', class: 'link-button', onClick: () => { view = { articleId: stored.id, editing: stored.id }; draw(); } }, 'Load theirs'),
          ' · ',
          h('button', { type: 'button', class: 'link-button', onClick: () => { force = true; finish(status); } }, 'Save mine anyway'));
        return;
      }
      if (status === 'published' && draft.status !== 'published') draft.publishedAt = Date.now();
      draft.status = status;
      draft.editedBy = { ...draft.editedBy, [me.id]: Date.now() };
      draft.lastEditedBy = me.id;
      const newlyAdded = (draft.invitedCoauthors ?? []).filter((id) => draft.coauthorIds.includes(id));
      delete draft.invitedCoauthors;
      save(withHistory(stored, draft, me.id));
      // Tell new co-authors (and, when it goes up, everyone on the byline).
      if (newlyAdded.length) notify({ recipientIds: newlyAdded, actorId: me.id, kind: 'invited', text: `${me.name} asked you to co-write “${draft.headline || 'an article'}”`, moduleId: context.moduleId, itemId: draft.id, spaceId: space?.kind === 'group' ? space.id : null });
      const others = authorsOf(draft).filter((id) => id !== me.id);
      if (status === 'published' && others.length) notify({ recipientIds: others, actorId: me.id, kind: 'event', text: `${me.name} published “${draft.headline}”, which you co-wrote`, moduleId: context.moduleId, itemId: draft.id });
      view = { articleId: draft.id, editing: null };
      draw();
      window.scrollTo(0, 0);
      showToast(status === 'published' ? (space?.kind === 'group' ? `Published in ${space.name}.` : 'Published. It’s on your blog and in your friends’ Feeds.')
        : status === 'scheduled' ? `Scheduled for ${whenScheduled(draft.publishAt)}.` : authorsOf(draft).length > 1 ? `Draft saved. ${joinNames(authorsOf(draft).filter((id) => id !== me.id).map((id) => memberOf(id)?.name.split(' ')[0] ?? 'Your co-author'))} can see it and work on it too.` : 'Draft saved. Only you can see it.');
    };

    return h('form', { class: 'article-editor', onSubmit: (event) => { event.preventDefault(); finish('published'); } },
      h('button', { type: 'button', class: 'link-button news-article__back', onClick: () => { view = { articleId: existing?.id ?? null, editing: null }; draw(); } }, icon('arrowLeft', 14), existing ? ' Cancel' : ' All articles'),
      coauthorSlot,
      draft.fromNote ? h('p', { class: 'settings-field__hint article-editor__from' }, icon('vault', 12), ` Started from the vault note “${draft.fromNote.name}”.`) : null,
      kicker, headline, dek, heroSlot,
      editor.toolbar, editor.content, editor.statusBar,
      error,
      h('div', { class: 'form-row article-editor__actions' },
        draft.status === 'published' ? null : h('span', { class: 'article-editor__later' },
          h('span', { class: 'settings-field__hint' }, 'Publish later:'), laterInput,
          h('button', { type: 'button', class: 'button', onClick: () => finish('scheduled') }, 'Schedule')),
        draft.status === 'published' ? null : h('button', { type: 'button', class: 'button', onClick: () => finish('draft') }, 'Save draft'),
        h('button', { type: 'submit', class: 'button button--primary' }, draft.status === 'published' ? 'Update' : 'Publish')));
  }

  function draw() {
    const editingOne = view.editing && view.editing !== 'new' ? find(view.editing) : null;
    if (isFullPage && view.editing && (view.editing === 'new' ? canWrite : editingOne && canChange(editingOne))) {
      replaceChildren(container, drawEditor(editingOne));
      return;
    }
    const open = isFullPage && view.articleId ? find(view.articleId) : null;
    if (open && (open.status === 'published' || isAuthorOf(open, me?.id))) { replaceChildren(container, drawReader(open)); return; }
    replaceChildren(container, h('div', { class: 'articles' }, drawList()));
  }

  draw();
}
