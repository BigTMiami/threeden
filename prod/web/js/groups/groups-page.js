// @ts-check
/**
 * groups-page.js — the Groups page (#groups; #groups-explore for Explore).
 *
 *   [ Your groups | Explore ]                        [ + Create a group ]
 *
 *   Your groups: tiles, each with the group's cover, name, a line about it,
 *   and members and last visit (Tiles · List switches to a table; the
 *   choice is remembered in this browser).
 *     ┌────────────┐ ┌────────────┐ ┌────────────┐
 *     │ ▒▒cover▒▒▒ │ │ ▒▒cover▒▒▒ │ │ ▒▒cover▒▒▒ │
 *     │ (JT) Junip…│ │ (PL) Porch…│ │ (EM) Easts…│
 *     │ Tenants on…│ │ Songs and …│ │ Free groce…│
 *     │ 9 · 2h ago │ │ 4 · today  │ │ 6 · 1d ago │
 *     └────────────┘ └────────────┘ └────────────┘
 *
 *   Explore: groups you're not in that anyone can find, and public events.
 *     [ Search groups and events ]
 *     Maple Ave Tenants Union                                 [ Join ]
 *     Public · 3 members · Tenants on Maple Ave organizing…
 *
 *     Public events
 *     [NOV 16] Tenants union general meeting · Maple Ave Tenants Union
 *              6:30 – 8:00pm · St. Mark's · 2 going      [👍][🤔][😢]
 *
 * Only public groups show up here. Open ones can be joined in one click;
 * "Ask to join" ones send a request that the group's admins see in
 * Settings → Members. Groups whose members are invited or added by admins
 * (a band, a newsroom) get a link to their public page, where you can follow.
 */

import { isFollowing, toggleFollow } from '../state/follows.js';
import { isChild, isWaitingFor } from '../state/children.js';
import { updateProfile } from '../state/accounts.js';
import { renderAreaMap } from '../ui/area-map.js';
import { joiningOf } from '../state/group-access.js';
import { renderEventTags } from '../events/event-tags.js';
import { formatMiles, placeById, guessPlace, distanceMiles } from '../utils/places.js';
import {
  INTERESTS, interestById, interestsOf, setInterests, suggestedInterests, rankGroups, whereChoices, inWhere, publicPlaceIds, eventInterests, friendsInLine,
} from '../state/explore.js';
import { getFriendIds } from '../state/friends.js';
import { friendsGoingLine } from '../events/regulars.js';
import { choiceMenu } from '../ui/choice-menu.js';
import { avatar } from '../ui/avatar.js';
import { h, replaceChildren, debounce } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { timeAgo } from '../utils/dates.js';
import { groupInitials } from '../utils/initials.js';
import { getCurrentUser, getGroupsByRecentVisit, getLastVisit, getSpaceMembers, getMember, publicTabsOf } from '../state/store.js';
import { roleOf, roleLabel } from '../state/permissions.js';
import {
  getDiscoverableGroups, hasRequestedToJoin, joinOrRequest, declineJoinRequest, getInvitesFor, acceptInvite, cancelInvite,
} from '../state/groups.js';
import { goTo, spaceHref, settingsHref } from '../router.js';
import { coverStyle } from './appearance.js';
import { getPublicEvents, updateEvent, areaOf } from '../state/events.js';
import { applyRsvp, occurrenceTimeLabel, colorValue } from '../modules/calendar/calendar-data.js';
import { rsvpButtons, rsvpSummary } from '../events/rsvp.js';
import { dateBlock } from '../modules/events/events-list.js';
import { eventHref, directionsButton } from '../events/event-details.js';
import { availabilityChip } from '../ui/availability-chip.js';

const SEARCH_DELAY_MS = 150;

