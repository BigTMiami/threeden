// @ts-check
/**
 * audience-chip.js — "who sees this", on every composer.
 *
 *   [🌐 Everyone ▾]    tap → [👥 Friends ▾]    (your blog)
 *   [🌐 Everyone ▾]    tap → [🔒 Members ▾]    (a group feed on a public tab)
 *   [🔒 Members of Porch Lights]               (no choice to make: it says so)
 *
 * One tap switches to the other choice; there are never more than two.
 * Where there's no choice, tapping says why (only members see this tab).
 *
 *   audienceFor(space, module)     → { choices, value, fixed } for that place
 *   audienceChip(audience, onChange)  → the chip
 *   canSeePost(post, space, viewerId) → may this person see the post?
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';
import { getTabs, getModule, getSpaceOfModule } from '../state/store.js';
import { friendStatus } from '../state/friends.js';

const CHOICES = {
  everyone: { id: 'everyone', label: 'Everyone', icon: 'globe' },
  friends: { id: 'friends', label: 'Friends', icon: 'people' },
  members: { id: 'members', label: 'Members', icon: 'lock' },
};

/** Is this module on a tab anyone can see? */
function onPublicTab(space, module) {
  return getTabs(space).find((t) => t.id === (module?.tabId ?? 'home'))?.visibility === 'public';
}

/**
 * Who a new post here can reach.
 * @returns {{ choices: string[], value: string, fixed: string | null }}
 */
export function audienceFor(space, module, { choice = true } = {}) {
  if (!space) return { choices: [], value: 'everyone', fixed: null };
  // Places that can't hold a members-only post on a public tab just say who sees it.
  if (!choice && space.kind === 'group' && onPublicTab(space, module)) return { choices: [], value: 'everyone', fixed: 'Everyone (public tab)' };
  if (space.kind === 'blog') return { choices: ['everyone', 'friends'], value: 'everyone', fixed: null };
  if (space.kind === 'personal') return { choices: [], value: 'members', fixed: 'Only you' };
  if (space.kind === 'group' && onPublicTab(space, module)) return { choices: ['everyone', 'members'], value: 'everyone', fixed: null };
  return { choices: [], value: 'members', fixed: `Members of ${space.name}` };
}

/**
 * @param {{ choices: string[], value: string, fixed: string | null }} audience
 * @param {(value: string) => void} [onChange]
 */
export function audienceChip(audience, onChange = () => {}) {
  if (!audience.choices.length) {
    return h('button', {
      type: 'button', class: 'audience-chip is-fixed', title: 'Who sees this',
      onClick: () => showToast({
        'Only you': 'Your homepage is just for you.',
        'Everyone (public tab)': 'This tab is public: anyone can see what’s posted here. An admin can make it members-only in Settings → Layout.',
      }[audience.fixed] ?? 'Only members see this. An admin can make the tab public in Settings → Layout.'),
    }, icon(audience.fixed.startsWith('Everyone') ? 'globe' : 'lock', 13), ` ${audience.fixed}`);
  }
  let value = audience.value;
  const chip = h('button', { type: 'button', class: 'audience-chip' });
  const draw = () => {
    const choice = CHOICES[value];
    const other = CHOICES[audience.choices.find((c) => c !== value)];
    chip.title = `Who sees this: ${choice.label}. Tap for ${other.label.toLowerCase()} only.`;
    chip.setAttribute('aria-label', `Who sees this: ${choice.label}. Tap to change to ${other.label}.`);
    replaceChildren(chip, icon(choice.icon, 13), ` ${choice.label} `, icon('chevronDown', 12));
  };
  chip.addEventListener('click', () => {
    value = audience.choices.find((c) => c !== value) ?? value;
    draw();
    onChange(value);
  });
  draw();
  return chip;
}

/** May `viewerId` see this post? (Posts without an audience are for everyone who can see the page.) */
export function canSeePost(post, space, viewerId) {
  const audience = post?.audience ?? 'everyone';
  if (audience === 'everyone') return true;
  if (viewerId && post.authorId === viewerId) return true;
  if (audience === 'friends') return Boolean(viewerId) && friendStatus(post.authorId, viewerId) === 'friends';
  if (audience === 'members') return Boolean(viewerId) && Boolean(space?.memberIds.includes(viewerId));
  return true;
}

/** The chip for a composer inside a module that has no choice to offer (announcements, forum threads). */
export function audienceChipForModule(moduleId) {
  return audienceChip(audienceFor(getSpaceOfModule(moduleId), getModule(moduleId), { choice: false }));
}
