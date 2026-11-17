// @ts-check
/**
 * dashboard-focus.js — the Dashboard for someone new: just the thing they
 * came for, so 3den doesn't open with everything at once.
 *
 * How they arrived (member.onboarding, js/onboarding/onboarding-state.js)
 * decides the focus:
 *
 *   came for an event        the event: cover, when, where, RSVP, who's going,
 *                            Share. Afterwards: "How was it?" and what's next.
 *   came to host one         their event and how answers are coming in, or
 *                            "Plan your event" if they haven't made it yet
 *   joined a group           the group: what's new, the latest post, the next
 *                            event to answer, and shortcuts to its parts
 *   started a group          the same, plus Invite people
 *   followed a blog or page  that person's (or page's) newest posts and events
 *   came from a message      their conversations, unread first
 *
 * Underneath: one line for anything else waiting ("Also: 2 unread
 * messages"), and now and then a tip about using 3den for something else
 * ("Throwing something? …"), never more than one, each dismissable for good.
 *
 * The focus lasts the first three weeks (an event focus until a week after
 * the event), or until they press "Show everything". The person can come
 * back to it from the full dashboard while it still applies.
 *
 *   focusFor(me, data)                      → a focus, or null for the full dashboard
 *   renderFocus(focus, { me, redraw, … })   → the focused card
 *   focusLabel(focus)                       → "Porch Lights", for "Back to …"
 *   renderTip(me, focus, redraw)            → a tip, or null (most days)
 */

import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { nextStepLine } from '../../onboarding/next-step.js';
import { avatar } from '../../ui/avatar.js';
import { showToast } from '../../ui/toast.js';
import { groupInitials } from '../../utils/initials.js';
import { timeAgo, formatShortDate, todayKey, addDays } from '../../utils/dates.js';
import { getMember, getSpace, getSpaces, getBlogOf, getPersonalSpace, getCurrentSpace, setCurrentSpace, addModule } from '../../state/store.js';
import { uses } from '../../state/features.js';
import { findEvent, updateEvent } from '../../state/events.js';
import { hasRequestedToJoin } from '../../state/groups.js';
import { getConversationsFor, unreadCount, lastMessage, messagePreview, conversationTitle } from '../../state/messages.js';
import { whatsNext } from '../../state/event-followups.js';
import { addToList, updateOnboarding } from '../../onboarding/onboarding-state.js';
import { pathFor } from '../../onboarding/steps.js';
import { spaceHref, blogHref, settingsHref } from '../../router.js';
import { rsvpButtons, rsvpSummary } from '../../events/rsvp.js';
import { eventHref, whenLabel, mapLink, directionsButton } from '../../events/event-details.js';
import { eventCoverBanner } from '../../events/event-cover.js';
import { eventShareButton } from '../../events/event-share.js';
import { applyRsvp, rsvpOf, normalizeEvent, isEvent, isHostOf } from '../calendar/calendar-data.js';
import { postTitle, sortedPosts } from '../blog-feeds/feed-data.js';
import { getModuleType } from '../registry.js';
import { groupUpdates, upcomingEventsIn } from './dashboard-data.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_FOR_DAYS = 21;
const EVENT_AFTER_DAYS = 7; // an event stays the focus this long after it happens
const FEED_TYPES = ['photofeed', 'textfeed', 'generalfeed'];

// ─── Which focus ─────────────────────────────────────────────────────────────

/** An event's last day (yyyy-mm-dd). */
const lastDayOf = (event) => event.endDate || event.date;

function stillRelevant(event) {
  return lastDayOf(event) >= addDays(todayKey(), -EVENT_AFTER_DAYS);
}

/** The next (or most recent) event this person made. */
function myEvent(me) {
  const mine = getSpaces().flatMap((space) => space.modules.flatMap((module) => (module.data?.events ?? [])
    .map(normalizeEvent).filter((e) => isEvent(e) && isHostOf(e, me.id) && stillRelevant(e))))
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = mine.find((e) => lastDayOf(e) >= todayKey()) ?? mine[mine.length - 1];
  return next ? findEvent(next.id) : null;
}

