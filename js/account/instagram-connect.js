/**
 * instagram-connect.js — connecting an Instagram account (js/state/instagram.js).
 *
 *   openInstagramConnect({ onDone })   → a dialog in three steps:
 *     1 · Before you connect   what we copy, what we never see, the professional-account note
 *     2 · Your posts           which blog feed they go into, and "keep it in sync"
 *     3 · Your people          upload Instagram's data download (or try a sample),
 *                              then "Show them to me now" or "Keep them in my suggestions"
 *   renderInstagramSection(user, redraw)   → the Account settings section
 *
 * The "Continue with Instagram" step is simulated: a real build sends people
 * to Instagram's own sign-in (Business Login for Instagram) and gets a token
 * back on the server. 3den never asks for an Instagram password.
 */

import { h, replaceChildren, makeId } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { changeState, getCurrentUser, getBlogOf } from '../state/store.js';
import { updateProfile } from '../state/accounts.js';
import { timeAgo } from '../utils/dates.js';
import {
  connectInstagram, syncInstagram, disconnectInstagram, setInstagramOptions, importPeople, sampleDataDownload,
  getInstagram, cleanHandle, isValidHandle, instagramSuggestions, instagramWaiting, SYNC_EVERY_MS,
} from '../state/instagram.js';
import { blogHref } from '../router.js';

const FEED_TYPES = new Set(['generalfeed']);

/** Photo and general feeds on your blog, to import into. */
function feedChoices(me) {
  const blog = getBlogOf(me.id);
  return blog ? blog.modules.filter((m) => FEED_TYPES.has(m.type)) : [];
}

/** A new photo feed on your blog, for Instagram posts. */
function addInstagramFeed(me) {
  const blog = getBlogOf(me.id);
  if (!blog) return null;
  const module = { id: makeId('mod'), type: 'generalfeed', title: 'From Instagram', span: 8, rows: 16, data: { posts: [], events: [] } };
  changeState((state) => { state.spaces.find((s) => s.id === blog.id).modules.push(module); }, 'layout');
  return module.id;
}

function readFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });
}

