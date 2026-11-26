// @ts-check
/**
 * calendar-feed.js — your 3den events, as a calendar Google Calendar, Apple
 * Calendar, or Outlook can subscribe to. The other direction from
 * external-calendars.js (which brings their events in).
 *
 *   member.calendarFeed = { token, include: 'going' | 'going-maybe', createdAt }
 *
 * The address is secret: anyone with it can see what's on the feed, so
 * "Make a new address" swaps the token and the old one stops working.
 *
 * What's on it: everything on My calendar, plus group events you host or are
 * going to ("maybe" too, if you choose; they come in marked tentative). Each
 * event links back to its page on 3den.
 *
 * Prototype: there's no server, so the address can't be fetched yet. The same
 * calendar downloads as a file (feedIcs). When the backend comes, it serves
 * GET /cal/<token>.ics with feedIcs(member) and calendar apps refresh it about
 * hourly (REFRESH-INTERVAL in the file asks for 1 hour; Google checks less
 * often, up to a day).
 */

import { changeState, getMember } from './store.js';
import { otherCalendarLinks } from '../editor/linked-items.js';
import { toIcs } from '../modules/calendar/calendar-import.js';
import { rsvpOf, isHostOf } from '../modules/calendar/calendar-data.js';

/** Where the backend will serve feeds. */
export const FEED_HOST = '3den.example';

export const FEED_CHOICES = [
  { id: 'going', label: 'Events I’m going to or hosting' },
  { id: 'going-maybe', label: 'Those, and ones I said maybe to' },
];

/** @param {any} member */
export const feedOf = (member) => member?.calendarFeed ?? null;

function newToken() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Turn the feed on (making its secret address), or change what's on it. */
export function setFeed(memberId, changes = {}) {
  changeState(() => {
    const member = getMember(memberId);
    const before = member.calendarFeed ?? { token: newToken(), include: 'going', createdAt: Date.now() };
    member.calendarFeed = { ...before, ...changes };
  }, 'account');
  return feedOf(getMember(memberId));
}

/** A new secret address; calendars using the old one stop updating. */
export const resetFeed = (memberId) => setFeed(memberId, { token: newToken(), createdAt: Date.now() });

export function turnOffFeed(memberId) {
  changeState(() => { delete getMember(memberId).calendarFeed; }, 'account');
}

/** https://3den.example/cal/<token>.ics */
export const feedUrl = (feed) => `https://${FEED_HOST}/cal/${feed.token}.ics`;
/** webcal:// opens the subscribe screen in Apple Calendar (and most calendar apps). */
export const webcalUrl = (feed) => `webcal://${FEED_HOST}/cal/${feed.token}.ics`;

/** One-click links to each calendar app's "subscribe to this address" screen. */
export function subscribeLinks(feed) {
  return {
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(feed))}`,
    apple: webcalUrl(feed),
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl(feed))}&name=3den`,
  };
}

/**
 * The events on someone's feed: their own calendar entries, plus group
 * events they host or are going to (and maybe, if chosen).
 * @param {any} member
 */
export function feedEvents(member) {
  const feed = feedOf(member) ?? { include: 'going' };
  const withMaybe = feed.include === 'going-maybe';
  const seen = new Set();
  const events = [];
  for (const link of otherCalendarLinks(member.id, null)) {
    const event = link.item;
    if (!event?.date || seen.has(event.id)) continue;
    const own = link.spaceName === 'My calendar';
    const answer = rsvpOf(event, member.id);
    const host = isHostOf(event, member.id);
    if (!own && !host && answer !== 'going' && !(withMaybe && answer === 'maybe')) continue;
    seen.add(event.id);
    events.push({
      ...event,
      title: own ? event.title : `${event.title} (${link.spaceName})`,
      url: `https://${FEED_HOST}/#event-${event.id}`,
      tentative: !own && !host && answer === 'maybe',
    });
  }
  return events.sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`));
}

/** The calendar file the address serves (and the download, for now). */
export const feedIcs = (member) => toIcs(feedEvents(member), '3den', { refreshHours: 1 });
