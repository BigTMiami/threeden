/**
 * event-share.js — the Share button on events, and the menu it opens.
 *
 *   Share “Porch Lights at the Backroom”            ×
 *   ┌──────────────────────────────────────────────┐
 *   │ ↗ Messages           to friends, in 3den     │
 *   │ 🔗 Copy link                                  │
 *   │ 🖼 Share card for Instagram                   │  ← public events
 *   │ ⋯ More options        (the phone's own share sheet)
 *   └──────────────────────────────────────────────┘
 *   Anyone with a 3den account can open the link.
 *
 * A rounded box in the middle of the screen, phones too (Nov 20: it was a
 * bottom sheet on phones; "Send in 3den" became "Messages", and Text and
 * Email went: Copy link and More options cover those).
 *
 * Who it can go to follows who can see the event (canViewEvent):
 *   public       anyone: friends, groupmates, people you've messaged, and
 *                outside 3den by link, Instagram, or the device's share menu
 *   group        people who can already see it (the group, anyone invited)
 *   invite only  the host can send it to anyone, which invites them;
 *                guests can send it to others on the guest list
 * For friends who can't see a private event, the event page has
 * "Bring a friend" (a guest link: js/events/event-extras.js).
 *
 * Nov 18: sending an event to people in 3den also puts it on their calendars
 * as an invitation (their RSVP card arrives in Messages), whenever the
 * sender may invite: a host, or anyone for public and group events.
 * **Add to a group's calendar** puts it on a group's calendar (and its
 * Upcoming events, and members' Dashboards) without copying it:
 * event.sharedGroupIds, read by js/editor/linked-items.js. Calendar entries
 * (no page, no RSVP) share the same way: **Add people** puts them on their
 * calendars, and Add to a group's calendar.
 *
 *   eventShareButton(found, me, { small, label })  → the button
 *   openEventShare(found, me)                      → the menu
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { openShareDialog } from '../ui/share-dialog.js';
import { openShareCard } from '../ui/share-card.js';
import { shareCandidates } from '../ui/post-reactions.js';
import { getMember, getSpaces } from '../state/store.js';
import { createPeopleSearch } from '../ui/people-search.js';
import { messageablePeople, recipientContext } from '../messages/recipients.js';
import { canViewEvent, updateEvent, canEditEvent, findEvent } from '../state/events.js';
import { colorValue } from '../modules/calendar/calendar-data.js';
import { whenLabel, eventHref } from './event-details.js';

const linkTo = (hash) => `${window.location.origin}${window.location.pathname}${hash}`;

export function eventShareButton(found, me, { small = true, label = 'Share', className = '' } = {}) {
  if (!found || !me || me.isGuest) return null;
  return h('button', {
    type: 'button',
    class: `button${small ? ' button--small' : ''} event-share-button ${className}`,
    onClick: () => openEventShare(found, me),
  }, icon('share', 14), ` ${label}`);
}

/** Who you can send the event to inside 3den. */
function candidatesFor(found, me) {
  const { event, space } = found;
  const everyone = [...new Set([...shareCandidates(me.id), ...space.memberIds, ...(event.inviteeIds ?? [])])].filter((id) => id !== me.id);
  if (event.visibility === 'invite' && canEditEvent(event, me.id)) return everyone; // sending invites them
  return everyone.filter((id) => canViewEvent(found, id));
}

function whoCanOpen(found) {
  const { event, space } = found;
  if (event.visibility === 'public') return 'Anyone with a 3den account can open the link.';
  if (event.visibility === 'group') return `Only people in ${space.name} (and anyone invited) can open the link.`;
  return 'Only people on the guest list can open the link.';
}

