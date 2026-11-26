// @ts-check
/**
 * from-note.js — "Turn into an article": a note in a vault, written together,
 * becomes an article draft that everyone who wrote in it co-authors.
 *
 *   articleTargets(vaultSpace, me) → [{ moduleId, label }]  the Articles it can go to:
 *                                    this group's, then your blog's
 *   turnNoteIntoArticle(note, { vaultModuleId, targetModuleId, me })
 *     → makes the draft (headline = the note's title, story = its text), tells the
 *       co-authors, and opens it in the editor. Returns the draft.
 *
 * The note stays in the vault; the draft remembers it (article.fromNote) and
 * the note remembers the draft (note.articleDraft), so each links to the other.
 */

import { getModule, getBlogOf, updateModuleData, changeState } from '../../state/store.js';
import { notify } from '../../state/notifications.js';
import { requestModuleFocus } from '../../editor/module-context.js';
import { openModulePage } from '../../router.js';
import { draftFromNote } from './articles-data.js';

export function articleTargets(vaultSpace, me) {
  const targets = [];
  if (vaultSpace?.kind === 'group') {
    for (const m of vaultSpace.modules) if (m.type === 'articles') targets.push({ moduleId: m.id, label: `${vaultSpace.name} · ${m.title}` });
  }
  const blog = getBlogOf(me.id);
  for (const m of blog?.modules ?? []) if (m.type === 'articles') targets.push({ moduleId: m.id, label: `Your blog · ${m.title}` });
  return targets;
}

/** Everyone who wrote in the note (note.editorIds; older notes: who made it and who edited it last). */
export const noteWriters = (note) => [...new Set([...(note.editorIds ?? []), note.createdBy, note.updatedBy].filter(Boolean))];

export function turnNoteIntoArticle(note, { vaultModuleId, targetModuleId, me }) {
  const target = getModule(targetModuleId);
  if (!target) return null;
  const draft = draftFromNote(note, { authorId: me.id, coauthorIds: noteWriters(note), moduleId: vaultModuleId });
  updateModuleData(targetModuleId, { ...target.data, articles: [draft, ...(target.data?.articles ?? [])] });
  // The note points at its draft.
  const vault = getModule(vaultModuleId);
  if (vault) {
    changeState(() => {
      const item = vault.data.items.find((i) => i.id === note.id);
      if (item) item.articleDraft = { moduleId: targetModuleId, articleId: draft.id };
    });
  }
  if (draft.coauthorIds.length) {
    notify({ recipientIds: draft.coauthorIds, actorId: me.id, kind: 'invited', text: `${me.name} turned “${note.name}” into an article draft you co-write`, moduleId: targetModuleId, itemId: draft.id });
  }
  requestModuleFocus(targetModuleId, `edit:${draft.id}`);
  openModulePage(targetModuleId);
  return draft;
}

/** Open the draft a note became. */
export function openNoteDraft(link) {
  requestModuleFocus(link.moduleId, `edit:${link.articleId}`);
  openModulePage(link.moduleId);
}
