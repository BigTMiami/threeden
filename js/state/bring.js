// @ts-check
/**
 * bring.js — bring your people to 3den: from your phone's contacts, from a
 * group chat, or with your own invite link.
 *
 *   readContacts(text)        a contacts file (.vcf from a phone, iCloud, or
 *                             Google; or a .csv) → [{ name, emails, phones }]
 *   readChatMembers(text)     a WhatsApp chat export (.txt) or any
 *                             "Name: message" log → [{ name, phone }]
 *   matchContacts(me, list)   → { onThreeden: [{ contact, member }], notYet: [contact] }
 *   friendLinkOf(me)          your invite link, #hi-<username>: whoever signs
 *                             up (or is signed in) and opens it becomes your friend
 *   befriendByLink(inviterId, memberId)
 *   inviteMessage(...)        the words to send, ready to paste
 *
 * Nothing from a contacts file or chat is saved, and 3den never contacts
 * anyone itself: you send the invitations, by text, email, or in the chat.
 */

import { changeState, getMember, getState } from './store.js';
import { findAccountByLogin, contactKind, normalizePhone } from './accounts.js';
import { friendStatus } from './friends.js';
import { makeId } from '../ui/dom.js';
import { notify } from './notifications.js';

/** @typedef {{ name: string, emails: string[], phones: string[] }} Contact */

const EMAIL = /[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/g;

/** Unfold vCard lines (a line starting with a space continues the one before). */
const unfold = (text) => text.replace(/\r?\n[ \t]/g, '');

/**
 * Contacts from a .vcf (one or many cards) or a .csv (Google, Outlook, Apple
 * Numbers: any columns; names from a "name" column or first + last).
 * @param {string} text
 * @returns {Contact[]}
 */
export function readContacts(text) {
  const raw = String(text ?? '');
  const contacts = /BEGIN:VCARD/i.test(raw) ? readVcards(raw) : readCsv(raw);
  // Merge duplicates (same email or phone), keep those with a way to reach them.
  const seen = new Map();
  const out = [];
  for (const c of contacts) {
    const keys = [...c.emails, ...c.phones];
    if (!keys.length) continue;
    const hit = keys.map((k) => seen.get(k)).find(Boolean);
    if (hit) {
      hit.emails = [...new Set([...hit.emails, ...c.emails])];
      hit.phones = [...new Set([...hit.phones, ...c.phones])];
      continue;
    }
    out.push(c);
    keys.forEach((k) => seen.set(k, c));
  }
  return out;
}

function readVcards(raw) {
  return unfold(raw).split(/BEGIN:VCARD/i).slice(1).map((card) => {
    const lines = card.split(/\r?\n/);
    const value = (line) => line.slice(line.indexOf(':') + 1).trim();
    const fn = lines.find((l) => /^FN[;:]/i.test(l));
    const n = lines.find((l) => /^N[;:]/i.test(l));
    const fromN = n ? value(n).split(';').slice(0, 2).reverse().filter(Boolean).join(' ') : '';
    const emails = lines.filter((l) => /^(item\d+\.)?EMAIL[;:]/i.test(l)).map((l) => value(l).toLowerCase()).filter((e) => e.includes('@'));
    const phones = lines.filter((l) => /^(item\d+\.)?TEL[;:]/i.test(l)).map((l) => normalizePhone(value(l).replace(/^tel:/i, ''))).filter(Boolean);
    return { name: (fn ? value(fn) : fromN).replace(/\\,/g, ',') || emails[0] || phones[0] || 'Someone', emails: [...new Set(emails)], phones: [...new Set(phones)] };
  });
}

/** Split one CSV line, minding quotes. */
function csvCells(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cell); cell = ''; } else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

function readCsv(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = csvCells(lines[0]).map((c) => c.toLowerCase());
  const hasHeader = header.some((c) => /name|mail|phone/.test(c));
  const col = (re) => header.findIndex((c) => re.test(c));
  const nameCol = col(/^(display )?name$|^full name$/);
  const firstCol = col(/^first( name)?$|given name/);
  const lastCol = col(/^last( name)?$|family name/);
  return (hasHeader ? lines.slice(1) : lines).map((line) => {
    const cells = csvCells(line);
    const joined = cells.join(' ');
    const emails = [...new Set((joined.match(EMAIL) ?? []).map((e) => e.toLowerCase()))];
    const phones = [...new Set(header.map((h, i) => (/phone|mobile|cell|tel/.test(h) ? cells[i] : '')).filter(Boolean)
      .flatMap((v) => v.split(/\s*:::\s*/)).map((v) => normalizePhone(v)).filter(Boolean))];
    if (!hasHeader) cells.forEach((c) => { if (contactKind(c) === 'phone') phones.push(normalizePhone(c)); });
    const name = (nameCol >= 0 && cells[nameCol]) || [cells[firstCol] ?? '', cells[lastCol] ?? ''].join(' ').trim()
      || (!hasHeader ? cells.find((c) => c && !EMAIL.test(c) && contactKind(c) !== 'phone') : '') || emails[0] || phones[0] || 'Someone';
    EMAIL.lastIndex = 0;
    return { name, emails, phones: [...new Set(phones)] };
  });
}

