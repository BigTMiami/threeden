/**
 * dashboard-module.js — "Dashboard", for your personal homepage: what you're
 * part of next, in one place.
 *
 *   Coming up
 *     ┌NOV┐ Harbor cleanup · Sun 9:00am · Eastside Mutual Aid   You're invited  [Going] [Maybe] [Can't go]
 *     └15 ┘ Thanksgiving dinner · Thu · Larsen Family            You're going
 *   For you (what needs you)
 *     ✉ Iris invited you to Juniper Supper Club        [Answer]
 *     2 unread messages · 3 notifications
 *   Your tasks
 *     ☐ Deep clean the kitchen · 14 Juniper Lane · due Nov 17
 *     ☐ Bring the extension cords · Porch Lights · overdue
 *   (full page only) Your groups
 *     (JT) Juniper Tenants Union   2 new posts · 1 new thread
 *
 * Coming up: events in the next month you're hosting, going to (or maybe),
 * or invited to, from everywhere (myUpcoming in dashboard-data.js). Your
 * tasks: to-dos assigned to you in your groups plus your own list's
 * (myTasks); tick one off right here. Friends' posts aren't here: that's
 * what the Feed is for.
 *
 * The card shows a few of each; the full page shows them all and adds
 * Your groups. Nothing is saved: it reads straight from everything else.
 *
 * For someone new, the card shows only what they came for instead (an
 * event, a group, a person they follow, their messages), with one line for
 * anything else and now and then a tip: see dashboard-focus.js. "Show
 * everything" switches to the full dashboard (saved as { focus: 'off' }),
 * and "Back to …" switches back while the focus still applies.
 *
 * Data: {} for the usual parts, or { sections: ['needs', 'events', …] } to
 * show only some, in that order, on the card and the full page ('groups' on
 * the card too; older layouts saying 'friends' get Coming up and Your tasks).
 * The full page's "Customize" sets it: a checkbox and ↑ ↓ for each part,
 * and "Reset". RSVPs and ticks are saved where the event or task lives.
 */

import { uses } from '../../state/features.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { showToast } from '../../ui/toast.js';
import { groupInitials } from '../../utils/initials.js';
import { timeAgo, formatShortDate } from '../../utils/dates.js';
import { getMember } from '../../state/store.js';
import { updateEvent } from '../../state/events.js';
import { requestModuleFocus } from '../../editor/module-context.js';
import { openModulePage, spaceHref, settingsHref } from '../../router.js';
import { rsvpButtons, answeredThisVisit } from '../../events/rsvp.js';
import { eventHref } from '../../events/event-details.js';
import { applyRsvp, occurrenceTimeLabel } from '../calendar/calendar-data.js';
import { needsYou, groupUpdates, myUpcoming, myTasks } from './dashboard-data.js';
import { dueLabel, isOverdue, applyTaskChanges } from '../todo/todo-data.js';
import { getModule, updateModuleData } from '../../state/store.js';
import { monthName } from '../../utils/dates.js';
import { colorValue } from '../calendar/calendar-data.js';
import { toggleNotifications } from '../../editor/notification-bell.js';
import { focusFor, focusLabel, renderFocus, renderTip, renderNextSteps } from './dashboard-focus.js';
import { availabilityChip } from '../../ui/availability-chip.js';

/** How many of each list the card shows (the full page shows all). */
const CARD_LIMITS = { rsvps: 2, groups: 4, events: 4, tasks: 4 };

export const dashboardModule = {
  type: 'dashboard',
  label: 'Dashboard',
  description: 'What’s coming up that you’re part of, your tasks, and what’s waiting on you',
  icon: 'dashboard',
  defaultSpan: 6,
  defaultRows: 16,
  available: true,
  spaceKinds: ['personal'],
  createInitialData: () => ({}),
  render: (container, context) => renderDashboard(container, context, false),
  renderFullPage: (container, context) => renderDashboard(container, context, true),
};

