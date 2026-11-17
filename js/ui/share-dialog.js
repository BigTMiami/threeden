/**
 * share-dialog.js — "Send" a post to people, as a message.
 *
 *   Send “Why I joined the tenants union”            ×
 *   [ Find someone ]
 *   ☐ (JB) Jamal Brooks
 *   ☑ (NL) Nora Larsen
 *   [ Add a note (optional) ]
 *                                           [Send to 1]
 *
 * Each person gets the post in your direct conversation with them, as a
 * card they can click to open it. Who you can send to is decided by the
 * caller: anyone who can see the post (for a group's thread, only people
 * in that group).
 *
 *   openShareDialog({ title, attachment: { kind: 'post', … }, candidateIds, onSent })
 *   (your own photo posts also get "Instagram card": instagram-card.js)
 *   (onSent gets the ids it went to, e.g. to invite them to an event)
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { avatar } from './avatar.js';
import { showToast } from './toast.js';
import { getMember, getCurrentUser } from '../state/store.js';
import { openDirectConversation, sendMessage } from '../state/messages.js';
import { openInstagramCard } from './instagram-card.js';

export function openShareDialog({ title, attachment, candidateIds, onSent = null }) {
  const me = getCurrentUser();
  const people = [...new Set(candidateIds)].filter((id) => id !== me.id).map(getMember).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  const chosen = new Set();
  const previousFocus = document.activeElement;

  const search = h('input', { type: 'search', class: 'input input--compact', placeholder: 'Find someone', 'aria-label': 'Find someone to send it to' });
  const list = h('ul', { class: 'share-dialog__people' });
  const note = h('input', { type: 'text', class: 'input', placeholder: 'Add a note (optional)', 'aria-label': 'Note' });
  const sendButton = h('button', { type: 'submit', class: 'button button--primary', disabled: true }, 'Send');

  function drawList() {
    const q = search.value.trim().toLowerCase();
    const shown = people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.username.includes(q));
    replaceChildren(list, shown.length ? shown.map((person) => h('li', {},
      h('label', { class: 'share-dialog__person' },
        h('input', {
          type: 'checkbox',
          checked: chosen.has(person.id),
          onChange: (event) => {
            if (event.target.checked) chosen.add(person.id); else chosen.delete(person.id);
            sendButton.disabled = chosen.size === 0;
            sendButton.textContent = chosen.size ? `Send to ${chosen.size}` : 'Send';
          },
        }),
        avatar(person, 26),
        h('span', {}, person.name, h('span', { class: 'share-dialog__username' }, ` @${person.username}`)))))
      : h('li', { class: 'module-empty' }, people.length ? 'Nobody matches.' : 'There’s nobody you can send this to.'));
  }
  search.addEventListener('input', drawList);
  drawList();

  const overlay = h('div', { class: 'sub-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Send ${title}` },
    h('form', {
      class: 'sub-viewer__panel share-dialog',
      onSubmit: (event) => {
        event.preventDefault();
        if (chosen.size === 0) return;
        const { fullText, ...sent } = attachment; // fullText is only for the Instagram card
        for (const id of chosen) sendMessage(openDirectConversation(me.id, id).id, me.id, note.value, sent);
        onSent?.([...chosen]);
        const names = [...chosen].map((id) => getMember(id)?.name.split(' ')[0]).filter(Boolean);
        showToast(`Sent to ${names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ')}.`);
        close();
      },
    },
      h('div', { class: 'sub-viewer__top' },
        h('h2', { class: 'sub-viewer__title' }, icon('send', 18), ` Send “${title}”`),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => close() }, icon('close', 18))),
      search, list, note,
      h('div', { class: 'form-row form-row--end' },
        // Your own photo post: make a picture to post on Instagram (instagram-card.js).
        attachment?.image && attachment.authorId === me.id ? h('button', {
          type: 'button', class: 'button button--quiet share-dialog__ig',
          onClick: () => { close(); openInstagramCard({ src: attachment.image, caption: attachment.fullText ?? attachment.excerpt ?? '', author: me }); },
        }, icon('image', 14), ' Instagram card') : null,
        sendButton)));

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    previousFocus?.focus?.();
  }
  function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); } }
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  search.focus();
}
