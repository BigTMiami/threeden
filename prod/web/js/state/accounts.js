// @ts-check
/**
 * accounts.js — signing up, signing in and out, and changing your profile.
 *
 * Every account is a member in `state.members`:
 *
 *   {
 *     id: 'm-leo',
 *     name: 'Leo L',              ← display name, shown everywhere
 *     username: 'leo',            ← unique; used for @mentions. a–z, 0–9, _ and .
 *     email: 'leo@example.com',     ← or null, for a quick account made with a phone number
 *     phone: '+15551234567',        ← (optional) digits, with + if given
 *     textNotifications: true,      ← (optional) also send notifications by text
 *     initials: 'LL',             ← worked out from the name
 *     color: '#3366CC',           ← avatar color (behind the initials, or the photo)
 *     photo: null,                ← a profile photo (data URL, 256 × 256), or null for initials
 *     bio: '',
 *     password: { salt, hash } | null,   ← demo accounts have no password
 *     quick: true,                  ← a quick account (see below)
 *     createdAt,
 *   }
 *
 * Quick accounts: someone invited to an event can answer with just their
 * name and a phone number or email (createQuickAccount). They get a
 * homepage set up for events, and can come back by typing that phone or
 * email (a real 3den would text or email them a sign-in code). Groups and
 * blogs ask them to finish their account first: a username and a password
 * (finishAccount).
 *
 * PROTOTYPE ONLY: accounts live in this browser's storage, and passwords
 * are hashed in the browser (js/account/password.js). A real 3den would
 * keep accounts on a server and hash passwords there with a slow algorithm
 * such as Argon2 or bcrypt. Don't reuse a real password here.
 *
 * Every account gets its own personal homepage (a space of kind
 * 'personal'), made when the account is created or, for older accounts,
 * the first time they sign in.
 */

import { changeState, getState, getMember, resetCurrentSpace } from './store.js';
import { createStarterHomepage } from '../data/starters.js';
import { newOnboarding } from '../onboarding/onboarding-state.js';
import { makeId } from '../ui/dom.js';

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/;

/** Colors offered for avatars (and given to new accounts in turn). */
export const AVATAR_COLORS = ['#3366CC', '#7B3FA0', '#14866D', '#AC6600', '#B32424', '#2F5D8A', '#5C6BC0', '#00796B', '#8D6E63', '#C2185B'];

// ─── Reading ─────────────────────────────────────────────────────────────────

export function getAccounts() {
  return getState().members;
}

/** The account with this username, email or phone number (case and spacing don't matter), or null. */
export function findAccountByLogin(text) {
  const login = text.trim().toLowerCase().replace(/^@/, '');
  if (!login) return null;
  const phone = contactKind(text) === 'phone' ? normalizePhone(text) : null;
  return getAccounts().find((m) => m.username?.toLowerCase() === login || m.email?.toLowerCase() === login
    || (phone && m.phone === phone)) ?? null;
}

// ─── Phone numbers and emails in one field ──────────────────────────────────

/**
 * What someone typed in a "Phone number or email" box:
 *   'email'  → has an @ and looks like an address
 *   'phone'  → digits (7 to 15), maybe with + ( ) - . and spaces
 *   null     → not sure yet
 */
export function contactKind(text) {
  const value = text.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
  if (/^\+?[\d\s().-]+$/.test(value)) {
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) return 'phone';
  }
  return null;
}

/** '+1 (555) 123-4567' → '+15551234567'; '555.123.4567' → '5551234567'. */
export function normalizePhone(text) {
  const value = text.trim();
  return `${value.startsWith('+') ? '+' : ''}${value.replace(/\D/g, '')}`;
}

export function phoneProblem(phone, exceptId = null) {
  const owner = getAccounts().find((m) => m.phone && m.phone === normalizePhone(phone));
  if (owner && owner.id !== exceptId) return 'There’s already an account with that phone number.';
  return '';
}

export function findAccountByUsername(username) {
  const wanted = username.toLowerCase();
  return getAccounts().find((m) => m.username?.toLowerCase() === wanted) ?? null;
}

/**
 * What's wrong with this username, or '' if it's fine.
 * `exceptId` lets an account keep its own username.
 */
export function usernameProblem(username, exceptId = null) {
  if (!USERNAME_PATTERN.test(username)) return 'Use 3–20 lowercase letters, numbers, dots, or underscores.';
  const owner = findAccountByUsername(username);
  if (owner && owner.id !== exceptId) return `@${username} is taken.`;
  return '';
}

