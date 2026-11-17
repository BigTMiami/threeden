// @ts-check
/**
 * quick-create.js — one "+" for making anything, from any page.
 *
 *   [+]  (in the top bar on a computer; a round button above the tab bar on phones)
 *   ┌ New ──────────────────────────────────────────── × ┐
 *   │ [Post] [Event] [Task] [Message]                    │
 *   │ ┌────────────────────────────────────────────────┐ │
 *   │ │ What's happening?                              │ │
 *   │ └────────────────────────────────────────────────┘ │
 *   │ Post to [ Porch Lights · Photos ▾ ]       [Post]   │
 *   └────────────────────────────────────────────────────┘
 *
 * You write first and choose where it goes last: the place starts as the
 * group you're on (or the last one you picked), so most of the time it's
 * one tap. Event takes plain words ("Potluck Sat 6pm at Grace's",
 * quick-add.js) with "More options" for the full Plan an event; Task goes
 * on any to-do list you can use; Message sends to one person.
 */

import { canMessage, parentsOf, childrenOf } from '../state/children.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { getCurrentUser, getSpaces, getCurrentSpace, getMember, getBlogOf, getPersonalSpace, changeState, getModule, getSpaceOfModule } from '../state/store.js';
import { audienceFor, audienceChip } from '../ui/audience-chip.js';
import { can } from '../state/permissions.js';
import { goTo } from '../router.js';
import { createPost as createFeedPost } from '../modules/blog-feeds/feed-data.js';
import { createPost as createAnnouncement } from '../modules/announcements/announcements-data.js';
import { createTask } from '../modules/todo/todo-data.js';
import { createEvent } from '../modules/calendar/calendar-data.js';
import { parseQuickEvent } from '../events/quick-add.js';
import { openDirectConversation, sendMessage } from '../state/messages.js';
import { getFriendIds } from '../state/friends.js';
import { formatShortDate, formatTime } from '../utils/dates.js';
import { eventHref } from '../events/event-details.js';

const FEEDS = ['photofeed', 'textfeed', 'generalfeed'];
const LAST_KEY = '3den.quick-create';
const KINDS = [['post', 'Post'], ['event', 'Event'], ['task', 'Task'], ['message', 'Message']];

const remembered = () => { try { return JSON.parse(sessionStorage.getItem(LAST_KEY) ?? '{}'); } catch { return {}; } };
const remember = (kind, where) => { try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ ...remembered(), [kind]: where })); } catch { /* fine */ } };

/** Every place `me` can put a kind of thing: [{ id: moduleId, label, spaceId }]. */
function placesFor(kind, me) {
  const out = [];
  const blog = getBlogOf(me.id);
  const personal = getPersonalSpace();
  for (const space of getSpaces()) {
    const mine = space === blog || space === personal;
    const member = space.kind === 'group' && space.memberIds.includes(me.id);
    if (!mine && !member) continue;
    const name = space === blog ? 'My blog' : space === personal ? 'My homepage' : space.name;
    for (const m of space.modules) {
      const ok = kind === 'post' ? (FEEDS.includes(m.type) && (mine || can(space, me.id, 'postToFeeds'))) || (m.type === 'announcements' && member && can(space, me.id, 'postAnnouncements'))
        : kind === 'event' ? m.type === 'calendar'
          : kind === 'task' ? m.type === 'todo'
            : false;
      if (ok) out.push({ id: m.id, label: `${name} · ${m.title}`, spaceId: space.id, type: m.type });
    }
  }
  return out;
}

/** The place to start on: the group you're on, then the last one you picked, then the first. */
function startPlace(kind, places) {
  const here = getCurrentSpace();
  return places.find((p) => p.spaceId === here?.id)?.id ?? places.find((p) => p.id === remembered()[kind])?.id ?? places[0]?.id ?? '';
}

function addTo(moduleId, change) {
  changeState((state) => {
    for (const space of state.spaces) {
      const module = space.modules.find((m) => m.id === moduleId);
      if (module) { change(module.data ?? (module.data = {}), space); return; }
    }
  }, 'layout');
}

let overlay = null;

