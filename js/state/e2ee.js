// @ts-check
/**
 * e2ee.js — end-to-end encryption for direct messages, Signal-style.
 *
 *   startEncryption()            → makes keys, seals old direct messages, unseals for reading
 *   sealOutgoing(message, convo) → after sendMessage/editMessage: encrypts it in the background
 *   openMessage(message)         → { body, attachment } to show, or null while it's still locked
 *   safetyNumber(meId, otherId)  → Promise<'12345 67890 …'> (60 digits, the same on both phones)
 *   isEncrypted(conversation)    → direct conversations are; group chats aren't yet
 *
 * How it works (WebCrypto only, no libraries):
 *   • Each account has an identity key pair (X25519 where the browser has
 *     it, P-256 otherwise). The private half stays on the device: here, in
 *     its own localStorage entry (DEVICE_KEY_STORE), never in the saved app
 *     state, which stands in for the server. The public half is on the
 *     member record (member.publicKey), as a server would publish it.
 *   • Two people get the same secret from their own private key and the
 *     other's public key (ECDH), stretched with HKDF (salted with the
 *     conversation id) into an AES-GCM-256 key.
 *   • A message's text and attachment are sealed together:
 *       message.sealed = { v: 1, iv, ct }   (base64), and body/attachment are emptied.
 *     So what's saved (the "server") has only ciphertext, plus who sent it and when.
 *   • Safety numbers: a SHA-512 of both public keys, shown as 60 digits.
 *     If they match on both phones, nobody is in the middle.
 *
 * What the real Signal Protocol adds (and why we'd use libsignal for launch):
 *   X3DH / PQXDH key agreement with signed prekeys (so you can message
 *   someone who's offline), the Double Ratchet (a new key for every
 *   message: forward secrecy and recovery after a compromise), sender keys
 *   for groups, sealed sender, and multi-device. See the security report.
 *
 * Plain text is kept only in memory (the `plain` cache) for showing and
 * searching on this device.
 */

import { changeState, getState } from './store.js';

const DEVICE_KEY_STORE = '3den.device-keys.v1';
const INFO = new TextEncoder().encode('3den-dm-v1');

const plain = new Map();        // messageId → { body, attachment }
const convoKeys = new Map();    // `${convoId}:${memberId}` → CryptoKey (AES-GCM)
let algorithm = null;           // { name: 'X25519' } or { name: 'ECDH', namedCurve: 'P-256' }
let ready = false;
const listeners = new Set();

// ─── Helpers ────────────────────────────────────────────────────────────────

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function loadDeviceKeys() {
  try { return JSON.parse(localStorage.getItem(DEVICE_KEY_STORE)) ?? {}; } catch { return {}; }
}
function saveDeviceKeys(keys) {
  try { localStorage.setItem(DEVICE_KEY_STORE, JSON.stringify(keys)); } catch { /* storage full: keys live for this visit */ }
}

async function pickAlgorithm() {
  try {
    await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    return { name: 'X25519' };
  } catch {
    return { name: 'ECDH', namedCurve: 'P-256' };
  }
}

export const isEncrypted = (conversation) => conversation?.kind === 'direct' && !conversation.spaceId && conversation.e2ee !== false;

export const encryptionAvailable = () => Boolean(globalThis.crypto?.subtle);

/** The other person in a direct conversation. */
const partnerOf = (conversation, memberId) => conversation.memberIds.find((id) => id !== memberId) ?? memberId;

// ─── Keys ───────────────────────────────────────────────────────────────────

const deviceKeys = loadDeviceKeys();
const importedPrivate = new Map();
const importedPublic = new Map();

/** Make a key pair for an account that has none on this device. Returns the public JWK. */
async function ensureKeys(memberId) {
  const stored = deviceKeys[memberId];
  if (stored && stored.alg === algorithm.name) return stored.publicJwk;
  const pair = await crypto.subtle.generateKey(algorithm, true, ['deriveBits']);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  deviceKeys[memberId] = { alg: algorithm.name, privateJwk, publicJwk, createdAt: Date.now() };
  saveDeviceKeys(deviceKeys);
  return publicJwk;
}

/**
 * Make sure an account has keys and has published its public half. Simulated
 * people (thousands of them in the sample) get keys only when someone first
 * messages them, so starting up stays quick.
 */
async function ensurePublished(memberId) {
  const publicJwk = await ensureKeys(memberId);
  const member = getState().members.find((m) => m.id === memberId);
  if (member && member.publicKey?.x !== publicJwk.x) {
    changeState((state) => { const live = state.members.find((m) => m.id === memberId); if (live) live.publicKey = publicJwk; });
  }
}

