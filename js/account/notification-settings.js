/**
 * notification-settings.js — Account settings → Notifications, and the
 * preview of the weekly email.
 *
 *   ── Notifications ───────────────────────────────────────────
 *   On this device   [Turn on]  /  ☑ On   ( ) Only things that need me  ( ) Everything   [Send a test]
 *                    ☐ Quiet hours  from [22:00] to [08:00]
 *                    Groups: Porch Lights [Same as above ▾] · Eastside Mutual Aid [Nothing ▾] …
 *                    (On an iPhone in Safari: how to add 3den to the Home Screen first.)
 *   By email         (•) A weekly email  ( ) A daily email  ( ) As it happens  ( ) No emails
 *                    [Preview this week’s email]
 *
 * The rules and the digest itself are in js/state/delivery.js.
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { formatShortDate, formatTime } from '../utils/dates.js';
import {
  prefsOf, setDeliveryPrefs, askForDeviceNotifications, deviceSupport, showOnDevice, weeklyDigest, EMAIL_CHOICES,
  GROUP_PUSH_CHOICES, installHelp, canOfferInstall, offerInstall,
} from '../state/delivery.js';
import { getSpaces } from '../state/store.js';

export function renderNotificationSection(user, redraw) {
  const prefs = prefsOf(user);
  const support = deviceSupport();
  const on = prefs.push && support === 'granted';

  // An iPhone in Safari: notifications only work once 3den is on the Home Screen.
  const iphone = installHelp() === 'iphone'
    ? h('div', { class: 'notify-install' },
      h('p', {}, h('strong', {}, 'To get notifications on this iPhone:')),
      h('ol', {},
        h('li', {}, 'Tap Share ', icon('share', 13), ' at the bottom of Safari.'),
        h('li', {}, 'Tap “Add to Home Screen”.'),
        h('li', {}, 'Open 3den from your Home Screen and come back here.')))
    : null;
  const install = canOfferInstall()
    ? h('button', { type: 'button', class: 'button button--small', onClick: async () => { if (await offerInstall()) showToast('3den is on your home screen.'); redraw(); } }, icon('download', 14), ' Add 3den to your home screen')
    : null;

  const device = iphone ?? (support === 'unsupported'
    ? h('p', { class: 'settings-field__hint' }, 'This browser can’t show notifications.')
    : support === 'denied'
      ? h('p', { class: 'settings-field__hint' }, 'Notifications are blocked for 3den in this browser. Allow them in the browser’s site settings, then come back.')
      : [
        h('label', { class: 'settings-choice' },
          h('input', {
            type: 'checkbox', checked: on,
            onChange: async (event) => {
              if (!event.target.checked) { setDeliveryPrefs(user.id, { push: false }); redraw(); return; }
              const answer = await askForDeviceNotifications();
              setDeliveryPrefs(user.id, { push: answer === 'granted' });
              showToast(answer === 'granted' ? 'Notifications are on for this device.' : 'Notifications weren’t allowed.');
              redraw();
            },
          }),
          h('span', {}, 'Notify me on this device')),
        on ? h('div', { class: 'settings-choices notify-scope', role: 'radiogroup', 'aria-label': 'What to notify me about' },
          [['needs', 'Only things that need me', 'Invitations, mentions, things assigned to you, and changes to events you’re going to'], ['all', 'Everything', 'Group news and new followers too']].map(([id, label, hint]) => h('label', { class: 'settings-choice' },
            h('input', { type: 'radio', name: 'push-scope', checked: prefs.pushScope === id, onChange: () => { setDeliveryPrefs(user.id, { pushScope: id }); redraw(); } }),
            h('span', {}, label, h('span', { class: 'settings-field__hint' }, ` ${hint}`))))) : null,
        on ? quietHours(user, prefs, redraw) : null,
        on ? groupChoices(user, prefs) : null,
        on ? h('button', {
          type: 'button', class: 'button button--small',
          onClick: () => { if (!showOnDevice('This is how 3den will let you know.')) showToast('The test couldn’t be shown.'); },
        }, 'Send a test') : null,
        install,
      ]);

  const email = user.email
    ? [
      h('div', { class: 'settings-choices', role: 'radiogroup', 'aria-label': 'Emails' }, EMAIL_CHOICES.map((choice) => h('label', { class: 'settings-choice' },
        h('input', { type: 'radio', name: 'email-choice', checked: prefs.email === choice.id, onChange: () => { setDeliveryPrefs(user.id, { email: choice.id }); redraw(); } }),
        h('span', {}, choice.label, choice.hint ? h('span', { class: 'settings-field__hint' }, ` ${choice.hint}`) : null)))),
      h('button', { type: 'button', class: 'button button--small', onClick: () => openDigestPreview(user) }, icon('mail', 14), ' Preview this week’s email'),
    ]
    : h('p', { class: 'settings-field__hint' }, 'Add an email address to your profile (above) to get a weekly email.');

  return h('section', { class: 'settings-section', id: 'notification-settings' },
    h('h2', { class: 'settings-section__title' }, 'Notifications'),
    h('p', { class: 'settings-section__description' }, '3den only interrupts you for things that need you. Everything else waits in the bell.'),
    h('h3', { class: 'settings-subtitle' }, 'On this device'), device,
    h('h3', { class: 'settings-subtitle' }, `By email${user.email ? ` (${user.email})` : ''}`), email,
    h('p', { class: 'settings-field__hint' }, 'Prototype: device notifications arrive while 3den is open in a window; emails aren’t really sent.'));
}

/** ☐ Quiet hours from [22:00] to [08:00]: held notifications wait in the bell (reminders still come). */
function quietHours(user, prefs, redraw) {
  const save = (changes) => { setDeliveryPrefs(user.id, { quiet: { ...prefs.quiet, ...changes } }); redraw(); };
  const time = (key, label) => h('input', { type: 'time', class: 'input input--compact', value: prefs.quiet[key], 'aria-label': label, disabled: !prefs.quiet.on, onChange: (e) => e.target.value && save({ [key]: e.target.value }) });
  return h('div', { class: 'notify-quiet' },
    h('label', { class: 'settings-choice' },
      h('input', { type: 'checkbox', checked: prefs.quiet.on, onChange: (e) => save({ on: e.target.checked }) }),
      h('span', {}, 'Quiet hours')),
    h('span', { class: 'notify-quiet__times' }, 'from ', time('from', 'Quiet from'), ' to ', time('to', 'Quiet until')),
    h('span', { class: 'settings-field__hint' }, ' Nothing buzzes then except reminders; the rest waits in the bell.'));
}

