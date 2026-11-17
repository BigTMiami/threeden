// @ts-check
/**
 * new-event-page.js — "Plan an event", step by step (#new-event).
 *
 * For people making their first invitation (and anyone who'd rather be
 * walked through it). One question at a time, with good defaults, so the
 * invitation can't go out half filled in:
 *
 *   1  What's the occasion?   [🎂 Birthday] [🏠 Housewarming] [🍲 Dinner] [🎵 Show] [🗣 Meeting] [✨ Something else]
 *                             Name it: [Dani's birthday            ]
 *   2  When?                  [Sat, Nov 21] [7:00pm] to [11:00pm]   (next Saturday, picked for you)
 *   3  Where?                 [123 Main St, apt 4          ]   (its area for Explore is guessed from this)
 *   4  Add a photo?           a cover photo, optional (no patterns or colors: no photo, no banner)
 *   5  Who can come?          (•) People I invite (a link to send)  ( ) Anyone (public)
 *                             Anything guests should know? [                    ]
 *   6  Preview                ┌ what guests will see ┐  ⚠ Missing: a place
 *                             [Create and get the link]
 *
 * Shortcuts on the first step: type it in plain words ("Potluck Sat 6pm at
 * Grace's", quick-add.js) to fill in the name, day, time, and place, or start
 * from a bundle (Monthly meeting, Potluck, …; bundles.js).
 *
 * Who hosts it: you, or one of your groups (step 5). It starts as the group
 * you were just in (#new-event-<groupId> picks one), and then the date and
 * time start at that group's usual ones ("Juniper Tenants Union usually
 * meets Thursdays at 6:30pm"). Tags are never guessed: add them on the
 * event page if you want them.
 *
 * The event goes on your homepage calendar (a calendar is added if there
 * isn't one), or the group's calendar, and you land on its page with the
 * link ready to copy.
 */

import { coverPicker, eventCoverBanner } from './event-cover.js';
import { h, replaceChildren, makeId } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { changeState, getCurrentUser, getPersonalSpace } from '../state/store.js';
import { createEvent, colorValue } from '../modules/calendar/calendar-data.js';
import { guessPlace, placeById } from '../utils/places.js';
import { whenLabel, eventHref } from './event-details.js';
import { goTo, getRoute } from '../router.js';
import { toDateKey, weekdayName, formatShortDate, formatTime } from '../utils/dates.js';
import { getSpaces, getGroupsByRecentVisit, getLastVisit } from '../state/store.js';
import { normalizeEvent } from '../modules/calendar/calendar-data.js';
import { parseQuickEvent, nextWeekday } from './quick-add.js';
import { BUNDLES, applyBundle } from './bundles.js';

const OCCASIONS = [
  { id: 'birthday', label: 'Birthday', emoji: '🎂', title: (name) => `${name}’s birthday`, time: ['19:00', '23:00'], color: 'purple', tags: ['party'] },
  { id: 'housewarming', label: 'Housewarming', emoji: '🏠', title: () => 'Housewarming', time: ['19:00', '23:00'], color: 'orange', tags: ['party', 'food'] },
  { id: 'dinner', label: 'Dinner', emoji: '🍲', title: () => 'Dinner at my place', time: ['19:00', '22:00'], color: 'red', tags: ['food'] },
  { id: 'show', label: 'Show', emoji: '🎵', title: () => 'Live show', time: ['21:00', '23:00'], color: 'blue', tags: ['music'] },
  { id: 'meeting', label: 'Meeting', emoji: '🗣️', title: () => 'Meeting', time: ['18:30', '20:00'], color: 'green', tags: ['meeting'] },
  { id: 'other', label: 'Something else', emoji: '✨', title: () => '', time: ['18:00', '21:00'], color: 'blue', tags: [] },
];
const STEPS = ['What’s the occasion?', 'When?', 'Where?', 'Add a photo?', 'Who’s hosting, and who can come?', 'Preview'];
const RECENT_VISIT_MS = 15 * 60 * 1000;