export function focusFor(me, data = {}) {
  const record = me?.onboarding;
  if (!record || data.focus === 'off') return null;
  const isNew = Date.now() - (record.startedAt ?? 0) < NEW_FOR_DAYS * DAY_MS;
  switch (record.source) {
    case 'event': {
      const found = findEvent(record.itemId);
      // An event keeps the focus until a week after it, even past three weeks.
      return found && stillRelevant(found.event) ? { kind: 'event', found } : null;
    }
    case 'host':
      return isNew || data.focus === 'on' ? { kind: 'host', found: myEvent(me) } : null;
    case 'group':
    case 'organizer': {
      const space = getSpace(record.spaceId);
      return space && (isNew || data.focus === 'on') ? { kind: 'group', space, organizer: record.source === 'organizer' } : null;
    }
    case 'blog':
    case 'follow': {
      if (!(isNew || data.focus === 'on')) return null;
      if (record.spaceId && getSpace(record.spaceId)) return { kind: 'page', space: getSpace(record.spaceId) };
      const member = getMember(record.itemId);
      return member ? { kind: 'person', member } : null;
    }
    case 'message':
      return isNew || data.focus === 'on' ? { kind: 'messages' } : null;
    default:
      return null;
  }
}

export function focusLabel(focus) {
  if (!focus) return '';
  if (focus.kind === 'event' || (focus.kind === 'host' && focus.found)) return `“${focus.found.event.title}”`;
  if (focus.kind === 'host') return 'your event';
  if (focus.kind === 'group' || focus.kind === 'page') return focus.space.name;
  if (focus.kind === 'person') return focus.member.name.split(' ')[0];
  return 'your messages';
}

// ─── The focused card ────────────────────────────────────────────────────────

/**
 * options: { me, redraw, openItem(moduleId, itemId), returnTo, also }
 * (`also` is the "Also: …" line, built by the dashboard from For you.)
 */
export function renderFocus(focus, options) {
  const body = {
    event: () => renderEventFocus(focus.found, options, false),
    host: () => (focus.found ? renderEventFocus(focus.found, options, true) : renderPlanEvent()),
    group: () => renderGroupFocus(focus.space, focus.organizer, options),
    page: () => renderPageFocus(focus.space, options),
    person: () => renderPersonFocus(focus.member, options),
    messages: () => renderMessagesFocus(options),
  }[focus.kind]();
  return h('div', { class: `dashboard-focus dashboard-focus--${focus.kind}` }, body);
}

/** "in 3 days", "today", "tomorrow", "2 days ago". */
function relativeDay(event) {
  const today = todayKey();
  if (event.date <= today && lastDayOf(event) >= today) return 'today';
  const days = Math.round((Date.parse(`${event.date}T12:00`) - Date.parse(`${today}T12:00`)) / DAY_MS);
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  const ago = Math.round((Date.parse(`${today}T12:00`) - Date.parse(`${lastDayOf(event)}T12:00`)) / DAY_MS);
  return ago === 1 ? 'yesterday' : `${ago} days ago`;
}

function renderEventFocus(found, { me, redraw }, isHost) {
  const { event, space } = found;
  const happened = lastDayOf(event) < todayKey();
  const host = getMember(event.createdBy);
  const going = Object.entries(event.rsvps ?? {}).filter(([, answer]) => answer === 'going').map(([id]) => getMember(id)).filter(Boolean);
  const answer = (choice) => {
    updateEvent(event.id, (saved) => applyRsvp(saved, me.id, choice));
    if (choice === 'going') showToast('You’re going! It’s on your calendar.');
    redraw();
  };

  return [
    h('p', { class: 'dashboard-focus__kicker' }, isHost ? 'Your event' : happened ? 'Your last event' : 'Your event'),
    eventCoverBanner(event, 'dashboard-focus__cover'),
    h('h3', { class: 'dashboard-focus__title' }, h('a', { href: eventHref(event.id) }, event.title)),
    h('p', { class: 'dashboard-focus__when' }, whenLabel(event), h('span', { class: 'dashboard-focus__soon' }, ` · ${relativeDay(event)}`)),
    event.location ? h('p', { class: 'dashboard-focus__line' }, icon('pin', 14), ' ', mapLink(event.location), ' ', happened ? null : directionsButton(event)) : null,
    h('p', { class: 'dashboard-focus__line' }, host ? [avatar(host, 20), isHost ? ' You’re hosting' : ` Hosted by ${host.name}`] : null,
      space.kind === 'group' ? [' · ', h('a', { href: spaceHref(space.id) }, space.name)] : null),
    happened
      ? renderAfter(found, me)
      : [
        isHost ? null : h('div', { class: 'dashboard-focus__rsvp' }, rsvpButtons(event, me.id, answer, { compact: true })),
        h('p', { class: 'dashboard-focus__line dashboard__meta' }, rsvpSummary(event),
          going.length ? h('span', { class: 'dashboard-focus__faces' }, going.slice(0, 6).map((m) => avatar(m, 22))) : null),
        isHost && !Object.keys(event.rsvps ?? {}).some((id) => id !== me.id)
          ? h('p', { class: 'dashboard-focus__hint' }, 'Nobody has answered yet. Share the link, or invite people from the event page.')
          : null,
      ],
    h('div', { class: 'dashboard-focus__actions' },
      h('a', { class: 'button button--small button--primary', href: eventHref(event.id) }, isHost ? 'Manage the event' : 'Open the event'),
      happened ? null : eventShareButton(found, me)),
  ];
}

