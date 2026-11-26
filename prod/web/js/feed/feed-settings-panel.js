// @ts-check
/**
 * feed-settings-panel.js — "Your feed" in Account settings (#account-feed).
 *
 *   Blogs and the feed   [✓] Use my blog and the Feed
 *   Take a break         [Take a break]  (hides the Feed for 24 hours)
 *   What you follow      3 friends · 2 posts, 4 photo albums, 1 event lately
 *     (RP) Rosa P   [More | Normal | Less | Mute]
 *     (DK) Dev K    [More | Normal | Less | Mute]
 *   Your groups      [✓] Juniper Tenants Union (its forum shares new threads)
 *   Show me          [✓] Posts and writing  [✓] Photos  [✓] Events  [✓] Forum threads
 *   Order            (•) Most relevant  ( ) Newest first
 *                    How "most relevant" works: …
 *   Go back          [30 days ▾]
 *   [ ] Rank friends I message higher   [ ] Include my own posts
 *
 * Every change saves right away (they only affect what you see).
 */

import { h } from '../ui/dom.js';
import { avatar } from '../ui/avatar.js';
import { getMember, getSpaces } from '../state/store.js';
import { getFriendIds, usesSocial } from '../state/friends.js';
import { blogHref } from '../router.js';
import { feedBreakControl } from './feed-break.js';
import { collectFeedItems } from './feed-items.js';
import { settingsOf as forumSettingsOf } from '../modules/forum/forum-data.js';
import { PEOPLE_LEVELS, DAY_CHOICES, KINDS, getFeedSettings, updateFeedSettings, levelOf, showsGroup } from './feed-settings.js';

