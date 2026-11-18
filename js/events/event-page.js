// @ts-check
/**
 * event-page.js — one event's own page (#event-<id>), Partiful-style.
 *
 *   ← Back
 *   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
 *   ▓  Potluck in the backyard              ▓
 *   ▓  Saturday, November 21 · 6 – 9pm      ▓
 *   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
 *   [👍 Going · 5] [🤔 Maybe · 2] [😢 Can't go · 0]
 *   📍 237 Hart St backyard · Hosted by Anna · Public · In 237 Hart Street
 *   About … · Guests …
 *   Host tools: invite people, the link
 *
 * A cover image (js/events/event-cover.js) sits above the title, and Share
 * (js/events/event-share.js) is next to the badge, for everyone.
 *
 * Whoever can edit the event can press "Customize page": change the cover
 * right there, move sections up and down, hide the ones they don't need,
 * and add their own (text, a schedule, links, photos and videos), saved as
 * event.page (js/events/event-page-layout.js).
 *
 * Who can open it is decided by canViewEvent (js/state/events.js): public
 * events are open to everyone signed in; group events to the group (and
 * anyone invited); invite-only events to the host and the invited.
 *
 * Saying "Going" puts the event on your own calendar (see linked items).
 */

import { reminderFor, setEventReminder, EVENT_LEADS } from '../state/reminders.js';
import { renderEventTags } from './event-tags.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { offerPushOnce, turnOnPush } from '../state/delivery.js';
import { offerFullAccountOnce, fullAccountNudge } from '../onboarding/finish-account.js';
import { renderText } from '../ui/text.js';
import { getCurrentUser, getMember, getSpace, getSpaces } from '../state/store.js';
import { findAccountByLogin, getAccounts } from '../state/accounts.js';
import { findEvent, updateEvent, canViewEvent, canEditEvent, hostGroupsOf } from '../state/events.js';
import { can } from '../state/permissions.js';
import { VISIBILITY, isMultiDay, applyRsvp, colorValue, rsvpOf, hostIdsOf, isFull, promoteWaitlist } from '../modules/calendar/calendar-data.js';
import { repeatLabel } from './event-series.js';
import { todayKey, addDays } from '../utils/dates.js';
import { editInPlace } from '../ui/edit-in-place.js';
import { renderRides } from './event-rides.js';
import { choiceMenu } from '../ui/choice-menu.js';
import { availabilityChip } from '../ui/availability-chip.js';
import { requestModuleFocus } from '../editor/module-context.js';
import { openModulePage, spaceHref, goBack, backLabel, goTo } from '../router.js';
import { rsvpButtons, rsvpSummary, guestList } from './rsvp.js';
import { whenLabel, mapLink, eventHref, renderTimePoll, areaLabel, directionsButton } from './event-details.js';
import {
  renderAfterEvent, renderSkips, renderBringFriend, renderSignups, renderMeetingNotes, friendCodeOwner,
} from './event-extras.js';
import { setPageMeta } from '../ui/page-meta.js';
import { eventCoverBanner, hasCover, coverPicker } from './event-cover.js';
import { normalizePage, SECTION_LABELS, ALWAYS_SHOWN, BLOCK_KINDS, newBlock, renderBlock, renderBlockEditor } from './event-page-layout.js';
import { eventShareButton } from './event-share.js';

/** Events whose page is being customized right now (by id). */
const customizing = new Set();

/** "Remind me": for people going (or maybe), and the host, before the event starts. */
function reminderControl(event, me, redraw) {
  if (me.isGuest || event.date < todayKey()) return null;
  const answer = rsvpOf(event, me.id);
  if (event.createdBy !== me.id && answer !== 'going' && answer !== 'maybe') return null;
  const current = reminderFor(me.id, event.id);
  // A small bell button; the choices open when you tap it.
  return choiceMenu({
    label: 'Remind me',
    className: 'event-page__remind',
    iconName: current ? 'bellRing' : 'bell',
    options: [{ id: '', label: 'No reminder' }, ...EVENT_LEADS.map((lead) => ({ id: lead.id, label: lead.label }))],
    value: current?.lead ?? '',
    display: (o) => (o.id ? o.label : 'Remind me'),
    onChange: (id) => {
      const reminder = setEventReminder(me.id, event, id || null);
      showToast(reminder ? `Reminder set: ${EVENT_LEADS.find((l) => l.id === reminder.lead).label.toLowerCase()}.` : 'Reminder off.');
      redraw();
    },
  });
}