/** After the event: "How was it?", then what's next from the same people. */
function renderAfter(found, me) {
  const next = whatsNext(found, me.id, 2);
  const went = rsvpOf(found.event, me.id) === 'going' || isHostOf(found.event, me.id);
  return [
    went ? h('p', { class: 'dashboard-focus__hint' }, 'How was it? Add your photos, or say thanks, on the event page.') : null,
    next.length ? h('div', { class: 'dashboard-focus__next' },
      h('p', { class: 'dashboard-focus__subhead' }, 'What’s next'),
      h('ul', { class: 'dashboard__list' }, next.map(({ event, date }) => h('li', { class: 'dashboard__row' },
        h('span', { class: 'dashboard__icon', 'aria-hidden': 'true' }, icon('calendar', 14)),
        h('span', { class: 'dashboard__text' }, h('a', { href: eventHref(event.id) }, event.title), h('span', { class: 'dashboard__meta' }, ` · ${formatShortDate(date)}`)))))) : null,
  ];
}

function renderPlanEvent() {
  return [
    h('p', { class: 'dashboard-focus__kicker' }, 'Your event'),
    h('h3', { class: 'dashboard-focus__title' }, 'Let’s plan it'),
    h('p', { class: 'dashboard-focus__hint' }, 'Five quick questions: the occasion, when, where, how it looks, and who can come. You get a link to send at the end.'),
    h('div', { class: 'dashboard-focus__actions' }, h('a', { class: 'button button--small button--primary', href: '#new-event' }, icon('plus', 14), ' Plan your event')),
  ];
}

/** The parts of a group worth a shortcut: home tab first, at most six. */
function shortcutsFor(space) {
  const tabOrder = (module) => ((module.tabId ?? 'home') === 'home' ? 0 : 1);
  return [...space.modules]
    .filter((module) => !['dashboard', 'recents', 'recentgroups'].includes(module.type))
    .sort((a, b) => tabOrder(a) - tabOrder(b))
    .slice(0, 6);
}