export function openInstagramConnect({ onDone = () => {} } = {}) {
  const me = getCurrentUser();
  if (!me) return;
  const previousFocus = document.activeElement;
  let step = getInstagram(me.id) ? 3 : 1;
  const choices = feedChoices(me);
  const draft = { handle: '', feed: choices[0]?.id ?? 'new', autoSync: true };

  const body = h('div', { class: 'ig-connect__body' });
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    previousFocus?.focus?.();
    onDone();
  };
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }

  const steps = () => h('ol', { class: 'ig-connect__steps', 'aria-label': 'Steps' },
    ['Before you connect', 'Your posts', 'Your people'].map((label, i) => h('li', { class: step === i + 1 ? 'is-current' : step > i + 1 ? 'is-done' : '' }, label)));

  function draw() {
    if (step === 1) {
      replaceChildren(body, steps(),
        h('p', {}, 'Bring your Instagram posts to your 3den blog, and find people you know there.'),
        h('ul', { class: 'ig-connect__list' },
          h('li', {}, icon('check', 14), ' We copy your posts (photos, videos, and captions) into a feed on your blog.'),
          h('li', {}, icon('check', 14), ' New posts are copied over every few minutes, if you want.'),
          h('li', {}, icon('lock', 14), ' We never see your Instagram password, messages, or anyone else’s posts.'),
          h('li', {}, icon('lock', 14), ' Disconnect any time, and choose whether the copies stay.')),
        h('p', { class: 'ig-connect__note' }, 'Instagram only lets apps read professional accounts. Switching to a free Creator account takes a minute in Instagram’s settings, and doesn’t change who can see your posts.'),
        h('label', { class: 'form-field' }, h('span', { class: 'form-label' }, 'Your Instagram username'),
          h('input', { class: 'text-input', type: 'text', placeholder: 'yourname', value: draft.handle, autocomplete: 'off', autocapitalize: 'none', 'aria-label': 'Your Instagram username', onInput: (event) => { draft.handle = event.target.value; } })),
        h('div', { class: 'form-row ig-connect__actions' },
          h('button', { type: 'button', class: 'button button--quiet', onClick: close }, 'Not now'),
          h('button', {
            type: 'button', class: 'button button--primary',
            onClick: () => {
              const handle = cleanHandle(draft.handle);
              if (!isValidHandle(handle)) { showToast('Type your Instagram username (letters, numbers, dots, and underscores).'); return; }
              draft.handle = handle;
              step = 2;
              draw();
            },
          }, 'Continue with Instagram')));
    } else if (step === 2) {
      replaceChildren(body, steps(),
        h('p', { class: 'ig-connect__ok' }, icon('check', 14), ` Instagram said yes for @${draft.handle} (simulated sign-in).`),
        h('fieldset', { class: 'ig-connect__fieldset' },
          h('legend', {}, 'Put my posts in'),
          [...choices.map((m) => [m.id, m.title]), ['new', 'A new “From Instagram” feed']].map(([id, label]) => h('label', { class: 'radio-row' },
            h('input', { type: 'radio', name: 'ig-feed', value: id, checked: draft.feed === id, onChange: () => { draft.feed = id; } }), ` ${label}`))),
        h('label', { class: 'checkbox-row' },
          h('input', { type: 'checkbox', checked: draft.autoSync, onChange: (event) => { draft.autoSync = event.target.checked; } }),
          ` Keep it in sync: copy new Instagram posts here (checked every ${Math.round(SYNC_EVERY_MS / 60000)} minutes)`),
        h('div', { class: 'form-row ig-connect__actions' },
          h('button', { type: 'button', class: 'button button--quiet', onClick: () => { step = 1; draw(); } }, 'Back'),
          h('button', {
            type: 'button', class: 'button button--primary',
            onClick: () => {
              const feedModuleId = draft.feed === 'new' ? addInstagramFeed(me) : draft.feed;
              if (!feedModuleId) { showToast('Turn on your blog first, then connect.'); return; }
              const count = connectInstagram(me.id, { handle: draft.handle, feedModuleId, autoSync: draft.autoSync });
              showToast(`Copied ${count} ${count === 1 ? 'post' : 'posts'} from Instagram.`);
              step = 3;
              draw();
            },
          }, 'Copy my posts')));
    } else {
      drawPeople();
    }
  }

  function drawPeople(found = null) {
    const fileInput = h('input', {
      type: 'file', accept: '.json,application/json', multiple: true, class: 'visually-hidden', 'aria-label': 'Instagram data files',
      onChange: async (event) => {
        let total = 0;
        for (const file of event.target.files) total += importPeople(me.id, await readFile(file)) ?? 0;
        if (!total) { showToast('Those files didn’t have followers or following in them. Look for followers_1.json and following.json.'); return; }
        drawPeople(total);
      },
    });
    const suggestions = found != null ? instagramSuggestions(me.id) : [];
    replaceChildren(body, steps(),
      found == null ? [
        h('p', {}, 'Want to find people you know from Instagram? Instagram doesn’t share follower lists with apps, but you can download your own and bring it here.'),
        h('ol', { class: 'ig-connect__how' },
          h('li', {}, 'In Instagram, open Accounts Center, then “Your information and permissions”, then “Download your information”.'),
          h('li', {}, 'Choose “Followers and following”, format JSON. Instagram emails you a link.'),
          h('li', {}, 'Unzip it and pick followers_1.json and following.json here.')),
        h('p', { class: 'ig-connect__note' }, 'We only keep the usernames, only you see them, and they’re only used to suggest friends. People appear only if they added the same Instagram username to their 3den profile.'),
        h('div', { class: 'form-row ig-connect__actions' },
          h('button', { type: 'button', class: 'button button--quiet', onClick: close }, 'Skip for now'),
          h('button', { type: 'button', class: 'button', onClick: () => drawPeople(importPeople(me.id, sampleDataDownload())) }, 'Try a sample'),
          h('button', { type: 'button', class: 'button button--primary', onClick: () => fileInput.click() }, icon('upload', 14), ' Choose files'),
          fileInput),
      ] : [
        h('p', { class: 'ig-connect__ok' }, icon('check', 14), ` Read ${found} ${found === 1 ? 'person' : 'people'}. ${suggestions.length} ${suggestions.length === 1 ? 'is' : 'are'} on 3den.`),
        suggestions.length ? h('ul', { class: 'friend-list ig-connect__people' }, suggestions.slice(0, 6).map(({ member, handle }) => h('li', { class: 'friend-row' },
          h('div', { class: 'friend-row__text' }, h('span', { class: 'friend-row__name' }, member.name), h('span', { class: 'friend-row__meta' }, `@${handle} on Instagram`))))) : null,
        instagramWaiting(me.id) ? h('p', { class: 'ig-connect__note' }, `The other ${instagramWaiting(me.id)} aren’t here yet. If they join and add their Instagram, they’ll show up in your suggestions.`) : null,
        h('div', { class: 'form-row ig-connect__actions' },
          h('button', { type: 'button', class: 'button', onClick: () => { close(); showToast('They’ll wait in Friends, under “From your Instagram”.'); } }, 'Keep them in my suggestions'),
          suggestions.length ? h('a', { class: 'button button--primary', href: '#feed-friends', onClick: close }, 'Show them to me now') : h('button', { type: 'button', class: 'button button--primary', onClick: close }, 'Done')),
      ]);
  }

  const overlay = h('div', { class: 'sub-viewer ig-connect', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Connect Instagram' },
    h('div', { class: 'sub-viewer__panel ig-connect__panel' },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, icon('image', 18), ' Connect Instagram'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: close }, icon('close', 18))),
      body));
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  draw();
  overlay.querySelector('input, button.button--primary')?.focus();
}