export function renderFeedSettingsSection(me, redraw) {
  const on = usesSocial(me.id);
  const settings = getFeedSettings(me.id);
  const change = (fn) => { updateFeedSettings(me.id, fn); redraw(); };

  // Turning blogs and the Feed off and on lives in "Parts of 3den you use".
  const optOut = h('p', { class: 'settings-field__hint' }, 'Blogs and the Feed are off. ',
    h('a', { href: '#account-parts' }, 'Turn them back on in “Parts of 3den you use”'), '.');
  if (!on) return section(optOut);

  const friendIds = getFriendIds(me.id);
  const items = collectFeedItems(friendIds);
  const count = (group) => items.filter((i) => i.kindGroup === group).length;

  const people = friendIds.length === 0
    ? h('p', { class: 'settings-field__hint' }, 'You don’t have friends on 3den yet, so your feed is empty. ', h('a', { href: '#feed-friends' }, 'Find people you know'), '.')
    : h('ul', { class: 'feed-settings__people' }, friendIds.map(getMember).filter(Boolean).map((friend) => h('li', { class: 'feed-settings__person' },
      avatar(friend, 28),
      h('a', { href: blogHref(friend), class: 'feed-settings__name' }, friend.name),
      h('span', { class: 'feed-settings__count' }, `${items.filter((i) => i.authorId === friend.id).length} recent`),
      h('div', { class: 'segmented', role: 'group', 'aria-label': `How much of ${friend.name} to show` },
        PEOPLE_LEVELS.map((level) => h('button', {
          type: 'button',
          class: `segmented__option${levelOf(settings, friend.id) === level.id ? ' is-active' : ''}`,
          'aria-pressed': String(levelOf(settings, friend.id) === level.id),
          onClick: () => change((s) => { s.people[friend.id] = level.id; }),
        }, level.label))))));

  // Your groups whose forums share new threads to members' Feeds.
  const sharingGroups = getSpaces().filter((space) => space.kind === 'group' && space.memberIds.includes(me.id)
    && space.modules.some((m) => m.type === 'forum' && forumSettingsOf(m.data ?? {}).showInFeed));
  const groups = h('div', { class: 'settings-field' },
    h('span', { class: 'settings-field__label' }, 'Your groups'),
    sharingGroups.length
      ? [
          h('p', { class: 'settings-field__hint' }, 'These groups’ moderators chose to share new forum threads with members’ Feeds. Untick a group to keep its threads out of yours.'),
          h('div', { class: 'settings-choices' }, sharingGroups.map((space) => h('label', { class: 'settings-choice' },
            h('input', { type: 'checkbox', checked: showsGroup(settings, space.id), onChange: (event) => change((s) => { s.groups[space.id] = event.target.checked; }) }),
            h('span', {}, h('strong', {}, space.name))))),
        ]
      : h('p', { class: 'settings-field__hint' }, 'None of your groups share forum threads to the Feed. A group’s moderators can turn this on in its forum’s settings.'));

  return section(
    h('div', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Take a break'),
      h('p', { class: 'settings-field__hint' }, 'Hide your feed, and “From friends” on your Dashboard, for 24 hours. Everything else keeps working.'),
      feedBreakControl(me, { onStart: redraw })),
    groups,
    h('div', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'What you follow'),
      h('p', { class: 'settings-field__hint' },
        `Your feed shows your ${friendIds.length} ${friendIds.length === 1 ? 'friend’s' : 'friends’'} blogs. Lately that’s ${count('posts')} ${count('posts') === 1 ? 'post' : 'posts'}, ${count('photos')} photo ${count('photos') === 1 ? 'update' : 'updates'} and ${count('events')} ${count('events') === 1 ? 'event' : 'events'}. Choose how much of each person to see:`),
      people),
    h('div', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Show me'),
      h('div', { class: 'feed-settings__row' }, KINDS.map((kind) => h('label', { class: 'page-control' },
        h('input', { type: 'checkbox', checked: settings.show[kind.id], onChange: (event) => change((s) => { s.show[kind.id] = event.target.checked; }) }),
        h('span', {}, kind.label))))),
    h('div', { class: 'settings-field' },
      h('span', { class: 'settings-field__label' }, 'Order'),
      h('div', { class: 'settings-choices', role: 'radiogroup', 'aria-label': 'Order' },
        [['relevant', 'Most relevant', 'People you chose “More” for, events coming up soon, and friends you’ve messaged lately come first; everything fades with age.'],
          ['newest', 'Newest first', 'Just the time it was posted. Your More/Less choices still hide muted people.']].map(([id, label, hint]) => h('label', { class: 'settings-choice' },
          h('input', { type: 'radio', name: 'feed-order', checked: settings.order === id, onChange: () => change((s) => { s.order = id; }) }),
          h('span', {}, h('strong', {}, label), h('span', { class: 'settings-field__hint' }, hint))))),
      settings.order === 'relevant' ? h('details', { class: 'feed-settings__how' },
        h('summary', {}, 'How “most relevant” is worked out'),
        h('p', {}, 'Each item gets a score: ', h('strong', {}, 'person × freshness × boosts'), '.'),
        h('ul', {},
          h('li', {}, 'Person: More counts double, Normal once, Less 0.4 times. Muted people are hidden.'),
          h('li', {}, 'Freshness: a brand-new item counts fully, half after a day, a third after two days, and so on.'),
          h('li', {}, 'Boosts: ×1.5 for an event in the next two weeks; ×1.3 for friends you’ve messaged in the last two weeks (if turned on below).')),
        h('p', {}, 'Nothing else is used: no ads, no engagement tricks. Each item in your feed says why it’s there.')) : null),
    h('div', { class: 'feed-settings__row' },
      h('label', { class: 'page-control' }, h('span', { class: 'page-control__label' }, 'Go back'),
        h('select', { class: 'input input--compact', onChange: (event) => change((s) => { s.days = Number(event.target.value); }) },
          DAY_CHOICES.map((d) => h('option', { value: d, selected: d === settings.days }, d === 365 ? 'a year' : `${d} days`)))),
      h('label', { class: 'page-control' },
        h('input', { type: 'checkbox', checked: settings.boostMessaged, onChange: (event) => change((s) => { s.boostMessaged = event.target.checked; }) }),
        h('span', {}, 'Rank friends I message higher')),
      h('label', { class: 'page-control' },
        h('input', { type: 'checkbox', checked: settings.includeMine, onChange: (event) => change((s) => { s.includeMine = event.target.checked; }) }),
        h('span', {}, 'Include my own posts')),
      h('label', { class: 'page-control', title: 'Groups you follow but aren’t in, like a venue or a shop' },
        h('input', { type: 'checkbox', checked: settings.calmFollows, onChange: (event) => change((s) => { s.calmFollows = event.target.checked; }) }),
        h('span', {}, 'Keep groups I follow calm: one post a day from each, never more than a quarter of my Feed (all of it is under Following)'))),
  );
}

function section(...children) {
  return h('section', { class: 'settings-section', id: 'feed-settings' },
    h('h2', { class: 'settings-section__title' }, 'Your feed'),
    h('p', { class: 'settings-section__description' }, 'What shows up in your Feed, and in what order. Changes save right away and only affect what you see.'),
    ...children);
}
