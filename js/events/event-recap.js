/**
 * event-recap.js — after an event, a one-tap recap post: the photos, a few
 * words, and the next date, connected underneath (the event strip in
 * feed-post.js), posted where the people who came will see it.
 *
 *   ┌ How was it? ────────────────────────────────────────────┐
 *   │ Share a recap: photos and the next date, in one post.   │
 *   │                                         [Post a recap]  │
 *   └─────────────────────────────────────────────────────────┘
 *
 *   ── Post a recap ─────────────────────────────────────────
 *   [▣][▣][□][▣]  [+ Add photos]          ← the event's photos, tick the ones to use
 *   [ Thanks to everyone who came to the harbor cleanup! … ]
 *   ☑ Connect the next one: Saturday free pantry, Nov 21
 *   Post to: [ Eastside Mutual Aid · Photos ▾ ]           [Cancel] [Post]
 *
 *   recapCard(found, me, redraw)   → the prompt for the event page, or null
 *   openRecapComposer(found, me, { onDone })
 *   recapTargets(found, me)        → feeds this person can post a recap to
 *
 * Who's asked: the host, and people who said Going, once it's over (up to
 * two weeks). Once posted, the card says so (member.recapped).
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { readImages } from '../ui/image-upload.js';
import { changeState, getBlogOf, getMember, getModule, updateModuleData } from '../state/store.js';
import { addEventPhotos, whatsNext, hasHappened } from '../state/event-followups.js';
import { rsvpOf } from '../modules/calendar/calendar-data.js';
import { createPost, normalizeFeed } from '../modules/blog-feeds/feed-data.js';
import { formatShortDate, todayKey, addDays } from '../utils/dates.js';
import { notify } from '../state/notifications.js';

const FEEDS = ['photofeed', 'generalfeed'];

/** Feeds this person can post a recap in: the event's group's, then their own blog's. */
export function recapTargets({ space }, me) {
  const targets = [];
  if (space.kind === 'group' && space.memberIds.includes(me.id)) {
    for (const m of space.modules) if (FEEDS.includes(m.type)) targets.push({ moduleId: m.id, label: `${space.name} · ${m.title}` });
  }
  const blog = getBlogOf(me.id);
  for (const m of blog?.modules ?? []) if (FEEDS.includes(m.type)) targets.push({ moduleId: m.id, label: `Your blog · ${m.title}` });
  return targets;
}

const recapped = (me, eventId) => (getMember(me.id)?.recapped ?? []).includes(eventId);

export function recapCard(found, me, redraw) {
  const { event } = found;
  if (me.isGuest || !hasHappened(event)) return null;
  if ((event.endDate ?? event.date) < addDays(todayKey(), -14)) return null;
  const isHost = event.createdBy === me.id;
  if (!isHost && rsvpOf(event, me.id) !== 'going') return null;
  if (!recapTargets(found, me).length) return null;
  if (recapped(me, event.id)) {
    return h('section', { class: 'recap-card recap-card--done' }, icon('check', 16), ' You posted a recap. Thanks for keeping everyone in the loop.');
  }
  return h('section', { class: 'recap-card' },
    h('div', {},
      h('h2', { class: 'recap-card__title' }, 'How was it?'),
      h('p', { class: 'recap-card__text' }, isHost ? 'Share a recap with everyone who came: photos and the next date, in one post.' : 'Share a few photos and what you thought. The next date goes with it.')),
    h('button', { type: 'button', class: 'button button--primary', onClick: () => openRecapComposer(found, me, { onDone: redraw }) }, icon('image', 14), ' Post a recap'));
}

