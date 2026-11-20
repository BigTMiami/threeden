// @ts-check
/**
 * event-extras.js — the parts of an event's page that keep people coming
 * back (the growth model's main lesson) and help groups that meet often.
 *
 *   renderAfterEvent     Photos (anyone who went can add some; the others are told)
 *                        and, once it's over, "What's next" from the same group or
 *                        host, with a Follow button
 *   renderSkips          For a repeating event you're going to: the next few dates,
 *                        each with "Skip this one", so you can stay Going without
 *                        being counted for a week you'll miss  (event.skips)
 *   renderBringFriend    A link that lets one friend see the event and RSVP as your
 *                        guest  (event.friendCodes = { code: memberId })
 *   renderMeetingNotes   Notes for each meeting of a group's event, kept by date
 *                        (event.minutes = { 'YYYY-MM-DD': { text, by, at } })
 *   shareCardButton      A picture for Instagram, with the link (js/ui/share-card.js)
 *
 * (Nov 20: event pages no longer have Sign-ups or Rides; a Board or Feed post
 * can still carry sign-ups, and groups have the Shifts module.)
 *
 *   friendCodeOwner(event, code) → the member whose guest link this is, or null
 */

import { h, replaceChildren, makeId } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { isRegular, visitsOf, VISITS_TO_BE_A_REGULAR } from './regulars.js';
import { renderSayThanks } from './event-thanks.js';
import { showToast } from '../ui/toast.js';
import { openLightbox } from '../ui/lightbox.js';
import { photoPicker } from '../ui/image-upload.js';
import { openShareCard } from '../ui/share-card.js';
import { getMember } from '../state/store.js';
import { updateEvent } from '../state/events.js';
import { isFollowing, toggleFollow } from '../state/follows.js';
import { addEventPhotos, whatsNext, hasHappened, hasStarted } from '../state/event-followups.js';
import { rsvpOf, occurrencesBetween, colorValue } from '../modules/calendar/calendar-data.js';
import { eventHref, whenLabel } from './event-details.js';
import { todayKey, addDays, formatShortDate, timeAgo } from '../utils/dates.js';
import { spaceHref } from '../router.js';
import { recapCard } from './event-recap.js';

const went = (event, memberId) => event.createdBy === memberId || ['going', 'maybe'].includes(rsvpOf(event, memberId));
const linkTo = (hash) => `${window.location.origin}${window.location.pathname}${hash}`;

// ─── After the event ─────────────────────────────────────────────────────────

export function renderAfterEvent({ event, space }, me, redraw) {
  if (!hasStarted(event)) return null;
  const photos = event.photos ?? [];
  const canAdd = !me.isGuest && went(event, me.id);
  const over = hasHappened(event);

  const photoSection = photos.length || canAdd ? h('section', { class: 'event-page__photos' },
    h('h2', { class: 'event-page__section-title' }, photos.length ? `Photos · ${photos.length}` : 'Photos'),
    photos.length
      ? h('div', { class: 'event-photos' }, photos.map((photo, i) => h('button', {
        type: 'button', class: 'event-photos__item', 'aria-label': `Photo ${i + 1} by ${getMember(photo.by)?.name ?? 'someone'}`,
        onClick: () => openLightbox(photos.map((p) => ({ ...p, caption: `By ${getMember(p.by)?.name ?? 'someone'}` })), i),
      }, h('img', { src: photo.src, alt: '' }))))
      : h('p', { class: 'event-details__muted' }, over ? 'No photos yet. Add yours so everyone can see them.' : 'Taking photos? Add them here as it happens.'),
    canAdd ? photoPicker({
      label: 'Add photos',
      onPhotos: (picked) => {
        addEventPhotos(event.id, picked, me);
        showToast(`Added ${picked.length === 1 ? 'your photo' : `${picked.length} photos`}. Everyone who went will see ${picked.length === 1 ? 'it' : 'them'}.`);
        redraw();
      },
    }) : null) : null;

  if (!over) return photoSection;

  const next = whatsNext({ event, space }, me.id);
  const followTarget = space.kind === 'group' ? { kind: 'space', id: space.id } : event.createdBy && event.createdBy !== me.id ? { kind: 'person', id: event.createdBy } : null;
  const followName = space.kind === 'group' ? space.name : getMember(event.createdBy)?.name.split(' ')[0];
  const isMember = space.kind === 'group' && space.memberIds.includes(me.id);

  return [
    recapCard({ event, space }, me, redraw),
    renderSayThanks(event, me),
    h('section', { class: 'event-page__next' },
      h('h2', { class: 'event-page__section-title' }, went(event, me.id) && event.createdBy !== me.id ? 'Thanks for coming! What’s next' : 'What’s next'),
      next.length
        ? h('ul', { class: 'event-next' }, next.map((o) => h('li', { class: 'event-next__row', style: { '--event-color': colorValue(o.event.color) } },
          h('span', { class: 'event-next__date' }, formatShortDate(o.date)),
          h('a', { href: eventHref(o.event.id) }, o.event.emoji ? `${o.event.emoji} ${o.event.title}` : o.event.title),
          h('span', { class: 'event-details__muted' }, ` · ${o.space.kind === 'group' ? o.space.name : 'hosted by the same person'}`))))
        : h('p', { class: 'event-details__muted' }, `Nothing else on the calendar from ${followName ?? 'them'} yet.`),
      followTarget && !me.isGuest && !isMember ? followButton(me, followTarget, followName, redraw) : null,
      space.kind === 'group' && (isMember || space.visibility === 'public') ? h('a', { class: 'button button--small', href: spaceHref(space.id) }, `Go to ${space.name}`) : null),
    photoSection,
  ];
}

