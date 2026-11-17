// @ts-check
/**
 * feed-needs.js — the top of the Feed: what your groups need from you,
 * each answerable right here.
 *
 *   ── From groups ─────────────────────────── 4 ──
 *   🎟 Eastside Mutual Aid · Harbor cleanup · Sun, Nov 15        [Going] [Maybe] [Can’t go]
 *   ▤  Tenants Union asks: Which night for the next meeting?     (Tue) (Wed) (Thu)
 *   ✓  14 Juniper Lane · Deep clean the kitchen · due Nov 17     [I’ll do it]
 *   ✋ Larsen Thanksgiving needs: Rolls (1 of 2 spots left)       [I’ll bring it]
 *   📣 Porch Lights · Set list for the fair                      [Reply…________] [Send]
 *
 *   collectAsks(me)        → [{ kind, key, space, …, timestamp }], most urgent first
 *   renderNeedsYou(me, redraw, { limit })
 *
 * Asks come straight from the groups' modules (nothing extra is saved):
 *   rsvp          upcoming group events you can see and haven't answered (needsYou in dashboard-data.js)
 *   poll          open polls on announcements in the last two weeks that you haven't voted in
 *   task          group to-dos nobody has taken, due within two weeks or added in the last week
 *   signup        open sign-up slots on events you're going to (or hosting) in the next month
 *   postask       announcements asking who's coming or who'll bring what (js/ui/asks.js)
 *   announcement  announcements from the last week you haven't seen: reply in place
 * Dismissing one ("Not for me") hides it for you: member.dismissedAsks.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { changeState, getCurrentUser, getMember, getModule, updateModuleData, getGroupsByRecentVisit } from '../state/store.js';
import { needsYou } from '../modules/dashboard/dashboard-data.js';
import { normalizeTask, dueLabel } from '../modules/todo/todo-data.js';
import { normalizePost as normalizeAnnouncement, hasSeen, createComment } from '../modules/announcements/announcements-data.js';
import { isClosed, myVote, castVote } from '../utils/polls.js';
import { applyRsvp, normalizeEvent, rsvpOf } from '../modules/calendar/calendar-data.js';
import { updateEvent } from '../state/events.js';
import { rsvpButtons } from '../events/rsvp.js';
import { eventHref } from '../events/event-details.js';
import { formatShortDate, formatTime, todayKey, addDays } from '../utils/dates.js';
import { notify } from '../state/notifications.js';
import { spaceHref } from '../router.js';
import { renderAsks } from '../ui/asks.js';
import { availabilityChip } from '../ui/availability-chip.js';

const DAY = 24 * 60 * 60 * 1000;

const dismissed = (me) => new Set(getMember(me.id)?.dismissedAsks ?? []);

export function dismissAsk(memberId, key) {
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    member.dismissedAsks = [...new Set([...(member.dismissedAsks ?? []), key])].slice(-200);
  }, 'account');
}

export function collectAsks(me) {
  const now = Date.now();
  const today = todayKey();
  const groups = getGroupsByRecentVisit();
  const asks = [];

  // Events waiting for an answer.
  for (const { event, date, space } of needsYou(me).rsvps) {
    if (date > addDays(today, 21)) continue; // three weeks out is soon enough to ask
    asks.push({ kind: 'rsvp', key: `rsvp:${event.id}`, space, event, date, urgency: date });
  }

  for (const space of groups) {
    for (const module of space.modules) {
      const data = module.data ?? {};
      if (module.type === 'announcements') {
        for (const raw of data.posts ?? []) {
          const post = normalizeAnnouncement(raw);
          // An announcement asking who's coming or who'll bring what (js/ui/asks.js).
          const asksRsvp = post.rsvp && !post.rsvp.answers?.[me.id];
          const asksSignup = post.signups?.some((slot) => (slot.memberIds ?? []).length < slot.spots) && !post.signups.some((slot) => (slot.memberIds ?? []).includes(me.id));
          if ((asksRsvp || asksSignup) && now - post.createdAt < 14 * DAY) {
            asks.push({ kind: 'postask', key: `postask:${post.id}`, space, module, post, urgency: addDays(today, 3) });
            continue;
          }
          if (post.poll && !isClosed(post.poll) && !myVote(post.poll, me.id)?.length && now - post.createdAt < 14 * DAY) {
            asks.push({ kind: 'poll', key: `poll:${post.id}`, space, module, post, urgency: post.poll.closesOn ?? addDays(today, 7) });
          } else if (!hasSeen(post, me.id) && now - post.createdAt < 7 * DAY) {
            asks.push({ kind: 'announcement', key: `ann:${post.id}`, space, module, post, urgency: addDays(today, 10) });
          }
        }
      }
      if (module.type === 'todo') {
        for (const raw of data.tasks ?? []) {
          const task = normalizeTask(raw);
          if (task.done || task.assigneeIds.length) continue;
          const soon = task.due && task.due <= addDays(today, 14);
          const fresh = task.createdAt && now - task.createdAt < 7 * DAY;
          if (soon || fresh) asks.push({ kind: 'task', key: `task:${task.id}`, space, module, task, urgency: task.due || addDays(today, 12) });
        }
      }
      if (Array.isArray(data.events)) {
        for (const raw of data.events) {
          const event = normalizeEvent(raw);
          if (!event.signups?.length || event.date < today || event.date > addDays(today, 30)) continue;
          if (event.createdBy !== me.id && rsvpOf(event, me.id) !== 'going') continue;
          if (event.signups.some((slot) => (slot.memberIds ?? []).includes(me.id))) continue;
          const open = event.signups.filter((slot) => (slot.memberIds ?? []).length < slot.spots);
          if (open.length) asks.push({ kind: 'signup', key: `signup:${event.id}`, space, module, event, slots: open, urgency: event.date });
        }
      }
    }
  }
  const hidden = dismissed(me);
  // Soonest first, but take turns between kinds, so a busy week of events doesn't hide a task or a poll.
  const byKind = new Map();
  for (const ask of asks.filter((a) => !hidden.has(a.key)).sort((a, b) => a.urgency.localeCompare(b.urgency))) {
    if (!byKind.has(ask.kind)) byKind.set(ask.kind, []);
    byKind.get(ask.kind).push(ask);
  }
  const queues = [...byKind.values()].sort((a, b) => a[0].urgency.localeCompare(b[0].urgency));
  const mixed = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) mixed.push(q.shift());
  return mixed;
}

/** Change a module's data and save it. */
function changeModule(moduleId, changeFn) {
  const data = structuredClone(getModule(moduleId).data);
  changeFn(data);
  updateModuleData(moduleId, data);
}

