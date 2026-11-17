// @ts-check
/**
 * calendar-feed-section.js — Account → Calendars → "See 3den in your other
 * calendar": subscribe to your 3den events from Google Calendar, Apple
 * Calendar, or Outlook (js/state/calendar-feed.js).
 *
 *   See 3den in your other calendar
 *   Your events show up there and stay up to date.
 *   [Add to Google Calendar] [Add to Apple Calendar] [Add to Outlook]
 *   ▸ Or copy the address   webcal://3den.example/cal/…  [Copy]
 *   On it: (•) Events I'm going to or hosting  ( ) Those, and ones I said maybe to
 *   12 events now · Download them as a file
 *   Make a new address · Stop sharing
 *
 * Before it's on: one line and [Set it up].
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import {
  FEED_CHOICES, feedOf, setFeed, resetFeed, turnOffFeed, webcalUrl, subscribeLinks, feedEvents, feedIcs,
} from '../state/calendar-feed.js';

export function renderCalendarFeedSection(user, redraw) {
  const feed = feedOf(user);
  const section = (/** @type {any[]} */ ...children) => h('section', { class: 'settings-section calendar-feed', id: 'calendar-feed' },
    h('h2', { class: 'settings-section__title' }, 'See 3den in your other calendar'),
    ...children);

  if (!feed) {
    return section(
      h('p', { class: 'settings-section__description' }, 'Your 3den events can show up in Google Calendar, Apple Calendar, or Outlook, and stay up to date when plans change.'),
      h('button', {
        type: 'button', class: 'button button--primary button--small',
        onClick: () => { setFeed(user.id); redraw(); },
      }, icon('calendar', 14), ' Set it up'));
  }

  const links = subscribeLinks(feed);
  const count = feedEvents(user).length;
  const address = webcalUrl(feed);

  const download = () => {
    const a = h('a', { href: URL.createObjectURL(new Blob([feedIcs(user)], { type: 'text/calendar' })), download: '3den.ics' });
    document.body.append(a); a.click(); a.remove();
  };

  return section(
    h('p', { class: 'settings-section__description' }, 'Your events show up there and stay up to date. Pick your calendar:'),
    h('div', { class: 'calendar-feed__apps' },
      h('a', { class: 'button button--small', href: links.google, target: '_blank', rel: 'noopener' }, 'Add to Google Calendar'),
      h('a', { class: 'button button--small', href: links.apple }, 'Add to Apple Calendar'),
      h('a', { class: 'button button--small', href: links.outlook, target: '_blank', rel: 'noopener' }, 'Add to Outlook')),
    h('details', { class: 'calendar-feed__address' },
      h('summary', {}, 'Or copy the address'),
      h('p', { class: 'settings-field__hint' }, 'Paste it where your calendar app says “Subscribe” or “From URL”. Keep it to yourself: anyone with it can see these events.'),
      h('div', { class: 'form-row' },
        h('input', { type: 'text', class: 'input', readOnly: true, value: address, 'aria-label': 'Calendar address', onFocus: (e) => e.target.select() }),
        h('button', {
          type: 'button', class: 'button button--small',
          onClick: () => navigator.clipboard?.writeText(address).then(() => showToast('Address copied.'), () => showToast('Couldn’t copy. Select the address and copy it.')),
        }, 'Copy'))),
    h('div', { class: 'settings-choices', role: 'radiogroup', 'aria-label': 'What’s on it' }, FEED_CHOICES.map((choice) => h('label', { class: 'settings-choice' },
      h('input', { type: 'radio', name: 'feed-include', checked: feed.include === choice.id, onChange: () => { setFeed(user.id, { include: choice.id }); redraw(); } }),
      h('span', {}, choice.label)))),
    h('p', { class: 'settings-field__hint calendar-feed__count' },
      `${count} ${count === 1 ? 'event' : 'events'} on it now. `,
      h('button', { type: 'button', class: 'link-button', onClick: download }, 'Download them as a file')),
    h('p', { class: 'calendar-feed__manage' },
      h('button', {
        type: 'button', class: 'link-button',
        onClick: () => { resetFeed(user.id); redraw(); showToast('New address made. Calendars using the old one stop updating; add the new one.'); },
      }, 'Make a new address'),
      ' · ',
      h('button', {
        type: 'button', class: 'link-button link-button--danger',
        onClick: () => {
          const before = feed;
          turnOffFeed(user.id); redraw();
          showToast('Stopped sharing. Your other calendar stops updating.', { actionLabel: 'Undo', onAction: () => { setFeed(user.id, before); redraw(); } });
        },
      }, 'Stop sharing')),
    h('p', { class: 'settings-field__hint' }, 'Prototype: the address starts working once 3den has a server. Until then, download the file and import it.'));
}