function followButton(me, target, name, redraw) {
  const following = isFollowing(me.id, target);
  return h('button', {
    type: 'button',
    class: `button button--small${following ? '' : ' button--primary'}`,
    'aria-pressed': String(following),
    onClick: () => {
      const now = toggleFollow(me.id, target);
      showToast(now ? `Following ${name}. Their next events will show up for you.` : `Stopped following ${name}.`);
      redraw();
    },
  }, following ? `Following ${name}` : `Follow ${name}`);
}

// ─── Repeating events: skip one ──────────────────────────────────────────────

export function renderSkips(event, me, redraw) {
  if (event.repeat === 'none' || rsvpOf(event, me.id) !== 'going' || me.isGuest) return null;
  const start = todayKey();
  const dates = [...new Set(occurrencesBetween([event], start, addDays(start, 70)).filter((o) => o.dayNumber === 1).map((o) => o.date))].slice(0, 4);
  if (dates.length === 0) return null;
  const skipped = new Set(event.skips?.[me.id] ?? []);
  const goingCount = (date) => Object.entries(event.rsvps ?? {}).filter(([id, a]) => a === 'going' && !(event.skips?.[id] ?? []).includes(date)).length;

  return h('section', { class: 'event-page__skips' },
    h('h2', { class: 'event-page__section-title' }, isRegular(event, me.id) ? `You’re a regular · ${visitsOf(event, me.id)} times` : 'Your next dates'),
    h('p', { class: 'event-details__muted' }, isRegular(event, me.id)
      ? 'Your Going carries over to every date. Missing one? Skip just that one.'
      : `Your Going carries over to every date. Missing one? Skip just that one. After ${VISITS_TO_BE_A_REGULAR} times, you’re a regular.`),
    h('ul', { class: 'event-skips' }, dates.map((date) => {
      const isSkipped = skipped.has(date);
      return h('li', { class: `event-skips__row${isSkipped ? ' is-skipped' : ''}` },
        h('span', { class: 'event-skips__date' }, formatShortDate(date)),
        h('span', { class: 'event-details__muted' }, `${goingCount(date)} going`),
        h('button', {
          type: 'button', class: 'button button--small', 'aria-pressed': String(isSkipped),
          onClick: () => {
            updateEvent(event.id, (e) => {
              const mine = new Set(e.skips?.[me.id] ?? []);
              if (mine.has(date)) mine.delete(date); else mine.add(date);
              e.skips = { ...e.skips, [me.id]: [...mine].filter((d) => d >= start) };
            });
            showToast(isSkipped ? `You’re back for ${formatShortDate(date)}.` : `Skipping ${formatShortDate(date)}. You’re still going to the rest.`);
            redraw();
          },
        }, isSkipped ? 'I’ll be there after all' : 'Skip this one'));
    })));
}

// ─── Bring a friend ──────────────────────────────────────────────────────────

export function friendCodeOwner(event, code) {
  return code ? event.friendCodes?.[code] ?? null : null;
}

