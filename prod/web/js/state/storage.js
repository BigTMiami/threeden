// @ts-check
/**
 * storage.js — saving and loading the app state.
 *
 * For this prototype, state lives in the browser, so each person sees their
 * own copy and it stays on their device only. Since Nov 15 it lives in
 * IndexedDB (room for hundreds of megabytes) rather than localStorage
 * (about 5 MB), so the sample data can be as big as it needs to be.
 *
 * Everything that touches storage goes through this file. When 3den gets a
 * real backend, replace these functions with API calls and the rest of the
 * app does not need to change.
 *
 *   loadState()          the state saved when the page opened, or null (instant: read before anything draws)
 *   readSavedState()     the newest saved state (another window may have saved since), as a promise
 *   saveState(state, onSaved?)   save it; returns what was saved, as text; onSaved runs once it's written
 *   clearSavedState()    forget it, so the next load starts from the sample data
 *   savedSize()          how big the last save was, in characters
 *
 * How it opens: this module waits for IndexedDB before the app starts (a
 * top-level await, so every module that imports the store waits too, by
 * a few milliseconds), then hands out the state synchronously.
 *
 * Clearing localStorage still starts fresh, the way it always has (tests and
 * "clear site data" rely on it): each save leaves a matching token in
 * localStorage, and a saved state without its token is thrown away. A save
 * from before the switch (in localStorage) is moved over once. Where
 * IndexedDB isn't available, it falls back to localStorage.
 *
 * Since Nov 16 there's one save slot for good: updates no longer throw your
 * data away. A save from an older version is brought up to date when it
 * loads (js/state/upgrade.js: new sample content is added around what you
 * made). The first time, the save from the old versioned slot
 * ('3den.homepage-prototype.v67' and earlier) is moved into it.
 */

const STORAGE_KEY = '3den.homepage-prototype';
const OLD_KEY_PREFIX = '3den.homepage-prototype.';
const TOKEN_KEY = '3den.saved-token';
const DB_NAME = '3den';
const STORE = 'state';

let lastSize = 0;
// Saves go out one at a time; if several come in while one is being written, only the newest is written next.
let writing = false;
/** @type {{ json: string, callbacks: Function[] } | null} */
let pending = null;
/** Waiting for the writes in flight to finish (readSavedState reads after them). */
let idleWaiters = [];

// ─── IndexedDB, in promises ──────────────────────────────────────────────────