async function privateKeyOf(memberId) {
  if (!importedPrivate.has(memberId)) {
    importedPrivate.set(memberId, await crypto.subtle.importKey('jwk', deviceKeys[memberId].privateJwk, algorithm, false, ['deriveBits']));
  }
  return importedPrivate.get(memberId);
}

async function publicKeyOf(memberId) {
  const jwk = getState().members.find((m) => m.id === memberId)?.publicKey;
  if (!jwk) throw new Error('No public key');
  const cacheKey = `${memberId}:${jwk.x}`;
  if (!importedPublic.has(cacheKey)) {
    const { key_ops: _ops, ...clean } = jwk;
    importedPublic.set(cacheKey, await crypto.subtle.importKey('jwk', clean, algorithm, true, []));
  }
  return importedPublic.get(cacheKey);
}

/** The AES key `memberId` uses for this conversation (both people derive the same one). */
async function conversationKey(conversation, memberId) {
  const id = `${conversation.id}:${memberId}`;
  if (convoKeys.has(id)) return convoKeys.get(id);
  const other = partnerOf(conversation, memberId);
  await ensurePublished(memberId);
  await ensurePublished(other);
  const bits = await crypto.subtle.deriveBits({ name: algorithm.name, public: await publicKeyOf(other) }, await privateKeyOf(memberId), 256);
  const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(conversation.id), info: INFO },
    hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  convoKeys.set(id, key);
  return key;
}

// ─── Sealing and opening ────────────────────────────────────────────────────

async function seal(conversation, message) {
  const key = await conversationKey(conversation, message.authorId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(JSON.stringify({ body: message.body ?? '', attachment: message.attachment ?? null }));
  // The message id and author go in as "additional data": the server can't swap ciphertexts around.
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`${message.id}|${message.authorId}`) }, key, payload);
  return { v: 1, iv: toB64(iv), ct: toB64(ct) };
}

async function unseal(conversation, message, readerId) {
  const key = await conversationKey(conversation, readerId);
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(message.sealed.iv), additionalData: new TextEncoder().encode(`${message.id}|${message.authorId}`) },
    key, fromB64(message.sealed.ct));
  return JSON.parse(new TextDecoder().decode(data));
}

/** What to show for a message: its own fields, or the unsealed ones (null while locked). */
export function openMessage(message) {
  if (!message.sealed) return { body: message.body ?? '', attachment: message.attachment ?? null };
  const cached = plain.get(message.id) ?? null;
  // Just edited, not re-sealed yet: the new text is still on the message for a moment.
  if (message.body && cached) return { ...cached, body: message.body };
  return cached;
}

/** Someone who can read this conversation, whose keys are on this device. */
function readerFor(conversation) {
  const me = getState().currentUserId;
  if (conversation.memberIds.includes(me) && deviceKeys[me]) return me;
  return conversation.memberIds.find((id) => deviceKeys[id]) ?? null;
}

/** Encrypt a just-sent (or just-edited) message. Its text is shown from memory meanwhile. */
export function sealOutgoing(conversationId, messageId) {
  const conversation = getState().conversations?.find((c) => c.id === conversationId);
  const message = conversation?.messages.find((m) => m.id === messageId);
  if (!message || !isEncrypted(conversation) || message.system || message.deleted) return;
  const before = plain.get(message.id);
  plain.set(message.id, { body: message.body ?? '', attachment: message.attachment ?? before?.attachment ?? null });
  if (!ready) { pendingSeal.add(`${conversationId}|${messageId}`); return; }
  sealNow(conversation, message);
}
const pendingSeal = new Set();

async function sealNow(conversation, message) {
  try {
    const sealed = await seal(conversation, { ...message, ...plain.get(message.id) });
    changeState((state) => {
      const live = state.conversations.find((c) => c.id === conversation.id)?.messages.find((m) => m.id === message.id);
      if (live && !live.deleted) Object.assign(live, { sealed, body: '', attachment: null });
    }, 'messages');
  } catch (error) {
    console.warn('Couldn’t encrypt a message', error);
  }
}

// ─── Starting up ────────────────────────────────────────────────────────────

/**
 * Make keys for the accounts that need them now (in the demo, everyone
 * "lives" on this one device), seal any direct message still in plain text, and unseal the
 * rest into memory so they can be shown.
 */
