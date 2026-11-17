// @ts-check
/**
 * sample-calendar.js — a made-up outside calendar (.ics text), relative to
 * today: work on Mondays and Wednesdays, the dentist on Thursday, brunch on
 * Saturday. Leo starts with it connected (Account → Calendars), and anyone
 * can add it with "Try it with a sample calendar".
 */

import { todayKey, addDays } from '../../utils/dates.js';

/** A sample calendar for trying this out: a work week, a dentist visit, and a brunch. */
export function sampleIcs() {
  const today = todayKey();
  const day = (offset) => addDays(today, offset).replace(/-/g, '');
  const weekday = new Date(`${today}T12:00`).getDay();
  // The next Monday, Wednesday, Thursday, and Saturday.
  const next = (target) => day(((target - weekday + 7) % 7) || 7);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//3den//sample//EN',
    'BEGIN:VEVENT', 'UID:s1', 'SUMMARY:Work', `DTSTART:${next(1)}T090000`, `DTEND:${next(1)}T170000`, 'RRULE:FREQ=WEEKLY', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:s2', 'SUMMARY:Work', `DTSTART:${next(3)}T090000`, `DTEND:${next(3)}T170000`, 'RRULE:FREQ=WEEKLY', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:s3', 'SUMMARY:Dentist', `DTSTART:${next(4)}T140000`, `DTEND:${next(4)}T150000`, 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:s4', 'SUMMARY:Brunch at Mom’s', `DTSTART:${next(6)}T100000`, `DTEND:${next(6)}T120000`, 'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