export function openEventShare(found, me) {
  if (found.event.kind === 'entry') { openEntryShare(found, me); return; }
  const { event, space } = found;
  const host = getMember(event.createdBy);
  const isPublic = event.visibility === 'public';
  const url = linkTo(eventHref(event.id));
  const blurb = [event.title, whenLabel(event), event.location].filter(Boolean).join(' · ');
  const previousFocus = document.activeElement;
  const isHostOfPrivate = event.visibility === 'invite' && canEditEvent(event, me.id);
  // Sending puts it on their calendars as an invitation, when you may invite.
  const mayInvite = canEditEvent(event, me.id) || event.visibility !== 'invite';

  const option = (iconName, label, hint, onClick, href = null) => h('li', {},
    h(href ? 'a' : 'button', {
      ...(href ? { href, target: '_blank', rel: 'noopener' } : { type: 'button' }),
      class: 'event-share__option',
      onClick: () => { onClick?.(); if (href) close(); },
    },
    h('span', { class: 'event-share__icon', 'aria-hidden': 'true' }, icon(iconName, 18)),
    h('span', { class: 'event-share__text' },
      h('span', { class: 'event-share__label' }, label),
      hint ? h('span', { class: 'event-share__hint' }, hint) : null)));

  const sendInApp = () => {
    close();
    openShareDialog({
      title: event.title,
      attachment: { kind: 'event', eventId: event.id },
      candidateIds: candidatesFor(found, me),
      // Sending it invites them: it's on their calendars with an RSVP (Nov 18).
      onSent: mayInvite ? (ids) => {
        updateEvent(event.id, (e) => { e.inviteeIds = [...new Set([...(e.inviteeIds ?? []), ...ids.filter((id) => id !== e.createdBy)])]; });
        showToast(ids.length === 1 ? 'Sent. It’s on their calendar, ready to RSVP.' : 'Sent. It’s on their calendars, ready to RSVP.');
      } : null,
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied.');
    } catch {
      showToast(url);
    }
    close();
  };

  const instagram = () => {
    close();
    openShareCard({
      title: event.title,
      emoji: event.emoji ?? (event.tags?.includes('music') ? '🎵' : '🎉'),
      color: colorValue(event.color),
      cover: event.cover?.kind === 'image' ? event.cover : null,
      lines: [whenLabel(event), event.location],
      byline: space.kind === 'group' ? space.name : host ? `Hosted by ${host.name}` : '',
      link: url,
    });
  };

  const nativeShare = async () => {
    close();
    try { await navigator.share({ title: event.title, text: blurb, url }); } catch { /* closed without sharing */ }
  };

  const overlay = h('div', { class: 'sub-viewer event-share', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Share ${event.title}` },
    h('div', { class: 'sub-viewer__panel event-share__panel' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, icon('share', 18), ` Share “${event.title}”`),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => close() }, icon('close', 18))),
      h('ul', { class: 'event-share__options' },
        option('send', 'Messages', isHostOfPrivate ? 'To anyone. Sending it invites them.' : mayInvite ? 'Their RSVP card arrives in Messages, and it goes on their calendar' : 'To people who can see it, in Messages', sendInApp),
        groupChoices(found, me).length && maySharetoGroups(found, me) ? option('calendar', 'Add to a group’s calendar', 'It shows on the group’s calendar, its Upcoming events, and members’ Dashboards', () => showGroups()) : null,
        option('link', 'Copy link', null, copyLink),
        isPublic ? option('image', 'Share card for Instagram', 'A picture for a story or post, with the link', instagram) : null,
        isPublic && typeof navigator.share === 'function' ? option('more', 'More options', 'Your device’s share menu', nativeShare) : null),
      h('p', { class: 'event-share__note' }, whoCanOpen(found),
        !isPublic && !isHostOfPrivate ? ' To bring someone else, use “Bring a friend” on the event page.' : '')));

  // "Add to a group's calendar": your groups, each a toggle.
  function showGroups() {
    const panel = overlay.querySelector('.event-share__panel');
    const list = h('ul', { class: 'event-share__groups' });
    const draw = () => list.replaceChildren(...groupChoices(found, me).map((group) => {
      const on = (findEvent(event.id)?.event.sharedGroupIds ?? []).includes(group.id);
      return h('li', {}, h('button', {
        type: 'button', class: `event-share__group${on ? ' is-on' : ''}`, 'aria-pressed': String(on),
        onClick: () => {
          shareWithGroup(event.id, group.id, !on);
          showToast(on ? `Taken off ${group.name}’s calendar.` : `On ${group.name}’s calendar now.`);
          draw();
        },
      }, icon(on ? 'check' : 'plus', 15), h('span', {}, group.name)));
    }));
    draw();
    panel.querySelector('.event-share__options')?.replaceWith(h('div', { class: 'event-share__groups-wrap' },
      h('p', { class: 'event-share__hint' }, 'It stays one event: RSVPs and changes are the same everywhere.'), list,
      h('div', { class: 'form-row' }, h('button', { type: 'button', class: 'button button--small', onClick: () => close() }, 'Done'))));
    /** @type {HTMLElement | null} */ (list.querySelector('button'))?.focus();
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (previousFocus?.isConnected) previousFocus.focus?.();
  }
  function onKey(keyEvent) { if (keyEvent.key === 'Escape') { keyEvent.stopPropagation(); close(); } }
  overlay.addEventListener('click', (clickEvent) => { if (clickEvent.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  overlay.querySelector('.event-share__option')?.focus();
}

/** Your groups this can go on: not where it lives, and not one that hosts it. */
function groupChoices(found, me) {
  const { event, space } = found;
  return getSpaces().filter((g) => g.kind === 'group' && g.memberIds.includes(me.id) && g.id !== space.id && !(event.hostGroupIds ?? []).includes(g.id));
}

/** May you put it on other groups' calendars? Hosts can; anyone can for public and group events; entries, people on them. */
function maySharetoGroups(found, me) {
  const { event, space } = found;
  if (canEditEvent(event, me.id)) return true;
  if (event.kind === 'entry') return space.memberIds.includes(me.id) || (event.attendeeIds ?? []).includes(me.id);
  return event.visibility !== 'invite';
}

/** Put an event or entry on a group's calendar (or take it off). */
export function shareWithGroup(eventId, groupId, on = true) {
  updateEvent(eventId, (e) => {
    const ids = new Set(e.sharedGroupIds ?? []);
    if (on) ids.add(groupId); else ids.delete(groupId);
    e.sharedGroupIds = [...ids];
  });
}

/**
 * Share a calendar entry: Add people (it goes on their calendars, as
 * people on the entry) and Add to a group's calendar.
 */
function openEntryShare(found, me) {
  const { event } = found;
  const previousFocus = document.activeElement;
  let chosen = [];
  const already = new Set(event.attendeeIds ?? []);
  const search = createPeopleSearch({
    people: messageablePeople(me).filter((p) => !already.has(p.id)),
    describe: (p) => recipientContext(me, p),
    label: 'Add people',
    placeholder: 'Add people by name or @username',
    onChange: (ids) => { chosen = ids; },
  });
  const groups = maySharetoGroups(found, me) ? groupChoices(found, me) : [];
  const groupList = h('ul', { class: 'event-share__groups' });
  const drawGroups = () => groupList.replaceChildren(...groups.map((group) => {
    const on = (findEvent(event.id)?.event.sharedGroupIds ?? []).includes(group.id);
    return h('li', {}, h('button', {
      type: 'button', class: `event-share__group${on ? ' is-on' : ''}`, 'aria-pressed': String(on),
      onClick: () => { shareWithGroup(event.id, group.id, !on); showToast(on ? `Taken off ${group.name}’s calendar.` : `On ${group.name}’s calendar now.`); drawGroups(); },
    }, icon(on ? 'check' : 'plus', 15), h('span', {}, group.name)));
  }));
  drawGroups();

  const overlay = h('div', { class: 'sub-viewer event-share', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Share ${event.title}` },
    h('div', { class: 'sub-viewer__panel event-share__panel' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, icon('share', 18), ` Share “${event.title}”`),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => close() }, icon('close', 18))),
      h('section', { class: 'event-share__section' },
        h('h3', { class: 'event-share__label' }, 'Add people'),
        h('p', { class: 'event-share__hint' }, 'It goes on their calendars too.'),
        search.element,
        h('div', { class: 'form-row' }, h('button', {
          type: 'button', class: 'button button--primary button--small',
          onClick: () => {
            if (!chosen.length) return;
            updateEvent(event.id, (e) => { e.attendeeIds = [...new Set([...(e.attendeeIds ?? []), ...chosen])]; });
            showToast(chosen.length === 1 ? 'Added. It’s on their calendar.' : 'Added. It’s on their calendars.');
            close();
          },
        }, 'Add'))),
      groups.length ? h('section', { class: 'event-share__section' },
        h('h3', { class: 'event-share__label' }, 'Add to a group’s calendar'),
        groupList) : null));

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  }
  function onKey(keyEvent) { if (keyEvent.key === 'Escape') { keyEvent.stopPropagation(); close(); } }
  overlay.addEventListener('click', (clickEvent) => { if (clickEvent.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  /** @type {HTMLElement | null} */ (overlay.querySelector('input'))?.focus();
}
