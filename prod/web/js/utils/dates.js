/**
 * dates.js — small date helpers.
 *
 * Dates are stored as 'YYYY-MM-DD' strings ("date keys") in local time, so
 * an event on the 14th stays on the 14th no matter the time zone.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Turn a Date into 'YYYY-MM-DD' (local time). */
export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Turn 'YYYY-MM-DD' back into a Date at local midnight. */
export function fromDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayKey() {
  return toDateKey(new Date());
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** 'Sunday' (or 'Sun' with short = true). 0 = Sunday. */
export function weekdayName(dayIndex, short = false) {
  const name = WEEKDAY_NAMES[dayIndex];
  return short ? name.slice(0, 3) : name;
}

/** The date key `days` after `key` (negative = before). */
export function addDays(key, days) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** The date key `months` after `key`, keeping the day of the month where possible. */
export function addMonths(key, months) {
  const date = fromDateKey(key);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, daysInMonth));
  return toDateKey(date);
}

/** The Sunday on or before `key` (weeks start on Sunday). */
export function startOfWeek(key) {
  return addDays(key, -fromDateKey(key).getDay());
}

/** The first day of `key`'s month. */
export function startOfMonth(key) {
  return `${key.slice(0, 8)}01`;
}

/** Whole days from `fromKey` to `toKey` (positive if `toKey` is later). */
export function daysBetween(fromKey, toKey) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((fromDateKey(toKey) - fromDateKey(fromKey)) / MS_PER_DAY);
}

/** 'Thursday, November 14' */
export function formatLongDate(key) {
  const date = fromDateKey(key);
  return `${WEEKDAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

export function monthName(monthIndex) {
  return MONTH_NAMES[monthIndex];
}

/** 'Nov 14' */
export function formatShortDate(key) {
  if (!key) return '';
  const date = fromDateKey(key);
  return `${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getDate()}`;
}

/** '19:00' → '7:00pm' */
export function formatTime(time) {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  const suffix = hours >= 12 ? 'pm' : 'am';
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, '0')}${suffix}`;
}

/** A friendly "2h ago" style label for a timestamp in milliseconds. */
export function timeAgo(timestamp) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