function askRow(ask, me, redraw) {
  const where = h('a', { class: 'needs__where', href: spaceHref(ask.space.id) }, ask.space.name);
  const notForMe = h('button', {
    type: 'button', class: 'icon-button needs__dismiss', title: 'Not for me: hide this from your Feed', 'aria-label': 'Not for me',
    onClick: () => { dismissAsk(me.id, ask.key); redraw(); },
  }, icon('close', 14));
  const row = (iconName, text, actions) => h('li', { class: `needs__row needs__row--${ask.kind}` },
    h('span', { class: 'needs__icon', 'aria-hidden': 'true' }, icon(iconName, 16)),
    h('div', { class: 'needs__text' }, text),
    notForMe,
    h('div', { class: 'needs__actions' }, actions));

  if (ask.kind === 'rsvp') {
    return row('ticket', [where, ' · ', h('a', { href: eventHref(ask.event.id) }, ask.event.title), h('span', { class: 'needs__meta' }, ` · ${formatShortDate(ask.date)}${ask.event.time ? `, ${formatTime(ask.event.time)}` : ''}`), ' ', availabilityChip(ask.event, { date: ask.date })],
      rsvpButtons(ask.event, me.id, (answer) => {
        updateEvent(ask.event.id, (saved) => applyRsvp(saved, me.id, answer));
        showToast(answer === 'going' ? `You’re going to “${ask.event.title}”.` : answer === 'maybe' ? 'Marked as maybe.' : 'Thanks for letting them know.');
        redraw();
      }, { compact: true }));
  }
  if (ask.kind === 'poll') {
    const { poll } = ask.post;
    return row('listBullet', [where, ' asks: ', h('strong', {}, poll.question)],
      poll.options.slice(0, 5).map((option) => h('button', {
        type: 'button', class: 'chip needs__choice',
        onClick: () => {
          changeModule(ask.module.id, (data) => {
            const post = data.posts.find((p) => p.id === ask.post.id);
            post.poll = castVote(post.poll, me.id, [option.id]);
          });
          showToast(`Voted “${option.text || formatShortDate(option.when?.date ?? '')}”.`);
          redraw();
        },
      }, option.text || (option.when ? formatShortDate(option.when.date) : '?'))));
  }
  if (ask.kind === 'task') {
    const due = dueLabel(ask.task);
    return row('todo', [where, ' · ', h('strong', {}, ask.task.text), due ? h('span', { class: 'needs__meta' }, ` · ${due}`) : null, h('span', { class: 'needs__meta' }, ' · nobody’s on it yet')],
      h('button', {
        type: 'button', class: 'button button--small button--primary',
        onClick: () => {
          changeModule(ask.module.id, (data) => {
            const task = data.tasks.find((t) => t.id === ask.task.id);
            task.assigneeIds = [me.id];
            delete task.assigneeId;
          });
          showToast(`It’s yours: “${ask.task.text}”. It’s on your homepage’s task list.`);
          redraw();
        },
      }, icon('hand2', 14), ' I’ll do it'));
  }
  if (ask.kind === 'signup') {
    return row('hand2', [where, ' · ', h('a', { href: eventHref(ask.event.id) }, ask.event.title), ' needs:'],
      ask.slots.slice(0, 3).map((slot) => h('button', {
        type: 'button', class: 'chip needs__choice', title: `${(slot.memberIds ?? []).length} of ${slot.spots} taken`,
        onClick: () => {
          updateEvent(ask.event.id, (e) => {
            e.signups = e.signups.map((s) => (s.id === slot.id ? { ...s, memberIds: [...(s.memberIds ?? []), me.id] } : s));
          });
          showToast(`You signed up for “${slot.label}”.`);
          redraw();
        },
      }, `${slot.label} (${slot.spots - (slot.memberIds ?? []).length} left)`)));
  }
  if (ask.kind === 'postask') {
    const when = ask.post.rsvp?.when;
    return row('hand2', [where, ' · ', h('strong', {}, ask.post.title), when ? h('span', { class: 'needs__meta' }, ` · ${when}`) : null],
      renderAsks({
        getPost: () => getModule(ask.module.id).data.posts.find((p) => p.id === ask.post.id),
        savePost: (fn) => changeModule(ask.module.id, (data) => fn(data.posts.find((p) => p.id === ask.post.id))),
        me,
        compact: true, // one row of buttons; sign-ups open with a tap
      }));
  }
  // An announcement you haven't seen: read it and reply here.
  const field = h('input', { type: 'text', class: 'input input--compact needs__reply', placeholder: 'Reply…', 'aria-label': `Reply to “${ask.post.title}”` });
  const send = () => {
    const body = field.value.trim();
    changeModule(ask.module.id, (data) => {
      const post = data.posts.find((p) => p.id === ask.post.id);
      post.seenBy = [...new Set([...(post.seenBy ?? []), me.id])];
      if (body) post.comments = [...(post.comments ?? []), createComment(me.id, body)];
    });
    if (body) notify({ recipientIds: [ask.post.authorId], actorId: me.id, kind: 'reply', text: `${me.name} replied to “${ask.post.title}”`, moduleId: ask.module.id, itemId: ask.post.id });
    showToast(body ? 'Reply sent.' : 'Marked as read.');
    redraw();
  };
  return h('li', { class: 'needs__row needs__row--announcement' },
    h('span', { class: 'needs__icon', 'aria-hidden': 'true' }, icon('announcements', 16)),
    h('div', { class: 'needs__text' }, where, ' · ', h('strong', {}, ask.post.title),
      ask.post.body ? h('p', { class: 'needs__body' }, ask.post.body.length > 180 ? `${ask.post.body.slice(0, 179)}…` : ask.post.body) : null),
    h('form', { class: 'needs__actions', onSubmit: (event) => { event.preventDefault(); send(); } },
      field,
      h('button', { type: 'submit', class: 'button button--small' }, 'Send'),
      h('button', { type: 'button', class: 'link-button needs__dismiss', onClick: () => { field.value = ''; send(); } }, 'Mark read')));
}

/** The "From groups" box, or null when nothing does. */
export function renderNeedsYou(me = getCurrentUser(), redraw, { limit = 3 } = {}) {
  const asks = collectAsks(me);
  if (!asks.length) return null;
  let showAll = false;
  const list = h('ul', { class: 'needs__list' });
  const more = h('div', {});
  const draw = () => {
    replaceChildren(list, (showAll ? asks : asks.slice(0, limit)).map((ask) => askRow(ask, me, redraw)));
    replaceChildren(more, asks.length > limit ? h('button', { type: 'button', class: 'link-button needs__more', onClick: () => { showAll = !showAll; draw(); } }, showAll ? 'Show fewer' : `See all ${asks.length}`) : null);
  };
  draw();
  return h('section', { class: 'needs', 'aria-label': 'From groups' },
    h('h2', { class: 'needs__title' }, 'From groups', h('span', { class: 'needs__count' }, String(asks.length))),
    list, more);
}
