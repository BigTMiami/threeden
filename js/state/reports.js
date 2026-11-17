// @ts-check
/**
 * reports.js — people reporting posts in the Feed (the "…" menu → Report).
 *
 * Saved in state.reports:
 *   [{ id, key, kind, spaceId, moduleId, itemId, authorId, memberId, reason, note, at }]
 *     key: what was reported ('feedpost:<id>', 'thread:<id>', 'event:<id>', …)
 *
 * In a group, the group's owner and admins get a notification. A forum
 * thread's report also goes on the thread itself, where the forum's
 * moderators review it (js/modules/forum/). Reports on blogs would go to
 * 3den's own team; in the prototype they're just kept.
 */

import { changeState, getState, getSpace, getModule, updateModuleData } from './store.js';
import { notify } from './notifications.js';
import { makeId } from '../ui/dom.js';

export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam or a scam' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate speech or symbols' },
  { id: 'violence', label: 'Violence or threats' },
  { id: 'sexual', label: 'Nudity or sexual content' },
  { id: 'false', label: 'False information' },
  { id: 'private', label: 'Shares someone’s private information' },
  { id: 'other', label: 'Something else' },
];

export function hasReported(key, memberId) {
  return (getState().reports ?? []).some((r) => r.key === key && r.memberId === memberId);
}

/** Save a report and tell whoever looks after it. Returns who that is, for the thank-you line. */
export function reportContent({ key, kind, spaceId = null, moduleId = null, itemId = null, authorId = null, memberId, reason, note = '' }) {
  changeState((state) => {
    state.reports = [...(state.reports ?? []), { id: makeId('rep'), key, kind, spaceId, moduleId, itemId, authorId, memberId, reason, note: note.trim(), at: Date.now() }];
  });
  const label = REPORT_REASONS.find((r) => r.id === reason)?.label ?? reason;
  // A forum thread: also on the thread, for the forum's moderators.
  if (kind === 'thread' && moduleId) {
    const module = getModule(moduleId);
    const threads = (module?.data?.threads ?? []).map((t) => (t.id === itemId
      ? { ...t, reports: [...(t.reports ?? []), { memberId, reason: note.trim() ? `${label}: ${note.trim()}` : label, at: Date.now() }] }
      : t));
    if (module) updateModuleData(moduleId, { ...module.data, threads });
  }
  const space = spaceId ? getSpace(spaceId) : null;
  if (space?.kind === 'group') {
    const moderators = Object.entries(space.roles ?? {}).filter(([, role]) => role === 'owner' || role === 'admin').map(([id]) => id);
    notify({ recipientIds: moderators, actorId: memberId, kind: 'report', text: `A post in ${space.name} was reported: ${label}`, spaceId, moduleId, itemId, anonymous: true });
    return `${space.name}’s moderators`;
  }
  return '3den’s team';
}
