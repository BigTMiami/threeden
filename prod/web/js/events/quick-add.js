// @ts-check
/**
 * quick-add.js — an event typed in plain words.
 *
 *   parseQuickEvent('Potluck Sat 6pm at Grace’s')
 *     → { title: 'Potluck', date: '2026-11-21', time: '18:00', endTime: '20:00', location: 'Grace’s' }
 *
 * Understands:
 *   days    today, tonight, tomorrow, Monday … Sunday (and Mon, Tue, …),
 *           "next Friday", "Nov 21", "21 Nov", "November 21st", "11/21"
 *   times   6pm, 6:30pm, 6:30 pm, 18:00, noon, midnight; "6-8pm" or
 *           "6pm to 8pm" sets the end too (otherwise it's two hours later)
 *   place   whatever comes after " at " or " @ " (when it isn't a time)
 *   title   what's left
 *
 * Anything it can't read is left out (null), so the form keeps its own
 * defaults for those. Nothing is guessed beyond the words typed: no tags.
 */

import { toDateKey, todayKey, addDays, fromDateKey } from '../utils/dates.js';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const dayIndex = (word) => DAYS.findIndex((d) => d.startsWith(word.toLowerCase()) && word.length >= 3);
const monthIndex = (word) => MONTHS.findIndex((m) => m.startsWith(word.toLowerCase()) && word.length >= 3);
const pad = (n) => String(n).padStart(2, '0');

/** "6pm" → "18:00", "6:30" (with a meridiem from elsewhere) … or null. */
function clock(hours, minutes, meridiem) {
  let h = Number(hours);
  const m = Number(minutes ?? 0);
  if (Number.isNaN(h) || h > 23 || m > 59) return null;
  const mer = meridiem?.toLowerCase();
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  if (!mer && h >= 1 && h <= 7) h += 12; // "dinner at 6": evenings are likelier than dawn
  return `${pad(h)}:${pad(m)}`;
}

/** The next date on a weekday (0 = Sunday): after today, or today itself if `allowToday`. */
export function nextWeekday(index, { allowToday = false } = {}) {
  const today = fromDateKey(todayKey());
  let ahead = (index - today.getDay() + 7) % 7;
  if (ahead === 0 && !allowToday) ahead = 7;
  return addDays(todayKey(), ahead);
}

export function parseQuickEvent(text) {
  let rest = ` ${String(text ?? '').replace(/\s+/g, ' ').trim()} `;
  const out = { title: '', date: null, time: null, endTime: null, location: null };
  const take = (re, fn) => {
    const m = rest.match(re);
    if (!m) return false;
    const ok = fn(m);
    if (ok !== false) rest = rest.replace(m[0], ' ');
    return ok !== false;
  };

  // Times: ranges first ("6-8pm", "6pm to 8pm", "18:00–20:00"), then a single time.
  take(/\s(?:from\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)?\s?(?:-|–|to|until|till)\s?(\d{1,2})(?::(\d{2}))?\s?(am|pm)?(?=\s)/i, (m) => {
    const mer = m[6] ?? m[3];
    const start = clock(m[1], m[2], m[3] ?? mer);
    const end = clock(m[4], m[5], mer);
    if (!start || !end || (!m[3] && !m[6] && !m[2] && !m[5])) return false;
    out.time = start; out.endTime = end;
    return true;
  });
  if (!out.time) {
    take(/\s(?:at\s|@\s?)?(noon|midnight)(?=\s)/i, (m) => { out.time = m[1].toLowerCase() === 'noon' ? '12:00' : '00:00'; });
  }
  if (!out.time) {
    take(/\s(?:at\s|@\s?)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i, (m) => { out.time = clock(m[1], m[2], m[3]); return out.time ? true : false; });
  }
  if (!out.time) {
    take(/\s(?:at\s|@\s?)?(\d{1,2}):(\d{2})(?=\s)/i, (m) => { out.time = clock(m[1], m[2], null); return out.time ? true : false; });
  }

  // Days.
  take(/\s(today|tonight)(?=\s)/i, (m) => { out.date = todayKey(); if (m[1].toLowerCase() === 'tonight' && !out.time) out.time = '19:00'; });
  if (!out.date) take(/\s(tomorrow|tmrw)(?=\s)/i, () => { out.date = addDays(todayKey(), 1); });
  if (!out.date) {
    take(/\s(?:on\s)?(next\s)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\.?(?=\s)/i, (m) => {
      const index = dayIndex(m[2]);
      if (index < 0) return false;
      // "Sat" can be today; "next Sat" never is.
      out.date = nextWeekday(index, { allowToday: !m[1] });
      return true;
    });
  }
  if (!out.date) {
    // "Nov 21", "November 21st", "21 Nov"
    take(/\s(?:on\s)?([a-z]{3,9})\.?\s(\d{1,2})(?:st|nd|rd|th)?(?=\s|,)/i, (m) => {
      const month = monthIndex(m[1]);
      if (month < 0) return false;
      out.date = futureDate(month, Number(m[2]));
      return Boolean(out.date);
    }) || take(/\s(?:on\s)?(\d{1,2})(?:st|nd|rd|th)?\s([a-z]{3,9})\.?(?=\s)/i, (m) => {
      const month = monthIndex(m[2]);
      if (month < 0) return false;
      out.date = futureDate(month, Number(m[1]));
      return Boolean(out.date);
    }) || take(/\s(?:on\s)?(\d{1,2})\/(\d{1,2})(?=\s)/, (m) => {
      out.date = futureDate(Number(m[1]) - 1, Number(m[2]));
      return Boolean(out.date);
    });
  }

  // Place: after " at " or " @ ".
  take(/\s(?:at|@)\s(.+?)\s*$/i, (m) => { const place = m[1].trim().replace(/[.,;]$/, ''); if (!place) return false; out.location = place; return true; });

  out.title = rest.replace(/\s+/g, ' ').replace(/^[\s,–-]+|[\s,–-]+$/g, '').trim();
  if (out.title) out.title = out.title[0].toUpperCase() + out.title.slice(1);
  if (out.time && !out.endTime) {
    const [hh, mm] = out.time.split(':').map(Number);
    out.endTime = `${pad((hh + 2) % 24)}:${pad(mm)}`;
  }
  return out;
}

/** The next time `month`/`day` comes around (this year, or next if it's past). */
function futureDate(month, day) {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const today = fromDateKey(todayKey());
  let date = new Date(today.getFullYear(), month, day);
  if (date.getMonth() !== month) return null;
  if (toDateKey(date) < todayKey()) date = new Date(today.getFullYear() + 1, month, day);
  return toDateKey(date);
}
