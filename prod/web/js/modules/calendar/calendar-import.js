// @ts-check
/**
 * calendar-import.js — bring a calendar in from, or take it out to, other
 * calendar apps, as an .ics file (the format Google Calendar, Apple
 * Calendar, and Outlook all export and import).
 *
 *   parseIcs(text)  → [{ title, date, endDate, time, endTime, allDay, location, notes, repeat }]
 *   toIcs(events, calendarName) → text of an .ics file
 *
 * What comes in: each event's title, start and end (timed or all-day),
 * place, notes, and simple repeats (every day, week, or month). Times
 * given in UTC are turned into this device's time; times with a named
 * time zone are kept as written. Everything arrives as a calendar entry
 * (no guests): turn one into an event to collect RSVPs.
 */

const pad = (n) => String(n).padStart(2, '0');
const unescape = (text) => text.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const escape = (text) => String(text ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** '20261114' or '20261114T190000' or '…Z' → { date: '2026-11-14', time: '19:00' | '' } */
function readDate(value) {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, , utc] = match;
  if (h == null) return { date: `${y}-${mo}-${d}`, time: '' };
  if (!utc) return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
  const local = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
  return { date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`, time: `${pad(local.getHours())}:${pad(local.getMinutes())}` };
}

const dayBefore = (key) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function parseIcs(text) {
  // Long lines are folded onto following lines that start with a space: join them back.
  const lines = String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  /** @type {any} */ let current = null; // the VEVENT being read; fields are added as they come
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') { if (current?.start) events.push(current); current = null; continue; }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const [name, ...params] = line.slice(0, colon).split(';');
    const value = line.slice(colon + 1);
    const key = name.toUpperCase();
    if (key === 'SUMMARY') current.title = unescape(value);
    else if (key === 'LOCATION') current.location = unescape(value);
    else if (key === 'DESCRIPTION') current.notes = unescape(value);
    else if (key === 'DTSTART') { current.start = readDate(value); current.allDay = params.some((p) => p.toUpperCase() === 'VALUE=DATE') || !value.includes('T'); }
    else if (key === 'DTEND') current.end = readDate(value);
    else if (key === 'RRULE') current.repeat = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly' }[/FREQ=([A-Z]+)/.exec(value)?.[1]] ?? 'none';
  }
  return events.map((e) => {
    const end = e.end ?? e.start;
    // An all-day event's end date is the day after its last day.
    const endDate = e.allDay && e.end && end.date > e.start.date ? dayBefore(end.date) : end.date;
    return {
      title: e.title?.trim() || 'Untitled',
      date: e.start.date,
      endDate: endDate >= e.start.date ? endDate : e.start.date,
      allDay: Boolean(e.allDay),
      time: e.allDay ? '' : e.start.time,
      endTime: e.allDay ? '' : end.time,
      location: e.location ?? '',
      notes: e.notes ?? '',
      repeat: e.repeat ?? 'none',
    };
  });
}

/**
 * @param {any[]} events  may also carry `url` (a link back to 3den) and `tentative` (a "maybe")
 * @param {string} [calendarName]
 * @param {{ refreshHours?: number }} [options]  for a subscribed feed: how often calendar apps should check again
 */
export function toIcs(events, calendarName = '3den', { refreshHours = 0 } = {}) {
  const stamp = (key, time) => `${key.replace(/-/g, '')}${time ? `T${time.replace(':', '')}00` : ''}`;
  const dayAfter = (key) => { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + 1); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//3den//Calendar//EN', `X-WR-CALNAME:${escape(calendarName)}`];
  if (refreshHours) lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${refreshHours}H`, `X-PUBLISHED-TTL:PT${refreshHours}H`);
  for (const event of events) {
    lines.push('BEGIN:VEVENT', `UID:${event.id}@3den`, `DTSTAMP:${now}`, `SUMMARY:${escape(event.title)}`);
    if (event.allDay || !event.time) lines.push(`DTSTART;VALUE=DATE:${stamp(event.date)}`, `DTEND;VALUE=DATE:${dayAfter(event.endDate || event.date)}`);
    else lines.push(`DTSTART:${stamp(event.date, event.time)}`, `DTEND:${stamp(event.endDate || event.date, event.endTime || event.time)}`);
    if (event.location) lines.push(`LOCATION:${escape(event.location)}`);
    if (event.notes) lines.push(`DESCRIPTION:${escape(event.notes)}`);
    if (event.repeat && event.repeat !== 'none') lines.push(`RRULE:FREQ=${event.repeat.toUpperCase()}`);
    if (event.url) lines.push(`URL:${event.url}`);
    if (event.tentative) lines.push('STATUS:TENTATIVE');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
