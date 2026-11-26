// @ts-check
/**
 * server-mode.js — demo mode or server mode (docs/architecture.md §4.1).
 *
 * - Demo mode is the prototype as it always was: accounts and everything
 *   else live in this browser, with the sample data and demo accounts.
 * - Server mode signs in to the 3den API. Accounts (sign up, sign in, sign
 *   out) are the server's; everything else still works from local data
 *   for now, and moves to the server area by area in later cycles.
 *
 * At start-up main.js calls startServerMode(): if a server answers at
 * /api/health, server mode is used (unless the person chose demo mode), and
 * GET /api/v1/me says who's signed in. The choice is kept in localStorage.
 *
 * A server account also gets a member in the local state (id
 * "m-<server account id>", `server: true`, no local password), so the rest
 * of the app, which still reads local data, knows who you are. Your groups
 * and their events are copied in the same way (js/api/sync.js).
 */

import { api, ApiError } from './client.js';
import { adoptServerAccount, signOut } from '../state/accounts.js';
import { getState } from '../state/store.js';
import { syncFromServer, forgetServerData, watchRsvps } from './sync.js';
import versionFile from '../../../shared/version.json' with { type: 'json' };

/** This web app's version (prod/shared/version.json; read like permissions.json). */
export const WEB_VERSION = versionFile.version;

const MODE_KEY = '3den.mode';
const HEALTH_TIMEOUT_MS = 2000;
const FIRST_SYNC_WAIT_MS = 3000; // after that, the page draws from the last copy and updates when it arrives

/** @type {'demo' | 'server'} */
let mode = 'demo';
let serverAvailable = false;
/** The API's version, from /api/health (null if it didn't answer). */
let serverVersion = null;

export const isServerMode = () => mode === 'server';
export const isServerAvailable = () => serverAvailable;

function wantedMode() {
  try { return window.localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'server'; } catch { return 'server'; }
}

async function checkServer() {
  try {
    const health = await api('/health', { timeoutMs: HEALTH_TIMEOUT_MS });
    serverVersion = health?.version ?? null;
    return health?.status === 'ok';
  } catch {
    return false;
  }
}

/** Pick the mode, and in server mode match the local sign-in to the server's. */
export async function startServerMode() {
  serverAvailable = await checkServer();
  mode = serverAvailable && wantedMode() === 'server' ? 'server' : 'demo';
  document.documentElement.dataset.mode = mode;
  showVersions();
  watchRsvps(isServerMode);
  if (mode !== 'server') return;

  try {
    adoptServerAccount(await api('/v1/me'));
  } catch (error) {
    // Not signed in on the server: not signed in here either (a demo account
    // from before, or a session revoked from another device).
    if (error instanceof ApiError && error.status === 401) {
      forgetServerData();
      if (getState().currentUserId) signOut();
    }
    return;
  }
  await Promise.race([syncQuietly(), new Promise((resolve) => setTimeout(resolve, FIRST_SYNC_WAIT_MS))]);
}

/**
 * "3den 0.4.1" in the page footer, plus the server's version when it differs
 * (a server that wasn't restarted, or a page from before an update).
 */
function showVersions() {
  const text = serverVersion && serverVersion !== WEB_VERSION
    ? `web ${WEB_VERSION} · server ${serverVersion}`
    : `3den ${WEB_VERSION}${serverAvailable ? '' : ' (no server)'}`;
  for (const el of document.querySelectorAll('.page__version')) el.textContent = text;
  console.info(`[3den] web ${WEB_VERSION}, server ${serverVersion ?? 'not answering'}, ${mode} mode`);
}

/** Bring the copied groups up to date; a failure leaves the last copy (and says so in the console). */
function syncQuietly() {
  return syncFromServer().catch((error) => console.warn('[3den] Couldn’t load your groups from the server:', error));
}

/**
 * Switch modes. Signs out here (and on the server) and reloads, so the app
 * starts clean in the new mode.
 * @param {'demo' | 'server'} next
 */
export async function switchMode(next) {
  try { window.localStorage.setItem(MODE_KEY, next); } catch { /* private window: this visit only */ }
  const wasServer = isServerMode();
  forgetServerData();
  signOut();
  if (wasServer) await api('/v1/auth/signout', { method: 'POST' }).catch(() => {});
  window.location.hash = '#signin';
  window.location.reload();
}

/**
 * @param {string} login  username, @username, or email
 * @param {string} password
 * @returns {Promise<string>} the local member id now signed in
 */
export async function serverSignIn(login, password) {
  const { account } = await api('/v1/auth/signin', { method: 'POST', body: { login, password, client: 'web' } });
  forgetServerData(); // someone else's groups, if they used this browser last
  const id = adoptServerAccount(account);
  await syncQuietly();
  return id;
}

/**
 * @param {{ name: string, username: string, email: string, password: string }} fields
 * @returns {Promise<string>} the local member id now signed in
 */
export async function serverSignUp({ name, username, email, password }) {
  const { account } = await api('/v1/auth/signup', { method: 'POST', body: { name, username, email, password, client: 'web' } });
  forgetServerData();
  return adoptServerAccount(account);
}

/**
 * Sign out on this device: at once here, and (in server mode) on the server
 * too, which ends this browser's session. Other devices stay signed in.
 */
export function signOutHere() {
  signOut();
  if (isServerMode()) {
    forgetServerData();
    api('/v1/auth/signout', { method: 'POST' }).catch(() => {});
  }
}