export function emailProblem(email, exceptId = null) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That doesn’t look like an email address.';
  const owner = getAccounts().find((m) => m.email?.toLowerCase() === email.toLowerCase());
  if (owner && owner.id !== exceptId) return 'There’s already an account with that email.';
  return '';
}

/** 'Leo Lopez' → 'LL', 'Rosa' → 'R'. */
export function initialsFor(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || '?';
}

/** A username suggestion from a name: 'Rosa Parks' → 'rosa.parks' (or rosa.parks2, …). */
export function suggestUsername(name) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 16) || 'user';
  let candidate = base.length >= 3 ? base : `${base}.3den`;
  for (let n = 2; findAccountByUsername(candidate); n += 1) candidate = `${base}${n}`;
  return candidate;
}

// ─── Signing up, in and out ──────────────────────────────────────────────────

/**
 * Make a new account (and its personal homepage) and sign in as it.
 * Check the fields first with usernameProblem / emailProblem.
 * `password` is the { salt, hash } from js/account/password.js.
 */
export function createAccount({ name, username, email, password, arrival = null }) {
  const accounts = getAccounts();
  const member = {
    id: makeId('m'),
    name: name.trim(),
    username,
    email: email.trim(),
    initials: initialsFor(name),
    color: AVATAR_COLORS[accounts.length % AVATAR_COLORS.length],
    bio: '',
    password,
    createdAt: Date.now(),
    // How they arrived, and how far they've got (js/onboarding/onboarding-state.js).
    onboarding: newOnboarding(arrival),
  };
  changeState((state) => {
    state.members.push(member);
    state.spaces.push(createStarterHomepage(member.id, member.onboarding.layout));
  });
  signIn(member.id);
  return member;
}

/**
 * A quick account for someone answering an event: a name and a phone
 * number or email. They get a username made from their name (used for
 * @mentions; they can pick their own when they finish their account).
 * Signs in as it, and returns it.
 */
export function createQuickAccount({ name, contact, textNotifications = false, arrival = null }) {
  const accounts = getAccounts();
  const isPhone = contactKind(contact) === 'phone';
  const member = {
    id: makeId('m'),
    name: name.trim(),
    username: suggestUsername(name),
    email: isPhone ? null : contact.trim(),
    phone: isPhone ? normalizePhone(contact) : null,
    textNotifications: isPhone && textNotifications,
    initials: initialsFor(name),
    color: AVATAR_COLORS[accounts.length % AVATAR_COLORS.length],
    bio: '',
    password: null,
    quick: true,
    createdAt: Date.now(),
    onboarding: newOnboarding(arrival),
  };
  changeState((state) => {
    state.members.push(member);
    state.spaces.push(createStarterHomepage(member.id, member.onboarding.layout));
  });
  signIn(member.id);
  return member;
}

/** Turn a quick account into a full one: name, username, password (and an email, if they add one). */
export function finishAccount(memberId, { name, username, password, email = null }) {
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    member.name = name.trim();
    member.initials = initialsFor(member.name);
    member.username = username;
    member.password = password;
    if (email) member.email = email.trim();
    delete member.quick;
  }, 'account', 'space', 'layout');
}

/**
 * Server mode (js/api/server-mode.js): the server has signed this account in.
 * Make (or update) its local member, "m-<server id>", and sign in as it here.
 * Its password lives only on the server, so the local member has none.
 *
 * @param {{ id: string, name: string, username: string, email: string, created_at: string }} account
 * @returns {string} the local member id
 */
export function adoptServerAccount(account) {
  const id = `m-${account.id}`;
  const existing = getAccounts().find((m) => m.id === id);
  if (!existing) {
    const member = {
      id,
      name: account.name,
      username: account.username,
      email: account.email,
      initials: initialsFor(account.name),
      color: AVATAR_COLORS[getAccounts().length % AVATAR_COLORS.length],
      bio: '',
      password: null,
      server: true,
      createdAt: Date.parse(account.created_at) || Date.now(),
      onboarding: newOnboarding(null),
    };
    changeState((state) => {
      state.members.push(member);
      state.spaces.push(createStarterHomepage(member.id, member.onboarding.layout));
    });
  } else if (existing.name !== account.name || existing.username !== account.username || existing.email !== account.email) {
    // Changed on the server (or on another device): the server wins.
    updateProfile(id, { name: account.name, username: account.username, email: account.email });
  }
  if (getState().currentUserId !== id) signIn(id);
  return id;
}