function renderDashboard(container, context, isFullPage) {
  const me = context.currentUser;
  const root = h('div', { class: `dashboard${isFullPage ? ' dashboard--page' : ''}` });
  const limit = (list, key) => (isFullPage ? list : list.slice(0, CARD_LIMITS[key]));
  // Older layouts asked for 'friends': that's Coming up and Your tasks now.
  // Read fresh on every draw, so Customize takes effect at once.
  const chosenSections = () => {
    const raw = context.getData()?.sections;
    return raw ? [...new Set(raw.flatMap((part) => (part === 'friends' ? ['events', 'tasks'] : [part])))] : null;
  };
  // Parts of 3den turned off in Account settings leave the Dashboard too.
  const turnedOff = { groups: !uses(me, 'groups') };
  const DEFAULT_PARTS = ['events', 'needs', 'tasks'];
  const ALL_PARTS = ['events', 'needs', 'tasks', 'groups'];
  // A chosen set (Customize) applies to the card and the full page; otherwise the card shows three, the page all four.
  const shows = (part) => !turnedOff[part] && (chosenSections() ?? (isFullPage ? ALL_PARTS : DEFAULT_PARTS)).includes(part);
  const order = () => {
    const chosen = chosenSections();
    return chosen ? [...chosen, ...ALL_PARTS.filter((p) => !chosen.includes(p))] : ALL_PARTS;
  };
  let customizing = false;

  /** Open a module's full page at one item, coming back here afterwards. */
  const openItem = (moduleId, itemId) => (event) => {
    event.preventDefault();
    if (itemId) requestModuleFocus(moduleId, itemId);
    openModulePage(moduleId, { returnTo: context.spaceId });
  };

  function draw() {
    const data = context.getData() ?? {};
    const focus = focusFor(me, data);
    // While new, they can switch back to the focus from the full dashboard.
    const couldFocus = !focus && data.focus === 'off' ? focusFor(me, { ...data, focus: 'on' }) : null;
    const setFocus = (value) => { context.saveData({ ...data, focus: value }); draw(); };
    root.classList.toggle('dashboard--focused', Boolean(focus) && !isFullPage);
    // One thing to do at a time: the next step, or (once there are none) a tip.
    const nextStep = renderNextSteps(me, draw);
    const tip = nextStep ? null : renderTip(me, focus, draw);

    if (focus && !isFullPage) {
      replaceChildren(root,
        h('div', { class: 'dashboard__focus-bar' },
          h('button', { type: 'button', class: 'link-button dashboard__switch', onClick: () => setFocus('off') }, 'Show everything')),
        renderFocus(focus, { me, redraw: draw, openItem }),
        nextStep,
        renderAlso(focus),
        tip);
      return;
    }
    replaceChildren(root,
      couldFocus && !isFullPage ? h('div', { class: 'dashboard__focus-bar' },
        h('button', { type: 'button', class: 'link-button dashboard__switch', onClick: () => setFocus(null) }, `Back to just ${focusLabel(couldFocus)}`)) : null,
      focus && isFullPage ? h('section', { class: 'dashboard__section dashboard__section--focus' }, renderFocus(focus, { me, redraw: draw, openItem })) : null,
      isFullPage && !context.isVisitor ? renderCustomize() : null,
      // Coming up first (left on a wide page), then For you, then Your tasks (Leo, Nov 14), unless Customize changed it.
      order().map((part) => (shows(part) ? { events: renderComingUp, needs: renderNeedsYou, tasks: renderTasks, groups: renderGroups }[part]() : null)),
      tip,
      isFullPage ? null : h('button', { type: 'button', class: 'link-button dashboard__more', onClick: () => context.openFullPage() }, 'Open the full dashboard →'));
  }

  /** Full page: "Customize" — which parts show (on the card too), and in what order. */
  function renderCustomize() {
    const LABELS = { events: 'Coming up', needs: 'For you', tasks: 'Your tasks', groups: 'Your groups' };
    const parts = order().filter((p) => !turnedOff[p]);
    const save = (next) => { context.saveData({ ...(context.getData() ?? {}), sections: next }); draw(); };
    const shown = parts.filter((p) => shows(p));
    const toggle = h('button', {
      type: 'button', class: 'button button--small dashboard__customize-toggle', 'aria-expanded': String(customizing),
      onClick: () => { customizing = !customizing; draw(); },
    }, icon('settings', 14), customizing ? ' Done' : ' Customize');
    if (!customizing) return h('div', { class: 'dashboard__customize' }, toggle);
    return h('div', { class: 'dashboard__customize is-open' },
      h('div', { class: 'dashboard__customize-head' },
        h('strong', {}, 'What your Dashboard shows'),
        h('span', { class: 'dashboard__customize-hint' }, 'On your homepage too. The card shows a few of each.'),
        toggle),
      h('ul', { class: 'dashboard__customize-list' }, parts.map((part, i) => h('li', {},
        h('label', {}, h('input', {
          type: 'checkbox', checked: shown.includes(part),
          onChange: (event) => save(event.target.checked ? parts.filter((p) => shown.includes(p) || p === part) : shown.filter((p) => p !== part)),
        }), ` ${LABELS[part]}`),
        h('span', { class: 'dashboard__customize-move' },
          h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': `Move ${LABELS[part]} up`, disabled: i === 0, onClick: () => { const next = [...parts]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; save(next.filter((p) => shown.includes(p))); } }, icon('arrowUp', 13)),
          h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': `Move ${LABELS[part]} down`, disabled: i === parts.length - 1, onClick: () => { const next = [...parts]; [next[i + 1], next[i]] = [next[i], next[i + 1]]; save(next.filter((p) => shown.includes(p))); } }, icon('arrowDown', 13)))))),
      h('button', { type: 'button', class: 'link-button', onClick: () => { const data = { ...(context.getData() ?? {}) }; delete data.sections; context.saveData(data); draw(); } }, 'Reset to the usual'));
  }

  /**
   * Under a focus: one quiet line for everything else waiting, so nothing is
   * missed but nothing competes ("Also: 1 invitation · 2 unread messages").
   */
  function renderAlso(focus) {
    const needs = needsYou(me);
    const groupsOn = uses(me, 'groups');
    const focusSpaceId = focus.space?.id ?? focus.found?.space.id ?? null;
    const focusEventId = focus.found?.event.id ?? null;
    const rsvps = groupsOn ? needs.rsvps.filter(({ event, space }) => event.id !== focusEventId && space.id !== focusSpaceId) : [];
    const invites = groupsOn ? needs.invites.filter(({ space }) => space.id !== focusSpaceId) : [];
    const unreadMessages = uses(me, 'messages') && focus.kind !== 'messages' ? needs.unreadMessages : 0;
    const parts = [
      invites.length ? h('a', { href: '#groups' }, `${invites.length} group ${invites.length === 1 ? 'invitation' : 'invitations'}`) : null,
      rsvps.length ? h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage() }, `${rsvps.length} more ${rsvps.length === 1 ? 'event' : 'events'} to answer`) : null,
      unreadMessages ? h('a', { href: '#messages' }, `${unreadMessages} unread ${unreadMessages === 1 ? 'message' : 'messages'}`) : null,
      needs.unreadNotifications ? h('button', { type: 'button', class: 'link-button', 'data-toggles-notifications': 'true', onClick: toggleNotifications },
        `${needs.unreadNotifications} ${needs.unreadNotifications === 1 ? 'notification' : 'notifications'}`) : null,
    ].filter(Boolean);
    if (!parts.length) return null;
    return h('p', { class: 'dashboard__also' }, 'Also: ', parts.flatMap((part, i) => (i ? [' · ', part] : [part])));
  }

  // ─── For you (what needs you) ─────────────────────────────────────────────────────────────

  function renderNeedsYou() {
    const needs = needsYou(me);
    const groupsOn = uses(me, 'groups');
    const invites = groupsOn ? needs.invites : [];
    const joinRequests = groupsOn ? needs.joinRequests : [];
    const { unreadNotifications } = needs;
    const unreadMessages = uses(me, 'messages') ? needs.unreadMessages : 0;
    const rows = [
      ...invites.map(({ space, invite }) => h('li', { class: 'dashboard__row' },
        h('span', { class: 'dashboard__icon', 'aria-hidden': 'true' }, icon('plus', 14)),
        h('span', { class: 'dashboard__text' }, `${getMember(invite.invitedBy)?.name ?? 'Someone'} invited you to join `, h('strong', {}, space.name)),
        h('a', { class: 'button button--small button--primary', href: '#groups' }, 'Answer'))),
      ...joinRequests.map(({ space, count }) => h('li', { class: 'dashboard__row' },
        h('span', { class: 'dashboard__icon', 'aria-hidden': 'true' }, icon('flag', 14)),
        h('span', { class: 'dashboard__text' }, `${count} ${count === 1 ? 'person wants' : 'people want'} to join `, h('strong', {}, space.name)),
        h('a', { class: 'button button--small', href: settingsHref(space.id, 'members') }, 'Review'))),
    ];
    const counts = [
      unreadMessages ? h('a', { href: '#messages' }, `${unreadMessages} unread ${unreadMessages === 1 ? 'message' : 'messages'}`) : null,
      unreadNotifications ? h('button', {
        type: 'button',
        class: 'link-button',
        'data-toggles-notifications': 'true',
        onClick: toggleNotifications,
      }, `${unreadNotifications} unread ${unreadNotifications === 1 ? 'notification' : 'notifications'}`) : null,
    ].filter(Boolean);

    return section('For you', 'flag',
      rows.length || counts.length ? [
        rows.length ? h('ul', { class: 'dashboard__list' }, rows) : null,
        counts.length ? h('p', { class: 'dashboard__note' }, counts.flatMap((c, i) => (i ? [' · ', c] : [c]))) : null,
      ] : h('p', { class: 'module-empty' }, 'Nothing waiting on you. Nice.'));
  }

  // ─── Your groups ───────────────────────────────────────────────────────────

  function renderGroups() {
    const updates = groupUpdates(me);
    if (updates.length === 0) {
      return section('Your groups', 'home', h('p', { class: 'module-empty' }, 'You’re not in any groups yet. ', h('a', { href: '#groups-explore' }, 'Find one to join'), '.'));
    }
    // Groups with something new first, then the rest in order of your visits.
    const busy = (u) => u.newPosts + u.newThreads + u.newFeedPosts + u.unreadChat;
    const ordered = [...updates].sort((a, b) => Number(busy(b) > 0) - Number(busy(a) > 0));
    return section('Your groups', 'home',
      h('ul', { class: 'dashboard__list' }, limit(ordered, 'groups').map(renderGroupRow)),
      !isFullPage && ordered.length > CARD_LIMITS.groups ? h('p', { class: 'dashboard__note' }, `+ ${ordered.length - CARD_LIMITS.groups} more`) : null);
  }

  function renderGroupRow(update) {
    const { space, latestPost, nextEvent } = update;
    const news = [
      update.newPosts && `${update.newPosts} new ${update.newPosts === 1 ? 'announcement' : 'announcements'}`,
      update.newThreads && `${update.newThreads} new ${update.newThreads === 1 ? 'thread' : 'threads'}`,
      update.newFeedPosts && `${update.newFeedPosts} new ${update.newFeedPosts === 1 ? 'post' : 'posts'}`,
      update.unreadChat && `${update.unreadChat} unread in chat`,
    ].filter(Boolean);

    return h('li', { class: 'dashboard__row dashboard__row--group' },
      h('span', { class: 'groups-menu__badge dashboard__badge', 'aria-hidden': 'true' }, groupInitials(space.name)),
      h('span', { class: 'dashboard__text' },
        h('a', { class: 'dashboard__group-name', href: spaceHref(space.id) }, space.name),
        news.length
          ? h('span', { class: 'dashboard__news' }, ` ${news.join(' · ')}`)
          : h('span', { class: 'dashboard__meta' }, update.lastVisit ? ` Nothing new since ${timeAgo(update.lastVisit)}` : ' Not visited yet'),
        latestPost ? h('span', { class: 'dashboard__detail' },
          'Latest: ', h('a', { href: `#module-${latestPost.moduleId}`, onClick: openItem(latestPost.moduleId, latestPost.post.id) }, `“${latestPost.post.title}”`),
          ` · ${getMember(latestPost.post.authorId)?.name.split(' ')[0] ?? 'someone'}, ${timeAgo(latestPost.post.createdAt)}`) : null,
        nextEvent ? h('span', { class: 'dashboard__detail' },
          'Next: ', h('a', { href: eventHref(nextEvent.event.id) }, nextEvent.event.title), ` · ${formatShortDate(nextEvent.date)}`) : null));
  }

  // ─── Coming up ─────────────────────────────────────────────────────────────

  function renderComingUp() {
    const upcoming = myUpcoming(me);
    if (!upcoming.length) {
      return section('Coming up', 'calendar', h('div', { class: 'empty-state empty-state--compact' },
        h('p', {}, 'Nothing on your calendar for the next month.'),
        uses(me, 'groups') ? h('a', { class: 'button button--small', href: '#groups-explore' }, 'Find something near you') : null));
    }
    const shown = limit(upcoming, 'events');
    return section('Coming up', 'calendar',
      h('ul', { class: 'dashboard__list dashboard__list--events' }, shown.map(renderEventRow)),
      !isFullPage && upcoming.length > shown.length ? h('button', { type: 'button', class: 'link-button dashboard__note', onClick: () => context.openFullPage() }, `+ ${upcoming.length - shown.length} more in the next month`) : null);
  }

  function renderEventRow({ event, date, space, role, ...occurrence }) {
    const [, month, day] = date.split('-').map(Number);
    const time = occurrenceTimeLabel({ event, date, ...occurrence });
    const label = { mine: 'On your calendar', host: 'You’re hosting', going: 'You’re going', maybe: 'You said maybe', invited: 'You’re invited', shift: 'Your shift' }[role];
    // A volunteer shift (shifts module) opens its module; everything else, the event's page.
    const href = role === 'shift' ? `#module-${occurrence.moduleId}` : eventHref(event.id);
    return h('li', { class: `dashboard__row dashboard__row--event is-${role}` },
      h('a', { class: 'dashboard__date', href, tabindex: '-1', 'aria-hidden': 'true', style: { '--event-color': colorValue(event.color) } },
        h('span', { class: 'dashboard__date-month' }, monthName(month - 1).slice(0, 3)),
        h('span', { class: 'dashboard__date-day' }, String(day))),
      h('span', { class: 'dashboard__text' },
        h('a', { class: 'dashboard__event-title', href }, event.title),
        h('span', { class: 'dashboard__meta' }, [time, space.kind === 'personal' ? 'My calendar' : space.name].filter(Boolean).join(' · ')),
        h('span', { class: `dashboard__role dashboard__role--${role}` }, label),
        role === 'invited' || role === 'maybe' ? availabilityChip(event, { date }) : null),
      role === 'invited' || role === 'maybe' || answeredThisVisit(event.id) ? rsvpButtons(event, me.id, (answer) => {
        updateEvent(event.id, (saved) => applyRsvp(saved, me.id, answer));
        if (answer === 'going') showToast(`You’re going to “${event.title}”.`);
        draw();
      }, { compact: true }) : null);
  }

  // ─── Your tasks ────────────────────────────────────────────────────────────

  function renderTasks() {
    const tasks = myTasks(me);
    if (!tasks.length) {
      return section('Your tasks', 'todo', h('div', { class: 'empty-state empty-state--compact' },
        h('p', {}, 'Nothing on your plate. When someone gives you a task, or you take one, it shows up here.')));
    }
    const shown = limit(tasks, 'tasks');
    return section('Your tasks', 'todo',
      h('ul', { class: 'dashboard__list dashboard__list--tasks' }, shown.map(({ task, space, moduleId }) => {
        const due = dueLabel(task);
        return h('li', { class: 'dashboard__row dashboard__row--task' },
          h('input', {
            type: 'checkbox', class: 'dashboard__check', 'aria-label': `Done: ${task.text}`,
            onChange: () => {
              const data = structuredClone(getModule(moduleId).data);
              const saved = data.tasks.find((t) => t.id === task.id);
              if (saved) applyTaskChanges(saved, { done: true }); // a repeating task comes back with its next date
              updateModuleData(moduleId, data);
              showToast(`Done: “${task.text}”.`, { actionLabel: 'Undo', onAction: () => {
                const back = structuredClone(getModule(moduleId).data);
                const t = back.tasks.find((x) => x.id === task.id);
                if (t) applyTaskChanges(t, task.repeat ? { undoRepeat: true } : { done: false });
                updateModuleData(moduleId, back);
                draw();
              } });
              draw();
            },
          }),
          h('span', { class: 'dashboard__text' },
            h('a', { href: `#module-${moduleId}`, onClick: openItem(moduleId, task.id) }, task.text),
            h('span', { class: `dashboard__meta${isOverdue(task) ? ' is-overdue' : ''}` }, [space.kind === 'personal' ? 'My list' : space.name, due].filter(Boolean).join(' · '))));
      })),
      !isFullPage && tasks.length > shown.length ? h('button', { type: 'button', class: 'link-button dashboard__note', onClick: () => context.openFullPage() }, `+ ${tasks.length - shown.length} more`) : null);
  }

  draw();
  // The wrapper lets CSS lay the three parts side by side when the card is wide.
  container.append(h('div', { class: 'dashboard-wrap' }, root));
}

/** A titled part of the dashboard. */
function section(title, iconName, ...children) {
  return h('section', { class: 'dashboard__section' },
    h('h3', { class: 'dashboard__title' }, icon(iconName, 14), ` ${title}`),
    ...children);
}
