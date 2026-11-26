// @ts-check
/**
 * welcome-checklist.js — getting settled in a group you just joined, one
 * step at a time, under the group's name for your first three weeks (or
 * until you finish or hide it):
 *
 *   → Next: Say hello: who you are, and what you can help with   1 of 5  ×
 *     [ I'm Leo, I live on Fir St and have a car… ] [Post]
 *
 * The steps, in order: read the latest news, say hello, answer the next
 * event, add a photo, choose how you hear from them.
 *
 * Most items tick themselves from what you've done anywhere in 3den; the
 * hello is saved as your intro (space.intros[memberId]) and shown in the
 * member directory. Saved: space.joinedAt[memberId] (set by addMember),
 * member.groupChecklists[spaceId] = { hidden, done: { hear: true } }.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { nextStepLine } from '../onboarding/next-step.js';
import { showToast } from '../ui/toast.js';
import { changeState, getSpace, getMember } from '../state/store.js';
import { goTo, openModulePage } from '../router.js';
import { notify } from '../state/notifications.js';
import { normalizeEvent, rsvpOf, occurrencesBetween } from '../modules/calendar/calendar-data.js';
import { todayKey, addDays, formatShortDate } from '../utils/dates.js';

const SHOW_FOR_DAYS = 21;

function stateOf(me, spaceId) {
  return me.groupChecklists?.[spaceId] ?? { hidden: false, done: {} };
}
function saveState(meId, spaceId, change) {
  changeState(() => {
    const member = getMember(meId);
    const current = member.groupChecklists?.[spaceId] ?? { hidden: false, done: {} };
    member.groupChecklists = { ...member.groupChecklists, [spaceId]: change(current) };
  }, 'account');
}

/** Save what someone says about themselves in a group (their intro), and tell the admins. */
export function saveIntro(spaceId, memberId, text) {
  changeState(() => {
    const space = getSpace(spaceId);
    space.intros = { ...space.intros, [memberId]: text.trim() };
  }, 'space');
  const space = getSpace(spaceId);
  const admins = Object.entries(space.roles ?? {}).filter(([, role]) => role === 'owner' || role === 'admin').map(([id]) => id);
  notify({ recipientIds: admins, actorId: memberId, kind: 'intro', text: `${getMember(memberId)?.name ?? 'Someone'} said hello in ${space.name}: “${text.trim().slice(0, 80)}”`, spaceId, href: `#directory-${spaceId}` });
}

function nextEvent(space, me) {
  const start = todayKey();
  const list = [];
  for (const module of space.modules) {
    if (!Array.isArray(module.data?.events)) continue;
    const events = module.data.events.map(normalizeEvent).filter((e) => e.kind !== 'task');
    for (const o of occurrencesBetween(events, start, addDays(start, 30))) if (o.dayNumber === 1) list.push(o);
  }
  list.sort((a, b) => a.date.localeCompare(b.date));
  return list[0] ? { ...list[0], answered: Boolean(rsvpOf(list[0].event, me.id)) } : null;
}

/** The items, each { id, label, done, action? , extra? }. */
function itemsFor(space, me, redraw) {
  const saved = stateOf(me, space.id);
  const items = [];
  // Joined from a link with just a name and phone number? Finishing the
  // account comes last, so they see the group first.
  const finish = me.quick ? { id: 'account', label: 'Finish your account: pick a username and password', done: false, action: () => goTo('#finish-account') } : null;
  const news = space.modules.find((m) => m.type === 'announcements');
  if (news) {
    const posts = news.data?.posts ?? [];
    const latest = [...posts].sort((a, b) => b.createdAt - a.createdAt)[0];
    items.push({
      id: 'read', label: 'Read the latest news',
      done: !latest || Boolean(saved.done.read) || (latest.seenBy ?? []).includes(me.id) || latest.authorId === me.id,
      // Opening the news counts as reading it.
      action: () => { saveState(me.id, space.id, (s) => ({ ...s, done: { ...s.done, read: true } })); openModulePage(news.id); },
    });
  }
  const intro = space.intros?.[me.id];
  items.push({
    id: 'hello', label: intro ? 'Said hello' : 'Say hello: who you are, and what you can help with', done: Boolean(intro),
    extra: intro ? null : () => {
      const input = h('input', { type: 'text', class: 'input input--compact', maxlength: '200', placeholder: `I’m ${me.name.split(' ')[0]}. I live nearby and can help with…`, 'aria-label': 'Say hello' });
      return h('form', {
        class: 'welcome-list__hello',
        onSubmit: (event) => {
          event.preventDefault();
          if (!input.value.trim()) { input.focus(); return; }
          saveIntro(space.id, me.id, input.value);
          showToast('Said hello. It shows next to your name in the member directory.');
          redraw();
        },
      }, input, h('button', { type: 'submit', class: 'button button--small button--primary' }, 'Post'));
    },
  });
  const next = nextEvent(space, me);
  if (next) items.push({ id: 'rsvp', label: `Answer the next event: ${next.event.title}, ${formatShortDate(next.date)}`, done: next.answered, action: () => goTo(`#event-${next.event.id}`) });
  items.push({ id: 'photo', label: 'Add a photo so people know you', done: Boolean(me.photo), action: () => goTo('#account-profile') });
  items.push({
    id: 'hear', label: 'Choose how you hear from them', done: Boolean(saved.done.hear),
    action: () => { saveState(me.id, space.id, (s) => ({ ...s, done: { ...s.done, hear: true } })); goTo('#account-notifications'); showToast('You can also mute just this group from its page.'); },
  });
  if (finish) items.push(finish);
  return items;
}

/** The next step for this group (one line), or null when it shouldn't show. */
export function renderWelcomeChecklist(space, me) {
  if (!space || space.kind !== 'group' || !me || me.isGuest) return null;
  // One thing at a time: not while their onboarding tutorial is going (js/onboarding/tutorial.js).
  const tour = me.onboarding?.tour;
  if (tour && tour.at !== 'DONE' && !tour.paused) return null;
  if (!space.memberIds.includes(me.id) || (space.roles?.[me.id] ?? 'member') !== 'member') return null;
  const joined = space.joinedAt?.[me.id];
  if (!joined || Date.now() - joined > SHOW_FOR_DAYS * 864e5) return null;
  if (stateOf(me, space.id).hidden) return null;

  const root = h('div', { class: 'welcome-list' });
  function draw() {
    const fresh = getMember(me.id);
    const items = itemsFor(getSpace(space.id), fresh, draw);
    const done = items.filter((i) => i.done).length;
    const next = items.find((i) => !i.done);
    if (!next) {
      replaceChildren(root, h('p', { class: 'welcome-list__done' }, '🎉 You’re all set in ', h('strong', {}, space.name), '.'));
      saveState(me.id, space.id, (s) => ({ ...s, hidden: true }));
      return;
    }
    replaceChildren(root, nextStepLine({
      ariaLabel: `Getting settled in ${space.name}`,
      label: next.label,
      action: next.action ? { label: 'Go', run: next.action } : null,
      extra: next.extra ? next.extra() : null,
      done,
      total: items.length,
      hideLabel: `Hide getting settled in ${space.name}`,
      onHide: () => { saveState(me.id, space.id, (s) => ({ ...s, hidden: true })); root.remove(); },
    }));
  }
  draw();
  return root;
}
