/**
 * post-menu.js — the "…" button on a post in the Feed (and on posts in
 * blog and group feeds), with the things you don't need every time:
 *
 *   …  ┌──────────────────────────┐
 *      │ 🔖 Save for later         │  ← keep it under Home → Saved (js/state/saved.js)
 *      │ ➤ Send to someone         │  ← send: () => … (the share dialog), when it can be sent
 *      │ ✎ Edit · 📌 Pin · Delete   │  ← actions: [[icon, label, run, danger?], …] (the card's own)
 *      │ 🖼 Make an Instagram card │  ← your own photo posts (js/ui/instagram-card.js)
 *      │ 👁 Why am I seeing this?  │  ← the Feed only: why it's here, and Adjust your feed
 *      │ ⓘ More information       │  ← where it's from, when, who can see it, edited, link
 *      │ ⚑ Report                 │  ← a reason and a note (not on your own posts)
 *      │ 🔇 Mute Jamal / ⊘ Block  │  ← person: { id, name } (blocks.js); onChange() redraws
 *      └──────────────────────────┘
 *
 * Every card keeps its secondary actions here, so the card itself shows only
 * the content and its main buttons (RSVP, Like, Comment).
 *
 * Each opens a small panel over the page (a sheet from the bottom on phones).
 *
 *   postMenu({ why, info, report, title })
 *     why:    'Jamal is your friend · …' or null
 *     info:   [[label, value], …] and info.link for "Copy link"
 *     report: { key, kind, spaceId, moduleId, itemId, authorId } or null (your own post)
 */

import { followAnchor } from '../ui/media-attach.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { isSaved, toggleSaved } from '../state/saved.js';
import { showToast } from '../ui/toast.js';
import { getCurrentUser } from '../state/store.js';
import { REPORT_REASONS, reportContent, hasReported } from '../state/reports.js';
import { setMuted, setBlocked } from '../state/blocks.js';
import { openInstagramCard } from '../ui/instagram-card.js';

/** "Block Jamal?" with what it does, then block. Used by the post menu and blog pages. */
export function confirmBlock(me, person, onDone) {
  const close = openPanel(`Block ${person.name}?`, [
    h('p', {}, 'Neither of you will be able to message the other, you won’t see each other’s posts, and you won’t show up in each other’s member lists. If you’re friends, that ends.'),
    h('p', { class: 'post-menu__muted' }, 'They aren’t told. You can unblock them any time in Account → Privacy.'),
    h('div', { class: 'form-row form-row--end' },
      h('button', { type: 'button', class: 'button button--quiet', onClick: () => close() }, 'Cancel'),
      h('button', { type: 'button', class: 'button button--danger', onClick: () => { setBlocked(me.id, person.id, true); close(); showToast(`Blocked ${person.name}.`); onDone?.(); } }, 'Block')),
  ]);
}