export async function startEncryption() {
  if (!encryptionAvailable()) return;
  algorithm = await pickAlgorithm();
  // Keys for the hand-made people and anyone in a direct conversation; the rest get theirs when first messaged.
  const inDirect = new Set((getState().conversations ?? []).filter(isEncrypted).flatMap((c) => c.memberIds));
  const members = getState().members.filter((m) => !m.growth || inDirect.has(m.id) || deviceKeys[m.id]);
  const publics = {};
  for (const member of members) publics[member.id] = await ensureKeys(member.id);
  const stale = members.filter((m) => m.publicKey?.x !== publics[m.id].x);
  if (stale.length) {
    changeState((state) => { for (const m of state.members) if (publics[m.id]) m.publicKey = publics[m.id]; });
    convoKeys.clear();
  }
  ready = true;

  const conversations = (getState().conversations ?? []).filter(isEncrypted);
  const toSeal = [];
  for (const conversation of conversations) {
    const reader = readerFor(conversation);
    for (const message of conversation.messages) {
      if (message.system || message.deleted) continue;
      if (message.sealed) {
        if (plain.has(message.id) || !reader) continue;
        try { plain.set(message.id, await unseal(conversation, message, reader)); } catch { plain.set(message.id, { body: '', attachment: null, unreadable: true }); }
      } else {
        plain.set(message.id, { body: message.body ?? '', attachment: message.attachment ?? null });
        toSeal.push([conversation, message]);
      }
    }
  }
  if (toSeal.length) {
    const sealedAll = await Promise.all(toSeal.map(([c, m]) => seal(c, m).catch(() => null)));
    changeState((state) => {
      toSeal.forEach(([c, m], i) => {
        const live = state.conversations.find((x) => x.id === c.id)?.messages.find((x) => x.id === m.id);
        if (live && sealedAll[i]) Object.assign(live, { sealed: sealedAll[i], body: '', attachment: null });
      });
    });
  }
  for (const entry of pendingSeal) {
    const [cid, mid] = entry.split('|');
    const c = getState().conversations.find((x) => x.id === cid);
    const m = c?.messages.find((x) => x.id === mid);
    if (m && !m.sealed) sealNow(c, m);
  }
  pendingSeal.clear();
  changeState(() => {}, 'messages'); // redraw anything that showed "Unlocking…"
  for (const listener of listeners) listener();
}

/** Unseal messages that arrived after start-up (e.g. after switching accounts). */
export async function unsealConversation(conversation) {
  if (!ready || !isEncrypted(conversation)) return;
  const reader = readerFor(conversation);
  if (!reader) return;
  let changed = false;
  for (const message of conversation.messages) {
    if (message.sealed && !plain.has(message.id)) {
      try { plain.set(message.id, await unseal(conversation, message, reader)); } catch { plain.set(message.id, { body: '', attachment: null, unreadable: true }); }
      changed = true;
    }
  }
  if (changed) changeState(() => {}, 'messages');
}

// ─── Safety numbers ─────────────────────────────────────────────────────────

/** 60 digits from both people's public keys, in a fixed order, so both phones show the same. */
export async function safetyNumber(meId, otherId) {
  if (ready) { await ensurePublished(meId); await ensurePublished(otherId); }
  const keyOf = (id) => getState().members.find((m) => m.id === id)?.publicKey;
  const parts = [[meId, keyOf(meId)], [otherId, keyOf(otherId)]].sort((a, b) => a[0].localeCompare(b[0]));
  if (parts.some(([, key]) => !key)) return null;
  const text = parts.map(([id, key]) => `${id}:${key.x}${key.y ?? ''}`).join('|');
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text)));
  const groups = [];
  for (let i = 0; i < 12; i += 1) {
    const chunk = hash.slice(i * 5, i * 5 + 5).reduce((n, byte) => n * 256 + byte, 0);
    groups.push(String(chunk % 100000).padStart(5, '0'));
  }
  return groups.join(' ');
}

/** A short fingerprint of someone's current key, to notice when it changes. */
export const keyFingerprint = (member) => member?.publicKey ? `${member.publicKey.x.slice(0, 16)}` : null;

export function setVerified(conversationId, memberId, isVerified) {
  changeState((state) => {
    const conversation = state.conversations.find((c) => c.id === conversationId);
    const member = state.members.find((m) => m.id === memberId);
    conversation.verified = { ...conversation.verified };
    if (isVerified) conversation.verified[memberId] = keyFingerprint(member);
    else delete conversation.verified[memberId];
  }, 'messages');
}

/** 'verified', 'changed' (their key is new since you checked), or 'unverified'. */
export function verificationOf(conversation, member) {
  const saved = conversation.verified?.[member.id];
  if (!saved) return 'unverified';
  return saved === keyFingerprint(member) ? 'verified' : 'changed';
}

export const encryptionInfo = () => ({ ready, algorithm: algorithm?.name === 'X25519' ? 'X25519' : 'P-256', cipher: 'AES-GCM-256' });
