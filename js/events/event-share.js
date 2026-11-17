/**
 * event-share.js — the Share button on events, and the menu it opens.
 *
 *   Share “Porch Lights at the Backroom”            ×
 *   ┌──────────────────────────────────────────────┐
 *   │ ↗ Send in 3den       to friends, in Messages │
 *   │ 🔗 Copy link                                  │
 *   │ 💬 Text message                               │  ← public events
 *   │ ✉ Email                                       │  ← public events
 *   │ 🖼 Share card for Instagram                   │  ← public events
 *   │ ⋯ More options        (the phone's own share sheet)
 *   └──────────────────────────────────────────────┘
 *   Anyone with a 3den account can open the link.
 *
 * Who it can go to follows who can see the event (canViewEvent):
 *   public       anyone: friends, groupmates, people you've messaged, and
 *                outside 3den by text, email, or Instagram
 *   group        people who can already see it (the group, anyone invited)
 *   invite only  the host can send it to anyone, which invites them;
 *                guests can send it to others on the guest list
 * For friends who can't see a private event, the event page has
 * "Bring a friend" (a guest link: js/events/event-extras.js).
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
import { getMember } from '../state/store.js';
import { canViewEvent, updateEvent } from '../state/events.js';
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
  if (event.visibility === 'invite' && event.createdBy === me.id) return everyone; // sending invites them
  return everyone.filter((id) => canViewEvent(found, id));
}

function whoCanOpen(found) {
  const { event, space } = found;
  if (event.visibility === 'public') return 'Anyone with a 3den account can open the link.';
  if (event.visibility === 'group') return `Only people in ${space.name} (and anyone invited) can open the link.`;
  return 'Only people on the guest list can open the link.';
}

export function openEventShare(found, me) {
  const { event, space } = found;
  const host = getMember(event.createdBy);
  const isPublic = event.visibility === 'public';
  const url = linkTo(eventHref(event.id));
  const blurb = [event.title, whenLabel(event), event.location].filter(Boolean).join(' · ');
  const message = `${blurb}\n${url}`;
  const previousFocus = document.activeElement;
  const isHostOfPrivate = event.visibility === 'invite' && event.createdBy === me.id;

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
      // An invite-only event's host sending it to someone puts them on the guest list.
      onSent: isHostOfPrivate ? (ids) => updateEvent(event.id, (e) => { e.inviteeIds = [...new Set([...(e.inviteeIds ?? []), ...ids])]; }) : null,
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
        option('send', 'Send in 3den', isHostOfPrivate ? 'To anyone. Sending it invites them.' : 'To people who can see it, in Messages', sendInApp),
        option('link', 'Copy link', null, copyLink),
        isPublic ? option('chat', 'Text message', null, null, `sms:?&body=${encodeURIComponent(message)}`) : null,
        isPublic ? option('mail', 'Email', null, null, `mailto:?subject=${encodeURIComponent(event.title)}&body=${encodeURIComponent(message)}`) : null,
        isPublic ? option('image', 'Share card for Instagram', 'A picture for a story or post, with the link', instagram) : null,
        isPublic && typeof navigator.share === 'function' ? option('more', 'More options', 'Your device’s share menu', nativeShare) : null),
      h('p', { class: 'event-share__note' }, whoCanOpen(found),
        !isPublic && !isHostOfPrivate ? ' To bring someone else, use “Bring a friend” on the event page.' : '')));

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
