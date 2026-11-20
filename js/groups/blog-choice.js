// @ts-check
/**
 * blog-choice.js — show or hide your blog from a group's members (Nov 18).
 *
 * After joining (any way: an invitation, Explore, a link), the group asks once,
 * if you've set up a blog (Nov 20: not a new account that has none yet):
 *
 *   Show your blog to members of Porch Lights?   [Show it]  [Hide it]
 *   They can open it from the directory and the chat.
 *
 * Group settings → General → "Your blog" changes it any time; the invite
 * link's join page has the same choice as a checkbox. The rule lives in
 * js/state/groups.js (blogShownIn, setBlogShownIn, shouldAskAboutBlog).
 *
 *   renderBlogQuestion(space, me, redraw)   the one-time bar in the group's header
 *   renderBlogSetting(space, me)            the settings section
 *   blogJoinCheckbox(me)                    → { element, shown() } for a join page
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { blogShownIn, setBlogShownIn, shouldAskAboutBlog, hasSetUpBlog } from '../state/groups.js';
import { getSpace, getMember } from '../state/store.js';

// Only for someone who has set up a blog (not the signed-out guest, not a brand-new account).
const hasBlog = (member) => hasSetUpBlog(member);

/** The one-time question after joining, or null. */
export function renderBlogQuestion(space, me, redraw) {
  const member = getMember(me?.id);
  if (!shouldAskAboutBlog(space, member)) return null;
  const answer = (shown) => {
    setBlogShownIn(space.id, me.id, shown);
    showToast(shown ? `Members of ${space.name} can see your blog.` : `Your blog is hidden from members of ${space.name}. Change it in the group’s settings.`);
    redraw?.();
  };
  return h('div', { class: 'blog-question', role: 'group', 'aria-label': 'Your blog in this group' },
    icon('pencil', 16),
    h('span', { class: 'blog-question__text' },
      h('strong', {}, `Show your blog to members of ${space.name}?`),
      h('span', {}, ' They can open it from the directory and the chat.')),
    h('span', { class: 'blog-question__buttons' },
      h('button', { type: 'button', class: 'button button--small button--primary', onClick: () => answer(true) }, 'Show it'),
      h('button', { type: 'button', class: 'button button--small', onClick: () => answer(false) }, 'Hide it')));
}

/** Group settings: "Your blog", for a member who has one. */
export function renderBlogSetting(space, me) {
  if (!hasBlog(getMember(me?.id)) || !space.memberIds.includes(me.id)) return null;
  const root = h('div', {});
  const draw = () => {
    const fresh = getSpace(space.id) ?? space;
    const shown = blogShownIn(fresh, me.id);
    replaceChildren(root, h('section', { class: 'settings-section' },
      h('h2', { class: 'settings-section__title' }, 'Your blog'),
      h('label', { class: 'checkbox-row' },
        h('input', {
          type: 'checkbox', checked: shown,
          onChange: (event) => {
            setBlogShownIn(fresh.id, me.id, event.target.checked);
            showToast(event.target.checked ? `Members of ${fresh.name} can see your blog.` : `Your blog is hidden from members of ${fresh.name}.`);
            draw();
          },
        }),
        ` Show my blog to members of ${fresh.name}`),
      h('p', { class: 'settings-field__hint' }, shown
        ? 'They can open it from the member directory, the chat, and your posts here.'
        : 'Nothing in this group links to your blog, and your blog doesn’t list this group. Posts you made public are still public.')));
  };
  draw();
  return root;
}

/** The same choice as a checkbox on a join page (checked: shown). */
export function blogJoinCheckbox(me) {
  if (!hasBlog(getMember(me?.id))) return { element: null, shown: () => true };
  const input = h('input', { type: 'checkbox', checked: true });
  return {
    element: h('label', { class: 'checkbox-row join-page__blog' }, input, ' Show my blog to the members'),
    shown: () => input.checked,
  };
}