export function openRecapComposer(found, me, { onDone = () => {} } = {}) {
  const { event } = found;
  const targets = recapTargets(found, me);
  const next = whatsNext(found, me.id, 1)[0] ?? null;
  const previousFocus = document.activeElement;
  // The event's photos (yours first), each ticked; added ones join the list.
  const photos = [...(event.photos ?? [])].sort((a, b) => Number(b.by === me.id) - Number(a.by === me.id)).map((p) => ({ ...p, use: true }));
  const added = [];
  const host = getMember(event.createdBy);
  const caption = h('textarea', {
    class: 'input recap__caption', rows: '3', 'aria-label': 'What to say',
  });
  caption.value = event.createdBy === me.id
    ? `Thanks to everyone who came to ${event.title}!${next ? ` Next up: ${next.event.title}, ${formatShortDate(next.date)}.` : ''}`
    : `Had a great time at ${event.title}${host && host.id !== me.id ? `. Thanks, ${host.name.split(' ')[0]}!` : '!'}`;
  let connect = Boolean(next);
  let target = targets[0]?.moduleId;

  const grid = h('div', { class: 'recap__photos' });
  const drawPhotos = () => replaceChildren(grid,
    photos.map((photo, i) => h('label', { class: `recap__photo${photo.use ? ' is-on' : ''}` },
      h('input', { type: 'checkbox', checked: photo.use, 'aria-label': `Use photo ${i + 1}`, onChange: (e) => { photo.use = e.target.checked; drawPhotos(); } }),
      h('img', { src: photo.src, alt: '' }))),
    h('label', { class: 'recap__add' },
      h('input', {
        type: 'file', accept: 'image/*', multiple: true, class: 'visually-hidden',
        onChange: async (e) => {
          const picked = await readImages(e.target.files);
          for (const p of picked) { const item = { ...p, id: `new-${added.length}`, by: me.id, use: true, isNew: true }; added.push(item); photos.push(item); }
          drawPhotos();
        },
      }), icon('plus', 16), h('span', {}, 'Add photos')));
  drawPhotos();

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); previousFocus?.focus?.(); };
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

  function post() {
    const chosen = photos.filter((p) => p.use);
    if (!chosen.length && !caption.value.trim()) { showToast('Add a photo or a few words first.'); return; }
    // New photos also go on the event's page, for everyone who came.
    const fresh = chosen.filter((p) => p.isNew);
    if (fresh.length) addEventPhotos(event.id, fresh, me);
    const module = getModule(target);
    const data = normalizeFeed(structuredClone(module.data ?? {}));
    const media = chosen.map((p, i) => ({ id: `recap-${Date.now()}-${i}`, kind: 'image', src: p.src, width: p.width, height: p.height, caption: '' }));
    const recap = createPost({ authorId: me.id, text: caption.value, media, attachments: connect && next ? [{ kind: 'event', eventId: next.event.id }] : [] });
    recap.recapOf = event.id;
    data.posts = [...(data.posts ?? []), recap];
    updateModuleData(target, data);
    changeState((state) => {
      const member = state.members.find((m) => m.id === me.id);
      member.recapped = [...new Set([...(member.recapped ?? []), event.id])].slice(-200);
    });
    // Everyone who went hears about it.
    const went = Object.entries(event.rsvps ?? {}).filter(([, a]) => a === 'going').map(([id]) => id);
    notify({ recipientIds: [event.createdBy, ...went], actorId: me.id, kind: 'photos', moduleId: target, itemId: recap.id, text: `${me.name} posted a recap of “${event.title}”` });
    close();
    showToast('Recap posted.', { actionLabel: 'See it', onAction: () => { window.location.hash = `#module-${target}`; } });
    onDone();
  }

  const overlay = h('div', { class: 'sub-viewer recap', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Post a recap' },
    h('div', { class: 'sub-viewer__panel recap__panel' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, icon('image', 18), ` Recap: ${event.title}`),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: close }, icon('close', 18))),
      photos.length ? h('p', { class: 'recap__hint' }, 'Tick the photos to use.') : h('p', { class: 'recap__hint' }, 'No photos on the event yet. Add some, or post words only.'),
      grid,
      caption,
      next ? h('label', { class: 'checkbox-row recap__connect' },
        h('input', { type: 'checkbox', checked: connect, onChange: (e) => { connect = e.target.checked; } }),
        ` Connect the next one: ${next.event.title}, ${formatShortDate(next.date)}`) : null,
      h('div', { class: 'form-row recap__actions' },
        targets.length > 1 ? h('label', { class: 'recap__where' }, 'Post to ',
          h('select', { class: 'input input--compact', onChange: (e) => { target = e.target.value; } },
            targets.map((t) => h('option', { value: t.moduleId }, t.label)))) : h('span', { class: 'recap__where' }, `Posts to ${targets[0].label}`),
        h('span', { class: 'photo-editor__spacer' }),
        h('button', { type: 'button', class: 'button button--quiet', onClick: close }, 'Cancel'),
        h('button', { type: 'button', class: 'button button--primary', onClick: post }, 'Post'))));
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  caption.focus();
}
