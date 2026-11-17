// @ts-check
/**
 * blog-settings-section.js — "Your blog" in Account settings (#account-blog):
 * whether people can like your posts, who can comment, and whether people
 * can send your posts to others.
 *
 *   Likes      [✓] People can like my posts
 *   Comments   (•) Friends  ( ) Anyone signed in  ( ) Nobody
 *   Sending    [✓] People can send my posts to others in Messages
 *
 * Every change saves right away. The rules live in js/state/reactions.js.
 */

import { h } from '../ui/dom.js';
import { showToast } from '../ui/toast.js';
import { usesSocial } from '../state/friends.js';
import { COMMENT_CHOICES, getBlogSettings, updateBlogSettings } from '../state/reactions.js';

export function renderBlogSettingsSection(me, redraw) {
  if (!usesSocial(me.id)) return null;
  const rules = getBlogSettings(me.id);
  const change = (fn, message) => { updateBlogSettings(me.id, fn); showToast(message); redraw(); };
  const check = (key, label, hint, onMessage, offMessage) => h('label', { class: 'settings-choice' },
    h('input', { type: 'checkbox', checked: rules[key], onChange: (event) => change((s) => { s[key] = event.target.checked; }, event.target.checked ? onMessage : offMessage) }),
    h('span', {}, h('strong', {}, label), h('span', { class: 'settings-field__hint' }, hint)));

  return h('section', { class: 'settings-section', id: 'blog-settings' },
    h('h2', { class: 'settings-section__title' }, 'Your blog'),
    h('p', { class: 'settings-section__description' }, 'How people can react to what you post on your blog. Your friends are your followers: they see your posts in their Feeds.'),
    h('div', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Likes'),
      check('likes', 'People can like my posts', 'Turn off to hide likes on all your posts.', 'Likes are on.', 'Likes are off. Nobody sees like counts on your posts.')),
    h('div', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Who can comment'),
      h('div', { class: 'settings-choices', role: 'radiogroup' }, COMMENT_CHOICES.map((choice) => h('label', { class: 'settings-choice' },
        h('input', { type: 'radio', name: 'blog-comments', checked: rules.comments === choice.id, onChange: () => change((s) => { s.comments = choice.id; }, `Comments: ${choice.label.toLowerCase()}.`) }),
        h('span', {}, h('strong', {}, choice.label), h('span', { class: 'settings-field__hint' }, choice.hint)))))),
    h('div', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Sending'),
      check('sharing', 'People can send my posts to others', 'A “Send” button under each post shares it in Messages.', 'People can send your posts.', 'Nobody else can send your posts now.')),
  );
}
