// @ts-check
/**
 * group-suggestions.js — new groups start small (three modules from a
 * template) and grow when they need to. Under the group's name, people who
 * can edit the homepage see one suggestion at a time:
 *
 *   → Next: Three events planned. Add a calendar so everyone sees the month?  [Add a calendar]  ×
 *
 *   When this happens                         Suggest
 *   3 or more events and no calendar           a calendar
 *   a household with 3 or more people          a shared list
 *   5 or more people and no chat               a group chat
 *   two weeks old, no to-do list or board      a to-do list
 *   an event with people going has passed      Photos, to share pictures from it
 *
 * Only for groups started in 3den (space.createdAt; the demo's groups were
 * set up by hand). × means never for that one (space.dismissedSuggestions).
 *
 *   renderGroupSuggestion(space, me) → the line, or null
 */

import { nextStepLine } from '../onboarding/next-step.js';
import { showToast } from '../ui/toast.js';
import { addModule, changeState, getSpace } from '../state/store.js';
import { can } from '../state/permissions.js';
import { normalizeEvent } from '../modules/calendar/calendar-data.js';
import { todayKey } from '../utils/dates.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const has = (space, ...types) => space.modules.some((m) => types.includes(m.type));
const eventsOf = (space) => space.modules.filter((m) => m.type === 'events' || m.type === 'calendar').flatMap((m) => (m.data?.events ?? []).map(normalizeEvent));

/** @type {{ id: string, when: (space: any) => boolean, text: (space: any) => string, label: string, type: string, title: string, data?: any }[]} */
export const GROUP_SUGGESTIONS = [
  {
    id: 'calendar', type: 'calendar', title: 'Calendar', label: 'Add a calendar',
    when: (s) => !has(s, 'calendar') && eventsOf(s).length >= 3,
    text: (s) => `${eventsOf(s).length} events planned. Add a calendar so everyone sees the month?`,
  },
  {
    // Tasks, opened on its Lists view (the List module until Nov 20).
    id: 'grocery', type: 'todo', title: 'Shared list', label: 'Add a shared list', data: { tasks: [], view: 'lists', items: [], history: [] },
    when: (s) => s.template === 'house' && !s.modules.some((m) => m.type === 'grocery' || (m.type === 'todo' && m.data?.view === 'lists')) && s.memberIds.length >= 3,
    text: () => 'Everyone’s in. Add a shared list for groceries and supplies?',
  },
  {
    id: 'chat', type: 'chat', title: 'Group chat', label: 'Add a chat',
    when: (s) => !has(s, 'chat') && s.memberIds.length >= 5,
    text: (s) => `${s.memberIds.length} people now. Add a group chat for quick back-and-forth?`,
  },
  {
    id: 'todo', type: 'todo', title: 'To-do', label: 'Add a to-do list',
    when: (s) => !has(s, 'todo', 'gantt') && Date.now() - s.createdAt >= 14 * DAY_MS,
    text: () => 'Add a to-do list for who’s doing what?',
  },
  {
    id: 'photos', type: 'gallery', title: 'Photos', label: 'Add Photos',
    when: (s) => !has(s, 'gallery', 'carousel') && Boolean(pastEventWithPeople(s)),
    text: (s) => `Add Photos so people can share pictures from “${pastEventWithPeople(s)?.title}”?`,
  },
];

function pastEventWithPeople(space) {
  const today = todayKey();
  return eventsOf(space).find((e) => e.date < today && Object.values(e.rsvps ?? {}).filter((a) => a === 'going').length >= 2) ?? null;
}

/** The first suggestion that applies to this group, or null. */
export function groupSuggestionFor(space, me) {
  if (!space?.createdAt || space.kind !== 'group' || !can(space, me.id, 'editHomepage')) return null;
  const dismissed = new Set(space.dismissedSuggestions ?? []);
  return GROUP_SUGGESTIONS.find((s) => !dismissed.has(s.id) && s.when(space)) ?? null;
}

function dismiss(spaceId, id) {
  changeState(() => {
    const space = getSpace(spaceId);
    space.dismissedSuggestions = [...new Set([...(space.dismissedSuggestions ?? []), id])];
  }, 'space');
}

export function renderGroupSuggestion(space, me) {
  const suggestion = groupSuggestionFor(space, me);
  if (!suggestion) return null;
  return nextStepLine({
    label: suggestion.text(space),
    ariaLabel: 'A suggestion for this group',
    action: {
      label: suggestion.label,
      run: () => {
        const module = addModule(suggestion.type, undefined, { title: suggestion.title });
        if (suggestion.data) {
          changeState(() => {
            const added = getSpace(space.id).modules.find((m) => m.id === module.id);
            if (added) added.data = { ...(added.data ?? {}), ...structuredClone(suggestion.data) };
          }, 'layout');
        }
        // A new calendar takes over the events Upcoming events kept on its own, so both show the same ones.
        if (suggestion.type === 'calendar') {
          changeState(() => {
            const fresh = getSpace(space.id);
            const calendar = fresh.modules.find((m) => m.id === module.id);
            for (const m of fresh.modules) {
              if (m.type !== 'events' || !m.data?.ownEvents) continue;
              calendar.data.events = [...(calendar.data.events ?? []), ...(m.data.events ?? [])];
              m.data = { ...m.data, events: [], ownEvents: false };
            }
          }, 'layout');
        }
        dismiss(space.id, suggestion.id); // done: don't suggest it again if they remove it later
        showToast(`Added ${suggestion.title} at the bottom of the page.`);
        requestAnimationFrame(() => document.querySelector(`[data-module-id="${module.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      },
    },
    onHide: () => dismiss(space.id, suggestion.id),
    hideLabel: 'No thanks',
    className: 'group-suggestion',
  });
}