export function openQuickCreate(kind = 'post') {
  const me = getCurrentUser();
  if (!me || me.isGuest) return;
  overlay?.remove();
  const previousFocus = /** @type {HTMLElement | null} */ (document.activeElement);
  let current = kind;
  const body = h('div', { class: 'quick-create__body' });
  const tabs = h('div', { class: 'segmented quick-create__tabs', role: 'tablist', 'aria-label': 'What to make' });

  function close() {
    overlay?.remove();
    overlay = null;
    document.removeEventListener('keydown', onKey, true);
    previousFocus?.focus?.();
  }
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }

  const whereSelect = (places, value, label) => h('label', { class: 'quick-create__where' }, h('span', {}, label),
    h('select', { class: 'input input--compact', 'aria-label': label }, places.map((p) => h('option', { value: p.id, selected: p.id === value }, p.label))));

  function draw() {
    replaceChildren(tabs, KINDS.map(([id, label]) => h('button', {
      type: 'button', role: 'tab', class: `segmented__option${current === id ? ' is-active' : ''}`, 'aria-selected': String(current === id),
      onClick: () => { current = id; draw(); },
    }, label)));
    replaceChildren(body, ({ post: drawPost, event: drawEvent, task: drawTask, message: drawMessage })[current]());
    requestAnimationFrame(() => /** @type {HTMLElement | null} */ (body.querySelector('textarea, input'))?.focus());
  }

  function drawPost() {
    const places = placesFor('post', me);
    if (!places.length) return h('p', {}, 'There’s nowhere for you to post yet. Turn on your blog in Account settings, or join a group.');
    const text = h('textarea', { class: 'input', rows: '4', placeholder: 'What’s happening?', 'aria-label': 'Your post' });
    const where = whereSelect(places, startPlace('post', places), 'Post to');
    // Who sees it depends on where it goes; the chip follows the place.
    const chipSlot = h('span', { class: 'quick-create__audience' });
    let audience = 'everyone';
    const drawChip = () => {
      const moduleId = where.querySelector('select').value;
      const module = getModule(moduleId);
      const found = audienceFor(getSpaceOfModule(moduleId), module, { choice: module?.type !== 'announcements' });
      audience = found.value;
      replaceChildren(chipSlot, audienceChip(found, (value) => { audience = value; }));
    };
    where.querySelector('select').addEventListener('change', drawChip);
    drawChip();
    return h('form', {
      class: 'quick-create__form',
      onSubmit: (e) => {
        e.preventDefault();
        const value = text.value.trim();
        if (!value) { text.focus(); return; }
        const place = places.find((p) => p.id === where.querySelector('select').value);
        if (place.type === 'announcements') {
          const [first, ...more] = value.split('\n');
          addTo(place.id, (data) => { data.posts = [createAnnouncement({ authorId: me.id, title: first.slice(0, 120), body: more.join('\n').trim() }), ...(data.posts ?? [])]; });
        } else {
          addTo(place.id, (data) => { data.posts = [createFeedPost({ authorId: me.id, text: value, audience }), ...(data.posts ?? [])]; });
        }
        remember('post', place.id);
        close();
        showToast(`Posted in ${place.label}.`, { actionLabel: 'See it', onAction: () => goTo(`#module-${place.id}`) });
      },
    }, text, h('div', { class: 'quick-create__foot' }, where, chipSlot, h('button', { type: 'submit', class: 'button button--primary' }, 'Post')));
  }

  function drawEvent() {
    const places = placesFor('event', me);
    const text = h('input', { type: 'text', class: 'input', placeholder: 'e.g. Potluck Sat 6pm at Grace’s', 'aria-label': 'Describe the event' });
    const reading = h('p', { class: 'settings-field__hint quick-create__reading', role: 'status' }, 'Type the name, day, time, and place, like you’d say it.');
    text.addEventListener('input', () => {
      const p = parseQuickEvent(text.value);
      reading.textContent = text.value.trim()
        ? [p.title || 'Untitled', p.date ? formatShortDate(p.date) : 'no day yet', p.time ? formatTime(p.time) : 'no time yet', p.location ? `at ${p.location}` : null].filter(Boolean).join(' · ')
        : 'Type the name, day, time, and place, like you’d say it.';
    });
    const where = places.length ? whereSelect(places, startPlace('event', places), 'Add to') : null;
    return h('form', {
      class: 'quick-create__form',
      onSubmit: (e) => {
        e.preventDefault();
        const p = parseQuickEvent(text.value);
        if (!p.title || !p.date) { showToast('Add a name and a day, like “Potluck Saturday 6pm”. Or use More options.'); text.focus(); return; }
        const place = places.find((x) => x.id === where?.querySelector('select').value);
        const space = place ? getSpaces().find((s) => s.id === place.spaceId) : null;
        const event = createEvent({
          kind: 'event', title: p.title, date: p.date, allDay: !p.time, time: p.time ?? '', endTime: p.endTime ?? '', location: p.location ?? '',
          visibility: space?.kind === 'group' ? 'group' : 'invite', createdBy: me.id, rsvps: { [me.id]: 'going' }, attendeeIds: [me.id],
        });
        if (!place) { close(); goTo('#new-event'); return; } // no calendar yet: the full planner makes one
        addTo(place.id, (data) => { data.events = [...(data.events ?? []), event]; });
        remember('event', place.id);
        close();
        goTo(eventHref(event.id));
        showToast('Event made. Add details here, or share it.');
      },
    }, text, reading,
    h('div', { class: 'quick-create__foot' }, where,
      h('a', { class: 'link-button', href: getCurrentSpace()?.kind === 'group' ? `#new-event-${getCurrentSpace().id}` : '#new-event', onClick: close }, 'More options'),
      h('button', { type: 'submit', class: 'button button--primary' }, 'Add')));
  }

  function drawTask() {
    const places = placesFor('task', me);
    if (!places.length) return h('p', {}, 'No to-do lists yet. Add a To-do list to your homepage or a group.');
    const text = h('input', { type: 'text', class: 'input', placeholder: 'What needs doing?', 'aria-label': 'The task' });
    const due = h('input', { type: 'date', class: 'input input--compact', 'aria-label': 'Due (optional)' });
    const mineBox = h('input', { type: 'checkbox', checked: true });
    const where = whereSelect(places, startPlace('task', places), 'On');
    return h('form', {
      class: 'quick-create__form',
      onSubmit: (e) => {
        e.preventDefault();
        if (!text.value.trim()) { text.focus(); return; }
        const place = places.find((p) => p.id === where.querySelector('select').value);
        addTo(place.id, (data) => { data.tasks = [...(data.tasks ?? []), createTask({ text: text.value.trim(), due: due.value, assigneeIds: mineBox.checked ? [me.id] : [] })]; });
        remember('task', place.id);
        close();
        showToast(`Added to ${place.label}.`, { actionLabel: 'See it', onAction: () => goTo(`#module-${place.id}`) });
      },
    }, text,
    h('div', { class: 'quick-create__row' }, h('label', { class: 'quick-create__where' }, h('span', {}, 'Due'), due), h('label', { class: 'settings-check' }, mineBox, ' I’ll do it')),
    h('div', { class: 'quick-create__foot' }, where, h('button', { type: 'submit', class: 'button button--primary' }, 'Add')));
  }

  function drawMessage() {
    const groupmates = getSpaces().filter((s) => s.kind === 'group' && s.memberIds.includes(me.id)).flatMap((s) => s.memberIds);
    const family = [...parentsOf(me.id), ...childrenOf(me.id).map((c) => c.id)];
    const people = [...new Set([...getFriendIds(me.id), ...groupmates, ...family])].filter((id) => id !== me.id && canMessage(me.id, id)).map(getMember).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    const to = h('select', { class: 'input input--compact', 'aria-label': 'To' }, h('option', { value: '' }, 'Choose someone'), people.map((p) => h('option', { value: p.id }, p.name)));
    const text = h('textarea', { class: 'input', rows: '3', placeholder: 'Write a message', 'aria-label': 'Message' });
    return h('form', {
      class: 'quick-create__form',
      onSubmit: (e) => {
        e.preventDefault();
        if (!to.value) { to.focus(); showToast('Choose who it’s for.'); return; }
        if (!text.value.trim()) { text.focus(); return; }
        const conversation = openDirectConversation(me.id, to.value);
        sendMessage(conversation.id, me.id, text.value);
        close();
        goTo(`#messages-${conversation.id}`);
      },
    }, text, h('div', { class: 'quick-create__foot' }, h('label', { class: 'quick-create__where' }, h('span', {}, 'To'), to), h('button', { type: 'submit', class: 'button button--primary' }, 'Send')));
  }

  overlay = h('div', { class: 'sub-viewer quick-create', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Make something new' },
    h('div', { class: 'sub-viewer__panel quick-create__panel' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, 'New'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: close }, icon('close', 18))),
      tabs, body));
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  draw();
}

/** The "+" button: in the top bar (computers) and floating above the tab bar (phones). */
export function quickCreateButton(extraClass = '') {
  return h('button', {
    type: 'button', class: `quick-create__button ${extraClass}`, 'aria-label': 'Make something new: a post, event, task, or message', title: 'New post, event, task, or message',
    onClick: () => openQuickCreate(),
  }, icon('plus', 18));
}
