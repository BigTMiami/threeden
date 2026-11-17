// @ts-check
/**
 * moderation-tab.js — Group settings → Moderation: what people reported in
 * this group, for whoever has the 'moderate' permission (admins and the
 * owner, unless the group changed it in Roles & permissions).
 *
 *   Needs a look (2)
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Announcement by Erik S · League news · 3h ago                │
 *   │ “CHEAP CLEATS!!! …”                                          │
 *   │ Reported by 2 people: Spam or a scam (2) · “third time…”    │
 *   │ [Keep it]  [Remove the post]  [Remove Erik from the group]   │
 *   └──────────────────────────────────────────────────────────────┘
 *   Handled (3)   ▸ kept · removed …
 *
 * Reports are grouped by what was reported. Who reported is never shown,
 * only how many and why. "Remove the post" deletes announcements, feed
 * posts, and forum threads; anything else gets "Open it" to handle there.
 * Each report remembers how it was handled: report.resolved = { how, by, at }.
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { changeState, getState, getModule, getMember, updateModuleData } from '../state/store.js';
import { REPORT_REASONS } from '../state/reports.js';
import { removeMember, snapshotGroup, restoreGroup } from '../state/groups.js';
import { roleOf, can } from '../state/permissions.js';
import { notify } from '../state/notifications.js';
import { timeAgo } from '../utils/dates.js';

const REMOVABLE = { announcement: 'posts', feedpost: 'posts', post: 'posts', thread: 'threads' };

/** The reported thing, if it still exists: { title, text, authorId, createdAt, where, href } */
function findContent(report) {
  const module = report.moduleId ? getModule(report.moduleId) : null;
  if (!module) return null;
  const listName = REMOVABLE[report.kind] ?? (module.data?.posts ? 'posts' : module.data?.threads ? 'threads' : null);
  const item = listName ? (module.data?.[listName] ?? []).find((x) => x.id === report.itemId) : null;
  if (!item) return null;
  return { title: item.title ?? '', text: item.body ?? item.text ?? '', authorId: item.authorId, createdAt: item.createdAt, where: module.title, href: `#module-${module.id}`, listName };
}

export function openReportsFor(spaceId) {
  return (getState().reports ?? []).filter((r) => r.spaceId === spaceId && !r.resolved);
}

function resolve(keys, spaceId, how, by) {
  changeState((state) => {
    state.reports = (state.reports ?? []).map((r) => (r.spaceId === spaceId && keys.includes(r.key) && !r.resolved ? { ...r, resolved: { how, by, at: Date.now() } } : r));
  });
}

