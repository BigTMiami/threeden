// @ts-check
/**
 * links-page.js — a "link in bio" page for a public group or a blog
 * (#links-<spaceId>): the one link a band or an organizer puts in their
 * Instagram bio. Anyone can open it, signed in or not.
 *
 *          (PL)
 *      Paper Lanterns
 *      Band · Bushwick
 *   Guitar-driven folk from Bushwick…
 *   [ + Follow ]  [ See the full page ]
 *
 *   COMING UP
 *   [NOV 26] Paper Lanterns at Alphaville · 9pm        RSVP →
 *   [DEC 10] Holiday show · Union Pool · 8pm           RSVP →
 *
 *   Made with 3den
 *
 * Group members get here from "Share" in the group's header (which also
 * makes the Instagram share card).
 *
 *   linksHref(spaceId) → '#links-<spaceId>'
 *   canHaveLinksPage(space) → a public group, or a blog
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { groupInitials } from '../utils/initials.js';
import { getCurrentUser, getMember, getSpace, publicTabsOf } from '../state/store.js';
import { isPublicGroup } from '../state/group-access.js';
import { isFollowing, toggleFollow, followersLabel } from '../state/follows.js';
import { upcomingEventsIn } from '../modules/dashboard/dashboard-data.js';
import { requireAccount } from '../onboarding/guest.js';
import { eventHref } from '../events/event-details.js';
import { formatShortDate, formatTime } from '../utils/dates.js';
import { spaceHref, blogHref } from '../router.js';
import { setPageMeta } from '../ui/page-meta.js';
import { placeById } from '../utils/places.js';

export const linksHref = (spaceId) => `#links-${spaceId}`;

export function canHaveLinksPage(space) {
  if (!space) return false;
  if (space.kind === 'blog') return !getMember(space.memberIds[0])?.socialOff;
  return space.kind === 'group' && isPublicGroup(space) && publicTabsOf(space).length > 0;
}

export function renderLinksPage(container, spaceId) {
  const me = getCurrentUser();
  const space = getSpace(spaceId);
  const redraw = () => renderLinksPage(container, spaceId);
  if (!canHaveLinksPage(space)) {
    replaceChildren(container, h('p', { class: 'module-empty' }, 'This page isn’t public.'));
    return;
  }
  const isBlog = space.kind === 'blog';
  const owner = isBlog ? getMember(space.memberIds[0]) : null;
  const target = isBlog ? { kind: 'person', id: owner.id } : { kind: 'space', id: space.id };
  const name = isBlog ? owner.name : space.name;
  const isInside = space.memberIds.includes(me.id);
  const following = !me.isGuest && isFollowing(me.id, target);
  const events = upcomingEventsIn(space).filter((o) => o.event.visibility === 'public').slice(0, 6);
  const area = owner?.location?.placeId ?? getMember(Object.keys(space.roles ?? {})[0])?.location?.placeId;
  const fullHref = isBlog ? blogHref(owner) : spaceHref(space.id);

  replaceChildren(container, h('div', { class: 'links-page' },
    isBlog ? avatar(owner, 88) : h('span', { class: 'groups-menu__badge links-page__badge', 'aria-hidden': 'true' }, groupInitials(space.name)),
    h('h1', { class: 'links-page__name' }, name),
    h('p', { class: 'links-page__meta' }, [
      isBlog ? `@${owner.username}` : space.groupType,
      area ? placeById(area)?.name.replace(' (NYC)', '') : null,
      followersLabel(target),
    ].filter(Boolean).join(' · ')),
    (isBlog ? owner.bio : space.description) ? h('p', { class: 'links-page__about' }, isBlog ? owner.bio : space.description) : null,
    h('div', { class: 'links-page__actions' },
      isInside ? null : h('button', {
        type: 'button', class: `button${following ? '' : ' button--primary'}`, 'aria-pressed': String(following),
        onClick: () => {
          if (requireAccount({ reason: `to follow ${name}`, action: 'follow', arrival: { source: 'follow', ...(isBlog ? { itemId: owner.id } : { spaceId: space.id }) }, then: (id) => toggleFollow(id, target) })) return;
          const now = toggleFollow(me.id, target);
          showToast(now ? `Following ${name}. You’ll hear about their next events.` : `Stopped following ${name}.`);
          redraw();
        },
      }, icon(following ? 'check' : 'plus', 16), following ? ' Following' : ' Follow'),
      h('a', { class: 'button', href: fullHref }, isBlog ? 'See the blog' : 'See the full page')),
    h('section', { class: 'links-page__events' },
      h('h2', { class: 'links-page__heading' }, 'Coming up'),
      events.length
        ? h('ul', { class: 'links-page__list' }, events.map((o) => h('li', {},
          h('a', { class: 'links-page__event', href: eventHref(o.event.id) },
            h('span', { class: 'links-page__date' }, formatShortDate(o.date)),
            h('span', { class: 'links-page__title' }, o.event.emoji ? `${o.event.emoji} ${o.event.title}` : o.event.title,
              h('span', { class: 'links-page__where' }, [o.event.location, o.event.time ? formatTime(o.event.time) : null].filter(Boolean).join(' · '))),
            h('span', { class: 'links-page__rsvp' }, 'RSVP →')))))
        : h('p', { class: 'module-empty' }, 'Nothing on the calendar right now. Follow to hear about the next one.')),
    h('p', { class: 'links-page__footer' }, 'Made with ', h('a', { href: '#' }, '3den'))));

  setPageMeta({
    title: isBlog ? `${owner.name} (@${owner.username})` : `${space.name}${space.groupType ? ` · ${space.groupType}` : ''}`,
    description: [isBlog ? owner.bio : space.description, events[0] ? `Next: ${events[0].event.title}, ${formatShortDate(events[0].date)}` : null].filter(Boolean).join(' · ').slice(0, 200),
  });
}