/** "you", "Grace", "Grace and you", "Grace, Ana, and Porch Lights": the host first, then hosting groups, with an Oxford comma. */
function hostNames(hosts, me, groups = []) {
  const names = [...hosts.map((m) => (m.id === me.id ? 'you' : m.name.split(' ')[0])), ...groups.map((g) => g.name)];
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

export function renderEventPage(container, eventId, friendCode = null) {
  const me = getCurrentUser();
  const found = findEvent(eventId);
  const redraw = () => renderEventPage(container, eventId, friendCode);
  // A guest link from someone going (js/events/event-extras.js): their friend can see it and RSVP.
  const guestOf = found ? friendCodeOwner(found.event, friendCode) : null;

  if (!found || !(canViewEvent(found, me.id) || guestOf)) {
    replaceChildren(container,
      h('button', { type: 'button', class: 'link-button module-page__back', onClick: () => goBack('#') }, icon('arrowLeft', 14), ` ${backLabel('Back', (id) => getSpace(id)?.name ?? null)}`),
      h('p', { class: 'module-empty' }, 'This event doesn’t exist, or it’s invite-only and you weren’t invited.'));
    return;
  }

  const { event, space, moduleId } = found;
  // Calendar entries don't have pages: show it on its calendar instead.
  if (event.kind === 'entry') {
    requestModuleFocus(moduleId, event.id);
    openModulePage(moduleId);
    return;
  }
  const host = getMember(event.createdBy);
  const hosts = hostIdsOf(event).map(getMember).filter(Boolean);
  const isHost = canEditEvent(event, me.id); // the host, a co-host, or someone in a hosting group
  const hostGroups = hostGroupsOf(event);
  const isMember = space.memberIds.includes(me.id);
  // Hosts (people or groups in the "Hosts" field) can edit, as can the group for group events.
  const canEdit = isHost || canEditEvent(event, me.id) || (event.visibility === 'group' && isMember) || can(space, me.id, 'moderate');
  const visibility = VISIBILITY.find((v) => v.id === event.visibility);

  const answer = (choice) => {
    updateEvent(event.id, (e) => {
      applyRsvp(e, me.id, choice);
      // Answering through a guest link adds you to the guest list, so you can still open it later.
      if (guestOf && !e.inviteeIds.includes(me.id)) e.inviteeIds = [...e.inviteeIds, me.id];
    });
    if ((choice === 'going' || choice === 'maybe') && offerFullAccountOnce(getCurrentUser())) {
      // A quick account's second answer: keep everything in one place (js/onboarding/finish-account.js).
      showToast('Answered! Add a username and password to keep all your events in one place.', { actionLabel: 'Finish my account', duration: 8000, onAction: () => goTo('#finish-account') });
    } else if (choice === 'going' && offerPushOnce(me)) {
      // The first time: offer a heads-up on their phone if plans change (js/state/delivery.js).
      showToast('You’re going! Want a heads-up on your phone if plans change?', {
        actionLabel: 'Turn on', duration: 8000,
        onAction: async () => { const a = await turnOnPush(me); showToast(a === 'granted' ? 'Notifications are on for this device.' : 'Notifications weren’t allowed. You can turn them on in Account settings.'); },
      });
    } else if (choice === 'going') showToast('You’re going! It’s on your calendar.');
    if (choice === 'waitlist') showToast('You’re on the waitlist. If a spot opens, you’ll move up to Going and we’ll tell you.');
    redraw();
  };

  const editing = canEdit && customizing.has(event.id);
  const page = normalizePage(event.page);
  const savePage = (changeFn, { redraw: again = true } = {}) => {
    updateEvent(event.id, (e) => {
      const next = normalizePage(e.page);
      changeFn(next);
      e.page = next;
    });
    if (again) redraw();
  };

  // The RSVP buttons show going and maybe, so the line under them only says spots left and the waitlist.
  const limits = rsvpSummary(event, { counts: false });
  const limitsLine = limits ? limits[0].toUpperCase() + limits.slice(1) : '';

  // The built-in sections (null when there's nothing to show).
  const sections = {
    poll: event.timePoll ? h('section', { class: 'event-page__time-poll' },
      h('h2', { class: 'event-page__section-title' }, event.timePoll.chosenId ? 'The time was picked by vote' : 'When should it be?'),
      renderTimePoll(event, me, redraw)) : null,
    rsvp: h('section', { class: 'event-page__rsvp' },
      h('h2', { class: 'event-page__section-title' }, 'Are you going?'),
      guestOf && !canViewEvent(found, me.id) ? h('p', { class: 'event-page__guest-of' }, avatar(getMember(guestOf), 20), ` ${getMember(guestOf)?.name ?? 'A friend'} invited you as their guest.`) : null,
      rsvpButtons(event, me.id, answer, { guestOf: guestOf ? { eventId: event.id } : null }),
      limitsLine ? h('p', { class: 'event-details__muted' }, limitsLine) : null,
      fullAccountNudge(me, redraw),
      availabilityChip(event, { offerConnect: true }),
      reminderControl(event, me, redraw)),
    facts: h('section', { class: 'event-page__facts' },
      event.location || event.area ? h('p', {}, icon('pin', 14), ' ', event.location ? mapLink(event.location) : null, areaLabel(event), ' ', directionsButton(event)) : null,
      h('p', {}, hosts.length ? [h('span', { class: 'avatar-row' }, hosts.map((m) => avatar(m, 22))), ` Hosted by ${hostNames(hosts, me, hostGroups)}`] : 'Host unknown'),
      event.repeat !== 'none' ? h('p', {}, icon('repeat', 14), ` ${repeatLabel(event)} · `, h('a', { href: `#series-${event.id}` }, 'See every date')) : null,
      h('p', {}, icon('calendar', 14), ' From ', isMember || space.kind === 'blog' ? h('a', { href: spaceHref(space.id) }, space.name) : space.name)),
    about: event.notes ? h('section', { class: 'event-page__about' },
      h('h2', { class: 'event-page__section-title' }, 'About'),
      h('p', { class: 'event-page__notes' }, renderText(event.notes))) : null,
    skips: renderSkips(event, me, redraw),
    after: renderAfterEvent(found, me, redraw),
    signups: renderSignups(event, me, canEdit, redraw),
    rides: renderRides(event, me, redraw),
    guests: h('section', { class: 'event-page__guests' },
      h('h2', { class: 'event-page__section-title' }, 'Guests'),
      guestList(event, getMember)),
    bring: renderBringFriend(found, me),
    notes: renderMeetingNotes(found, me, redraw),
  };

  /** One section in place, or (customizing) wrapped with ↑ ↓ Hide / Delete. */
  const slot = (id, index) => {
    const block = page.blocks.find((b) => b.id === id);
    const hidden = page.hidden.includes(id);
    if (!editing) {
      if (hidden) return null;
      return block ? renderBlock(block) : sections[id];
    }
    const label = block ? (BLOCK_KINDS.find((k) => k.kind === block.kind)?.label ?? 'Section') : SECTION_LABELS[id];
    const move = (delta) => savePage((p) => {
      const from = p.order.indexOf(id);
      const to = Math.max(0, Math.min(p.order.length - 1, from + delta));
      p.order.splice(to, 0, p.order.splice(from, 1)[0]);
    });
    const content = block
      ? renderBlockEditor(block, (changes, { redraw: again = false } = {}) => savePage((p) => { Object.assign(p.blocks.find((b) => b.id === id), changes); }, { redraw: again }))
      : hidden ? null : sections[id] ?? h('p', { class: 'event-page__empty-section' }, 'Nothing to show here yet.');
    return h('div', { class: `event-page__slot${hidden ? ' is-hidden' : ''}` },
      h('div', { class: 'event-page__slot-bar' },
        h('span', { class: 'event-page__slot-label' }, label, hidden ? ' (hidden)' : ''),
        h('button', { type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': `Move ${label} up`, disabled: index === 0, onClick: () => move(-1) }, icon('chevronUp', 14)),
        h('button', { type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': `Move ${label} down`, disabled: index === page.order.length - 1, onClick: () => move(1) }, icon('chevronDown', 14)),
        block
          ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => savePage((p) => { p.blocks = p.blocks.filter((b) => b.id !== id); p.order = p.order.filter((x) => x !== id); }) }, 'Delete')
          : ALWAYS_SHOWN.includes(id) ? null
            : h('button', { type: 'button', class: 'link-button', onClick: () => savePage((p) => { p.hidden = hidden ? p.hidden.filter((x) => x !== id) : [...p.hidden, id]; }) }, hidden ? 'Show' : 'Hide')),
      content);
  };

  const customizeBar = editing ? h('div', { class: 'event-page__customize' },
    h('div', { class: 'event-page__customize-head' },
      h('strong', {}, 'Customizing this page'),
      h('span', { class: 'event-details__muted' }, 'Changes save as you go. Everyone who opens the event sees them.'),
      h('button', { type: 'button', class: 'button button--primary button--small', onClick: () => { customizing.delete(event.id); redraw(); } }, 'Done')),
    h('div', { class: 'event-page__customize-cover' },
      h('span', { class: 'settings-field__label' }, 'Cover'),
      coverPicker(event.cover, (cover) => updateEvent(event.id, (e) => { e.cover = cover; }))),
    h('div', { class: 'event-page__add-blocks' },
      h('span', { class: 'settings-field__label' }, 'Add a section'),
      h('div', { class: 'event-page__block-kinds' }, BLOCK_KINDS.map((kind) => h('button', {
        type: 'button', class: 'event-page__block-kind', title: kind.hint,
        onClick: () => savePage((p) => { const block = newBlock(kind.kind); p.blocks.push(block); p.order.push(block.id); }),
      }, icon(kind.icon, 16), h('span', {}, h('strong', {}, kind.label), h('span', {}, kind.hint))))))) : null;

  replaceChildren(container,
    h('button', { type: 'button', class: 'link-button module-page__back', onClick: () => goBack('#') }, icon('arrowLeft', 14), ` ${backLabel('Back', (id) => getSpace(id)?.name ?? null)}`),
    h('article', { class: `event-page${editing ? ' is-customizing' : ''}`, style: { '--event-color': colorValue(event.color) } },
      eventCoverBanner(event, 'event-page__cover', { natural: true }),
      h('header', { class: `event-page__hero${hasCover(event) ? ' event-page__hero--cover' : ''}` },
        h('div', { class: 'event-page__hero-top' },
          h('span', { class: `event-badge event-badge--${event.visibility} event-page__badge` }, visibility?.label),
          h('span', { class: 'event-page__hero-actions' },
            canEdit && !editing ? h('button', { type: 'button', class: 'button button--small', onClick: () => { customizing.add(event.id); redraw(); } }, icon('pencil', 14), ' Customize page') : null,
            eventShareButton(found, me))),
        event.emoji ? h('span', { class: 'event-page__emoji', 'aria-hidden': 'true' }, event.emoji) : null,
        // Hosts can tap the name or the time to change it right here.
        editInPlace('h1', {
          className: 'event-page__title', label: 'Event name', canEdit,
          fields: [{ key: 'title', value: event.title }],
          onSave: ({ title }) => { updateEvent(event.id, (e) => { e.title = title; }); redraw(); },
        }),
        editInPlace('p', {
          className: 'event-page__when', label: 'When', canEdit,
          display: whenLabel(event),
          fields: isMultiDay(event) || event.allDay
            ? [{ key: 'date', type: 'date', value: event.date, label: 'Date' }]
            : [
                { key: 'date', type: 'date', value: event.date, label: 'Date' },
                { key: 'time', type: 'time', value: event.time ?? '', label: 'Starts' },
                { key: 'endTime', type: 'time', value: event.endTime ?? '', label: 'Ends', required: false },
              ],
          onSave: (values) => { updateEvent(event.id, (e) => {
            const days = isMultiDay(e) ? Math.round((Date.parse(e.endDate) - Date.parse(e.date)) / 86400000) : 0;
            e.date = values.date;
            e.endDate = days ? addDays(values.date, days) : values.date;
            if ('time' in values) { e.time = values.time; e.endTime = values.endTime && values.endTime > values.time ? values.endTime : ''; }
          }); redraw(); },
        }),
        renderEventTags(event)),
      customizeBar,
      page.order.map((id, index) => slot(id, index)),
      isHost || canEdit ? renderHostTools(found, me, { isHost, canEdit, moduleId, redraw }) : null,
    ),
  );
  // What search engines and link previews show for a public event.
  setPageMeta(event.visibility === 'public' ? {
    title: `${event.title} · ${whenLabel(event)}`,
    description: [event.location, host ? `Hosted by ${host.name}` : null, event.notes].filter(Boolean).join(' · ').slice(0, 200),
  } : null);
}

/** Invite people, the link, edit in the calendar. (Sharing is the Share button at the top.) */
function renderHostTools(found, me, { isHost, canEdit, moduleId, redraw }) {
  const { event } = found;
  const input = h('input', { type: 'text', class: 'input input--compact', placeholder: '@username', list: 'event-invite-options', 'aria-label': 'Invite by username' });
  const error = h('span', { class: 'event-details__muted' });
  const shareUrl = `${window.location.origin}${window.location.pathname}${eventHref(event.id)}`;

  // Co-hosts: any host can add one; the person who made it can't be removed.
  const cohostInput = h('input', { type: 'text', class: 'input input--compact', placeholder: '@username', list: 'event-invite-options', 'aria-label': 'Add a co-host by username' });
  const cohostError = h('span', { class: 'event-details__muted' });
  const cohosts = (event.cohostIds ?? []).map(getMember).filter(Boolean);
  const hostGroups = hostGroupsOf(event);
  // Groups you're in can host with you (not the group it already lives in).
  const groupChoices = getSpaces().filter((g) => g.kind === 'group' && g.memberIds.includes(me.id) && g.id !== found.space.id && !hostGroups.some((x) => x.id === g.id));
  const room = event.capacity ? Number(event.capacity) - Object.values(event.rsvps ?? {}).filter((a) => a === 'going').length : 0;
  const waiting = event.waitlist ?? [];

  return h('section', { class: 'event-page__host' },
    h('h2', { class: 'event-page__section-title' }, isHost ? 'Host tools' : 'Manage'),
    isHost && waiting.length ? h('div', { class: 'event-page__waitlist' },
      h('p', {}, icon('list', 14), ` ${waiting.length} on the waitlist`, isFull(event) ? '. It moves up by itself when someone stops going.' : '.'),
      !isFull(event) && room > 0 ? h('button', {
        type: 'button', class: 'button button--small button--primary',
        onClick: () => { updateEvent(event.id, (e) => promoteWaitlist(e)); showToast('Moved people up from the waitlist. They’ve been told.'); redraw(); },
      }, `Let the next ${Math.min(room, waiting.length)} in`) : null) : null,
    isHost ? h('div', { class: 'event-page__cohosts' },
      h('span', { class: 'settings-field__label' }, 'Hosts'),
      h('span', { class: 'settings-field__hint' }, 'Hosts can invite people, edit the event, and see these host tools. Add a group and everyone in it can.'),
      cohosts.length ? h('ul', { class: 'event-page__cohost-list' }, cohosts.map((m) => h('li', {},
        avatar(m, 22), ` ${m.id === me.id ? 'You' : m.name}`,
        h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { updateEvent(event.id, (e) => { e.cohostIds = e.cohostIds.filter((id) => id !== m.id); }); showToast(m.id === me.id ? 'You’re not a co-host anymore.' : `${m.name} isn’t a co-host anymore.`); redraw(); } }, m.id === me.id ? 'Step down' : 'Remove')))) : null,
      hostGroups.length ? h('ul', { class: 'event-page__cohost-list' }, hostGroups.map((g) => h('li', {},
        icon('people', 16), ` ${g.name}`,
        h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { updateEvent(event.id, (e) => { e.hostGroupIds = (e.hostGroupIds ?? []).filter((id) => id !== g.id); }); showToast(`${g.name} isn’t hosting anymore.`); redraw(); } }, 'Remove')))) : null,
      h('form', {
        class: 'form-row',
        onSubmit: (submitEvent) => {
          submitEvent.preventDefault();
          const account = findAccountByLogin(cohostInput.value);
          if (!account) { cohostError.textContent = 'No account with that username.'; return; }
          if (hostIdsOf(event).includes(account.id)) { cohostError.textContent = `${account.name} already hosts it.`; return; }
          updateEvent(event.id, (e) => {
            e.cohostIds = [...(e.cohostIds ?? []), account.id];
            if (!e.inviteeIds.includes(account.id)) e.inviteeIds = [...e.inviteeIds, account.id];
          });
          showToast(`${account.name} is a co-host now. They’ve been told.`);
          redraw();
        },
      }, cohostInput, h('button', { type: 'submit', class: 'button button--small' }, 'Add'), cohostError),
      groupChoices.length ? h('select', {
        class: 'input input--compact', 'aria-label': 'Add a group as a host',
        onChange: (e) => {
          const group = groupChoices.find((g) => g.id === e.target.value);
          if (!group) return;
          updateEvent(event.id, (saved) => { saved.hostGroupIds = [...(saved.hostGroupIds ?? []), group.id]; });
          showToast(`${group.name} is hosting too. It’s on their calendar.`);
          redraw();
        },
      }, h('option', { value: '' }, 'Add a group as a host…'), groupChoices.map((g) => h('option', { value: g.id }, g.name))) : null) : null,
    isHost ? h('form', {
      class: 'form-row',
      onSubmit: (submitEvent) => {
        submitEvent.preventDefault();
        const account = findAccountByLogin(input.value);
        if (!account) { error.textContent = 'No account with that username.'; return; }
        updateEvent(event.id, (e) => { if (!e.inviteeIds.includes(account.id)) e.inviteeIds = [...e.inviteeIds, account.id]; });
        showToast(`Invited ${account.name}.`);
        redraw();
      },
    }, input, h('button', { type: 'submit', class: 'button button--small' }, 'Invite'), error) : null,
    h('datalist', { id: 'event-invite-options' }, getAccounts().filter((a) => !event.inviteeIds.includes(a.id)).map((a) => h('option', { value: `@${a.username}` }, a.name))),
    h('label', { class: 'event-page__share' },
      h('span', { class: 'settings-field__label' }, 'Link to this event'),
      h('input', { type: 'text', class: 'input', readonly: true, value: shareUrl, onFocus: (e) => e.target.select() }),
      h('span', { class: 'settings-field__hint' }, event.visibility === 'public' ? 'Anyone with a 3den account can open it.' : 'Only people who can see the event can open it.')),
    canEdit ? h('button', {
      type: 'button',
      class: 'button',
      onClick: () => {
        requestModuleFocus(moduleId, event.id);
        openModulePage(moduleId);
      },
    }, icon('pencil', 14), ' Edit in the calendar') : null,
  );
}
