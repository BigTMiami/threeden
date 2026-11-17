// @ts-check
/**
 * initials.js — the short label shown in a group's square badge.
 *
 *   "Riverside Tenants Union" → "RT"
 *   "237 Hart Street"         → "237"   (names starting with a number,
 *                                        like an address, show the number)
 */
export function groupInitials(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length && /^\d+$/.test(words[0])) return words[0].slice(0, 3);
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');
}