export function renderModerationTab(space, me, redraw) {
  if (!can(space, me.id, 'moderate')) {
    return h('p', { class: 'settings-locked' }, icon('lock', 13), ' Only the people who moderate this group see its reports.');
  }
  const all = (getState().reports ?? []).filter((r) => r.spaceId === space.id);
  const groups = new Map();
  for (const r of all) groups.set(r.key, [...(groups.get(r.key) ?? []), r]);
  const open = [...groups.values()].filter((list) => list.some((r) => !r.resolved));
  const handled = [...groups.values()].filter((list) => list.every((r) => r.resolved));

  const reasonsLine = (list) => {
    const counts = new Map();
    for (const r of list) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
    const reasons = [...counts].map(([id, n]) => `${REPORT_REASONS.find((x) => x.id === id)?.label ?? id}${n > 1 ? ` (${n})` : ''}`).join(' · ');
    const notes = list.map((r) => r.note).filter(Boolean);
    return [h('strong', {}, `Reported by ${list.length} ${list.length === 1 ? 'person' : 'people'}: `), reasons, notes.length ? h('span', { class: 'moderation__notes' }, notes.map((n) => ` “${n}”`)) : null];
  };

  function card(list) {
    const first = list[0];
    const content = findContent(first);
    const author = getMember(content?.authorId ?? first.authorId);
    const authorIsMember = author && space.memberIds.includes(author.id) && roleOf(space, author.id) !== 'owner';
    const keys = [first.key];
    const kindLabel = { announcement: 'Announcement', feedpost: 'Post', post: 'Post', thread: 'Forum thread', event: 'Event', photos: 'Photos' }[first.kind] ?? 'Post';
    return h('li', { class: 'moderation__card' },
      h('div', { class: 'moderation__head' },
        author ? avatar(author, 28) : null,
        h('span', {}, h('strong', {}, kindLabel), ` by ${author?.name ?? 'someone'}`, h('span', { class: 'moderation__meta' }, [content?.where, content?.createdAt ? timeAgo(content.createdAt) : null].filter(Boolean).map((x) => ` · ${x}`)))),
      content ? h('blockquote', { class: 'moderation__quote' }, content.title ? h('strong', {}, content.title, ' ') : null, content.text.slice(0, 280)) : h('p', { class: 'moderation__gone' }, 'It’s been deleted already.'),
      h('p', { class: 'moderation__reasons' }, reasonsLine(list)),
      h('div', { class: 'form-row moderation__actions' },
        h('button', {
          type: 'button', class: 'button button--small',
          onClick: () => { resolve(keys, space.id, 'kept', me.id); showToast('Kept. The reports are marked as handled.'); redraw(); },
        }, 'Keep it'),
        content && content.listName ? h('button', {
          type: 'button', class: 'button button--small button--danger',
          onClick: () => {
            const module = getModule(first.moduleId);
            updateModuleData(first.moduleId, { ...module.data, [content.listName]: module.data[content.listName].filter((x) => x.id !== first.itemId) });
            resolve(keys, space.id, 'removed', me.id);
            if (author) notify({ recipientIds: [author.id], actorId: me.id, kind: 'moderation', spaceId: space.id, text: `A moderator removed your ${kindLabel.toLowerCase()} in ${space.name}${content.title ? ` (“${content.title}”)` : ''} after it was reported.` });
            showToast('Removed. They’ve been told it was removed, not who reported it.');
            redraw();
          },
        }, `Remove the ${kindLabel.toLowerCase()}`) : content ? h('a', { class: 'button button--small', href: content.href }, 'Open it') : null,
        authorIsMember ? h('button', {
          type: 'button', class: 'link-button link-button--danger',
          onClick: () => {
            const before = snapshotGroup(space.id);
            removeMember(space.id, author.id);
            resolve(keys, space.id, 'member removed', me.id);
            showToast(`${author.name} isn’t in ${space.name} anymore.`, {
              actionLabel: 'Undo',
              onAction: () => { restoreGroup(before); redraw(); },
            });
            redraw();
          },
        }, `Remove ${author.name.split(' ')[0]} from the group`) : null));
  }

  return h('div', { class: 'moderation' },
    h('section', { class: 'settings-section' },
      h('h2', { class: 'settings-section__title' }, `Needs a look${open.length ? ` (${open.length})` : ''}`),
      h('p', { class: 'settings-section__description' }, 'What members reported here. You see why, never who.'),
      open.length ? h('ul', { class: 'moderation__list' }, open.map(card))
        : h('div', { class: 'empty-state empty-state--compact' }, icon('shield', 22), h('p', { class: 'empty-state__title' }, 'Nothing to look at. Nice.'))),
    handled.length ? h('section', { class: 'settings-section' },
      h('details', {},
        h('summary', {}, `Handled (${handled.length})`),
        h('ul', { class: 'moderation__handled' }, handled.map((list) => {
          const r = list[list.length - 1].resolved;
          return h('li', {}, `${REPORT_REASONS.find((x) => x.id === list[0].reason)?.label ?? 'Report'} · ${r.how} by ${getMember(r.by)?.name.split(' ')[0] ?? 'a moderator'} · ${timeAgo(r.at)}`);
        })))) : null);
}