function renderGroupFocus(space, organizer, { me, redraw, openItem }) {
  const isMember = space.memberIds.includes(me.id);
  const update = isMember ? groupUpdates(me).find((u) => u.space.id === space.id) : null;
  const next = upcomingEventsIn(space).filter(({ event }) => event.visibility !== 'invite' || event.inviteeIds?.includes(me.id));
  const toAnswer = next.find(({ event }) => event.createdBy !== me.id && !rsvpOf(event, me.id));
  const nextUp = toAnswer ?? next[0];
  const news = update ? [
    update.newPosts && `${update.newPosts} new ${update.newPosts === 1 ? 'announcement' : 'announcements'}`,
    update.newThreads && `${update.newThreads} new ${update.newThreads === 1 ? 'thread' : 'threads'}`,
    update.newFeedPosts && `${update.newFeedPosts} new ${update.newFeedPosts === 1 ? 'post' : 'posts'}`,
    update.unreadChat && `${update.unreadChat} unread in chat`,
  ].filter(Boolean) : [];

  const answer = (event) => (choice) => {
    updateEvent(event.id, (saved) => applyRsvp(saved, me.id, choice));
    if (choice === 'going') showToast(`You’re going to “${event.title}”.`);
    redraw();
  };

  return [
    h('div', { class: 'dashboard-focus__group-head' },
      h('span', { class: 'groups-menu__badge dashboard__badge dashboard-focus__badge', 'aria-hidden': 'true' }, groupInitials(space.name)),
      h('span', {},
        h('p', { class: 'dashboard-focus__kicker' }, organizer ? 'Your group (you started it)' : 'Your group'),
        h('h3', { class: 'dashboard-focus__title' }, h('a', { href: spaceHref(space.id) }, space.name)),
        h('p', { class: 'dashboard__meta' }, [space.groupType, `${space.memberIds.length} ${space.memberIds.length === 1 ? 'member' : 'members'}`].filter(Boolean).join(' · ')))),
    !isMember
      ? h('p', { class: 'dashboard-focus__hint' },
        hasRequestedToJoin(space, me.id) ? 'You asked to join. You’ll get a notification when you’re in.' : 'You’re not in the group yet. ',
        hasRequestedToJoin(space, me.id) ? null : h('a', { href: spaceHref(space.id) }, `Open ${space.name} to join`))
      : h('p', { class: `dashboard-focus__news${news.length ? '' : ' is-quiet'}` },
        news.length ? news.join(' · ') : update?.lastVisit ? `You’re all caught up since ${timeAgo(update.lastVisit)}.` : 'Have a look around: nothing’s marked as read yet.'),
    update?.latestPost ? h('p', { class: 'dashboard-focus__line' },
      icon('announcements', 14), ' Latest: ',
      h('a', { href: `#module-${update.latestPost.moduleId}`, onClick: openItem(update.latestPost.moduleId, update.latestPost.post.id) }, `“${update.latestPost.post.title}”`),
      h('span', { class: 'dashboard__meta' }, ` · ${getMember(update.latestPost.post.authorId)?.name.split(' ')[0] ?? 'someone'}, ${timeAgo(update.latestPost.post.createdAt)}`)) : null,
    nextUp ? h('div', { class: 'dashboard-focus__event-row' },
      h('p', { class: 'dashboard-focus__line' }, icon('calendar', 14), toAnswer ? ' Answer: ' : ' Next: ',
        h('a', { href: eventHref(nextUp.event.id) }, nextUp.event.title), h('span', { class: 'dashboard__meta' }, ` · ${formatShortDate(nextUp.date)}`)),
      toAnswer && isMember ? rsvpButtons(toAnswer.event, me.id, answer(toAnswer.event), { compact: true }) : null) : null,
    isMember ? h('div', { class: 'dashboard-focus__shortcuts' },
      h('p', { class: 'dashboard-focus__subhead' }, 'Go to'),
      h('div', { class: 'dashboard-focus__chips' }, shortcutsFor(space).map((module) => h('a', {
        class: 'chip dashboard-focus__chip',
        href: `#module-${module.id}`,
        onClick: openItem(module.id, null),
      }, icon(getModuleType(module.type)?.icon ?? 'file', 13), ` ${module.title}`)))) : null,
    h('div', { class: 'dashboard-focus__actions' },
      h('a', { class: 'button button--small button--primary', href: spaceHref(space.id) }, `Open ${space.name}`),
      organizer ? h('a', { class: 'button button--small', href: settingsHref(space.id, 'members') }, icon('plus', 14), ' Invite people') : null),
  ];
}

function renderPersonFocus(member, { openItem }) {
  const blog = getBlogOf(member.id);
  const posts = (blog?.modules ?? []).filter((m) => FEED_TYPES.includes(m.type))
    .flatMap((m) => sortedPosts(m.data ?? {}).map((post) => ({ post, moduleId: m.id })))
    .sort((a, b) => b.post.createdAt - a.post.createdAt).slice(0, 3);
  const events = blog ? upcomingEventsIn(blog).filter(({ event }) => event.visibility === 'public').slice(0, 2) : [];
  return [
    h('div', { class: 'dashboard-focus__group-head' },
      avatar(member, 40),
      h('span', {},
        h('p', { class: 'dashboard-focus__kicker' }, 'Keeping up with'),
        h('h3', { class: 'dashboard-focus__title' }, h('a', { href: blogHref(member) }, member.name)))),
    posts.length ? h('ul', { class: 'dashboard__list' }, posts.map(({ post, moduleId }) => h('li', { class: 'dashboard__row' },
      h('span', { class: 'dashboard__text' },
        h('a', { href: `#module-${moduleId}`, onClick: openItem(moduleId, post.id) }, postTitle(post)),
        h('span', { class: 'dashboard__meta' }, ` · ${timeAgo(post.createdAt)}`)),
      post.media[0]?.kind === 'image' ? h('img', { class: 'dashboard__thumb', src: post.media[0].src, alt: '' }) : null)))
      : h('p', { class: 'module-empty' }, `${member.name.split(' ')[0]} hasn’t posted yet.`),
    events.length ? h('ul', { class: 'dashboard__list' }, events.map(({ event, date }) => h('li', { class: 'dashboard__row' },
      h('span', { class: 'dashboard__icon', 'aria-hidden': 'true' }, icon('calendar', 14)),
      h('span', { class: 'dashboard__text' }, h('a', { href: eventHref(event.id) }, event.title), h('span', { class: 'dashboard__meta' }, ` · ${formatShortDate(date)}`))))) : null,
    h('div', { class: 'dashboard-focus__actions' }, h('a', { class: 'button button--small button--primary', href: blogHref(member) }, `Open ${member.name.split(' ')[0]}’s blog`)),
  ];
}

