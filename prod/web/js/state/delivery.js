// @ts-check
/**
 * delivery.js — getting notifications to people when 3den isn't open:
 * notifications on this device, and email.
 *
 *   prefsOf(member)            → { push, pushScope: 'needs' | 'all', email: 'weekly' | 'daily' | 'instant' | 'off' }
 *   setDeliveryPrefs(id, {…})
 *   askForDeviceNotifications() → Promise<'granted' | 'denied' | 'unsupported'>
 *   startDelivery()            → watches for new notifications and shows them on the device
 *   weeklyDigest(member)       → what the weekly email would say
 *
 * The rule: only interrupt people for things that need them (NEEDS_YOU:
 * an invitation, a mention, something assigned, a change to an event,
 * a friend request, a report). Group news and new followers wait in the
 * bell and the weekly email unless someone asks for everything.
 *
 * Phones: notifications go through the service worker (sw.js), because
 * phones only allow them from one. On an iPhone that needs 3den added to
 * the Home Screen first (installHelp() says how). Each group can be set to
 * Everything, Only things that need me, or Nothing (prefs.groups), and
 * quiet hours hold notifications overnight (they wait in the bell).
 *
 * Prototype notes: device notifications are real (the browser's own, shown
 * when this window isn't in front), but they only arrive while 3den is
 * open in some window. With a server, the same notifications go out by Web
 * Push (subscribeToPush; VAPID_PUBLIC_KEY is empty until there is one) and
 * arrive with 3den closed. Emails aren't sent: the weekly one can be
 * previewed, and notifications that would be emailed are marked `emailed`.
 */

import { changeState, getState, getCurrentUser, getGroupsByRecentVisit, subscribe } from './store.js';
import { needsYou, upcomingEventsIn, groupUpdates } from '../modules/dashboard/dashboard-data.js';
import { rsvpOf } from '../modules/calendar/calendar-data.js';
import { addDays, todayKey } from '../utils/dates.js';

export const NEEDS_YOU = ['mention', 'assigned', 'declined', 'invited', 'event', 'followup', 'friend', 'report', 'reminder'];

export const EMAIL_CHOICES = [
  { id: 'weekly', label: 'A weekly email', hint: 'Sunday evening: what needs you, and the week ahead' },
  { id: 'daily', label: 'A daily email', hint: 'Only on days when something needs you' },
  { id: 'instant', label: 'As it happens', hint: 'One email for each thing that needs you' },
  { id: 'off', label: 'No emails', hint: '' },
];

/**
 * @returns {{ push: boolean, pushScope: 'needs' | 'all', email: string, groups: Record<string, 'all' | 'needs' | 'off'>,
 *   quiet: { on: boolean, from: string, to: string }, askedPush?: number }}
 */
export function prefsOf(member) {
  return {
    push: false, pushScope: 'needs', email: member?.email ? 'weekly' : 'off', groups: {}, quiet: { on: false, from: '22:00', to: '08:00' },
    ...member?.delivery,
  };
}

/** Per-group choices for phone notifications. */
export const GROUP_PUSH_CHOICES = [
  { id: 'default', label: 'Same as above' },
  { id: 'all', label: 'Everything' },
  { id: 'needs', label: 'Only things that need me' },
  { id: 'off', label: 'Nothing' },
];

/** Is it quiet hours now? ("22:00" to "08:00" wraps past midnight.) */
export function inQuietHours(prefs, now = new Date()) {
  if (!prefs.quiet?.on) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const at = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const from = at(prefs.quiet.from);
  const to = at(prefs.quiet.to);
  return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

/**
 * Should this notification reach the device? Group settings win over the
 * overall one; quiet hours hold everything but reminders for today.
 */
export function shouldPush(prefs, n, now = new Date()) {
  if (!prefs.push) return false;
  const scope = (n.spaceId && prefs.groups?.[n.spaceId]) || prefs.pushScope;
  if (scope === 'off') return false;
  if (scope === 'needs' && !NEEDS_YOU.includes(n.kind)) return false;
  if (inQuietHours(prefs, now) && n.kind !== 'reminder') return false;
  return true;
}

export function setDeliveryPrefs(memberId, changes) {
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    member.delivery = { ...prefsOf(member), ...changes };
  }, 'account');
}

/** Would this kind be emailed straight away to this person? (notifications.js marks it.) */
export function emailsNow(member, kind) {
  return Boolean(member?.email) && prefsOf(member).email === 'instant' && NEEDS_YOU.includes(kind);
}

export const deviceSupport = () => (typeof Notification === 'function' ? Notification.permission : 'unsupported');

export async function askForDeviceNotifications() {
  if (typeof Notification !== 'function') return 'unsupported';
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission === 'granted') subscribeToPush();
  return Notification.permission;
}

// ─── The service worker (sw.js) ──────────────────────────────────────────────

/** @type {ServiceWorkerRegistration | null} */
let registration = null;

/** Register sw.js (quietly does nothing where service workers aren't allowed, like some previews). */
export async function registerWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
  try {
    registration = await navigator.serviceWorker.register('sw.js');
    // A tap on a notification while 3den is open: go to its page here.
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'open' && event.data.href) window.location.hash = event.data.href;
    });
  } catch { registration = null; }
  return registration;
}

/** The server's public key for Web Push. Empty in the prototype: there's no server to send from. */
/** @type {string} */
export const VAPID_PUBLIC_KEY = '';

