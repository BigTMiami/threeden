// @ts-check
/**
 * forum-settings.js — "Forum settings", for the group's moderators.
 *
 *   Posting
 *     Who can start threads   (•) Everyone  ( ) Admins and the owner
 *     Who can reply           (•) Everyone  ( ) Admins and the owner
 *     [✓] People can edit their own posts
 *     [ ] Allow anonymous posts
 *   Moderation
 *     [ ] New threads need a moderator's approval
 *     (who can pin and moderate, with a link to Roles & permissions)
 *   Notifications and the Feed
 *     [ ] Tell every member about new threads
 *     [ ] Show new threads in members' Feeds
 *   Display
 *     [✓] Allow downvotes   [ ] Threads can have a best answer
 *     Sort threads by [Hot ▾]   Guidelines [ … ]
 *                                                    [Save] [Cancel]
 *
 * Nothing is saved until "Save".
 */

import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { getSpace } from '../../state/store.js';
import { requiredRole } from '../../state/permissions.js';
import { settingsHref } from '../../router.js';
import { SORT_OPTIONS, settingsOf } from './forum-data.js';

export function renderForumSettings(context, { onSave, onClose }) {
  const draft = { ...settingsOf(context.getData()) };
  const space = getSpace(context.spaceId);

  const radios = (key, options) => h('div', { class: 'settings-choices', role: 'radiogroup' },
    options.map(([value, label, hint]) => h('label', { class: 'settings-choice' },
      h('input', { type: 'radio', name: `forum-${key}`, checked: draft[key] === value, onChange: () => { draft[key] = value; } }),
      h('span', {}, h('strong', {}, label), hint ? h('span', { class: 'settings-field__hint' }, hint) : null))));
  const check = (key, label, hint) => h('label', { class: 'settings-choice' },
    h('input', { type: 'checkbox', checked: draft[key], onChange: (event) => { draft[key] = event.target.checked; } }),
    h('span', {}, h('strong', {}, label), hint ? h('span', { class: 'settings-field__hint' }, hint) : null));
  const field = (label, ...controls) => h('div', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, label), ...controls);
  const group = (title, ...fields) => h('fieldset', { class: 'forum-settings__group' }, h('legend', { class: 'forum-settings__legend' }, title), ...fields);

  const guidelines = h('textarea', {
    class: 'input',
    rows: '4',
    placeholder: 'e.g. Be kind. Search before posting. Use the Questions tag for questions.',
    onInput: (event) => { draft.guidelines = event.target.value; },
  });
  guidelines.value = draft.guidelines;

  const roleWho = (permissionId) => {
    const role = requiredRole(space, permissionId);
    return role === 'owner' ? 'the owner' : role === 'admin' ? 'admins and the owner' : 'every member';
  };
  const everyoneOrAdmins = [['everyone', 'Everyone in the group'], ['admins', 'Admins and the owner']];

  return h('form', {
    class: 'forum-page__composer forum-settings',
    onSubmit: (event) => {
      event.preventDefault();
      onSave({ ...draft, guidelines: draft.guidelines.trim() });
      showToast('Forum settings saved.');
      onClose();
    },
  },
    h('h2', { class: 'forum-page__heading' }, icon('settings', 16), ' Forum settings'),

    group('Posting',
      field('Who can start threads', radios('whoCanStart', [
        everyoneOrAdmins[0],
        [...everyoneOrAdmins[1], 'Good for announcements, or a Q&A where admins post the questions.'],
      ])),
      field('Who can reply', radios('whoCanReply', [
        everyoneOrAdmins[0],
        [...everyoneOrAdmins[1], 'Everyone else can read and vote, but not reply.'],
      ])),
      field('Posts',
        check('allowEditing', 'People can edit their own posts', 'Edited posts say “edited”. Turn off to keep a fixed record.'),
        check('anonymous', 'Allow anonymous posts', 'People can choose to post without their name. Moderators can still see who wrote it.'))),

    group('Moderation',
      field('Approval', check('requireApproval', 'New threads need a moderator’s approval', 'Until a moderator approves it, a new thread is only visible to its author and the moderators, who are notified. Moderators’ own threads go straight up.')),
      h('p', { class: 'settings-field__hint' },
        `Right now ${roleWho('pinPosts')} can pin threads, and ${roleWho('moderate')} can approve, lock, and delete posts, manage tags, and review reports. `,
        space?.kind === 'group' ? h('a', { href: settingsHref(space.id, 'permissions') }, 'Change who can in Roles & permissions') : null,
        '.')),

    group('Notifications and the Feed',
      field('Notifications', check('notifyNewThreads', 'Tell every member about new threads', 'Each new thread puts a notification in everyone’s bell. Best for small groups or quiet forums.')),
      field('The Feed', check('showInFeed', 'Show new threads in members’ Feeds', 'New threads appear in the Feed of people in this group, never anyone outside it. Each member can still turn this group off in their own feed settings.'))),

    group('Display',
      field('Voting', check('downvotes', 'Allow downvotes', 'Turn off to keep only upvotes (gentler for small groups).')),
      field('Questions and answers', check('qa', 'Threads can have a best answer', 'The person who asked (or a moderator) marks the best reply. Adds an “Unanswered” list.')),
      field('Sort threads by', h('select', {
        class: 'input input--compact',
        onChange: (event) => { draft.defaultSort = event.target.value; },
      }, SORT_OPTIONS.map((o) => h('option', { value: o.id, selected: o.id === draft.defaultSort }, o.label)))),
      field('Guidelines', guidelines, h('span', { class: 'settings-field__hint' }, 'Shown above the threads, folded up.'))),

    h('div', { class: 'form-row' },
      h('button', { type: 'submit', class: 'button button--primary' }, 'Save'),
      h('button', { type: 'button', class: 'button button--quiet', onClick: onClose }, 'Cancel')),
  );
}
