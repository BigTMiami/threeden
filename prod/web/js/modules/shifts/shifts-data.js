// @ts-check
/**
 * shifts-data.js — shifts: what they are and how they change.
 *
 * Data shape:
 *   {
 *     shifts: [{
 *       id, date: '2026-11-21', start: '08:30', end: '10:00',
 *       role: 'Setup', location: 'Pantry', spots: 3,
 *       memberIds: ['m-leo'],          ← who took it, in order
 *       notes: '',                     ← more about it: shown when you open the shift (Nov 20)
 *       seriesId: null,                ← set when it's one of a repeating series
 *       createdBy: 'm-leo',
 *     }],
 *     series: {                        ← repeating shifts (Nov 20)
 *       'series-x': {
 *         every: 'week' | '2weeks' | 'month',
 *         until: '' | '2027-03-01',    ← '' = keeps going
 *         through: '2027-01-15',       ← the last date made so far
 *         template: { start, end, role, location, spots, notes },
 *       },
 *     },
 *   }
 *
 * A repeating shift is stored as one shift per date, so each date has its
 * own sign-ups (and can be changed or deleted on its own). Dates are made
 * eight weeks ahead and topped up as time passes (extendSeries).
 */

import { makeId } from '../../ui/dom.js';
import { addDays, fromDateKey, toDateKey } from '../../utils/dates.js';

/** How far ahead a repeating shift's dates are made. */
export const SERIES_AHEAD_DAYS = 56;

export const REPEATS = [['none', 'Doesn’t repeat'], ['week', 'Every week'], ['2weeks', 'Every 2 weeks'], ['month', 'Every month']];
export const repeatLabel = (every) => (REPEATS.find(([v]) => v === every)?.[1] ?? '');

export function normalizeShift(shift) {
  return { location: '', notes: '', spots: 1, memberIds: [], seriesId: null, ...shift };
}

const clampSpots = (spots) => Math.max(1, Math.min(99, Number(spots) || 1));

export function createShift(fields) {
  return normalizeShift({ id: makeId('shift'), ...fields, spots: clampSpots(fields.spots) });
}

export const isFullShift = (shift) => shift.memberIds.length >= shift.spots;
export const openSpots = (shift) => Math.max(0, shift.spots - shift.memberIds.length);
export const findShift = (data, id) => { const s = (data.shifts ?? []).find((x) => x.id === id); return s ? normalizeShift(s) : null; };
export const seriesOf = (data, shift) => (shift?.seriesId ? data.series?.[shift.seriesId] ?? null : null);

/** Shifts on or after `from` and before `to` (date keys), sorted by date and start time. */
export function shiftsBetween(data, from, to) {
  return (data.shifts ?? []).map(normalizeShift)
    .filter((s) => s.date >= from && s.date < to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

/** { '2026-11-21': [shift, …], … } in date order. */
export function byDay(shifts) {
  const days = new Map();
  for (const shift of shifts) days.set(shift.date, [...(days.get(shift.date) ?? []), shift]);
  return days;
}

export function takeShift(data, shiftId, memberId) {
  return { ...data, shifts: data.shifts.map((s) => (s.id !== shiftId || s.memberIds.includes(memberId) || isFullShift(normalizeShift(s)) ? s : { ...s, memberIds: [...(s.memberIds ?? []), memberId] })) };
}

export function dropShift(data, shiftId, memberId) {
  return { ...data, shifts: data.shifts.map((s) => (s.id !== shiftId ? s : { ...s, memberIds: (s.memberIds ?? []).filter((id) => id !== memberId) })) };
}

/** Copy 7 days of shifts (from weekStart) a week later, nobody signed up yet. Skips any that already exist there. */
export function copyWeek(data, weekStart) {
  const source = shiftsBetween(data, weekStart, addDays(weekStart, 7));
  const target = shiftsBetween(data, addDays(weekStart, 7), addDays(weekStart, 14));
  const key = (s) => `${s.date}|${s.start}|${s.role}`;
  const existing = new Set(target.map(key));
  const copies = source.map((s) => ({ ...s, id: makeId('shift'), date: addDays(s.date, 7), memberIds: [], seriesId: null })).filter((s) => !existing.has(key(s)));
  return { data: { ...data, shifts: [...data.shifts, ...copies] }, added: copies.length };
}

// ─── Editing one shift ──────────────────────────────────────────────────────

const TEMPLATE_KEYS = ['start', 'end', 'role', 'location', 'spots', 'notes'];
const templateOf = (shift) => Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, shift[k]]));

/**
 * Save an edited shift. `scope` 'later' also changes the later dates of its
 * series (not their dates or sign-ups), and the series' template.
 */
