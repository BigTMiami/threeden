// @ts-check
/**
 * text.js — turning plain text people wrote into something to show.
 *
 *   renderText('See https://example.org, @anna') → ['See ', <a>…</a>, ', ', <span class="mention">@anna</span>]
 *   renderText('Rent letters #tenantrights')       → ['Rent letters ', <a class="hashtag" href="#tag-tenantrights">#tenantrights</a>]
 *
 * Used for messages, forum posts and announcements, so every place that
 * shows written text treats links and @mentions the same way. Everything
 * else stays plain text: nothing people type is ever inserted as HTML.
 */

import { h } from './dom.js';
import { MENTION_PATTERN, mentionChip } from './mentions.js';
import { findAccountByUsername } from '../state/accounts.js';
import { TAG_PATTERN } from '../state/tags.js';

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/g;

/** Text with web addresses turned into links and @usernames into mentions. */
export function renderText(text) {
  return text.split(URL_PATTERN).flatMap((part, i) => (i % 2 === 1
    ? [h('a', { href: part, target: '_blank', rel: 'noopener noreferrer' }, part)]
    : renderMentions(part).flatMap((piece) => (typeof piece === 'string' ? renderTags(piece) : [piece]))));
}

/** Split plain text around #hashtags, which link to the tag's page (js/feed/tag-page.js). */
function renderTags(text) {
  const pieces = [];
  let last = 0;
  for (const match of text.matchAll(TAG_PATTERN)) {
    const [, before, tag] = match;
    const start = match.index + before.length;
    pieces.push(text.slice(last, start), h('a', { class: 'hashtag', href: `#tag-${tag.toLowerCase()}` }, `#${tag}`));
    last = start + 1 + tag.length;
  }
  pieces.push(text.slice(last));
  return pieces.filter((piece) => piece !== '');
}

/** Split plain text around @mentions of real accounts. */
function renderMentions(text) {
  const pieces = [];
  let last = 0;
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const [, before, username] = match;
    const member = findAccountByUsername(username.toLowerCase());
    if (!member) continue;
    const start = match.index + before.length; // where the "@" is
    pieces.push(text.slice(last, start), mentionChip(member, `@${username}`));
    last = start + 1 + username.length;
  }
  pieces.push(text.slice(last));
  return pieces.filter((piece) => piece !== '');
}
