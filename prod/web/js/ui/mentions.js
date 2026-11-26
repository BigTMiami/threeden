// @ts-check
/**
 * mentions.js — @username mentions in anything people write.
 *
 *   findMentionedIds('Thanks @maya and @owen!')  → ['m-maya', 'm-owen']
 *   newlyMentionedIds(before, after)             → ids mentioned in `after` but not `before`
 *   mentionChip(member)                          → <span class="mention">@maya</span>
 *
 * Works on plain text (forum posts, announcements) and on rich-text HTML
 * (documents): for HTML it reads the text, so a mention chip
 * `<span class="mention" data-username="anna">@maya</span>` counts the same
 * as someone typing "@maya".
 *
 * A mention only counts if the username belongs to an account. Usernames
 * are 3–20 lowercase letters, numbers, dots or underscores (accounts.js),
 * and a trailing dot is punctuation: "thanks @leo." mentions @leo.
 *
 * Getting told about it is js/state/notifications.js's job.
 */

import { h } from './dom.js';
import { findAccountByUsername } from '../state/accounts.js';

/** "@" not glued to a word before it (so emails don't count), then a username. */
export const MENTION_PATTERN = /(^|[^\w@.])@([a-z0-9_.]*[a-z0-9_])/gi;

/** Plain text from text or HTML. */
function textOf(textOrHtml) {
  if (!/[<&]/.test(textOrHtml)) return textOrHtml;
  const template = document.createElement('template');
  template.innerHTML = textOrHtml;
  return template.content.textContent;
}

/** Usernames mentioned (lowercase, no repeats), whether or not they're real accounts. */
export function findUsernames(textOrHtml = '') {
  const names = new Set();
  for (const match of textOf(textOrHtml).matchAll(MENTION_PATTERN)) names.add(match[2].toLowerCase());
  return [...names];
}

/** Member ids of the accounts mentioned. */
export function findMentionedIds(textOrHtml = '') {
  return findUsernames(textOrHtml).map((name) => findAccountByUsername(name)?.id).filter(Boolean);
}

/** Who's mentioned now who wasn't before (for notifying only about new mentions after an edit). */
export function newlyMentionedIds(before = '', after = '') {
  const already = new Set(findMentionedIds(before));
  return findMentionedIds(after).filter((id) => !already.has(id));
}

/**
 * In HTML being shown (not edited), turn mentions into links to people's
 * blogs: both mention chips from the editor and "@name" typed as text.
 */
export function decorateMentions(root) {
  for (const chip of root.querySelectorAll('span.mention[data-username]')) {
    const member = findAccountByUsername(chip.dataset.username);
    if (member) chip.replaceWith(mentionChip(member));
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement.closest('a')) continue;
    if (node.textContent.includes('@')) textNodes.push(node);
  }
  for (const node of textNodes) {
    const text = node.textContent;
    const pieces = [];
    let last = 0;
    for (const match of text.matchAll(MENTION_PATTERN)) {
      const member = findAccountByUsername(match[2].toLowerCase());
      if (!member) continue;
      const start = match.index + match[1].length;
      pieces.push(text.slice(last, start), mentionChip(member, `@${match[2]}`));
      last = start + 1 + match[2].length;
    }
    if (pieces.length) /** @type {Text} */ (node).replaceWith(...pieces, text.slice(last));
  }
  return root;
}

/** How a mention looks: a link to the person's blog. */
export function mentionChip(member, text = `@${member.username}`) {
  return h('a', { class: 'mention', href: `#blog-${member.username}`, title: `${member.name} (@${member.username}): open their blog` }, text);
}
