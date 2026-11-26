// @ts-check
/**
 * landing.js — the public front page (#welcome), what someone who isn't
 * signed in sees first at 3den's address.
 *
 *   Your groups, organized. Your people, close.
 *   [Join 3den]  [Try the organizer demo]  Sign in
 *
 *   Organize      Events, sign-ups, shifts, and tasks in one place…
 *   Private       No ads, no data brokers, encrypted messages…
 *   Together      A feed that ends, and asks you to show up…
 *
 *   How a group starts: 1 Answer two questions · 2 Invite people · 3 Plan the first thing
 *   Footer: Help · Privacy · Open source
 *
 * "Try the organizer demo" signs in as the demo account Leo and starts the
 * tour (demo-tour.js). Signed-in people can open #welcome too.
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { getCurrentUser } from '../state/store.js';
import { signIn } from '../state/accounts.js';
import { goTo } from '../router.js';
import { SOURCE_CODE_URL } from './help-page.js';

const PILLARS = [
  { icon: 'calendar', title: 'Organize without the spreadsheet', text: 'Events with RSVPs and waitlists, sign-ups right in an announcement, volunteer shifts people take with one tap, and tasks that land on the right person.' },
  { icon: 'lock', title: 'Private by design', text: 'No ads and no data brokers, ever. Direct messages are end-to-end encrypted. Your area shows as a neighborhood, never an address.' },
  { icon: 'people', title: 'Made for showing up', text: 'Your Feed ends when you’re caught up. What’s at the top is what your groups need from you, so you close the app and go do it.' },
];

const STEPS = [
  ['Answer two questions', 'What the group is, and who can see it and join it. Then a quick look around.'],
  ['Invite people', 'A link, a list you already have, or usernames.'],
  ['Plan the first thing', 'An event, a sign-up, or a shift. Reminders go out on their own.'],
];

const FOR = ['Tenant unions', 'Mutual aid', 'Bands', 'Rec leagues', 'Households', 'Classes', 'Neighborhood groups', 'Newsletters'];

export function renderLanding(container) {
  const me = getCurrentUser();
  const signedIn = me && !me.isGuest;
  const tryDemo = () => { signIn('m-leo'); goTo('#tour'); };

  replaceChildren(container, h('div', { class: 'landing' },
    h('section', { class: 'landing__hero' },
      h('h1', { class: 'landing__title' }, 'Your groups, organized.', h('br'), 'Your people, close.'),
      h('p', { class: 'landing__lede' }, 'One place for the groups you’re part of: what’s coming up, who’s bringing what, and the people you do it with. No ads. No bots. No selling you.'),
      h('div', { class: 'landing__actions' },
        signedIn ? h('a', { class: 'button button--primary button--large', href: '#' }, 'Go to your homepage')
          : h('a', { class: 'button button--primary button--large', href: '#signup' }, 'Join 3den'),
        h('button', { type: 'button', class: 'button button--large', onClick: tryDemo }, icon('compass', 16), ' Try the organizer demo'),
        signedIn ? null : h('a', { class: 'link-button landing__signin', href: '#signin' }, 'Sign in')),
      h('p', { class: 'landing__for' }, 'For ', FOR.map((f, i) => [i ? (i === FOR.length - 1 ? ', and ' : ', ') : '', h('span', {}, f.toLowerCase())]), '.')),
    h('section', { class: 'landing__pillars', 'aria-label': 'What 3den is for' }, PILLARS.map((p) => h('article', { class: 'landing__pillar' },
      h('span', { class: 'landing__pillar-icon', 'aria-hidden': 'true' }, icon(p.icon, 22)),
      h('h2', {}, p.title),
      h('p', {}, p.text)))),
    h('section', { class: 'landing__steps' },
      h('h2', {}, 'Starting a group takes a minute'),
      h('ol', {}, STEPS.map(([title, text]) => h('li', {}, h('strong', {}, title), h('span', {}, text)))),
      h('a', { class: 'button button--primary', href: signedIn ? '#new-group' : '#signup' }, 'Start a group')),
    h('footer', { class: 'landing__footer' },
      h('a', { href: '#help' }, 'Help'), ' · ',
      h('a', { href: '#help-privacy' }, 'Privacy'), ' · ',
      // The AGPL asks that people can get the source (help-page.js, SOURCE_CODE_URL).
      h('a', { href: SOURCE_CODE_URL || '#help-start' }, 'Open source'))));
}