/** A group's public page they followed: its newest posts and next event. */
function renderPageFocus(space, { openItem }) {
  const posts = space.modules.filter((m) => FEED_TYPES.includes(m.type) || m.type === 'announcements')
    .flatMap((m) => (m.data?.posts ?? []).map((post) => ({ post, moduleId: m.id })))
    .sort((a, b) => b.post.createdAt - a.post.createdAt).slice(0, 3);
  const next = upcomingEventsIn(space).find(({ event }) => event.visibility === 'public');
  return [
    h('div', { class: 'dashboard-focus__group-head' },
      h('span', { class: 'groups-menu__badge dashboard__badge dashboard-focus__badge', 'aria-hidden': 'true' }, groupInitials(space.name)),
      h('span', {},
        h('p', { class: 'dashboard-focus__kicker' }, 'Keeping up with'),
        h('h3', { class: 'dashboard-focus__title' }, h('a', { href: spaceHref(space.id) }, space.name)))),
    posts.length ? h('ul', { class: 'dashboard__list' }, posts.map(({ post, moduleId }) => h('li', { class: 'dashboard__row' },
      h('span', { class: 'dashboard__text' },
        h('a', { href: `#module-${moduleId}`, onClick: openItem(moduleId, post.id) }, post.title || postTitle(post)),
        h('span', { class: 'dashboard__meta' }, ` · ${timeAgo(post.createdAt)}`)))))
      : h('p', { class: 'module-empty' }, 'Nothing posted yet.'),
    next ? h('p', { class: 'dashboard-focus__line' }, icon('calendar', 14), ' Next: ', h('a', { href: eventHref(next.event.id) }, next.event.title), h('span', { class: 'dashboard__meta' }, ` · ${formatShortDate(next.date)}`)) : null,
    h('div', { class: 'dashboard-focus__actions' }, h('a', { class: 'button button--small button--primary', href: spaceHref(space.id) }, `Open ${space.name}`)),
  ];
}

function renderMessagesFocus({ me }) {
  const conversations = getConversationsFor(me.id)
    .map((c) => ({ c, unread: unreadCount(c, me.id), last: lastMessage(c) }))
    .filter(({ last }) => last)
    .sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0) || b.last.createdAt - a.last.createdAt)
    .slice(0, 4);
  return [
    h('p', { class: 'dashboard-focus__kicker' }, 'Your messages'),
    conversations.length ? h('ul', { class: 'dashboard__list' }, conversations.map(({ c, unread, last }) => h('li', { class: 'dashboard__row' },
      h('span', { class: 'dashboard__icon', 'aria-hidden': 'true' }, icon('chat', 14)),
      h('span', { class: 'dashboard__text' },
        h('a', { href: `#messages-${c.id}` }, h(unread ? 'strong' : 'span', {}, conversationTitle(c, me.id))),
        h('span', { class: 'dashboard__meta' }, ` · ${messagePreview(last).slice(0, 60)}`)),
      unread ? h('span', { class: 'dashboard-focus__unread' }, String(unread)) : null)))
      : h('p', { class: 'module-empty' }, 'No messages yet.'),
    h('div', { class: 'dashboard-focus__actions' }, h('a', { class: 'button button--small button--primary', href: '#messages' }, 'Open Messages')),
  ];
}

// ─── Next steps ──────────────────────────────────────────────────────────────

/**
 * The Get started steps (js/onboarding/steps.js), inside the focused card,
 * as the same one line the homepage uses: the next step not done yet.
 * Gone once they're all done, or after ×.
 */
