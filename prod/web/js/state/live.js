// @ts-check
/**
 * live.js — who else has this page open right now.
 *
 *   ● Maya is here too          (a small pill in the corner of the page)
 *
 * Each window says "I'm on this page, as this person" every few seconds
 * over the same BroadcastChannel the store uses for live changes
 * (js/state/store.js, "Live between windows"); a window that hasn't spoken
 * for ten seconds is gone. With a server this becomes real presence
 * between devices; here it works between windows of one browser.
 *
 *   startPresence()   called once from main.js
 */

import { h, replaceChildren } from '../ui/dom.js';
import { getCurrentUser, getMember, isGuestBrowsing } from './store.js';

const BEAT_MS = 3000;
const GONE_MS = 10000;
const tabId = Math.random().toString(36).slice(2);
const others = new Map(); // tabId → { userId, hash, at }

export function startPresence() {
  if (typeof BroadcastChannel !== 'function') return;
  const channel = new BroadcastChannel('3den-live');
  const pill = h('div', { class: 'presence-pill', role: 'status', hidden: true });
  document.body.append(pill);

  const page = () => window.location.hash.split('~')[0];
  const say = (type = 'here') => {
    const me = getCurrentUser();
    if (!me || isGuestBrowsing()) return;
    channel.postMessage({ type, tabId, userId: me.id, hash: page() });
  };

  function draw() {
    const now = Date.now();
    const me = getCurrentUser();
    for (const [id, other] of others) if (now - other.at > GONE_MS) others.delete(id);
    const here = [...new Set([...others.values()].filter((o) => o.hash === page() && o.userId !== me?.id).map((o) => o.userId))]
      .map(getMember).filter(Boolean);
    pill.hidden = here.length === 0;
    if (!here.length) return;
    const names = here.map((m) => m.name.split(' ')[0]);
    const text = names.length === 1 ? `${names[0]} is here too` : names.length === 2 ? `${names[0]} and ${names[1]} are here too` : `${names[0]}, ${names[1]}, and ${names.length - 2} more are here too`;
    replaceChildren(pill, h('span', { class: 'presence-pill__dot', 'aria-hidden': 'true' }), text);
  }

  channel.addEventListener('message', (event) => {
    const message = event.data;
    if (!message?.tabId || message.tabId === tabId) return;
    if (message.type === 'here') others.set(message.tabId, { userId: message.userId, hash: message.hash, at: Date.now() });
    if (message.type === 'gone') others.delete(message.tabId);
    if (message.type === 'here' || message.type === 'gone') draw();
  });
  window.addEventListener('hashchange', () => { say(); draw(); });
  window.addEventListener('pagehide', () => say('gone'));
  setInterval(() => { say(); draw(); }, BEAT_MS);
  say();
}