/** @returns {Promise<IDBDatabase | null>} */
function openDb() {
  return new Promise((resolve) => {
    try {
      if (!window.indexedDB) { resolve(null); return; }
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** Run one request in a transaction; resolves with its result (or null on failure). */
function run(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    let result = null;
    if (request) request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const tokenNow = () => { try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; } };

const dbPromise = openDb();
const db = await dbPromise;

/** Read what's saved, checking its token; moves an old localStorage save over. */
/** The version number in an old slot's name ('3den.homepage-prototype.v67' → 67), or -1. */
const versionOf = (key) => Number(/\.v(\d+)$/.exec(key)?.[1] ?? -1);

/** Of the old versioned slots, the newest (its key), or null. */
const newestOld = (keys) => keys.filter((key) => key.startsWith(OLD_KEY_PREFIX) && versionOf(key) >= 0)
  .sort((a, b) => versionOf(b) - versionOf(a))[0] ?? null;

async function readInitial() {
  // localStorage (no IndexedDB, or an old save from before Nov 15): the newest versioned save moves to the one slot.
  try {
    const keys = Object.keys(window.localStorage);
    const oldKey = newestOld(keys);
    if (oldKey && !window.localStorage.getItem(STORAGE_KEY)) {
      const raw = window.localStorage.getItem(oldKey);
      if (raw && !db) window.localStorage.setItem(STORAGE_KEY, raw);
      else if (raw) window.localStorage.setItem(`${STORAGE_KEY}.moving`, raw);
    }
    for (const key of keys) if (key.startsWith(`${OLD_KEY_PREFIX}v`)) window.localStorage.removeItem(key);
  } catch { /* no localStorage */ }
  if (!db) {
    try { const raw = window.localStorage.getItem(STORAGE_KEY); lastSize = raw?.length ?? 0; return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  try {
    const keys = /** @type {string[]} */ (await run(db, 'readonly', (store) => store.getAllKeys())) ?? [];
    // The first load since the switch to one slot: move the newest versioned save into it.
    const oldKey = keys.includes(STORAGE_KEY) ? null : newestOld(keys);
    if (oldKey) {
      const oldRecord = await run(db, 'readonly', (store) => store.get(oldKey));
      if (oldRecord) await run(db, 'readwrite', (store) => store.put(oldRecord, STORAGE_KEY));
    }
    const old = keys.filter((key) => key !== STORAGE_KEY);
    if (old.length) await run(db, 'readwrite', (store) => { old.forEach((key) => store.delete(key)); return null; });
    const record = /** @type {{ token: string, json: string } | null} */ (await run(db, 'readonly', (store) => store.get(STORAGE_KEY)));
    if (record && record.token && record.token === tokenNow()) {
      lastSize = record.json.length;
      return JSON.parse(record.json);
    }
    // A save without its token: localStorage was cleared since, so start fresh.
    if (record) await run(db, 'readwrite', (store) => store.delete(STORAGE_KEY));
    // A save from before the switch to IndexedDB: move it over.
    const legacy = window.localStorage.getItem(`${STORAGE_KEY}.moving`) ?? window.localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      window.localStorage.removeItem(`${STORAGE_KEY}.moving`);
      window.localStorage.removeItem(STORAGE_KEY);
      writeNow(legacy);
      lastSize = legacy.length;
      return JSON.parse(legacy);
    }
  } catch (error) {
    console.warn('[3den] Could not load saved state:', error);
  }
  return null;
}

const initial = await readInitial();

// ─── The API ─────────────────────────────────────────────────────────────────

/** Return the state saved when the page opened, or null if there isn't one. */
export function loadState() {
  return initial ? structuredClone(initial) : null;
}

/** The newest saved state (another window may have saved since this one opened). */
export async function readSavedState() {
  if (!db) {
    try { const raw = window.localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  if (writing) await new Promise((resolve) => idleWaiters.push(resolve));
  try {
    const record = /** @type {{ token: string, json: string } | null} */ (await run(db, 'readonly', (store) => store.get(STORAGE_KEY)));
    return record && record.token === tokenNow() ? JSON.parse(record.json) : null;
  } catch { return null; }
}


function failed(error) {
  console.warn('[3den] Could not save state:', error);
  window.dispatchEvent(new CustomEvent('3den:save-failed', { detail: { isFull: error?.name === 'QuotaExceededError' } }));
}

function writeNow(json, callbacks = []) {
  if (!db) {
    try { window.localStorage.setItem(STORAGE_KEY, json); callbacks.forEach((fn) => fn()); } catch (error) { failed(error); }
    return;
  }
  writing = true;
  let token = tokenNow();
  try {
    if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); window.localStorage.setItem(TOKEN_KEY, token); }
  } catch { token = token ?? 'no-local-storage'; }
  run(db, 'readwrite', (store) => store.put({ token, json }, STORAGE_KEY))
    .then(() => callbacks.forEach((fn) => fn()))
    .catch(failed)
    .finally(() => {
      writing = false;
      if (pending) { const next = pending; pending = null; writeNow(next.json, next.callbacks); }
      else { const waiters = idleWaiters; idleWaiters = []; waiters.forEach((fn) => fn()); }
    });
}

/**
 * Save the state. If storage is unavailable or full, it warns in the
 * console and fires a '3den:save-failed' event on window, which main.js
 * turns into a message. Returns what was saved, as text; `onSaved` runs
 * once it's written (other windows are told then, so they read the new one).
 */
export function saveState(state, onSaved = null) {
  const json = JSON.stringify(state);
  lastSize = json.length;
  const callbacks = onSaved ? [onSaved] : [];
  if (writing) pending = { json, callbacks: [...(pending?.callbacks ?? []), ...callbacks] };
  else writeNow(json, callbacks);
  return json;
}

/** Forget the saved state, so the next load starts from the demo data (right away: its token goes now). */
export function clearSavedState() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[3den] Could not clear saved state:', error);
  }
  pending = null;
  if (db) run(db, 'readwrite', (store) => store.delete(STORAGE_KEY)).catch(() => {});
}

/** How big the last save was, in characters. */
export const savedSize = () => lastSize;
