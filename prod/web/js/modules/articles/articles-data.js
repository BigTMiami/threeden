// @ts-check
/**
 * articles-data.js — the data behind Articles (articles-module.js).
 *
 *   data = {
 *     articles: [{
 *       id: 'art-…',
 *       authorId: 'm-leo',
 *       kicker: 'Housing',            ← the small label over the headline (a section)
 *       headline: 'Rents rose 9%…',
 *       dek: 'The building’s …',      ← the line under the headline that says what it’s about
 *       hero: { src, caption, credit } | null,   ← the big picture at the top
 *       html: '<p>…</p>',             ← the story (rich text)
 *       status: 'draft' | 'scheduled' | 'published',
 *       publishAt,                    ← when a scheduled one goes up (ms)
 *       history: [{ at, by, kicker, headline, dek, html }],  ← earlier published versions, newest first
 *       coauthorIds: ['m-maya'],      ← co-authors: they see and edit the draft, and share the byline
 *       editedBy: { 'm-leo': ms },    ← who has worked on it, and when they last saved
 *       lastEditedBy: 'm-maya',
 *       fromNote: { moduleId, itemId, name } | null,  ← started from a vault note ("Turn into an article")
 *       views: 214,                   ← times it was opened once published (not by its authors)
 *       readers: 131,                 ← different signed-in people who opened it
 *       viewerIds: ['m-iris'],        ← who those were (so a reader counts once)
 *       createdAt, publishedAt, updatedAt,
 *     }],
 *   }
 */

import { makeId } from '../../ui/dom.js';

const WORDS_PER_MINUTE = 230;

export function normalizeArticle(article) {
  const a = {
    kicker: '', headline: '', dek: '', hero: null, html: '<p></p>', status: 'draft',
    createdAt: Date.now(), publishedAt: null, updatedAt: null, publishAt: null, history: [],
    coauthorIds: [], editedBy: {}, lastEditedBy: null, fromNote: null, views: 0, readers: 0, viewerIds: [],
    ...article,
  };
  // A scheduled article whose time has come is simply published, as of that time.
  if (a.status === 'scheduled' && a.publishAt && a.publishAt <= Date.now()) return { ...a, status: 'published', publishedAt: a.publishAt };
  return a;
}

const MAX_HISTORY = 20;

/** Keep the version that's about to be replaced (published ones only), newest first. */
export function withHistory(before, after, byId) {
  if (!before || before.status !== 'published') return after;
  const changed = ['kicker', 'headline', 'dek', 'html'].some((key) => before[key] !== after[key]);
  if (!changed) return after;
  const entry = { at: before.updatedAt ?? before.publishedAt ?? Date.now(), by: byId, kicker: before.kicker, headline: before.headline, dek: before.dek, html: before.html };
  return { ...after, history: [entry, ...(before.history ?? [])].slice(0, MAX_HISTORY) };
}

export function createArticle(authorId) {
  return normalizeArticle({ id: makeId('art'), authorId, createdAt: Date.now() });
}

/** Everyone on the byline: the author first, then co-authors. */
export const authorsOf = (article) => [article.authorId, ...(article.coauthorIds ?? []).filter((id) => id !== article.authorId)];
export const isAuthorOf = (article, memberId) => Boolean(memberId) && authorsOf(article).includes(memberId);

/** "Maya", "Maya and Leo", "Maya, Leo, and Priya" (names from `nameOf`). */
export function joinNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** A draft from a vault note: its title becomes the headline, its text the story. */
export function draftFromNote(note, { authorId, coauthorIds = [], moduleId }) {
  return normalizeArticle({
    id: makeId('art'), authorId, coauthorIds: coauthorIds.filter((id) => id !== authorId),
    headline: note.name ?? '', html: note.html || '<p></p>', createdAt: Date.now(), updatedAt: Date.now(),
    editedBy: { [authorId]: Date.now() }, lastEditedBy: authorId,
    fromNote: { moduleId, itemId: note.id, name: note.name ?? 'a note' },
  });
}

/** Published ones, newest first. Authors and co-authors also see their drafts (first). */
export function visibleArticles(data, viewerId) {
  const all = (data?.articles ?? []).map(normalizeArticle);
  const drafts = all.filter((a) => (a.status === 'draft' || a.status === 'scheduled') && isAuthorOf(a, viewerId)).sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  const published = all.filter((a) => a.status === 'published').sort((a, b) => b.publishedAt - a.publishedAt);
  return [...drafts, ...published];
}

const plain = (html) => (html ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** "4 min read". */
export function readingTime(article) {
  const words = plain(article.html).split(' ').filter(Boolean).length;
  return `${Math.max(1, Math.round(words / WORDS_PER_MINUTE))} min read`;
}

/** The dek, or the start of the story when there's no dek. */
export function summaryOf(article, chars = 180) {
  if (article.dek) return article.dek;
  const text = plain(article.html);
  return text.length > chars ? `${text.slice(0, chars - 1)}…` : text;
}

/** "1 view", "1,204 views". */
export const viewsLabel = (n) => `${(n ?? 0).toLocaleString('en-US')} ${n === 1 ? 'view' : 'views'}`;

/**
 * Count one opening of a published article by `viewerId` (null for a guest).
 * Its authors don't count. Returns the counted article, or null when it doesn't count.
 */
export function countView(article, viewerId) {
  if (article.status !== 'published' || isAuthorOf(article, viewerId)) return null;
  const viewerIds = article.viewerIds ?? [];
  const isNew = Boolean(viewerId) && !viewerIds.includes(viewerId);
  return {
    ...article,
    views: (article.views ?? 0) + 1,
    readers: (article.readers ?? 0) + (isNew ? 1 : 0),
    viewerIds: isNew ? [...viewerIds, viewerId] : viewerIds,
  };
}

export function canPublish(article) {
  return Boolean(article.headline.trim()) && Boolean(plain(article.html));
}