/**
 * Who's in a chat, from its export: WhatsApp's "12/3/26, 9:41 PM - Maya Chen: …"
 * (Android) or "[12/3/26, 9:41:03 PM] Maya Chen: …" (iPhone), or plain
 * "Maya: …" lines. Unsaved numbers come through as the number.
 * @param {string} text
 * @returns {{ name: string, phone: string | null }[]}
 */
export function readChatMembers(text) {
  const names = new Map();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^‎?\[?\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?\]?\s*(?:-\s*)?([^:]{1,60}):\s/.exec(line)
      ?? /^([A-Z][^:]{0,40}):\s\S/.exec(line);
    if (!m) continue;
    const name = m[1].replace(/^‎|‪|‬/g, '').trim();
    if (!name || /^(messages and calls|you)$/i.test(name) || name.length < 2) continue;
    if (!names.has(name)) names.set(name, { name, phone: contactKind(name) === 'phone' ? normalizePhone(name) : null });
  }
  return [...names.values()];
}

/** Find who's already on 3den: by email or phone for contacts, by name or phone for chat members. */
export function matchContacts(me, list) {
  const onThreeden = [];
  const notYet = [];
  const members = getState().members.filter((m) => m.id !== me.id && !m.deleted);
  for (const contact of list) {
    const keys = [...(contact.emails ?? []), ...(contact.phones ?? []), ...(contact.phone ? [contact.phone] : [])];
    let member = keys.map((k) => findAccountByLogin(k)).find(Boolean) ?? null;
    if (!member && !keys.length && contact.name) {
      const lower = contact.name.toLowerCase();
      const byName = members.filter((m) => m.name.toLowerCase() === lower);
      member = byName.length === 1 ? byName[0] : null; // only when the name is unique
    }
    if (member && member.id === me.id) continue;
    if (member) { if (!onThreeden.some((x) => x.member.id === member.id)) onThreeden.push({ contact, member, status: friendStatus(me.id, member.id) }); } else notYet.push(contact);
  }
  return { onThreeden, notYet };
}

/** Your invite link: #hi-<username>. */
export const friendLinkOf = (me) => `${window.location.href.split('#')[0]}#hi-${me.username}`;

/** The member a #hi- link points to. */
export const findInviter = (username) => getState().members.find((m) => m.username?.toLowerCase() === String(username).toLowerCase() && !m.deleted) ?? null;

/** Opening someone's invite link makes you friends (the link is their yes). */
export function befriendByLink(inviterId, memberId) {
  if (inviterId === memberId) return 'self';
  const status = friendStatus(memberId, inviterId);
  if (status === 'friends') return 'already';
  if (status === 'unavailable') return 'unavailable';
  changeState((state) => {
    state.friendships = (state.friendships ?? []).filter((f) => !((f.from === inviterId && f.to === memberId) || (f.from === memberId && f.to === inviterId)));
    state.friendships.push({ id: makeId('friend'), from: inviterId, to: memberId, status: 'accepted', createdAt: Date.now(), respondedAt: Date.now(), via: 'link' });
  }, 'account');
  notify({ recipientIds: [inviterId], actorId: memberId, kind: 'friend', text: `${getMember(memberId)?.name} joined with your invite link. You’re friends now.`, href: `#blog-${getMember(memberId)?.username}` });
  return 'friends';
}

/** The words to send: to people (your link) or to a chat (a group's link). */
export function inviteMessage({ me, link, group = null }) {
  return group
    ? `We’re moving this chat to 3den, so our plans, events, and photos are in one place: ${link} Tap it to join ${group.name}. It only takes a name and a phone number.`
    : `I’m using 3den for my groups and plans. Join me here and we’ll be friends: ${link} (it’s free, no ads). ${me.name.split(' ')[0]}`;
}

/** Links that open a message, ready to send. */
export function sendLinks(message, { phones = [], emails = [] } = {}) {
  const body = encodeURIComponent(message);
  return {
    whatsapp: `https://wa.me/?text=${body}`,
    text: `sms:${phones.join(',')}?&body=${body}`,
    email: `mailto:?${emails.length ? `bcc=${encodeURIComponent(emails.join(','))}&` : ''}subject=${encodeURIComponent('Join me on 3den')}&body=${body}`,
  };
}