/** Groups you're in that have a calendar to put the event on. */
function hostGroups(me) {
  return getSpaces().filter((s) => s.kind === 'group' && s.memberIds.includes(me.id) && s.modules.some((m) => m.type === 'calendar'));
}

/**
 * A group's usual weekday and start time, from its events: the most common
 * of each. { weekday: 4, time: '18:30' } or null when it has no timed events.
 */
export function groupHabits(group) {
  const events = group.modules.filter((m) => m.type === 'calendar').flatMap((m) => m.data?.events ?? []).map(normalizeEvent)
    .filter((e) => e.kind !== 'task' && !e.allDay && e.time);
  if (!events.length) return null;
  const most = (values) => [...values.reduce((map, v) => map.set(v, (map.get(v) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0][0];
  const weekday = most(events.map((e) => new Date(`${e.date}T12:00`).getDay()));
  const time = most(events.map((e) => e.time));
  const ends = events.filter((e) => e.time === time && e.endTime).map((e) => e.endTime);
  return { weekday, time, endTime: ends.length ? most(ends) : null };
}

function nextSaturday() {
  const date = new Date();
  date.setDate(date.getDate() + (((6 - date.getDay() + 7) % 7) || 7));
  return toDateKey(date);
}

export function renderNewEventPage(container) {
  const me = getCurrentUser();
  const firstName = me.name.split(' ')[0];
  const draft = {
    occasion: null, title: '', date: nextSaturday(), time: '19:00', endTime: '23:00',
    location: '', area: me.location?.placeId ?? null, emoji: '✨', color: 'blue', visibility: 'invite', notes: '', tags: [], cover: null,
    host: 'me', repeat: 'none', bundle: null,
  };
  let step = 0;
  let timeHint = 'We picked next Saturday. Change it if you like.';
  let quickNote = '';
  let lastQuick = '';

  // The host starts as the group you came from: #new-event-<id>, or the one you were just in.
  const groups = hostGroups(me);
  const asked = getRoute().spaceId;
  const recent = getGroupsByRecentVisit().find((g) => Date.now() - (getLastVisit(g.id) ?? 0) < RECENT_VISIT_MS);
  const startGroup = groups.find((g) => g.id === asked) ?? groups.find((g) => g.id === recent?.id) ?? null;
  if (startGroup) setHost(startGroup.id);

  /** Pick the host; a group's usual day and time become the defaults. */
  function setHost(id) {
    draft.host = id;
    const group = groups.find((g) => g.id === id);
    if (!group) { draft.visibility = draft.visibility === 'group' ? 'invite' : draft.visibility; timeHint = 'We picked next Saturday. Change it if you like.'; return; }
    if (draft.visibility === 'invite') draft.visibility = 'group';
    const habits = groupHabits(group);
    if (!habits) { timeHint = 'We picked next Saturday. Change it if you like.'; return; }
    draft.date = nextWeekday(habits.weekday);
    draft.time = habits.time;
    if (habits.endTime) draft.endTime = habits.endTime;
    timeHint = `${group.name} usually meets ${weekdayName(habits.weekday)}s at ${formatTime(habits.time)}, so we picked ${formatShortDate(draft.date)}.`;
  }

  /** "Potluck Sat 6pm at Grace's": fill in what the words say. */
  function quickFill(text) {
    const parsed = parseQuickEvent(text);
    if (parsed.title) draft.title = parsed.title;
    if (parsed.date) draft.date = parsed.date;
    if (parsed.time) { draft.time = parsed.time; draft.endTime = parsed.endTime; }
    if (parsed.location) { draft.location = parsed.location; const guess = guessPlace(parsed.location); if (guess) draft.area = guess.id; }
    const got = [parsed.date && formatShortDate(parsed.date), parsed.time && formatTime(parsed.time), parsed.location && `at ${parsed.location}`].filter(Boolean);
    quickNote = got.length ? `Got it: ${got.join(' · ')}.` : 'Got the name. Pick the day and time next.';
    if (parsed.date || parsed.time) timeHint = 'From what you typed.';
  }

  function useBundle(bundle) {
    draft.bundle = bundle.id;
    Object.assign(draft, { title: bundle.fields.title, time: bundle.fields.time, endTime: bundle.fields.endTime, repeat: bundle.fields.repeat, color: bundle.fields.color, emoji: bundle.emoji, notes: bundle.fields.notes });
    draw();
  }

  function choose(occasion) {
    draft.occasion = occasion.id;
    if (!draft.title || OCCASIONS.some((o) => o.title(firstName) === draft.title)) draft.title = occasion.title(firstName);
    [draft.time, draft.endTime] = occasion.time;
    draft.emoji = occasion.emoji;
    draft.color = occasion.color; // tags aren't guessed from the occasion
    if (occasion.id === 'show') draft.visibility = 'public'; // shows want an audience
    draw();
  }

  /** What still needs filling in before it can go out. */
  const missing = () => [
    !draft.title.trim() && 'a name',
    !draft.date && 'a date',
    !draft.time && 'a start time',
    !draft.location.trim() && 'a place',
  ].filter(Boolean);

  const canContinue = () => (step === 0 ? Boolean(draft.title.trim()) : step === 1 ? Boolean(draft.date && draft.time) : true);

  function stepBody() {
    if (step === 0) {
      const name = h('input', { type: 'text', class: 'input', value: draft.title, placeholder: 'Name your event', 'aria-label': 'Event name', onInput: (e) => { draft.title = e.target.value; nextButton.disabled = !canContinue(); } });
      const fillOnce = () => {
        const words = quick.value.trim();
        if (!words || words === lastQuick) return;
        lastQuick = words;
        quickFill(words);
        setTimeout(draw);
      };
      const quick = h('input', {
        type: 'text', class: 'input', placeholder: 'e.g. Potluck Sat 6pm at Grace’s', 'aria-label': 'Describe it in a few words',
        // Enter, or leaving the box, fills the form in (once per wording; drawn after the event settles).
        onKeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); fillOnce(); } },
        onChange: () => fillOnce(),
      });
      return [
        h('label', { class: 'settings-field new-event__quick' }, h('span', { class: 'settings-field__label' }, 'Type it like you’d say it'), (quick.value = lastQuick, quick),
          quickNote ? h('span', { class: 'settings-field__hint new-event__quick-note', role: 'status' }, icon('check', 12), ` ${quickNote}`) : h('span', { class: 'settings-field__hint' }, 'The day, time, and place are filled in from what you write.')),
        h('div', { class: 'new-event__choices', role: 'group', 'aria-label': 'Occasion' }, OCCASIONS.map((o) => h('button', {
          type: 'button', class: `new-event__choice${draft.occasion === o.id ? ' is-active' : ''}`, 'aria-pressed': String(draft.occasion === o.id), onClick: () => choose(o),
        }, h('span', { class: 'new-event__emoji', 'aria-hidden': 'true' }, o.emoji), o.label))),
        h('div', { class: 'new-event__bundles' },
          h('span', { class: 'settings-field__label' }, 'Or set up regular work in one step'),
          h('div', { class: 'new-event__bundle-list', role: 'group', 'aria-label': 'Bundles' }, BUNDLES.map((b) => h('button', {
            type: 'button', class: `new-event__bundle${draft.bundle === b.id ? ' is-active' : ''}`, 'aria-pressed': String(draft.bundle === b.id), onClick: () => useBundle(b),
          }, h('span', { 'aria-hidden': 'true' }, b.emoji), h('span', {}, h('strong', {}, b.label), h('span', { class: 'settings-field__hint' }, b.hint)))))),
        h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Name it'), name),
      ];
    }
    if (step === 1) {
      const set = (key) => (e) => { draft[key] = e.target.value; nextButton.disabled = !canContinue(); };
      return [
        h('div', { class: 'form-row new-event__when' },
          h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Date'), h('input', { type: 'date', class: 'input', value: draft.date, onInput: set('date') })),
          h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Starts'), h('input', { type: 'time', class: 'input', value: draft.time, onInput: set('time') })),
          h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Ends'), h('input', { type: 'time', class: 'input', value: draft.endTime, onInput: set('endTime') }))),
        h('p', { class: 'settings-field__hint' }, timeHint),
        draft.repeat !== 'none' ? h('p', { class: 'settings-field__hint' }, icon('repeat', 12), ` Repeats ${draft.repeat === 'weekly' ? 'every week' : 'every month'}.`) : null,
      ];
    }
    if (step === 2) {
      return [
        h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Address or place'),
          h('input', {
            type: 'text', class: 'input', value: draft.location, placeholder: 'e.g. 123 Main St, apt 4, or a bar’s name', 'aria-label': 'Address or place',
            onInput: (e) => {
              draft.location = e.target.value;
              // Its area (for "near you" on Explore) comes from the address; there's no field for it.
              const guess = guessPlace(draft.location);
              if (guess) draft.area = guess.id;
            },
          })),
      ];
    }
    if (step === 3) {
      return [
        h('div', { class: 'settings-field new-event__cover' },
          coverPicker(draft.cover, (cover) => { draft.cover = cover; }),
          h('span', { class: 'settings-field__hint' }, 'Optional. A photo of the place, or a flyer. It goes across the top of the event page and on share cards. No photo is fine too.')),
      ];
    }
    if (step === 4) {
      const group = groups.find((g) => g.id === draft.host);
      const who = group
        ? [['group', `Members of ${group.name}`, 'On the group’s calendar, for everyone in it.'], ['public', 'Anyone', 'It’s public: people can find it on Explore and RSVP.']]
        : [['invite', 'People I invite', 'You get a link to send. Only people you invite can see it.'], ['public', 'Anyone', 'It’s public: people can find it on Explore and RSVP.']];
      return [
        groups.length ? h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Hosted by'),
          h('select', { class: 'input', 'aria-label': 'Hosted by', onChange: (e) => { setHost(e.target.value); draw(); } },
            h('option', { value: 'me', selected: draft.host === 'me' }, `Just me (${firstName})`),
            groups.map((g) => h('option', { value: g.id, selected: draft.host === g.id }, g.name))),
          group ? h('span', { class: 'settings-field__hint' }, 'You’re the host; it goes on the group’s calendar.') : null) : null,
        h('div', { class: 'settings-choices', role: 'radiogroup', 'aria-label': 'Who can come' },
          who.map(([id, label, hint]) => h('label', { class: 'settings-choice' },
            h('input', { type: 'radio', name: 'new-event-visibility', checked: draft.visibility === id, onChange: () => { draft.visibility = id; } }),
            h('span', {}, h('strong', {}, label), h('span', { class: 'settings-field__hint' }, hint))))),
        h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Anything guests should know? (optional)'),
          h('textarea', { class: 'input', rows: '3', placeholder: 'Bring a dish, buzz #4, dogs welcome…', onInput: (e) => { draft.notes = e.target.value; } }, draft.notes)),
      ];
    }
    // Preview: what guests will see.
    const gaps = missing();
    const preview = { ...draft, kind: 'event', allDay: false, endDate: draft.date };
    return [
      h('p', { class: 'settings-field__hint' }, 'This is what guests will see when they open your link.'),
      h('article', { class: 'new-event__preview', style: { '--event-color': colorValue(draft.color) } },
        eventCoverBanner(draft, 'new-event__preview-cover'),
        h('header', { class: 'event-page__hero new-event__preview-hero' },
          h('span', { class: 'new-event__preview-emoji', 'aria-hidden': 'true' }, draft.emoji),
          h('h2', { class: 'event-page__title' }, draft.title || 'Untitled event'),
          h('p', { class: 'event-page__when' }, whenLabel(preview))),
        h('div', { class: 'new-event__preview-body' },
          h('div', { class: 'rsvp new-event__preview-rsvp', 'aria-hidden': 'true' }, ['👍 Going', '🤔 Maybe', '😢 Can’t go'].map((label) => h('span', { class: 'rsvp__button' }, label))),
          draft.location ? h('p', {}, icon('pin', 14), ` ${draft.location}${draft.area ? ` · ${placeById(draft.area)?.name ?? ''}` : ''}`) : null,
          h('p', {}, avatar(me, 22), ` Hosted by ${me.name}`),
          draft.notes ? h('p', { class: 'event-page__notes' }, draft.notes) : null)),
      gaps.length
        ? h('p', { class: 'new-event__missing', role: 'status' }, icon('flag', 14), ` Missing: ${gaps.join(', ')}. `, h('button', { type: 'button', class: 'link-button', onClick: () => { step = gaps.includes('a place') && gaps.length === 1 ? 2 : 0; draw(); } }, 'Fix it'))
        : h('p', { class: 'new-event__ready' }, icon('check', 14), ' Everything guests need is there.'),
    ];
  }

  function create() {
    const event = applyBundle(createEvent({
      kind: 'event', title: draft.title.trim(), date: draft.date, allDay: false, time: draft.time, endTime: draft.endTime,
      location: draft.location.trim(), area: draft.area, color: draft.color, emoji: draft.emoji, notes: draft.notes.trim(), tags: draft.tags, cover: draft.cover,
      visibility: draft.visibility, createdBy: me.id, rsvps: { [me.id]: 'going' }, attendeeIds: [me.id], repeat: draft.repeat,
    }), BUNDLES.find((b) => b.id === draft.bundle));
    const group = groups.find((g) => g.id === draft.host);
    changeState((state) => {
      if (group) {
        const calendar = state.spaces.find((s) => s.id === group.id).modules.find((m) => m.type === 'calendar');
        calendar.data = { ...calendar.data, events: [...(calendar.data.events ?? []), event] };
        return;
      }
      const home = getPersonalSpace();
      let calendar = home.modules.find((m) => m.type === 'calendar') ?? home.modules.find((m) => m.type === 'events' && m.data?.ownEvents);
      if (!calendar) {
        calendar = { id: makeId('mod'), type: 'calendar', title: 'My calendar', span: 6, rows: 12, data: { events: [] } };
        home.modules.push(calendar);
      }
      calendar.data = { ...calendar.data, events: [...(calendar.data.events ?? []), event] };
    }, 'layout');
    goTo(`${eventHref(event.id)}`);
    showToast(draft.visibility === 'public' ? 'Your event is live. Share the link to get people there.' : 'Your event is ready. Copy the link below and send it to your guests.');
  }

  const nextButton = h('button', { type: 'button', class: 'button button--primary' });
  const root = h('div', { class: 'new-event' });

  function draw() {
    const isLast = step === STEPS.length - 1;
    nextButton.textContent = isLast ? 'Create and get the link' : 'Next';
    nextButton.disabled = isLast ? missing().some((m) => m !== 'a place') : !canContinue();
    nextButton.onclick = isLast ? create : () => { step += 1; draw(); };
    replaceChildren(root,
      h('ol', { class: 'new-event__progress', 'aria-label': 'Steps' }, STEPS.map((label, i) => h('li', {
        class: `new-event__dot${i === step ? ' is-current' : ''}${i < step ? ' is-done' : ''}`, 'aria-current': i === step ? 'step' : null, title: label,
      }, h('span', { class: 'visually-hidden' }, label)))),
      h('p', { class: 'new-event__count' }, `Step ${step + 1} of ${STEPS.length}`),
      h('h2', { class: 'new-event__question' }, STEPS[step]),
      h('div', { class: 'new-event__body' }, stepBody()),
      h('div', { class: 'form-row new-event__nav' },
        step > 0 ? h('button', { type: 'button', class: 'button button--quiet', onClick: () => { step -= 1; draw(); } }, 'Back') : h('a', { class: 'button button--quiet', href: '#' }, 'Cancel'),
        nextButton));
    root.querySelector('input, button.new-event__choice')?.focus?.({ preventScroll: true });
  }

  replaceChildren(container,
    h('header', { class: 'settings-page__header' },
      h('h1', { class: 'settings-page__title' }, 'Plan an event'),
      h('p', { class: 'settings-page__subtitle' }, 'Six quick steps, and you’ll have a link to send.')),
    h('section', { class: 'settings-section' }, root));
  draw();
}