export function renderGroupsPage(container, tab = 'yours') {
  const me = getCurrentUser();
  const child = isChild(me.id);
  const isExplore = tab === 'explore' && !child; // child accounts don't explore (children.js)
  const redraw = () => renderGroupsPage(container, tab);

  // No page title: the tabs say where you are, and Create a group sits on the same line.
  replaceChildren(container,
    h('h1', { class: 'visually-hidden' }, 'Groups'),
    h('div', { class: 'groups-page__bar' },
      h('nav', { class: 'settings-tabs groups-page__tabs', 'aria-label': 'Groups' },
        h('a', { href: '#groups', class: `settings-tabs__tab${isExplore ? '' : ' is-active'}`, 'aria-current': isExplore ? null : 'page' }, 'Your groups'),
        child ? null : h('a', { href: '#groups-explore', class: `settings-tabs__tab${isExplore ? ' is-active' : ''}`, 'aria-current': isExplore ? 'page' : null }, 'Explore')),
      child ? null : h('a', { class: 'button button--primary groups-page__create', href: '#new-group' }, icon('plus', 14), ' Create a group')),
    child ? h('p', { class: 'settings-field__hint groups-page__child-note' }, icon('lock', 13), ' Your parent picks the groups you join. When someone invites you, we ask them first.') : null,
    isExplore ? null : renderInvitations(me, redraw),
    isExplore ? renderExplore(me, redraw) : renderYourGroups(me, redraw),
  );
}

// ─── Invitations ─────────────────────────────────────────────────────────────

/** Groups someone invited you to: Accept or Decline. Nothing when there are none. */
function renderInvitations(me, redraw) {
  const invites = getInvitesFor(me.id);
  if (invites.length === 0) return null;
  return h('div', { class: 'settings-section invitations' },
    h('h2', { class: 'settings-section__title' }, `Invitations · ${invites.length}`),
    h('ul', { class: 'explore-list' }, invites.map(({ space, invite }) => h('li', { class: 'explore-list__row' },
      h('span', { class: 'groups-menu__badge explore-list__badge', 'aria-hidden': 'true' }, groupInitials(space.name)),
      h('div', { class: 'explore-list__text' },
        h('h3', { class: 'explore-list__name' }, space.name),
        h('p', { class: 'explore-list__meta' }, `${getMember(invite.invitedBy)?.name ?? 'Someone'} invited you · ${timeAgo(invite.at)} · ${getSpaceMembers(space).length} members`),
        space.description ? h('p', { class: 'explore-list__description' }, space.description) : null),
      h('span', { class: 'invitations__actions' },
        h('button', {
          type: 'button',
          class: 'button button--primary',
          onClick: () => {
            if (acceptInvite(space.id, me.id) === 'asked') { showToast(`We asked your parent if you can join ${space.name}.`); redraw(); return; }
            showToast(`You joined ${space.name}.`); goTo(spaceHref(space.id));
          },
        }, isChild(me.id) ? (isWaitingFor(me.id, space.id) ? 'Waiting for a parent' : 'Ask a parent') : 'Accept'),
        h('button', {
          type: 'button',
          class: 'button',
          onClick: () => { cancelInvite(space.id, me.id); showToast(`Declined the invitation to ${space.name}.`); redraw(); },
        }, 'Decline')),
    ))));
}

// ─── Your groups ─────────────────────────────────────────────────────────────

const VIEW_KEY = '3den.groups-view';
const groupsView = () => { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'tiles'; } catch { return 'tiles'; } };

