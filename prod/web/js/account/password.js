// @ts-check
/**
 * password.js — hashing passwords for the prototype's accounts.
 *
 * PROTOTYPE ONLY. Accounts live in this browser, so the password is hashed
 * here with SHA-256 and a random salt, which keeps it from sitting in
 * storage as plain text. That is NOT good enough for a real service: a
 * real 3den hashes passwords on its server with a deliberately slow
 * algorithm (Argon2, bcrypt or scrypt) and never sends the hash to the
 * browser.
 *
 *   const password = await hashPassword('correct horse');   // { salt, hash }
 *   await checkPassword('correct horse', password);         // true
 */

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await sha256(`${salt}:${password}`) };
}

export async function checkPassword(password, stored) {
  if (!stored) return false;
  return (await sha256(`${stored.salt}:${password}`)) === stored.hash;
}

export function passwordProblem(password) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return '';
}

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return toHex(new Uint8Array(bytes));
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