/** Each of your groups: Same as above / Everything / Only things that need me / Nothing. */
function groupChoices(user, prefs) {
  const groups = getSpaces().filter((s) => s.kind === 'group' && s.memberIds.includes(user.id)).sort((a, b) => a.name.localeCompare(b.name));
  if (!groups.length) return null;
  return h('details', { class: 'notify-groups' },
    h('summary', {}, `By group${Object.keys(prefs.groups ?? {}).length ? ` (${Object.keys(prefs.groups).length} changed)` : ''}`),
    h('p', { class: 'settings-field__hint' }, 'Busy group? Turn it down here without leaving it.'),
    h('ul', { class: 'notify-groups__list' }, groups.map((group) => h('li', { class: 'notify-groups__row' },
      h('span', {}, group.name),
      h('select', {
        class: 'input input--compact', 'aria-label': `Notifications from ${group.name}`,
        onChange: (e) => {
          const next = { ...prefs.groups };
          if (e.target.value === 'default') delete next[group.id]; else next[group.id] = e.target.value;
          prefs.groups = next;
          setDeliveryPrefs(user.id, { groups: next });
          showToast(`${group.name}: ${GROUP_PUSH_CHOICES.find((c) => c.id === e.target.value)?.label.toLowerCase()}.`);
        },
      }, GROUP_PUSH_CHOICES.map((c) => h('option', { value: c.id, selected: (prefs.groups?.[group.id] ?? 'default') === c.id }, c.label)))))));
}

/** The weekly email, as it would arrive. */
export function openDigestPreview(user) {
  const digest = weeklyDigest(user);
  const previousFocus = document.activeElement;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); previousFocus?.focus?.(); };
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }
  const link = (href, text) => h('a', { href, onClick: close }, text);
  const first = user.name.split(' ')[0];
  const quiet = !digest.needs.length && !digest.week.length && !digest.groups.length;

  const overlay = h('div', { class: 'sub-viewer digest', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'This week’s email' },
    h('div', { class: 'sub-viewer__panel digest__panel' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, icon('mail', 18), ' This week’s email'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: close }, icon('close', 18))),
      h('div', { class: 'digest__meta' }, h('div', {}, h('strong', {}, 'From: '), '3den'), h('div', {}, h('strong', {}, 'To: '), user.email ?? ''),
        h('div', {}, h('strong', {}, 'Subject: '), digest.needs.length ? `${digest.needs.length} ${digest.needs.length === 1 ? 'thing needs' : 'things need'} you, and your week ahead` : 'Your week ahead')),
      h('div', { class: 'digest__body' },
        h('p', {}, `Hi ${first},`),
        quiet ? h('p', {}, 'Nothing needs you this week, and nothing is on the calendar. Enjoy the quiet.') : null,
        digest.needs.length ? [h('h3', {}, 'For you'), h('ul', {}, digest.needs.map((n) => h('li', {}, link(n.href, n.text))))] : null,
        digest.week.length ? [h('h3', {}, 'Your week'), h('ul', {}, digest.week.map(({ date, event, space, going }) => h('li', {},
          h('strong', {}, `${formatShortDate(date)}${event.time ? `, ${formatTime(event.time)}` : ''}: `),
          link(`#event-${event.id}`, event.title), ` · ${space.name}`,
          going === 'going' ? ' · you’re going' : going === 'maybe' ? ' · you said maybe' : ' · not answered yet')))] : null,
        digest.groups.length ? [h('h3', {}, 'In your groups'), h('ul', {}, digest.groups.map(({ space, line }) => h('li', {}, link(`#space-${space.id}`, space.name), `: ${line}`)))] : null,
        h('p', { class: 'digest__foot' }, 'You get this once a week. Change it or turn it off in Account settings → Notifications.'))));
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  overlay.querySelector('.icon-button')?.focus();
}
