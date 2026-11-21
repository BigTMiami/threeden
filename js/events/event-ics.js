// @ts-check
/**
 * event-ics.js — "Add to calendar" on an event page (Nov 21): a .ics file
 * the phone or computer opens in its own calendar app (Apple Calendar,
 * Google Calendar, Outlook). Saying Going already puts the event on your
 * 3den calendar; this puts it on the phone's too. The onboarding tour's
 * "On your calendar" card (B2) outlines it.
 *
 *   icsFor(event)            → the file's text
 *   addToCalendarButton(event) → <a class="button event-ics-button" download>
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const pad = (n) => String(n).padStart(2, '0');
/** 2026-11-21 + 14:30 → 20261121T143000 (floating local time); a date alone → 20261121 */
const stamp = (date, time) => (time ? `${date.replaceAll('-', '')}T${time.replace(':', '')}00` : date.replaceAll('-', ''));
const escape = (text) => String(text ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
/** The day after a YYYY-MM-DD date (an all-day event's DTEND is the next day). */
function nextDay(date) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @param {any} event */
export function icsFor(event) {
  const allDay = event.allDay ?? !event.time;
  const endDate = event.endDate || event.date;
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//3den//Events//EN', 'BEGIN:VEVENT',
    `UID:${event.id}@3den`,
    `DTSTAMP:${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`,
    allDay ? `DTSTART;VALUE=DATE:${stamp(event.date)}` : `DTSTART:${stamp(event.date, event.time)}`,
    allDay ? `DTEND;VALUE=DATE:${stamp(nextDay(endDate))}` : `DTEND:${stamp(endDate, event.endTime || event.time)}`,
    `SUMMARY:${escape(event.title)}`,
    event.location ? `LOCATION:${escape(event.location)}` : null,
    event.notes ? `DESCRIPTION:${escape(event.notes)}` : null,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return `${lines.join('\r\n')}\r\n`;
}

/** @param {any} event */
export function addToCalendarButton(event) {
  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsFor(event))}`;
  const file = `${String(event.title || 'event').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'event'}.ics`;
  return h('a', { class: 'button button--small event-ics-button', href, download: file, title: 'Opens in your phone’s or computer’s calendar' },
    icon('calendar', 14), ' Add to calendar');
}
