// @ts-check
/**
 * shifts-data.js — volunteer shifts: what they are and how they change.
 *
 * Data shape:
 *   {
 *     shifts: [{
 *       id, date: '2026-11-21', start: '08:30', end: '10:00',
 *       role: 'Setup', location: 'Pantry', spots: 3,
 *       memberIds: ['m-leo'],          ← who took it, in order
 *       notes: '',
 *     }],
 *   }
 */

import { makeId } from '../../ui/dom.js';
import { addDays } from '../../utils/dates.js';

export function normalizeShift(shift) {
  return { location: '', notes: '', spots: 1, memberIds: [], ...shift };
}

export function createShift(fields) {
  return normalizeShift({ id: makeId('shift'), ...fields, spots: Math.max(1, Math.min(99, Number(fields.spots) || 1)) });
}

export const isFullShift = (shift) => shift.memberIds.length >= shift.spots;
export const openSpots = (shift) => Math.max(0, shift.spots - shift.memberIds.length);

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
  const copies = source.map((s) => ({ ...s, id: makeId('shift'), date: addDays(s.date, 7), memberIds: [] })).filter((s) => !existing.has(key(s)));
  return { data: { ...data, shifts: [...data.shifts, ...copies] }, added: copies.length };
}

