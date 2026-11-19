// @ts-check
/**
 * security.js — the settings behind the Security tabs (Nov 18): yours
 * (Account settings → Security, js/account/security-section.js) and a
 * group's (Group settings → Security, js/groups/security-tab.js).
 *
 * Yours, on your member record (member.security):
 *   passkeys        [{ id, name, kind: 'device'|'manager'|'key'|'phone', addedAt, lastUsedAt }]
 *   twoStep         'passkey' | 'app' | 'off'   how a new device signs in (no text messages: SIM swaps)
 *   passkeyUnlock   true: a passkey also unlocks your encrypted messages and files (WebAuthn PRF)
 *   recoveryKeyAt   when you last made a recovery key (only you keep the words)
 *   previews        false: notifications say "New message", never the words
 *   disappearing    'off' | '1d' | '7d' | '28d'   for new direct conversations
 *   newDeviceAlerts true: you, and the people you talk to, are told when a device is added
 *   leaveNoTrace    true: this device keeps nothing once 3den is closed (a shared computer)
 *
 * A group's, on the space (space.security):
 *   encrypt         true: private posts, chat, calendar, and vault are encrypted on members' devices
 *   requirePasskey  'none' | 'admins' | 'everyone'
 *   history         'none' | '30d' | 'all'   what new members can read from before they joined
 *   inviteExpiry    'never' | '1d' | '7d' | '30d'
 *   disappearing    'off' | '1d' | '7d' | '28d'   the group chat
 *   publishFiles    'admins' | 'editors' | 'nobody'   who can publish a vault file to a public link
 *
 * The prototype keeps everything in this browser, so most of this is the
 * shape a backend would honor. What the prototype already does with it:
 * group chats hide earlier messages from new members ("history"), say when
 * messages disappear, groups that ask for passkeys tell the people who
 * still need one, and your passkeys and recovery key are listed.
 */

import { getMember, getSpace, changeState, getCurrentUser } from './store.js';
import { roleOf } from './permissions.js';
import { makeId } from '../ui/dom.js';

export const MY_DEFAULTS = Object.freeze({
  passkeys: [], twoStep: 'off', passkeyUnlock: true, recoveryKeyAt: null,
  previews: false, disappearing: 'off', newDeviceAlerts: true, leaveNoTrace: false,
});
export const GROUP_DEFAULTS = Object.freeze({
  encrypt: true, requirePasskey: 'none', history: 'none', inviteExpiry: 'never', disappearing: 'off', publishFiles: 'editors',
});

export const DISAPPEAR_LABELS = { off: 'Off', '1d': 'After a day', '7d': 'After a week', '28d': 'After 4 weeks' };
// The same lengths as a chat's own timer (DISAPPEAR_OPTIONS in js/state/messages.js; its "4 weeks" is 30 days).
export const DISAPPEAR_MS = { off: 0, '1d': 864e5, '7d': 7 * 864e5, '28d': 30 * 864e5 };

/** A person's security settings, with the defaults filled in. */
export function mySecurity(memberId = getCurrentUser()?.id) {
  return { ...MY_DEFAULTS, ...(getMember(memberId)?.security ?? {}) };
}

/** Change some of your own security settings. */
export function setMySecurity(patch, memberId = getCurrentUser()?.id) {
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    if (member) member.security = { ...(member.security ?? {}), ...patch };
  }, 'account');
}

/** A group's security settings, with the defaults filled in. */
export function groupSecurity(spaceOrId) {
  const space = typeof spaceOrId === 'string' ? getSpace(spaceOrId) : spaceOrId;
  return { ...GROUP_DEFAULTS, ...(space?.security ?? {}) };
}

/** Change some of a group's security settings (whoever can manage roles). */
export function setGroupSecurity(spaceId, patch) {
  changeState((state) => {
    const space = state.spaces.find((s) => s.id === spaceId);
    if (space) space.security = { ...(space.security ?? {}), ...patch };
  }, 'space');
}

