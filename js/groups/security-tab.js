// @ts-check
/**
 * security-tab.js — Group settings → Security (Nov 18), for whoever can
 * manage roles. Changes save at once.
 *
 *   At a glance        Encrypted: posts, chat, calendar, files · 1 of 2 admins use a passkey
 *   Encryption         ☑ Encrypt this group's private content
 *   Passkeys           ○ Nobody has to  ○ Admins  ○ Everyone
 *   New members        ○ Nothing from before they joined  ○ The last 30 days  ○ Everything
 *   Invite links       expire: Never / a day / a week / 30 days · Reset invite links
 *   Group chat         disappearing messages
 *   Vault              who can publish a file to a public link
 *   Always on          membership and device changes show in the group; …
 *
 * Settings live in space.security (js/state/security.js).
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { getMember } from '../state/store.js';
import { resetInviteLink } from '../state/groups.js';
import { openDirectConversation, setDisappearing } from '../state/messages.js';
import { goTo } from '../router.js';
import { groupSecurity, setGroupSecurity, adminPasskeys, groupChatIds, DISAPPEAR_LABELS, DISAPPEAR_MS } from '../state/security.js';

const radios = (name, label, options, value, onChange, hint) => h('fieldset', { class: 'settings-field settings-fieldset' },
  h('legend', { class: 'settings-field__label' }, label),
  h('div', { class: 'settings-choices', role: 'radiogroup', 'aria-label': label },
    options.map((o) => h('label', { class: 'settings-choice' },
      h('input', { type: 'radio', name, value: o.id, checked: value === o.id, onChange: () => onChange(o.id) }),
      h('span', {}, h('strong', {}, o.label), o.hint ? h('span', { class: 'settings-field__hint' }, o.hint) : null)))),
  hint ? h('span', { class: 'settings-field__hint' }, hint) : null);

function section(title, description, ...children) {
  return h('section', { class: 'settings-section security-section' },
    h('h2', { class: 'settings-section__title' }, title),
    description ? h('p', { class: 'settings-section__description' }, description) : null,
    ...children);
}

/**
 * @param {any} space
 * @param {any} me
 * @param {() => void} redraw
 */