export function postMenu({ why = null, info = [], link = null, report = null, title = 'this post', save = null, person = null, onChange = null, igCard = null, send = null, actions = [] }) {
  const me = getCurrentUser();
  const menu = h('div', { class: 'post-menu__list', role: 'menu', hidden: true });
  const button = h('button', {
    type: 'button', class: 'icon-button icon-button--subtle post-menu__button',
    'aria-label': 'More options for this post', title: 'More options', 'aria-haspopup': 'true', 'aria-expanded': 'false',
    onClick: () => setOpen(menu.hidden),
  }, icon('more', 18));
  const wrapper = h('div', { class: 'post-menu' }, button, menu);

  const closeIfOutside = (event) => { if (!wrapper.contains(event.target)) setOpen(false); };
  let stopFollowing = () => {};
  function setOpen(open) {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) document.addEventListener('pointerdown', closeIfOutside);
    else document.removeEventListener('pointerdown', closeIfOutside);
    // Placed where all of it shows: under the "…", or above it near the bottom (media-attach.js).
    stopFollowing();
    stopFollowing = open ? followAnchor(menu, button, () => setOpen(false), { align: 'end' }) : () => {};
  }

  const item = (iconName, label, onChoose, danger = false) => h('button', {
    type: 'button', role: 'menuitem', class: `post-menu__item${danger ? ' post-menu__item--danger' : ''}`,
    onClick: () => { setOpen(false); onChoose(); },
  }, icon(iconName, 15), ` ${label}`);

  const reported = () => report && hasReported(report.key, me?.id);
  // Save for later (js/state/saved.js): the label says which it'll do.
  const saveItem = () => {
    const saved = isSaved(me.id, save.key);
    return item(saved ? 'bookmarkFilled' : 'bookmark', saved ? 'Saved (remove)' : 'Save for later', () => {
      const now = toggleSaved(me.id, save);
      showToast(now ? 'Saved. Find it under Home → Saved.' : 'Removed from Saved.');
      replaceChildren(menu, ...buildItems());
    });
  };
  const buildItems = () => [
    save && me && !me.isGuest ? saveItem() : null,
    send && me && !me.isGuest ? item('send', 'Send to someone', send) : null,
    igCard ? item('image', 'Make an Instagram card', () => openInstagramCard(igCard)) : null,
    // The card's own actions (Edit, Pin, Delete), for whoever may use them.
    ...actions.filter(Boolean).map(([iconName, label, run, danger]) => item(iconName, label, run, danger)),
    why ? item('eye', 'Why am I seeing this?', () => openPanel('Why you’re seeing this', [
      h('p', {}, why),
      h('p', { class: 'post-menu__muted' }, 'Your Feed is your friends, your groups, and what you follow, in the order your feed settings choose.'),
      h('a', { class: 'button button--small', href: '#account-feed' }, 'Adjust your feed'),
    ])) : null,
    item('info', 'More information', () => openPanel('About this post', [
      h('dl', { class: 'post-menu__facts' }, info.filter(([, value]) => value).flatMap(([label, value]) => [h('dt', {}, label), h('dd', {}, value)])),
      link ? h('button', {
        type: 'button', class: 'button button--small',
        onClick: async () => { try { await navigator.clipboard.writeText(link); showToast('Link copied.'); } catch { showToast(link); } },
      }, icon('link', 14), ' Copy link') : null,
    ])),
    report && me && !me.isGuest ? reportItem() : null,
    person && me && !me.isGuest && person.id !== me.id ? item('bell', `Mute ${person.name.split(' ')[0]}`, () => {
      setMuted(me.id, person.id, true);
      showToast(`Muted ${person.name}. Their posts won’t show in your Feed. Undo in Account → Privacy.`);
      onChange?.();
    }) : null,
    person && me && !me.isGuest && person.id !== me.id ? item('block', `Block ${person.name.split(' ')[0]}`, () => confirmBlock(me, person, onChange)) : null];
  replaceChildren(menu, ...buildItems());

  function reportItem() {
    const label = h('span', {}, reported() ? 'Reported' : 'Report');
    const button = h('button', {
      type: 'button', role: 'menuitem', class: 'post-menu__item',
      onClick: () => { setOpen(false); if (reported()) showToast('You reported this already. Thanks.'); else openReport(() => { label.textContent = 'Reported'; }); },
    }, icon('flag', 15), ' ', label);
    return button;
  }

  function openReport(onDone) {
    let reason = null;
    const note = h('textarea', { class: 'input', rows: '2', placeholder: 'Anything else that would help? (optional)', 'aria-label': 'More about the report' });
    const send = h('button', { type: 'submit', class: 'button button--primary', disabled: true }, 'Send report');
    const form = h('form', {
      class: 'post-menu__report',
      onSubmit: (event) => {
        event.preventDefault();
        if (!reason) return;
        const who = reportContent({ ...report, memberId: me.id, reason, note: note.value });
        onDone?.();
        close();
        showToast(`Thanks for telling us. ${who} will take a look. The person who posted it won’t know it was you.`);
      },
    },
    h('p', { class: 'post-menu__muted' }, `What’s wrong with ${title}?`),
    h('div', { class: 'settings-choices', role: 'radiogroup', 'aria-label': 'Reason' }, REPORT_REASONS.map((r) => h('label', { class: 'settings-choice post-menu__reason' },
      h('input', { type: 'radio', name: 'report-reason', value: r.id, onChange: () => { reason = r.id; send.disabled = false; } }),
      h('span', {}, r.label)))),
    note,
    h('div', { class: 'form-row form-row--end' }, h('button', { type: 'button', class: 'button button--quiet', onClick: () => close() }, 'Cancel'), send));
    const close = openPanel('Report this post', form);
  }

  return wrapper;
}

/** A small panel over the page; returns its close function. */
function openPanel(heading, content) {
  const previousFocus = document.activeElement;
  const overlay = h('div', { class: 'sub-viewer post-menu__sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': heading },
    h('div', { class: 'sub-viewer__panel post-menu__panel' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, heading),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => close() }, icon('close', 18))),
      h('div', { class: 'post-menu__body' }, content)));
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    if (previousFocus?.isConnected) previousFocus.focus?.();
  }
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  overlay.querySelector('button, a, input')?.focus();
  return close;
}

/**
 * The "…" next to someone's name on their blog: Mute / Unmute and
 * Block / Unblock (blocks.js). onChange() redraws the page.
 */
export function personMenu(person, onChange) {
  const me = getCurrentUser();
  if (!me || me.isGuest || person.id === me.id) return null;
  const menu = h('div', { class: 'post-menu__list', role: 'menu', hidden: true });
  const button = h('button', {
    type: 'button', class: 'button post-menu__button', 'aria-label': `More options for ${person.name}`, title: 'More', 'aria-haspopup': 'true', 'aria-expanded': 'false',
    onClick: () => setOpen(menu.hidden),
  }, icon('more', 16));
  const wrapper = h('div', { class: 'post-menu' }, button, menu);
  const closeIfOutside = (event) => { if (!wrapper.contains(event.target)) setOpen(false); };
  let stopFollowing = () => {};
  function setOpen(open) {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) { draw(); document.addEventListener('pointerdown', closeIfOutside); } else document.removeEventListener('pointerdown', closeIfOutside);
    stopFollowing();
    stopFollowing = open ? followAnchor(menu, button, () => setOpen(false), { align: 'end' }) : () => {};
  }
  const first = person.name.split(' ')[0];
  const entry = (iconName, label, run) => h('button', { type: 'button', role: 'menuitem', class: 'post-menu__item', onClick: () => { setOpen(false); run(); } }, icon(iconName, 15), ` ${label}`);
  function draw() {
    const muted = (getCurrentUser().muted ?? []).includes(person.id);
    const blocked = (getCurrentUser().blocked ?? []).includes(person.id);
    replaceChildren(menu,
      blocked ? null : entry('bell', muted ? `Unmute ${first}` : `Mute ${first}`, () => { setMuted(me.id, person.id, !muted); showToast(muted ? `Unmuted ${person.name}.` : `Muted ${person.name}. Their posts won’t show in your Feed.`); onChange?.(); }),
      blocked
        ? entry('block', `Unblock ${first}`, () => { setBlocked(me.id, person.id, false); showToast(`Unblocked ${person.name}.`); onChange?.(); })
        : entry('block', `Block ${first}`, () => confirmBlock(me, person, onChange)));
  }
  return wrapper;
}