/** Ask the browser for a push address and keep it for the server (member.delivery.pushSubscription). */
export async function subscribeToPush() {
  if (!VAPID_PUBLIC_KEY || !registration?.pushManager) return null;
  try {
    const key = Uint8Array.from(atob(VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const me = getCurrentUser();
    if (me) setDeliveryPrefs(me.id, { pushSubscription: subscription.toJSON() });
    return subscription;
  } catch { return null; }
}

/** Show one on the device (if allowed). Returns whether it was shown. Phones need the service worker. */
export function showOnDevice(text, href = null) {
  if (deviceSupport() !== 'granted') return false;
  if (registration?.active) {
    registration.active.postMessage({ type: 'show', title: '3den', body: text, href, tag: text });
    return true;
  }
  try {
    const note = new Notification('3den', { body: text, icon: 'icons/icon-192.png', tag: text });
    note.onclick = () => { window.focus(); if (href) window.location.hash = href; note.close(); };
    return true;
  } catch { return false; }
}

/**
 * Offer phone notifications once, at a moment they'd help (saying Going to
 * an event): only if they're off, the browser hasn't been asked, and we
 * haven't offered before. Marks it offered.
 */
export function offerPushOnce(me) {
  if (!me || me.isGuest) return false;
  const prefs = prefsOf(me);
  if (prefs.push || prefs.askedPush || deviceSupport() !== 'default') return false;
  setDeliveryPrefs(me.id, { askedPush: Date.now() });
  return true;
}

/** Turn phone notifications on (asking the browser), with a toast saying how it went. */
export async function turnOnPush(me) {
  const answer = await askForDeviceNotifications();
  setDeliveryPrefs(me.id, { push: answer === 'granted' });
  return answer;
}

// ─── Installing 3den on a phone ──────────────────────────────────────────────

/** Android and desktop Chrome offer "Install"; we keep the offer for a button. */
let installOffer = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installOffer = event; });
}
export const canOfferInstall = () => Boolean(installOffer);
export async function offerInstall() {
  if (!installOffer) return false;
  installOffer.prompt();
  const { outcome } = await installOffer.userChoice;
  installOffer = null;
  return outcome === 'accepted';
}

/** Is 3den running from the Home Screen (installed)? */
export const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;

/**
 * What this device needs before phone notifications work:
 *   'iphone'   an iPhone or iPad in Safari: add to Home Screen first
 *   null       nothing; notifications can be turned on here
 */
export function installHelp() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !isInstalled() ? 'iphone' : null;
}

/** New notifications for whoever's signed in go to the device, when this window isn't in front. */
export function startDelivery() {
  registerWorker();
  const startedAt = Date.now();
  const shown = new Set();
  subscribe('notifications', () => {
    const me = getCurrentUser();
    if (!me || me.isGuest) return;
    const prefs = prefsOf(me);
    if (!prefs.push) return;
    for (const n of getState().notifications ?? []) {
      if (n.recipientId !== me.id || n.read || n.createdAt < startedAt || shown.has(n.id)) continue;
      shown.add(n.id);
      if (!shouldPush(prefs, n)) continue; // group settings, needs-you only, quiet hours
      if (document.visibilityState === 'visible' && document.hasFocus()) continue; // they can already see the bell
      showOnDevice(n.text, n.href ?? (n.moduleId ? `#module-${n.moduleId}` : n.spaceId ? `#space-${n.spaceId}` : null));
    }
  });
}

/**
 * The weekly email: { needs: [{ text, href }], week: [{ date, event, space, going }], groups: [{ space, line }] }
 */
export function weeklyDigest(me) {
  const needing = needsYou(me);
  const needs = [
    ...needing.invites.map(({ space }) => ({ text: `You’re invited to join ${space.name}`, href: '#groups' })),
    ...needing.rsvps.slice(0, 5).map(({ event, space }) => ({ text: `${space.name} is waiting for your answer: ${event.title}`, href: `#event-${event.id}` })),
    ...needing.joinRequests.map(({ space, count }) => ({ text: `${count} ${count === 1 ? 'person wants' : 'people want'} to join ${space.name}`, href: `#settings-${space.id}` })),
    ...(needing.unreadMessages ? [{ text: `${needing.unreadMessages} unread ${needing.unreadMessages === 1 ? 'message' : 'messages'}`, href: '#messages' }] : []),
  ];
  const until = addDays(todayKey(), 7);
  const week = getGroupsByRecentVisit().flatMap(upcomingEventsIn)
    .filter(({ date }) => date <= until)
    .filter(({ event }) => event.visibility !== 'invite' || event.inviteeIds.includes(me.id) || event.createdBy === me.id)
    .map((occurrence) => ({ ...occurrence, going: occurrence.event.createdBy === me.id ? 'going' : rsvpOf(occurrence.event, me.id) }))
    .filter(({ going }) => going !== 'no')
    .slice(0, 8);
  const groups = groupUpdates(me)
    .map((u) => {
      const parts = [
        u.newPosts ? `${u.newPosts} ${u.newPosts === 1 ? 'announcement' : 'announcements'}` : null,
        u.newThreads ? `${u.newThreads} new ${u.newThreads === 1 ? 'thread' : 'threads'}` : null,
        u.newFeedPosts ? `${u.newFeedPosts} new ${u.newFeedPosts === 1 ? 'post' : 'posts'}` : null,
        u.unreadChat ? `${u.unreadChat} unread in chat` : null,
      ].filter(Boolean);
      return parts.length ? { space: u.space, line: parts.join(', ') } : null;
    })
    .filter(Boolean)
    .slice(0, 6);
  return { needs, week, groups };
}
