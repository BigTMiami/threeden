// @ts-check
/**
 * post-drafts.js — posts you started and haven't put up yet. Private to you:
 * saved on your account, not in the feed (so nobody else, even in a group,
 * can see them).
 *
 *   member.postDrafts = [{ id, moduleId, text, media, attachments, audience, updatedAt }]
 *
 *   draftsFor(me, moduleId)  → your drafts for one feed, newest first
 *   saveDraft(me, fields)    → saves (a new one, or the one with fields.id); returns its id
 *   deleteDraft(me, id)      → removes it; returns it (for Undo)
 *   restoreDraft(me, draft)
 *   hasContent(fields)       → is there anything worth keeping?
 *
 * The composer saves as you type (feed-modules.js), so closing it, or the
 * page, never loses what you wrote. Posting removes the draft.
 */

import { changeState, getMember } from './store.js';
import { makeId } from '../ui/dom.js';

const MAX_DRAFTS = 50;

/** @param {any} me @param {string} moduleId */
export function draftsFor(me, moduleId) {
  return (getMember(me?.id)?.postDrafts ?? []).filter((d) => d.moduleId === moduleId).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const hasContent = (fields) => Boolean(fields?.text?.trim() || fields?.media?.length || fields?.attachments?.length);

/**
 * @param {any} me
 * @param {{ id?: string | null, moduleId: string, text: string, media: any[], attachments: any[], audience?: string }} fields
 */
export function saveDraft(me, { id = null, moduleId, text, media, attachments, audience = 'everyone' }) {
  const draftId = id ?? makeId('draft');
  changeState(() => {
    const member = getMember(me.id);
    const others = (member.postDrafts ?? []).filter((d) => d.id !== draftId);
    const draft = { id: draftId, moduleId, text, media: structuredClone(media), attachments: structuredClone(attachments), audience, updatedAt: Date.now() };
    member.postDrafts = [draft, ...others].slice(0, MAX_DRAFTS);
  }); // no event: the feed redraws itself, and typing isn't interrupted
  return draftId;
}

export function deleteDraft(me, id) {
  const member = getMember(me.id);
  const draft = (member?.postDrafts ?? []).find((d) => d.id === id) ?? null;
  if (!draft) return null;
  changeState(() => { member.postDrafts = member.postDrafts.filter((d) => d.id !== id); }); // no event: the feed redraws itself, and typing isn't interrupted
  return draft;
}

export function restoreDraft(me, draft) {
  if (!draft) return;
  changeState(() => {
    const member = getMember(me.id);
    if (!(member.postDrafts ?? []).some((d) => d.id === draft.id)) member.postDrafts = [draft, ...(member.postDrafts ?? [])];
  }); // no event: the feed redraws itself, and typing isn't interrupted
}