/** Sign in as an account (the password, if any, has already been checked). */
export function signIn(memberId) {
  resetCurrentSpace();
  changeState((state) => {
    state.currentUserId = memberId;
    // Every account has a homepage. (A blog is made later, when they say
    // yes to "dive into 3den" on their first visit to the Blog tab.)
    const owns = (kind) => state.spaces.some((s) => s.kind === kind && s.memberIds[0] === memberId);
    // It starts with the layout for how they arrived, if we know it.
    const layout = state.members.find((m) => m.id === memberId)?.onboarding?.layout;
    if (!owns('personal')) state.spaces.push(createStarterHomepage(memberId, layout));
  }, 'account', 'space', 'mode', 'layout');
}

export function signOut() {
  resetCurrentSpace();
  changeState((state) => { state.currentUserId = null; }, 'account', 'space', 'mode', 'layout');
}

// ─── Profile ─────────────────────────────────────────────────────────────────

/** Change name, username, email, color or bio. Initials follow the name. */
export function updateProfile(memberId, changes) {
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    Object.assign(member, changes);
    if ('name' in changes) member.initials = initialsFor(member.name);
  }, 'account', 'space', 'layout');
}

export function setPassword(memberId, password) {
  changeState((state) => { state.members.find((m) => m.id === memberId).password = password; });
}

/**
 * Groups this account owns. An owner has to hand a group to someone else
 * (or delete it) before deleting their account.
 */
export function groupsOwnedBy(memberId) {
  return getState().spaces.filter((space) => space.kind === 'group' && space.roles?.[memberId] === 'owner');
}

/**
 * Delete an account: it leaves every group, its personal homepage is
 * removed, and it's signed out. Things it posted stay, shown as from
 * "a former member".
 */
/**
 * Everything 3den keeps about someone, as one JSON-ready object: their
 * account (without the password hash), their homepage and blog, the groups
 * they're in (names and their role), their messages, and everything they
 * posted, commented, or answered anywhere.
 */
export function exportAccountData(memberId) {
  const state = getState();
  const member = state.members.find((m) => m.id === memberId);
  if (!member) return null;
  const { passwordHash: _hash, ...account } = member;
  const authored = [];
  const walk = (value, where) => {
    if (Array.isArray(value)) { value.forEach((v) => walk(v, where)); return; }
    if (!value || typeof value !== 'object') return;
    if (value.authorId === memberId) authored.push({ where, ...value });
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child, where);
  };
  for (const space of state.spaces) for (const module of space.modules ?? []) walk(module.data, `${space.name} · ${module.title}`);
  return {
    exportedAt: new Date().toISOString(),
    account,
    spaces: state.spaces.filter((s) => (s.kind === 'personal' || s.kind === 'blog') && s.memberIds[0] === memberId),
    groups: state.spaces.filter((s) => s.kind === 'group' && s.memberIds.includes(memberId)).map((s) => ({ id: s.id, name: s.name, role: s.roles?.[memberId] ?? 'member' })),
    conversations: (state.conversations ?? []).filter((c) => c.memberIds.includes(memberId)),
    authored,
    notifications: (state.notifications ?? []).filter((n) => n.recipientId === memberId),
  };
}

/** Remove everything `memberId` wrote inside module data (posts, threads, replies, comments, …). Changes `data`. */
function removeAuthored(value, memberId) {
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      if (value[i] && typeof value[i] === 'object' && value[i].authorId === memberId) value.splice(i, 1);
      else removeAuthored(value[i], memberId);
    }
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) removeAuthored(child, memberId);
  }
}

export function deleteAccount(memberId, { deletePosts = false } = {}) {
  if (groupsOwnedBy(memberId).length) return false;
  resetCurrentSpace();
  changeState((state) => {
    // "Also delete everything I posted": gone from every group, and messages they sent.
    if (deletePosts) {
      for (const space of state.spaces) for (const module of space.modules ?? []) removeAuthored(module.data, memberId);
      for (const conversation of state.conversations ?? []) conversation.messages = conversation.messages.filter((m) => m.authorId !== memberId);
    }
    state.spaces = state.spaces
      .filter((space) => !((space.kind === 'personal' || space.kind === 'blog') && space.memberIds[0] === memberId))
      .map((space) => {
        if (!space.memberIds.includes(memberId)) return space;
        const { [memberId]: _removed, ...roles } = space.roles ?? {};
        return { ...space, memberIds: space.memberIds.filter((id) => id !== memberId), roles };
      });
    state.members = state.members.filter((m) => m.id !== memberId);
    delete state.visits?.[memberId];
    if (state.currentUserId === memberId) state.currentUserId = null;
  }, 'account', 'space', 'mode', 'layout');
  return true;
}

/** True for the signed-in account. */
export function isMe(memberId) {
  return getState().currentUserId === memberId && Boolean(getMember(memberId));
}