export function renderBringFriend({ event, space }, me) {
  if (me.isGuest || event.visibility === 'public') return null; // a public event's own link works for anyone
  const canBring = went(event, me.id) || space.memberIds.includes(me.id);
  if (!canBring) return null;
  const box = h('div', { class: 'event-friend' });
  const existing = Object.entries(event.friendCodes ?? {}).find(([, id]) => id === me.id)?.[0];

  function show(code) {
    const url = linkTo(`${eventHref(event.id)}~${code}`);
    replaceChildren(box,
      h('input', { type: 'text', class: 'input', readonly: true, value: url, 'aria-label': 'Your guest link', onFocus: (e) => e.target.select() }),
      h('button', {
        type: 'button', class: 'button button--small',
        onClick: async () => { try { await navigator.clipboard.writeText(url); showToast('Guest link copied. Send it to your friend.'); } catch { showToast(url); } },
      }, icon('link', 14), ' Copy'),
      h('span', { class: 'settings-field__hint' }, 'Whoever opens this link can see the event and RSVP as your guest.'));
  }

  if (existing) show(existing);
  else {
    replaceChildren(box, h('button', {
      type: 'button', class: 'button button--small',
      onClick: () => {
        const code = makeId('f').slice(2);
        updateEvent(event.id, (e) => { e.friendCodes = { ...e.friendCodes, [code]: me.id }; });
        show(code);
      },
    }, icon('plus', 14), ' Get a guest link'));
  }
  return h('section', { class: 'event-page__friend' },
    h('h2', { class: 'event-page__section-title' }, 'Bring a friend'),
    box);
}

// ─── Meeting notes ───────────────────────────────────────────────────────────

export function renderMeetingNotes({ event, space }, me, redraw) {
  if (space.kind !== 'group' || !space.memberIds.includes(me.id)) return null;
  const today = todayKey();
  // The dates to keep notes for: the last few that happened, and the next one.
  const past = occurrencesBetween([event], addDays(today, -120), today).filter((o) => o.dayNumber === 1).map((o) => o.date);
  const upcoming = occurrencesBetween([event], addDays(today, 1), addDays(today, 60)).filter((o) => o.dayNumber === 1).map((o) => o.date);
  const dates = [...new Set([...past.slice(-4).reverse(), ...upcoming.slice(0, 1)])];
  if (dates.length === 0) return null;
  let date = dates.find((d) => event.minutes?.[d]) ?? dates[0];

  const select = h('select', { class: 'input input--compact', 'aria-label': 'Which meeting' },
    dates.map((d) => h('option', { value: d, selected: d === date }, `${formatShortDate(d)}${d > today ? ' (next)' : ''}`)));
  const text = h('textarea', { class: 'input event-notes__text', rows: '5', placeholder: 'Agenda, decisions, who’s doing what…', 'aria-label': 'Meeting notes' });
  const meta = h('span', { class: 'settings-field__hint' });
  const fill = () => {
    const saved = event.minutes?.[date];
    text.value = saved?.text ?? '';
    meta.textContent = saved ? `Last edited by ${getMember(saved.by)?.name ?? 'someone'}, ${timeAgo(saved.at)}` : 'Anyone in the group can edit these.';
  };
  select.addEventListener('change', () => { date = select.value; fill(); });
  fill();

  return h('section', { class: 'event-page__notes-section' },
    h('h2', { class: 'event-page__section-title' }, event.repeat === 'none' ? 'Meeting notes' : 'Notes from each meeting'),
    dates.length > 1 ? select : null,
    text,
    h('div', { class: 'form-row' },
      h('button', {
        type: 'button', class: 'button button--small',
        onClick: () => {
          updateEvent(event.id, (e) => { e.minutes = { ...e.minutes, [date]: { text: text.value.trim(), by: me.id, at: Date.now() } }; });
          showToast('Notes saved.');
          redraw();
        },
      }, 'Save notes'),
      meta));
}

// ─── Share card ──────────────────────────────────────────────────────────────

export function shareCardButton({ event, space }, me) {
  if (event.visibility !== 'public' && event.createdBy !== me.id) return null;
  const host = getMember(event.createdBy);
  return h('button', {
    type: 'button', class: 'button button--small',
    onClick: () => openShareCard({
      title: event.title,
      emoji: event.emoji ?? (event.tags?.includes('music') ? '🎵' : '🎉'),
      color: colorValue(event.color),
      cover: event.cover?.kind === 'image' ? event.cover : null,
      lines: [whenLabel(event), event.location],
      byline: space.kind === 'group' ? space.name : host ? `Hosted by ${host.name}` : '',
      link: linkTo(eventHref(event.id)),
    }),
  }, icon('image', 14), ' Share card for Instagram');
}