export const PASSKEY_KINDS = {
  device: { label: 'This phone or computer', hint: 'Face ID, a fingerprint, Windows Hello, or your screen lock. Syncs with your Apple, Google, or Microsoft account.' },
  manager: { label: 'A password manager', hint: '1Password, Bitwarden, Proton Pass, Dashlane, and others. Works across Apple, Android, Windows, and Linux.' },
  key: { label: 'A security key', hint: 'A YubiKey, Google Titan, Feitian, or another FIDO2 key, plugged in or tapped. The strongest: it never leaves the key.' },
  phone: { label: 'Your phone, for this computer', hint: 'Scan a QR code with your phone and approve there, with whatever passkey it holds.' },
};

/** Add a passkey (the prototype stands in for the browser's own passkey prompt). */
export function addPasskey(kind, name) {
  const passkey = { id: makeId('pk'), kind, name: name || PASSKEY_KINDS[kind]?.label || 'Passkey', addedAt: Date.now(), lastUsedAt: Date.now() };
  const mine = mySecurity();
  setMySecurity({ passkeys: [...mine.passkeys, passkey], twoStep: mine.twoStep === 'off' ? 'passkey' : mine.twoStep });
  return passkey;
}

export function removePasskey(id) {
  const mine = mySecurity();
  const passkeys = mine.passkeys.filter((p) => p.id !== id);
  setMySecurity({ passkeys, twoStep: !passkeys.length && mine.twoStep === 'passkey' ? 'off' : mine.twoStep });
}

/** Does this person have a passkey? */
export const hasPasskey = (memberId) => mySecurity(memberId).passkeys.length > 0;

/** Is this person asked to add a passkey by this group (and hasn't)? */
export function passkeyNeededIn(space, memberId) {
  const rule = groupSecurity(space).requirePasskey;
  if (rule === 'none' || hasPasskey(memberId)) return false;
  if (rule === 'everyone') return true;
  return ['admin', 'owner'].includes(roleOf(space, memberId) ?? '');
}

/** The group chat conversations of a group (its Chat modules). */
export const groupChatIds = (space) => (space?.modules ?? []).filter((m) => m.type === 'chat' && m.data?.conversationId).map((m) => m.data.conversationId);

/**
 * When a group's chat starts for this member: messages before it are
 * hidden ("New members" in the group's Security settings). null: all of it.
 * People with no join date (the group's founders) see everything.
 */
export function chatStartFor(space, memberId) {
  const rule = groupSecurity(space).history;
  const joined = space?.joinedAt?.[memberId];
  if (rule === 'all' || !joined) return null;
  return rule === '30d' ? joined - 30 * 864e5 : joined;
}

/**
 * Twelve words to get back into your account (and your encrypted history)
 * if every device and passkey is lost. Made on this device and shown once;
 * only the date is saved.
 */
const WORDS = ['acorn', 'amber', 'anchor', 'aspen', 'basil', 'birch', 'bramble', 'brook', 'cedar', 'clover', 'comet', 'coral', 'cricket', 'dawn', 'delta', 'ember', 'fern', 'finch', 'flint', 'garnet', 'harbor', 'hazel', 'heron', 'ivy', 'juniper', 'kestrel', 'lantern', 'lark', 'linen', 'maple', 'meadow', 'moss', 'nectar', 'oak', 'orchid', 'otter', 'pebble', 'pine', 'plum', 'quartz', 'quill', 'raven', 'reed', 'river', 'saffron', 'sage', 'sparrow', 'spruce', 'thistle', 'thyme', 'tide', 'tulip', 'umber', 'valley', 'violet', 'willow', 'wren', 'yarrow', 'zephyr', 'zinnia', 'lichen', 'marsh', 'nutmeg', 'osprey'];
export function makeRecoveryKey() {
  const picks = new Uint32Array(12);
  crypto.getRandomValues(picks);
  setMySecurity({ recoveryKeyAt: Date.now() });
  return [...picks].map((n) => WORDS[n % WORDS.length]);
}

/** How many of a group's admins have a passkey: for the Security tab's summary. */
export function adminPasskeys(space) {
  const admins = space.memberIds.filter((id) => ['admin', 'owner'].includes(roleOf(space, id) ?? ''));
  return { total: admins.length, withPasskey: admins.filter(hasPasskey).length, missing: admins.filter((id) => !hasPasskey(id)) };
}