/** A cover for a tile: the group's own, or a soft color from its accent (or name) when it has none. */
function tileCover(group) {
  const style = group.appearance?.cover ? coverStyle({ focus: 50, ...group.appearance.cover }) : null;
  if (style) return style;
  const hue = [...group.name].reduce((n, c) => n + c.charCodeAt(0), 0) % 360;
  const accent = group.appearance?.accent || `hsl(${hue} 45% 55%)`;
  return { background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 45%, #ffffff))` };
}

function renderYourGroups(me, redraw) {
  const groups = getGroupsByRecentVisit();
  if (groups.length === 0) {
    return h('div', { class: 'empty-state' },
      h('p', { class: 'empty-state__title' }, 'You’re not in any groups yet.'),
      h('p', {}, h('a', { href: '#groups-explore' }, 'Explore groups you can join'), ' or ', h('a', { href: '#new-group' }, 'start your own'), '.'));
  }
  const view = groupsView();
  const switcher = h('div', { class: 'segmented groups-page__view', role: 'group', 'aria-label': 'Show groups as' },
    [['tiles', 'Tiles'], ['list', 'List']].map(([id, label]) => h('button', {
      type: 'button', class: `segmented__option${view === id ? ' is-active' : ''}`, 'aria-pressed': String(view === id),
      onClick: () => { try { localStorage.setItem(VIEW_KEY, id); } catch { /* not remembered */ } redraw(); },
    }, label)));

  if (view === 'tiles') {
    return h('div', { class: 'groups-gallery-wrap' }, switcher,
      h('ul', { class: 'groups-gallery' }, groups.map((group) => {
        const lastVisit = getLastVisit(group.id);
        const requests = roleOf(group, me.id) !== 'member' ? group.joinRequests?.length ?? 0 : 0;
        const count = getSpaceMembers(group).length;
        return h('li', { class: 'group-tile' },
          h('a', { class: 'group-tile__link', href: spaceHref(group.id) },
            h('span', { class: 'group-tile__cover', style: tileCover(group), 'aria-hidden': 'true' }),
            h('span', { class: 'group-tile__body' },
              h('span', { class: 'group-tile__name' },
                h('span', { class: 'groups-menu__badge group-tile__badge', 'aria-hidden': 'true' }, groupInitials(group.name)),
                h('span', {}, group.name)),
              group.description ? h('span', { class: 'group-tile__about' }, group.description) : null,
              h('span', { class: 'group-tile__meta' }, `${count} ${count === 1 ? 'member' : 'members'} · ${lastVisit ? `visited ${timeAgo(lastVisit)}` : 'not visited yet'}`))),
          requests ? h('a', { class: 'group-tile__requests', href: settingsHref(group.id, 'members') }, `${requests} ${requests === 1 ? 'request' : 'requests'}`) : null);
      })));
  }

  return h('div', { class: 'settings-section groups-table-wrap' }, switcher,
    h('table', { class: 'groups-table' },
      h('thead', {}, h('tr', {},
        ['Group', 'Members', 'Last visit', ''].map((label) => h('th', { scope: 'col' }, label)))),
      h('tbody', {}, groups.map((group) => {
        const lastVisit = getLastVisit(group.id);
        const requests = group.joinRequests?.length ?? 0;
        return h('tr', {},
          h('th', { scope: 'row' },
            h('a', { class: 'groups-table__name', href: spaceHref(group.id) },
              h('span', { class: 'groups-menu__badge', 'aria-hidden': 'true' }, groupInitials(group.name)),
              group.name),
            // Your role only when you help run it; who can see it and who's online are on the group's own page.
            roleOf(group, me.id) !== 'member' ? h('span', { class: 'groups-table__role' }, roleLabel(roleOf(group, me.id))) : null),
          // data-label: on phones the table becomes a list, and each value says what it is.
          h('td', { 'data-label': 'Members' }, String(getSpaceMembers(group).length)),
          h('td', { class: 'groups-table__muted', 'data-label': 'Visited' }, lastVisit ? timeAgo(lastVisit) : 'Never'),
          h('td', { class: 'groups-table__actions' },
            requests && roleOf(group, me.id) !== 'member'
              ? h('a', { href: settingsHref(group.id, 'members'), class: 'groups-table__requests' }, `${requests} ${requests === 1 ? 'request' : 'requests'}`)
              : null,
            h('a', { href: settingsHref(group.id) }, 'Settings')),
        );
      })),
    ),
  );
}

// ─── Explore ─────────────────────────────────────────────────────────────────

/**
 * Explore (js/state/explore.js): what you're into, then where, then
 * groups for you (friends first, then your interests, then nearby), then
 * events. The search box narrows both.
 *
 *   [ Search public groups and events ]
 *   What are you into?  [🎵 Music] [🌳 Outdoors] [🎨 Arts and books] …
 *   Where: [Within 5 mi of Juniper Lane ▾]
 *   Groups for you
 *     (ER) Eastside Rec Soccer · Sports and fitness · Eastside · 1.6 mi · 3 members   [Join]
 *          ●● Maya is in it
 *     Show all 12
 *   Events                                       [For you | Soonest | Nearest]
 *     [NOV 16] …
 */
let exploreWhere = 'near'; // 'near' | 'anywhere' | a place id; kept while you're on the page
let exploreSort = 'foryou'; // or 'soonest', 'nearest'
let showAllGroups = false;
const GROUPS_SHOWN = 5;

function renderExplore(me, redraw) {
  let search = '';
  const area = areaOf(me);
  if (!area && exploreWhere === 'near') exploreWhere = 'anywhere';
  const results = h('ul', { class: 'explore-list explore-groups' });
  const groupsMore = h('div', { class: 'explore-groups__more' });
  const eventResults = h('ul', { class: 'explore-list explore-events' });
  const eventsNote = h('div', { class: 'explore-events__note' });
  const interestRow = h('div', { class: 'explore-interests', role: 'group', 'aria-label': 'What are you into?' });
  const whereSlot = h('span', { class: 'explore-where' });
  const sortSwitch = h('div', { class: 'segmented explore-sort', role: 'group', 'aria-label': 'Sort events' });

  const allGroups = getDiscoverableGroups(me.id);
  const allEvents = getPublicEvents();
  const places = publicPlaceIds(allGroups, allEvents);

  function drawResults() {
    const query = search.trim().toLowerCase();
    const mine = new Set(interestsOf(me));

    // Groups for you.
    const ranked = rankGroups(me, allGroups.filter((g) => !query || `${g.name} ${g.description ?? ''} ${g.groupType ?? ''}`.toLowerCase().includes(query)), { where: exploreWhere });
    const shownGroups = showAllGroups || query ? ranked : ranked.slice(0, GROUPS_SHOWN);
    replaceChildren(results, shownGroups.length
      ? shownGroups.map((row) => renderExploreRow(row.space, me, redraw, row))
      : h('li', { class: 'module-empty explore-list__empty' }, query ? `No groups match “${search.trim()}” here.` : 'No public groups here yet. Try Anywhere, or start one.'));
    replaceChildren(groupsMore, !query && ranked.length > GROUPS_SHOWN
      ? h('button', { type: 'button', class: 'link-button', onClick: () => { showAllGroups = !showAllGroups; drawResults(); } }, showAllGroups ? 'Show fewer' : `Show all ${ranked.length}`)
      : null);

    // Events in the same place.
    const friends = new Set(getFriendIds(me.id));
    const matching = allEvents
      .filter(({ event, space }) => !query || `${event.title} ${event.location} ${event.notes} ${space.name}`.toLowerCase().includes(query))
      .map((occurrence) => {
        const place = occurrence.event.area ? placeById(occurrence.event.area) : guessPlace(occurrence.event.location);
        const distance = area && place ? distanceMiles(area.point, place) : null;
        const friendsGoing = Object.entries(occurrence.event.rsvps ?? {}).filter(([id, a]) => a === 'going' && friends.has(id)).length;
        const matches = eventInterests(occurrence.event, occurrence.space).filter((id) => mine.has(id)).length;
        return { ...occurrence, place, distance, score: friendsGoing * 10 + matches * 6 - (Date.parse(occurrence.date) - Date.now()) / 86400000 / 7 };
      });
    const here = matching.filter((o) => inWhere(o.place, exploreWhere, area));
    const elsewhere = matching.length - here.length;
    let shown = here;
    if (exploreSort === 'foryou') shown = [...here].sort((a, b) => b.score - a.score);
    if (exploreSort === 'nearest' && area) shown = [...here].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    replaceChildren(eventResults, shown.length
      ? shown.map((occurrence) => renderPublicEventRow(occurrence, me, drawResults))
      : h('li', { class: 'module-empty explore-list__empty' }, query ? 'No events match. Try another search.' : 'No public events here coming up.'));
    replaceChildren(eventsNote, exploreWhere !== 'anywhere' && elsewhere
      ? h('p', { class: 'settings-field__hint' }, `${elsewhere} more ${elsewhere === 1 ? 'is' : 'are'} somewhere else · `,
        h('button', { type: 'button', class: 'link-button', onClick: () => { setWhere('anywhere'); } }, 'Show everywhere'))
      : null);
    drawFilters();
  }

  function setWhere(id) {
    exploreWhere = id; showAllGroups = false;
    replaceChildren(whereSlot, whereMenu());
    drawResults();
  }

  const whereMenu = () => choiceMenu({
    label: 'Where', prefix: 'Where: ', iconName: 'pin', className: 'explore-where__menu',
    options: whereChoices(me, places), value: exploreWhere, onChange: (id) => setWhere(id),
  });

  /** Interest chips (saved to your profile) and the For you / Soonest / Nearest switch. */
  function drawFilters() {
    const mine = interestsOf(me);
    const suggested = mine.length ? [] : suggestedInterests(me);
    replaceChildren(interestRow, INTERESTS.map((interest) => {
      const isOn = mine.includes(interest.id);
      return h('button', {
        type: 'button', class: `chip explore-interests__chip${isOn ? ' is-on' : ''}${suggested.includes(interest.id) ? ' is-suggested' : ''}`, 'aria-pressed': String(isOn),
        onClick: () => { setInterests(me.id, isOn ? mine.filter((id) => id !== interest.id) : [...mine, interest.id]); drawResults(); },
      }, `${interest.emoji} ${interest.label}`);
    }));
    replaceChildren(sortSwitch, [['foryou', 'For you'], ['soonest', 'Soonest'], ...(area ? [['nearest', 'Nearest']] : [])].map(([id, label]) => h('button', {
      type: 'button', class: `segmented__option${exploreSort === id ? ' is-active' : ''}`, 'aria-pressed': String(exploreSort === id),
      onClick: () => { exploreSort = id; drawResults(); },
    }, label)));
  }

  replaceChildren(whereSlot, whereMenu());
  const section = h('div', { class: 'settings-section' },
    h('label', { class: 'page-search explore-search' }, icon('search', 16), h('input', {
      type: 'search',
      class: 'input page-search__input',
      placeholder: 'Search public groups and events',
      'aria-label': 'Search public groups and events',
      onInput: debounce((event) => { search = event.target.value; drawResults(); }, SEARCH_DELAY_MS),
    })),
    h('h2', { class: 'explore-interests__title' }, 'What are you into?',
      interestsOf(me).length ? null : h('span', { class: 'settings-field__hint' }, ' Pick a few and they’ll come first.')),
    interestRow,
    // Events and groups only make sense near you: set a rough area first (js/ui/area-map.js).
    area ? h('p', { class: 'explore-events__where' }, whereSlot, ' ', h('a', { href: '#account-location', class: 'explore-where__change' }, 'Change my area'))
      : h('div', { class: 'explore-area' },
        h('p', { class: 'explore-area__ask' }, h('strong', {}, 'Where are you, roughly?'), ' Pick an area so what you see is close enough to get to.'),
        renderAreaMap({
          saveLabel: 'Show what’s near here',
          onSave: (location) => {
            updateProfile(me.id, { location: { placeId: null, ...location } });
            exploreWhere = 'near';
            showToast(`Showing what’s within ${location.radiusMiles} miles. Change it any time in Account settings.`);
            redraw();
          },
        }),
        h('p', {}, whereSlot)),
    h('h2', { class: 'settings-section__title explore-groups__title' }, 'Groups for you'),
    results,
    groupsMore,
    h('div', { class: 'explore-events__header' },
      h('h2', { class: 'settings-section__title' }, 'Events'),
      sortSwitch),
    eventResults,
    eventsNote,
    h('p', { class: 'settings-field__hint' }, 'Only public groups and events show up here. Anyone can RSVP to a public event.'),
  );
  drawResults();
  return section;
}

/** One group on Explore. `row` (from rankGroups) adds where it is, its interests, and friends in it. */
function renderExploreRow(group, me, redraw, row = null) {
  const requested = hasRequestedToJoin(group, me.id);
  const count = getSpaceMembers(group).length;
  const joining = joiningOf(group);

  let action;
  if (requested) {
    action = h('span', { class: 'explore-list__requested' },
      'Requested · ',
      h('button', {
        type: 'button',
        class: 'link-button',
        onClick: () => { declineJoinRequest(group.id, me.id); redraw(); },
      }, 'Cancel'));
  } else if (joining === 'invite' || joining === 'admins') {
    // Members come in by invitation; anyone can still look and follow (like a bar or a venue).
    const target = { kind: 'space', id: group.id };
    const following = isFollowing(me.id, target);
    action = publicTabsOf(group).length
      ? h('span', { class: 'explore-list__actions' },
        h('button', {
          type: 'button', class: `button${following ? '' : ' button--primary'}`, 'aria-pressed': String(following),
          onClick: () => { const now = toggleFollow(me.id, target); showToast(now ? `Following ${group.name}. Its posts stay calm in your Feed: one a day at most.` : `Stopped following ${group.name}.`); redraw(); },
        }, following ? icon('check', 14) : icon('plus', 14), following ? ' Following' : ' Follow'),
        h('a', { class: 'button button--quiet', href: spaceHref(group.id) }, 'See page'))
      : h('span', { class: 'explore-list__requested' }, icon('lock', 14), ' By invitation');
  } else {
    action = h('button', {
      type: 'button',
      class: joining === 'open' ? 'button button--primary' : 'button',
      onClick: () => {
        const result = joinOrRequest(group.id, me.id);
        if (result === 'asked') { showToast(`We asked your parent if you can join ${group.name}.`); redraw(); return; }
        if (result === 'joined') {
          showToast(`You joined ${group.name}.`);
          goTo(spaceHref(group.id));
        } else {
          showToast(`Asked to join ${group.name}. Its admins will see your request.`);
          redraw();
        }
      },
    }, joining === 'open' ? 'Join' : 'Ask to join');
  }

  return h('li', { class: 'explore-list__row' },
    h('span', { class: 'groups-menu__badge explore-list__badge', 'aria-hidden': 'true' }, groupInitials(group.name)),
    h('div', { class: 'explore-list__text' },
      h('h2', { class: 'explore-list__name' }, group.name),
      h('p', { class: 'explore-list__meta' }, [
        row?.interests.length ? row.interests.map((id) => interestById(id)?.label).join(', ') : group.groupType,
        row?.place?.name.replace(/\s*\(.*\)$/, ''),
        // Nearby: how far. A neighborhood picked across the country: just its name.
        row?.distance == null || row.distance > 25 ? null : row.distance < 0.3 ? 'nearby' : `${formatMiles(row.distance)} away`,
        `${count} ${count === 1 ? 'member' : 'members'}`,
      ].filter(Boolean).join(' · ')),
      group.description ? h('p', { class: 'explore-list__description' }, group.description) : null,
      row?.friends.length ? h('p', { class: 'explore-list__friends' },
        h('span', { class: 'avatar-row' }, row.friends.slice(0, 3).map((id) => avatar(getMember(id), 20))), ` ${friendsInLine(row.friends)}`) : null),
    action,
  );
}

/** A public event: date, what and where, who's going, and RSVP buttons. */
function renderPublicEventRow(occurrence, me, redraw) {
  const { event, space } = occurrence;
  // "2.1 mi away" when we know where you and it are; else the area's name (if the address doesn't already say it).
  const area = placeById(event.area)?.name;
  const where = occurrence.distance != null ? `${formatMiles(occurrence.distance)} away` : (area && !(event.location ?? '').includes(area) ? area : null);
  const meta = [occurrenceTimeLabel(occurrence), event.location, where].filter(Boolean).join(' · ');
  return h('li', { class: 'explore-list__row explore-events__row' },
    dateBlock(occurrence.date, colorValue(event.color)),
    h('div', { class: 'explore-list__text' },
      h('h3', { class: 'explore-list__name' }, h('a', { href: eventHref(event.id) }, event.title)),
      h('p', { class: 'explore-list__meta' }, `${space.name}${meta ? ` · ${meta}` : ''}`),
      renderEventTags(event),
      h('p', { class: 'explore-list__meta' }, rsvpSummary(event)),
      friendsGoingLine(event, me.id, Object.keys(event.rsvps ?? {}).filter((id) => event.rsvps[id] === 'going')) ? h('p', { class: 'explore-list__friends' }, icon('people', 13), ` ${friendsGoingLine(event, me.id, Object.keys(event.rsvps ?? {}).filter((id) => event.rsvps[id] === 'going'))}`) : null,
      availabilityChip(event, { date: occurrence.date }),
      h('div', { class: 'explore-events__actions' },
        rsvpButtons(event, me.id, (answer) => {
          updateEvent(event.id, (saved) => applyRsvp(saved, me.id, answer));
          if (answer === 'going') showToast(`You're going to "${event.title}". It's on your calendar.`);
          redraw();
        }, { compact: true }),
        directionsButton(event))),
  );
}