export function updateShift(data, shiftId, fields, { scope = 'one' } = {}) {
  const shift = findShift(data, shiftId);
  if (!shift) return data;
  const clean = { ...fields, ...(fields.spots !== undefined ? { spots: clampSpots(fields.spots) } : {}) };
  const series = scope === 'later' ? seriesOf(data, shift) : null;
  const sameKeys = Object.fromEntries(Object.entries(clean).filter(([k]) => TEMPLATE_KEYS.includes(k)));
  return {
    ...data,
    shifts: data.shifts.map((s) => {
      if (s.id === shiftId) return { ...s, ...clean };
      if (series && s.seriesId === shift.seriesId && s.date > shift.date) return { ...s, ...sameKeys };
      return s;
    }),
    ...(series ? { series: { ...data.series, [shift.seriesId]: { ...series, template: { ...series.template, ...sameKeys } } } } : {}),
  };
}

/** Delete a shift; `scope` 'later' also deletes the later dates of its series, and stops it. */
export function deleteShift(data, shiftId, { scope = 'one' } = {}) {
  const shift = findShift(data, shiftId);
  if (!shift) return data;
  if (scope === 'later' && shift.seriesId) {
    const series = { ...(data.series ?? {}) };
    delete series[shift.seriesId];
    return { ...data, series, shifts: data.shifts.filter((s) => !(s.seriesId === shift.seriesId && s.date >= shift.date)) };
  }
  return { ...data, shifts: data.shifts.filter((s) => s.id !== shiftId) };
}

// ─── Repeating ──────────────────────────────────────────────────────────────

/** The next date after `date` for a repeat rule. "Every month" keeps the day (the 31st → the month's last day). */
export function nextDate(date, every) {
  if (every === 'week') return addDays(date, 7);
  if (every === '2weeks') return addDays(date, 14);
  const d = fromDateKey(date);
  const target = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return toDateKey(target);
}

/** Make the series' dates after `through`, up to `until` or SERIES_AHEAD_DAYS past today. */
function fillSeries(data, seriesId, today) {
  const series = data.series?.[seriesId];
  if (!series) return { data, added: 0 };
  const limit = [addDays(today, SERIES_AHEAD_DAYS), series.until].filter(Boolean).sort()[0];
  // A date that already has this shift (same start and name, e.g. one copied by hand) joins the series instead.
  const same = (s, date) => s.date === date && s.start === series.template.start && s.role === series.template.role;
  const copies = [];
  const joined = new Set();
  let through = series.through;
  let date = nextDate(series.through, series.every);
  while (date <= limit) {
    const existing = data.shifts.find((s) => same(s, date) && (!s.seriesId || s.seriesId === seriesId));
    if (existing) joined.add(existing.id);
    else copies.push(normalizeShift({ id: makeId('shift'), ...series.template, date, memberIds: [], seriesId }));
    through = date;
    date = nextDate(date, series.every);
  }
  if (through === series.through) return { data, added: 0 };
  const shifts = data.shifts.map((s) => (joined.has(s.id) ? { ...s, seriesId } : s));
  return { data: { ...data, shifts: [...shifts, ...copies], series: { ...data.series, [seriesId]: { ...series, through } } }, added: copies.length + joined.size };
}

/**
 * Set how a shift repeats, from its date on. 'none' stops it: later dates
 * nobody has taken go; ones people took stay, on their own.
 */
export function setRepeat(data, shiftId, every, until = '', today) {
  let shift = findShift(data, shiftId);
  if (!shift) return data;
  const current = seriesOf(data, shift);
  if (current && current.every === every) {
    // Same rule: maybe a new end date. Drop dates past it; make any that are now missing.
    const series = { ...current, until };
    let next = { ...data, series: { ...data.series, [shift.seriesId]: series } };
    if (until) next = { ...next, shifts: next.shifts.filter((s) => !(s.seriesId === shift.seriesId && s.date > until && !(s.memberIds ?? []).length)) };
    return fillSeries(next, shift.seriesId, today).data;
  }
  let next = data;
  if (current) {
    // Leave the old series: later dates nobody took go, the rest stand alone.
    const oldId = shift.seriesId;
    const series = { ...(data.series ?? {}) };
    delete series[oldId];
    next = {
      ...data, series,
      shifts: data.shifts
        .filter((s) => !(s.seriesId === oldId && s.date > shift.date && !(s.memberIds ?? []).length))
        .map((s) => (s.seriesId === oldId ? { ...s, seriesId: null } : s)),
    };
    shift = { ...shift, seriesId: null };
  }
  if (every === 'none') return next;
  const seriesId = makeId('series');
  next = {
    ...next,
    shifts: next.shifts.map((s) => (s.id === shiftId ? { ...s, seriesId } : s)),
    series: { ...(next.series ?? {}), [seriesId]: { every, until, through: shift.date, template: templateOf(shift) } },
  };
  return fillSeries(next, seriesId, today).data;
}

/** Top up every series to SERIES_AHEAD_DAYS past today. → { data, added } */
export function extendSeries(data, today) {
  let next = data;
  let added = 0;
  for (const id of Object.keys(data.series ?? {})) {
    const result = fillSeries(next, id, today);
    next = result.data;
    added += result.added;
  }
  return { data: next, added };
}
