// @ts-check
/**
 * member-import.js — bring a member list in from wherever a group keeps it
 * now (a spreadsheet, a mailing list, a group chat export).
 *
 *   ── Bring in a member list ──────────────────────────────
 *   [ paste emails or usernames, or choose a CSV file ]      [Check the list]
 *
 *   On 3den already (3)        Iris Novak, Marcus Bell, …    [Invite all 3]
 *   Not on 3den yet (5)        ana@example.org, …            [Copy an invitation] [Email them]
 *
 * People with accounts are invited (they accept or decline, like any
 * invitation). The rest get the group's invite link, which you send
 * yourself: 3den doesn't email people who never gave it their address,
 * and the list isn't saved anywhere.
 *
 *   renderMemberImport(space, me, redraw)
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { findAccountByLogin } from '../state/accounts.js';
import { inviteToGroup, inviteLinkOf, resetInviteLink } from '../state/groups.js';
import { getSpace } from '../state/store.js';

const EMAIL = /[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+/g;

/** Emails and @usernames from anything pasted or uploaded. */
export function readPeople(text) {
  const emails = String(text).match(EMAIL) ?? [];
  const usernames = [...String(text).replace(EMAIL, ' ').matchAll(/@([a-z0-9._-]{2,30})/gi)].map((m) => m[1]);
  return [...new Set([...emails, ...usernames].map((p) => p.toLowerCase()))];
}

export function renderMemberImport(space, me, redraw) {
  const results = h('div', { class: 'member-import__results', 'aria-live': 'polite' });
  const input = h('textarea', {
    class: 'input member-import__input', rows: '3', 'aria-label': 'Emails or usernames',
    placeholder: 'Paste emails or @usernames, in any layout: one per line, a spreadsheet column, a whole CSV…',
  });
  const fileInput = h('input', {
    type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain', class: 'visually-hidden', 'aria-label': 'A member list file',
    onChange: (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { input.value = String(reader.result); check(); };
      reader.readAsText(file);
      event.target.value = '';
    },
  });

  function check() {
    const people = readPeople(input.value);
    if (!people.length) { replaceChildren(results, h('p', { class: 'settings-field__hint' }, 'No email addresses or @usernames found in that.')); return; }
    const live = getSpace(space.id);
    const found = [];
    const unknown = [];
    for (const person of people) {
      const account = findAccountByLogin(person);
      if (account) { if (!found.includes(account)) found.push(account); } else if (person.includes('@')) unknown.push(person);
    }
    const already = found.filter((a) => live.memberIds.includes(a.id));
    const invited = found.filter((a) => (live.invites ?? []).some((i) => i.memberId === a.id));
    const toInvite = found.filter((a) => !already.includes(a) && !invited.includes(a));
    const link = inviteLinkOf(live);
    const message = `You’re invited to join ${live.name} on 3den, where we keep our calendar, files, and plans: ${link}`;

    replaceChildren(results,
      toInvite.length ? h('div', { class: 'member-import__group' },
        h('strong', {}, `On 3den already (${toInvite.length})`),
        h('p', { class: 'member-import__names' }, toInvite.map((a) => a.name).join(', ')),
        h('button', {
          type: 'button', class: 'button button--primary button--small',
          onClick: () => {
            for (const account of toInvite) inviteToGroup(space.id, account.id, me.id);
            showToast(`Invited ${toInvite.length} ${toInvite.length === 1 ? 'person' : 'people'}. They’ll see it on their Groups page.`);
            redraw();
          },
        }, `Invite ${toInvite.length === 1 ? toInvite[0].name.split(' ')[0] : `all ${toInvite.length}`}`)) : null,
      already.length || invited.length ? h('p', { class: 'settings-field__hint' },
        [already.length ? `${already.length} already ${already.length === 1 ? 'a member' : 'members'}` : null, invited.length ? `${invited.length} already invited` : null].filter(Boolean).join(', '), '.') : null,
      unknown.length ? h('div', { class: 'member-import__group' },
        h('strong', {}, `Not on 3den yet (${unknown.length})`),
        h('p', { class: 'member-import__names' }, unknown.slice(0, 8).join(', '), unknown.length > 8 ? `, and ${unknown.length - 8} more` : ''),
        link ? h('div', { class: 'form-row' },
          h('button', { type: 'button', class: 'button button--small', onClick: () => navigator.clipboard?.writeText(message).then(() => showToast('Invitation copied. Paste it wherever you talk to them.'), () => showToast('Couldn’t copy.')) }, icon('link', 14), ' Copy an invitation'),
          h('a', { class: 'button button--small', href: `mailto:?bcc=${encodeURIComponent(unknown.join(','))}&subject=${encodeURIComponent(`Join ${live.name} on 3den`)}&body=${encodeURIComponent(message)}` }, icon('mail', 14), ' Email them yourself'))
          : h('button', { type: 'button', class: 'button button--small', onClick: () => { resetInviteLink(space.id); check(); } }, icon('link', 14), ' Create an invite link to send them'),
        h('p', { class: 'settings-field__hint' }, 'They go in the “bcc” line, so nobody sees anyone else’s address. 3den doesn’t keep this list.')) : null);
  }

  return h('section', { class: 'settings-section member-import' },
    h('h2', { class: 'settings-section__title' }, 'Bring in a member list'),
    h('p', { class: 'settings-section__description' }, 'Moving a group here? Paste your list or choose a file. People already on 3den are invited; you send everyone else the invite link.'),
    input,
    h('div', { class: 'form-row' },
      h('button', { type: 'button', class: 'button button--small', onClick: check }, 'Check the list'),
      h('button', { type: 'button', class: 'button button--small button--quiet', onClick: () => fileInput.click() }, icon('upload', 14), ' Choose a file'),
      fileInput),
    results);
}
