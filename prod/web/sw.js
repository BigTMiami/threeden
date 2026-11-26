/*
 * sw.js — 3den's service worker: phone (and desktop) notifications.
 *
 * - "push": a notification sent by 3den's server (Web Push). The payload is
 *   JSON: { title, body, href, tag }. Works with 3den closed; on an iPhone,
 *   once 3den is added to the Home Screen (iOS 16.4 and later).
 * - "message" { type: 'show', title, body, href, tag }: the open app asks for
 *   one (js/state/delivery.js). Phones only allow notifications from a
 *   service worker, so even the prototype's local ones come through here.
 * - "notificationclick": opens 3den at the notification's page, reusing an
 *   open window when there is one.
 *
 * Prototype: there's no server yet, so nothing arrives by "push"; see
 * HANDOFF.md ("Before the backend") for what the server needs.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

function show({ title = '3den', body = '', href = null, tag = undefined } = {}) {
  return self.registration.showNotification(title, {
    body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { href },
  });
}

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() ?? '' }; }
  event.waitUntil(show(data));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'show') event.waitUntil(show(event.data));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = event.notification.data?.href ?? '';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).pathname.endsWith('index.html') || new URL(w.url).pathname.endsWith('/'));
    if (open) {
      await open.focus();
      if (href) open.postMessage({ type: 'open', href });
      return;
    }
    await self.clients.openWindow(`index.html${href || ''}`);
  })());
});
