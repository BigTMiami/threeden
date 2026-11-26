// @ts-check
/**
 * reminders.js — "remind me": a nudge before an event or when a task is due.
 *
 *   setEventReminder(memberId, event, lead)   lead: 'day' | '2h' | '1h' | null (off)
 *   setTaskReminder(memberId, task, moduleId, lead)  lead: 'morning' | 'day' | null
 *   reminderFor(memberId, refId)              → the reminder, or null
 *   startReminders()                          checks every 30 seconds; due ones become
 *                                             notifications (and so reach the device and
 *                                             email, following js/state/delivery.js)
 *   autoRemind(memberId, event)               saying Going sets "the day before", unless
 *                                             they already chose (member.reminderDefault = 'off' skips it)
 *
 * Saved on the member: member.reminders = [{ id, kind: 'event' | 'task', refId,
 *   moduleId, lead, at (ms), text, href, sent }]
 *
 * In the prototype a reminder fires only while 3den is open in a window
 * (the check runs in the page); a real one is sent by the server.
 */

import { changeState, getMember, getState } from './store.js';
import { notify } from './notifications.js';
import { makeId } from '../ui/dom.js';
import { formatTime, formatShortDate } from '../utils/dates.js';

const HOUR = 60 * 60 * 1000;

export const EVENT_LEADS = [
  { id: 'day', label: 'The day before (at 6pm)' },
  { id: '2h', label: '2 hours before' },
  { id: '1h', label: '1 hour before' },
];
export const TASK_LEADS = [
  { id: 'day', label: 'The day before (at 6pm)' },
  { id: 'morning', label: 'The morning it’s due (at 9am)' },
];

const at = (dateKey, time) => new Date(`${dateKey}T${time || '09:00'}:00`).getTime();

function eventTime(event, lead) {
  const start = at(event.date, event.time || '09:00');
  if (lead === 'day') { const d = new Date(`${event.date}T18:00:00`); d.setDate(d.getDate() - 1); return d.getTime(); }
  if (lead === '2h') return start - 2 * HOUR;
  if (lead === '1h') return start - HOUR;
  return null;
}

function taskTime(task, lead) {
  if (!task.due) return null;
  if (lead === 'morning') return at(task.due, '09:00');
  if (lead === 'day') { const d = new Date(`${task.due}T18:00:00`); d.setDate(d.getDate() - 1); return d.getTime(); }
  return null;
}

export const reminderFor = (memberId, refId) => getMember(memberId)?.reminders?.find((r) => r.refId === refId && !r.sent) ?? null;

function saveReminder(memberId, reminder) {
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    const rest = (member.reminders ?? []).filter((r) => r.refId !== reminder?.refId && !(r.sent && Date.now() - r.at > 7 * 24 * HOUR));
    member.reminders = reminder ? [...rest, reminder] : rest;
  }, 'person');
}

export function setEventReminder(memberId, event, lead) {
  if (!lead) { changeState((state) => { const m = state.members.find((x) => x.id === memberId); m.reminders = (m.reminders ?? []).filter((r) => r.refId !== event.id); }, 'person'); return null; }
  const when = eventTime(event, lead);
  const reminder = {
    id: makeId('rem'), kind: 'event', refId: event.id, lead, at: when, sent: false, href: `#event-${event.id}`,
    text: `Reminder: “${event.title}” ${lead === 'day' ? 'is tomorrow' : 'starts soon'}${event.time ? `, ${formatTime(event.time)}` : ''}${event.location ? ` · ${event.location}` : ''}`,
  };
  saveReminder(memberId, reminder);
  return reminder;
}

export function setTaskReminder(memberId, task, moduleId, lead) {
  if (!lead) { changeState((state) => { const m = state.members.find((x) => x.id === memberId); m.reminders = (m.reminders ?? []).filter((r) => r.refId !== task.id); }, 'person'); return null; }
  const when = taskTime(task, lead);
  if (when == null) return null;
  const reminder = {
    id: makeId('rem'), kind: 'task', refId: task.id, moduleId, lead, at: when, sent: false, href: `#module-${moduleId}`,
    text: `Reminder: “${task.text}” is due ${lead === 'day' ? 'tomorrow' : 'today'} (${formatShortDate(task.due)})`,
  };
  saveReminder(memberId, reminder);
  return reminder;
}

/** Going to an event: remind the day before, unless they chose otherwise already. */
export function autoRemind(memberId, event) {
  const member = getMember(memberId);
  if (!member || member.reminderDefault === 'off' || reminderFor(memberId, event.id)) return null;
  const when = eventTime(event, 'day');
  if (when == null || when < Date.now()) return null;
  return setEventReminder(memberId, event, 'day');
}

let timer = null;
export function startReminders() {
  const tick = () => {
    const now = Date.now();
    const due = [];
    for (const member of getState().members) {
      for (const reminder of member.reminders ?? []) if (!reminder.sent && reminder.at <= now) due.push([member.id, reminder]);
    }
    if (!due.length) return;
    changeState((state) => {
      for (const [memberId, reminder] of due) {
        const saved = state.members.find((m) => m.id === memberId).reminders.find((r) => r.id === reminder.id);
        if (saved) saved.sent = true;
      }
    });
    for (const [memberId, reminder] of due) {
      // Stale ones (the moment passed more than a day ago, e.g. 3den wasn't open) are dropped quietly.
      if (now - reminder.at > 24 * HOUR) continue;
      notify({ recipientIds: [memberId], actorId: null, kind: 'reminder', text: reminder.text, href: reminder.href, moduleId: reminder.moduleId ?? null, itemId: reminder.refId });
    }
  };
  tick();
  clearInterval(timer);
  timer = setInterval(tick, 30 * 1000);
}
