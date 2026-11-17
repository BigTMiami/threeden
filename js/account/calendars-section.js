// @ts-check
/**
 * calendars-section.js — Account → Calendars: connect your other
 * calendars so event cards can say "You're free" or "Clashes with …".
 *
 *   Your calendars
 *   ☑ Work · Google Calendar · 14 events · checked 2 min ago   Refresh  Remove
 *
 *   Connect a calendar
 *   [Google Calendar] [Apple Calendar] [Outlook] [A calendar file]
 *     How: Settings → the calendar → "Secret address in iCal format".
 *     Name [Work      ]  Address [https://calendar.google.com/…/basic.ics] [Connect]
 *     or [Pick an .ics file]
 *   Try it with a sample calendar
 *
 * Only you see these calendars; 3den uses them just to tell you whether
 * you're free (js/state/external-calendars.js).
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { timeAgo } from '../utils/dates.js';
import {
  PROVIDERS, calendarsOf, connectCalendar, updateCalendar, removeCalendar, restoreCalendar, fetchIcs, refreshCalendar, sampleIcs,
} from '../state/external-calendars.js';

export function renderCalendarsSection(user, redraw) {
  let provider = null; // the connect panel that's open
  const root = h('div', {});

  const draw = () => {
    const list = calendarsOf(user);
    replaceChildren(root,
      h('section', { class: 'settings-section' },
        h('h2', { class: 'settings-section__title' }, 'Your calendars'),
        h('p', { class: 'settings-section__description' }, 'Event cards say whether you’re free, checking these and what you’ve said yes to on 3den. Only you see them.'),
        list.length ? h('ul', { class: 'ext-calendars' }, list.map((calendar) => h('li', { class: 'ext-calendars__row' },
          h('label', { class: 'ext-calendars__check' },
            h('input', { type: 'checkbox', checked: calendar.on, onChange: (e) => { updateCalendar(user.id, calendar.id, { on: e.target.checked }); redraw(); } }),
            h('span', {}, h('strong', {}, calendar.name), ` · ${PROVIDERS[calendar.provider]?.label ?? 'Calendar'}`)),
          h('span', { class: 'ext-calendars__meta' }, `${calendar.events.length} ${calendar.events.length === 1 ? 'event' : 'events'} · ${calendar.url ? `checked ${timeAgo(calendar.syncedAt)}` : `added ${timeAgo(calendar.syncedAt)}`}`),
          calendar.url ? h('button', {
            type: 'button', class: 'link-button',
            onClick: async () => {
              try { await refreshCalendar(user.id, calendar); showToast('Up to date.'); redraw(); } catch { showToast('Couldn’t reach that calendar from here. Upload its .ics file instead.'); }
            },
          }, 'Refresh') : null,
          h('button', {
            type: 'button', class: 'link-button link-button--danger',
            onClick: () => {
              const before = removeCalendar(user.id, calendar.id);
              redraw();
              showToast(`Removed “${calendar.name}”.`, { actionLabel: 'Undo', onAction: () => { restoreCalendar(user.id, before); redraw(); } });
            },
          }, 'Remove'))))
          : h('p', { class: 'module-empty' }, 'None yet.')),
      h('section', { class: 'settings-section' },
        h('h2', { class: 'settings-section__title' }, 'Connect a calendar'),
        h('div', { class: 'ext-calendars__providers' }, Object.entries(PROVIDERS).map(([id, p]) => h('button', {
          type: 'button', class: `button button--small${provider === id ? ' button--primary' : ''}`, 'aria-pressed': String(provider === id),
          onClick: () => { provider = provider === id ? null : id; draw(); },
        }, p.label))),
        provider ? connectPanel(provider) : null,
        h('p', { class: 'ext-calendars__sample' },
          h('button', {
            type: 'button', class: 'link-button',
            onClick: () => { connectCalendar(user.id, { name: 'Sample: work and errands', provider: 'file', text: sampleIcs() }); showToast('Added a sample calendar.'); redraw(); },
          }, icon('calendar', 13), ' Try it with a sample calendar'))));
  };

  function connectPanel(id) {
    const name = h('input', { type: 'text', class: 'input', value: id === 'file' ? '' : PROVIDERS[id].label, placeholder: 'Work, Family…', 'aria-label': 'Calendar name' });
    const url = h('input', { type: 'url', class: 'input', placeholder: 'https://… or webcal://…  (ends in .ics)', 'aria-label': 'Calendar address' });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const file = h('input', {
      type: 'file', accept: '.ics,text/calendar', hidden: true,
      onChange: async () => {
        const picked = file.files?.[0];
        if (!picked) return;
        const text = await picked.text();
        if (!/BEGIN:VCALENDAR/.test(text)) { error.textContent = 'That file isn’t a calendar (.ics).'; return; }
        // A name they typed wins; otherwise the file's name ("Family.ics" → "Family").
        const typed = name.value.trim();
        const calendar = connectCalendar(user.id, { name: typed && typed !== PROVIDERS[id].label ? typed : picked.name.replace(/\.ics$/i, ''), provider: id, text });
        showToast(`Connected “${calendar.name}” (${calendar.events.length} events).`);
        redraw();
      },
    });
    const pickFile = h('button', { type: 'button', class: 'button button--small', onClick: () => file.click() }, 'Pick an .ics file');
    return h('div', { class: 'ext-calendars__connect' },
      h('p', { class: 'settings-field__hint' }, PROVIDERS[id].steps),
      h('label', { class: 'settings-field' }, h('span', { class: 'settings-field__label' }, 'Name'), name),
      id === 'file' ? null : h('form', {
        class: 'form-row',
        onSubmit: async (e) => {
          e.preventDefault();
          if (!url.value.trim()) { error.textContent = 'Paste the calendar’s address first.'; return; }
          error.textContent = 'Connecting…';
          try {
            const text = await fetchIcs(url.value);
            const calendar = connectCalendar(user.id, { name: name.value.trim(), provider: id, url: url.value.trim(), text });
            showToast(`Connected “${calendar.name}” (${calendar.events.length} events).`);
            redraw();
          } catch {
            error.textContent = 'Couldn’t reach that address from here. Download the calendar as an .ics file and pick it below.';
          }
        },
      }, url, h('button', { type: 'submit', class: 'button button--primary button--small' }, 'Connect')),
      h('div', { class: 'form-row' }, id === 'file' ? null : h('span', { class: 'settings-field__hint' }, 'or'), pickFile, file),
      error);
  }

  draw();
  return root;
}