export function renderNextSteps(me, redraw) {
  const record = me?.onboarding;
  if (!record || record.hidden) return null;
  const { steps } = pathFor(me, record);
  const step = steps.find((s) => !s.done);
  if (!step) return null;
  return nextStepLine({
    ariaLabel: 'Next step',
    className: 'dashboard-steps',
    label: step.label,
    href: step.action ? null : step.href ?? null,
    action: step.action ?? null,
    done: steps.length - steps.filter((s) => !s.done).length,
    total: steps.length,
    hideLabel: 'Hide next steps',
    onHide: () => { updateOnboarding({ hidden: true }); redraw(); },
  });
}

// ─── Now and then, a tip for another use ─────────────────────────────────────

/**
 * Each tip is about a different way to use 3den than the one they came for,
 * and shows only if they haven't done that thing yet. One tip at most, on
 * every other day (never on the first), in rotation. "Not now" hides that
 * tip for good (it's saved in onboarding.tipsSeen as 'dash-<id>').
 */
const TIPS = [
  {
    id: 'plan-event', not: ['host'],
    applies: (me) => !myEvent(me),
    text: 'Throwing something? 3den can make the invitation, collect RSVPs, and send people the details.',
    label: 'Plan an event', href: () => '#new-event',
  },
  {
    id: 'start-group', not: ['organizer'],
    applies: (me) => uses(me, 'groups') && !getSpaces().some((s) => s.kind === 'group' && s.roles?.[me.id] === 'owner'),
    text: 'Have a band, a book club, or a building? A group keeps its announcements, calendar, and chat in one place.',
    label: 'Start a group', href: () => '#new-group',
  },
  {
    id: 'own-tasks', not: ['organized'],
    applies: () => !getPersonalSpace()?.modules.some((m) => m.type === 'todo'),
    text: 'Your homepage can be just for you, too: a to-do list, a calendar, and notes no one else sees.',
    label: 'Add a to-do list', action: 'add-todo',
  },
  {
    id: 'blog', not: ['blog', 'follow'],
    applies: (me) => uses(me, 'blogs'),
    text: 'Share photos and updates with friends on your blog. They see everything you post, in order, with no ads.',
    label: 'See your blog', href: (me) => `#blog-${me.username}`,
  },
  {
    id: 'explore', not: [],
    applies: (me) => uses(me, 'groups'),
    text: 'See what’s happening near you: public events and groups you can join.',
    label: 'Explore', href: () => '#groups-explore',
  },
];

export function renderTip(me, focus, redraw, { force = false } = {}) {
  const record = me?.onboarding;
  if (!record || record.tipsOff) return null;
  const day = Math.floor((Date.now() - (record.startedAt ?? Date.now())) / DAY_MS);
  if (!force && (day < 1 || day % 2 === 1)) return null;
  const source = record.source;
  const candidates = TIPS.filter((tip) => !tip.not.includes(source) && !(record.tipsSeen ?? []).includes(`dash-${tip.id}`) && tip.applies(me));
  if (!candidates.length) return null;
  const tip = candidates[day % candidates.length];

  const dismiss = () => { addToList('tipsSeen', `dash-${tip.id}`); redraw(); };
  const tryIt = tip.action === 'add-todo'
    ? h('button', {
      type: 'button', class: 'link-button',
      onClick: () => {
        const personal = getPersonalSpace();
        if (getCurrentSpace()?.id !== personal.id) setCurrentSpace(personal.id);
        addModule('todo', personal.modules.length, { title: 'My tasks' });
        addToList('tipsSeen', `dash-${tip.id}`);
        showToast('Added “My tasks” to the bottom of your homepage.');
      },
    }, tip.label)
    : h('a', { href: tip.href(me), onClick: () => addToList('tipsSeen', `dash-${tip.id}`) }, `${tip.label} →`);

  return h('aside', { class: 'dashboard-tip', 'aria-label': 'A tip' },
    h('span', { class: 'dashboard-tip__icon', 'aria-hidden': 'true' }, '💡'),
    h('span', { class: 'dashboard-tip__text' }, tip.text, ' ', tryIt),
    h('button', { type: 'button', class: 'link-button dashboard-tip__dismiss', onClick: dismiss }, 'Not now'));
}

/** The tips' ids (for tests). */
export const DASHBOARD_TIPS = TIPS.map((t) => t.id);