export function renderSecurityTab(space, me, redraw) {
  const sec = groupSecurity(space);
  const save = (patch, message) => { setGroupSecurity(space.id, patch); if (message) showToast(message); redraw(); };
  const admins = adminPasskeys(space);
  const isPublic = space.visibility === 'public';

  const glance = h('section', { class: 'settings-section security-glance', 'aria-label': 'At a glance' },
    h('p', { class: 'security-glance__row' }, icon(sec.encrypt ? 'lock' : 'eyeOff', 16),
      sec.encrypt ? ' Encrypted on members’ devices: posts, chat, calendar, and files' : ' Not encrypted: 3den’s servers can read this group’s private content'),
    isPublic ? h('p', { class: 'security-glance__row' }, icon('globe', 16), ' Public tabs aren’t encrypted: anyone can read them') : null,
    h('p', { class: 'security-glance__row' }, icon('shield', 16), ` ${admins.withPasskey} of ${admins.total} admin${admins.total === 1 ? '' : 's'} use${admins.total === 1 ? 's' : ''} a passkey`),
    admins.missing.length ? h('ul', { class: 'security-missing' }, admins.missing.map((id) => {
      const m = getMember(id);
      if (!m) return null;
      return h('li', {}, avatar(m, 22), ` ${id === me.id ? 'You' : m.name}`,
        id === me.id
          ? h('a', { class: 'link-button', href: '#account-security' }, 'Add one')
          : h('button', {
            type: 'button', class: 'link-button',
            onClick: () => goTo(`#messages-${openDirectConversation(me.id, id).id}`),
          }, 'Ask them'));
    })) : null);

  const encryption = section('Encryption', null,
    h('label', { class: 'settings-choice security-check' },
      h('input', { type: 'checkbox', checked: sec.encrypt, onChange: (e) => save({ encrypt: e.target.checked }, e.target.checked ? 'Private content is encrypted on members’ devices.' : 'Private content is no longer encrypted.') }),
      h('span', {}, h('strong', {}, 'Encrypt this group’s private content'),
        h('span', { class: 'settings-field__hint' }, 'Posts, the group chat, the calendar, and vault files are locked on members’ devices, so 3den’s servers keep only locked copies. Search runs on each member’s device. Turn it off only if the group needs 3den to read it (for example, to moderate for you).'))));

  const passkeys = section('Passkeys', 'A passkey can’t be phished or reused, unlike a password.',
    radios('require-passkey', 'Who has to use a passkey', [
      { id: 'none', label: 'Nobody has to', hint: 'Members choose for themselves.' },
      { id: 'admins', label: 'Admins and the owner', hint: 'The accounts that can change everything. Recommended.' },
      { id: 'everyone', label: 'Everyone', hint: 'For groups whose members could be targeted. People without one are asked to add one.' },
    ], sec.requirePasskey, (v) => save({ requirePasskey: v }, { none: 'Passkeys are up to each member.', admins: 'Admins are asked to use a passkey.', everyone: 'Everyone is asked to use a passkey.' }[v])));

  const history = section('New members', null,
    radios('history', 'What new members can read from before they joined', [
      { id: 'none', label: 'Nothing from before they joined', hint: 'The safest: a new account, or a stolen one, can’t read back.' },
      { id: '30d', label: 'The last 30 days' },
      { id: 'all', label: 'Everything' },
    ], sec.history, (v) => save({ history: v }), 'For the group chat and posts. Pinned posts and the calendar are always there.'));

  const invites = section('Invite links', null,
    h('label', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Invite links stop working'),
      h('select', {
        class: 'input input--compact', 'aria-label': 'Invite links stop working',
        onChange: (e) => save({ inviteExpiry: e.target.value }),
      }, [['never', 'Never'], ['1d', 'After a day'], ['7d', 'After a week'], ['30d', 'After 30 days']].map(([id, label]) => h('option', { value: id, selected: sec.inviteExpiry === id }, label))),
      h('span', { class: 'settings-field__hint' }, 'A link that gets forwarded around keeps working until it expires or you reset it.')),
    space.inviteCode ? h('div', { class: 'form-row' }, h('button', {
      type: 'button', class: 'button',
      onClick: () => { resetInviteLink(space.id); showToast('Invite links were reset. Old links don’t work anymore.'); redraw(); },
    }, 'Reset invite links')) : null);

  const chat = section('Group chat', null,
    h('label', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Disappearing messages'),
      h('select', {
        class: 'input input--compact', 'aria-label': 'Disappearing messages',
        onChange: (e) => {
          // The chat's own timer follows, with its usual notice in the chat.
          for (const id of groupChatIds(space)) setDisappearing(id, me.id, DISAPPEAR_MS[e.target.value] ?? 0);
          save({ disappearing: e.target.value }, e.target.value === 'off' ? 'Messages stay in the group chat.' : `Messages in the group chat disappear ${DISAPPEAR_LABELS[e.target.value].toLowerCase()}.`);
        },
      }, Object.entries(DISAPPEAR_LABELS).map(([id, label]) => h('option', { value: id, selected: sec.disappearing === id }, label))),
      h('span', { class: 'settings-field__hint' }, 'Everyone in the chat sees the setting, and when it changed.')));

  const vault = section('Vault', null,
    radios('publish-files', 'Who can publish a vault file to a public link', [
      { id: 'admins', label: 'Admins' },
      { id: 'editors', label: 'Anyone who can edit the vault' },
      { id: 'nobody', label: 'Nobody', hint: 'Files can still be shared with people by name.' },
    ], sec.publishFiles, (v) => save({ publishFiles: v }), 'A published file is readable by anyone with the link, so it isn’t encrypted.'));

  const always = section('Always on', 'These can’t be turned off, so nobody (including 3den) can quietly read along.',
    h('ul', { class: 'security-facts' },
      h('li', {}, icon('people', 14), ' Everyone sees when someone joins, leaves, or is added'),
      h('li', {}, icon('phone', 14), ' Everyone sees when a member adds a new device'),
      h('li', {}, icon('bell', 14), ' Notifications never carry what a post or message says, unless a member turns that on for themselves')));

  return h('div', { class: 'security-tab' }, glance, encryption, passkeys, history, invites, chat, vault, always);
}