/** Account settings → Instagram. */
export function renderInstagramSection(user, redraw) {
  const link = getInstagram(user.id);
  const findable = h('label', { class: 'checkbox-row' },
    h('input', { type: 'checkbox', checked: Boolean(user.instagramHandle) && user.instagramFindable !== false, disabled: !user.instagramHandle,
      onChange: (event) => { updateProfile(user.id, { instagramFindable: event.target.checked }); } }),
    user.instagramHandle ? ` Let people who know me as @${user.instagramHandle} on Instagram find me here` : ' Let people find me by my Instagram username (connect first, or add it to your profile)');
  if (!link) {
    return h('section', { class: 'settings-section', id: 'instagram-settings' },
      h('h2', { class: 'settings-section__title' }, 'Instagram'),
      h('p', { class: 'settings-section__description' }, 'Copy your Instagram posts to your blog, keep them in sync, and find people you know.'),
      h('button', { type: 'button', class: 'button button--primary', onClick: () => openInstagramConnect({ onDone: redraw }) }, 'Connect Instagram'),
      findable);
  }
  const posts = Object.keys(link.imported).length;
  const suggestions = instagramSuggestions(user.id).length;
  return h('section', { class: 'settings-section', id: 'instagram-settings' },
    h('h2', { class: 'settings-section__title' }, 'Instagram'),
    h('p', { class: 'settings-section__description' },
      `Connected as @${link.handle}. ${posts} ${posts === 1 ? 'post' : 'posts'} copied`,
      link.lastSyncAt ? `, last checked ${timeAgo(link.lastSyncAt)}.` : '.'),
    h('label', { class: 'checkbox-row' },
      h('input', { type: 'checkbox', checked: link.autoSync, onChange: (event) => { setInstagramOptions(user.id, { autoSync: event.target.checked }); redraw(); } }),
      ' Keep it in sync (copy new posts automatically)'),
    findable,
    h('div', { class: 'form-row' },
      h('button', { type: 'button', class: 'button', onClick: () => { const n = syncInstagram(user.id); showToast(n ? `Copied ${n} new ${n === 1 ? 'post' : 'posts'}.` : 'You’re up to date.'); redraw(); } }, 'Sync now'),
      h('button', { type: 'button', class: 'button', onClick: () => openInstagramConnect({ onDone: redraw }) }, link.peopleImportedAt ? 'Update people' : 'Find people'),
      suggestions ? h('a', { class: 'link-button', href: '#feed-friends' }, `${suggestions} from Instagram on 3den`) : null,
      h('a', { class: 'link-button', href: blogHref(user) }, 'See your blog')),
    h('details', { class: 'ig-connect__disconnect' },
      h('summary', {}, 'Disconnect'),
      h('p', {}, 'Stop copying posts. What should happen to the ones already copied?'),
      h('div', { class: 'form-row' },
        h('button', { type: 'button', class: 'button', onClick: () => { disconnectInstagram(user.id); showToast('Disconnected. Your copied posts stay on your blog.'); redraw(); } }, 'Keep them'),
        h('button', { type: 'button', class: 'button button--danger', onClick: () => { disconnectInstagram(user.id, { removePosts: true }); showToast('Disconnected and removed the copied posts.'); redraw(); } }, 'Remove them'))));
}
