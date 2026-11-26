// @ts-check
/**
 * document-sharing.js — the "Sharing" tile on an open vault file or folder
 * (a note, an article, a module file like a spreadsheet, a photo or video,
 * any upload, or a folder), and the panel it opens. Each of its three rows
 * opens to change it (Nov 17):
 *
 *   [👥 4 members can edit · Shared in 1 place · Published ▾]
 *   ┌ Sharing and publishing ─────────────────────────────── × ┐
 *   │ ▸ Who can open it    4 members can edit                   │
 *   │ ▾ Shared in          1 page                               │
 *   │     ▣ On the page Juniper Tenants Union · Home [Can edit ▾]│
 *   │       Take it off the page                                │
 *   │ ▸ Published          In 2 places                          │
 *   │     📣 Post in Leo’s blog · Posts · Nov 14   [Can view ▾]  │
 *   │     📰 Draft in The Bulletin               Open the draft  │
 *   │     [Publish]   (or [Post] for photos, videos, and files)  │
 *   └───────────────────────────────────────────────────────────┘
 *
 * Who can open it follows the vault: your homepage's vault is yours alone;
 * a group's vault is its members'. In a group, the file's maker (and
 * admins, who can moderate) set what the other members can do with it:
 * edit (the default), comment, or only view (item.memberAccess).
 *
 * Shared in: the pages showing it (File from vault). Published: the posts
 * it's in and the article it became. Each share has its own "Can view /
 * comment / edit", changed here by whoever shared it. Publish (or Post)
 * opens publish-dialog.js: where to, then the post.
 *
 *   documentShareButton({ vaultModuleId, itemId })  → element
 *   documentAccess(vaultModuleId, item, me)  → 'edit' | 'comment' | 'view' | 'none'
 *   findShares(vaultModuleId, itemId)        → [{ kind: 'post' | 'page', … }]
 *   publicationOf(item)                      → { status, article, module } | null
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { accessPicker, accessLabel, documentAccess } from './file-access.js';
import { createPeopleSearch } from './people-search.js';
import { avatar } from './avatar.js';
import { messageablePeople, recipientContext } from '../messages/recipients.js';
import { notify } from '../state/notifications.js';

export { documentAccess };
import { getState, getSpace, getModule, getSpaceOfModule, getCurrentUser, getMember, updateModuleData, changeState, restoreModule } from '../state/store.js';
import { openPublishDialog, publishVerb } from './publish-dialog.js';
import { showToast } from './toast.js';
import { openModal } from './modal.js';
import { can } from '../state/permissions.js';
import { requestModuleFocus } from '../editor/module-context.js';
import { openModulePage } from '../router.js';
import { normalizeArticle, viewsLabel, authorsOf, isAuthorOf } from '../modules/articles/articles-data.js';

const FEEDS = new Set(['textfeed', 'generalfeed', 'carousel']);
/** Which row of the panel is open: 'who' | 'shared' | 'published' | null (kept while it redraws; closed each time it opens). */
let openRow = null;
const MEMBER_ACCESS = [
  { id: 'edit', label: 'edit' },
  { id: 'comment', label: 'comment' },
  { id: 'view', label: 'only view' },
];

/** May `me` change who can do what (the document's maker, or a moderator)? */
function canSetAccess(space, item, me) {
  if (!space || !me) return false;
  if (space.kind !== 'group') return space.memberIds[0] === me.id;
  return item.createdBy === me.id || can(space, me.id, 'moderate');
}

/** Every post and page this document is shared in. */
export function findShares(vaultModuleId, itemId) {
  const shares = [];
  const same = (from) => from?.vaultModuleId === vaultModuleId && from?.itemId === itemId;
  for (const space of getState().spaces) {
    for (const module of space.modules ?? []) {
      if (FEEDS.has(module.type)) {
        for (const post of module.data?.posts ?? []) {
          for (const attachment of post.attachments ?? []) {
            if (attachment.kind === 'file' && same(attachment.item?.from)) shares.push({ kind: 'post', space, module, post, attachment, access: attachment.access ?? 'view' });
          }
        }
      } else if (module.type === 'vaultfile' && same({ vaultModuleId: module.data?.vaultModuleId, itemId: module.data?.itemId })) {
        shares.push({ kind: 'page', space, module, access: module.data.access ?? 'view' });
      }
    }
  }
  return shares;
}

/** The article this document became, if any: { status, article, module }. */
export function publicationOf(item) {
  const link = item?.articleDraft;
  const module = link ? getModule(link.moduleId) : null;
  const raw = module?.data?.articles?.find((a) => a.id === link.articleId);
  return raw ? { status: normalizeArticle(raw).status, article: normalizeArticle(raw), module } : null;
}

/** Change what people can do with one share (a post's attachment, or a page's vault file). */
function setShareAccess(share, access) {
  if (share.kind === 'page') { updateModuleData(share.module.id, { ...share.module.data, access }); return; }
  const data = structuredClone(share.module.data);
  const post = data.posts.find((p) => p.id === share.post.id);
  const attachment = post?.attachments.find((a) => a.kind === 'file' && a.item?.from?.itemId === share.attachment.item.from.itemId);
  if (attachment) attachment.access = access;
  updateModuleData(share.module.id, data);
}

const shortDate = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Take a File from vault module off its page (any page, not just the one open); Undo puts it back. */
function takeOffPage(share) {
  let removed = null;
  changeState((state) => {
    const space = state.spaces.find((x) => x.id === share.space.id);
    const index = space?.modules.findIndex((m) => m.id === share.module.id) ?? -1;
    if (index === -1) return;
    const [module] = space.modules.splice(index, 1);
    removed = { module, index, spaceId: space.id };
  }, 'layout');
  return removed;
}

/** The button, and the panel under it. */
export function documentShareButton({ vaultModuleId, itemId }) {
  const me = getCurrentUser();
  const space = getSpaceOfModule(vaultModuleId);
  const itemNow = () => getModule(vaultModuleId)?.data?.items?.find((i) => i.id === itemId);
  const panel = h('div', { class: 'doc-share__panel', role: 'dialog', 'aria-label': 'Sharing and publishing', hidden: true });
  const label = h('span', { class: 'doc-share__label' });
  const button = h('button', {
    type: 'button', class: 'doc-share__button', 'aria-expanded': 'false', 'aria-haspopup': 'dialog',
    onClick: () => (panel.hidden ? open() : close()),
  }, icon(space?.kind === 'group' ? 'people' : 'lock', 13), label, icon('chevronDown', 12));
  const root = h('div', { class: 'doc-share' }, button, panel);

  const memberAccessLabel = (item) => MEMBER_ACCESS.find((a) => a.id === (item.memberAccess ?? 'edit'))?.label ?? 'edit';
  const whoSummary = (item) => (space?.kind === 'group' ? `${space.memberIds.length} members can ${memberAccessLabel(item)}` : 'Only you');
  const pagesOf = () => findShares(vaultModuleId, itemId).filter((s) => s.kind === 'page');
  const postsOf = () => findShares(vaultModuleId, itemId).filter((s) => s.kind === 'post');
  const publishedSummary = (item) => {
    const pub = publicationOf(item);
    const posts = postsOf().length + (pub ? 1 : 0);
    if (pub?.status === 'published' || posts) return posts ? `In ${posts} ${posts === 1 ? 'place' : 'places'}` : 'Published';
    if (pub) return { draft: 'Article draft', scheduled: 'Scheduled' }[pub.status] ?? 'Not published';
    return 'Not published';
  };

  /** "Only you", "4 members can edit", plus where it's shared and published. */
  function summary() {
    const item = itemNow();
    if (!item) return '';
    const pages = pagesOf().length;
    const published = publishedSummary(item);
    return [whoSummary(item), pages ? `Shared in ${pages} ${pages === 1 ? 'place' : 'places'}` : null, published === 'Not published' ? null : published].filter(Boolean).join(' · ');
  }

  function drawLabel() {
    label.textContent = ` ${summary()} `;
    const pub = publicationOf(itemNow());
    button.classList.toggle('is-published', pub?.status === 'published' || postsOf().length > 0);
  }

  /** One row: a button with its title and summary that opens its editor under it. */
  function row(id, title, summaryText, editor) {
    const isOpen = openRow === id;
    return h('section', { class: `doc-share__section${isOpen ? ' is-open' : ''}` },
      h('button', {
        type: 'button', class: 'doc-share__row-toggle', 'aria-expanded': String(isOpen),
        onClick: () => { openRow = isOpen ? null : id; drawPanel(); },
      }, icon(isOpen ? 'chevronDown' : 'chevronRight', 13), h('span', { class: 'doc-share__heading' }, title), h('span', { class: 'doc-share__row-summary' }, summaryText)),
      isOpen ? h('div', { class: 'doc-share__editor' }, editor()) : null);
  }

  function whoEditor(item) {
    if (space?.kind !== 'group') {
      return [
        h('p', { class: 'doc-share__line' }, icon('lock', 12), ` In ${getModule(vaultModuleId)?.title ?? 'your vault'} on your homepage: only you${(item.sharedWith ?? []).length ? ' and the people below' : ''} can open it.`),
        sharingEditor(item),
      ];
    }
    const mayChange = canSetAccess(space, item, me);
    const maker = getMember(item.createdBy);
    return [
      h('p', { class: 'doc-share__line' }, `In ${getModule(vaultModuleId)?.title ?? 'the vault'}, in ${space.name}: its ${space.memberIds.length} members can open it. Members can:`),
      h('div', { class: 'doc-share__choices', role: 'radiogroup', 'aria-label': 'What members can do' }, MEMBER_ACCESS.map((a) => h('label', { class: 'doc-share__choice' },
        h('input', {
          type: 'radio', name: `member-access-${itemId}`, value: a.id, checked: a.id === (item.memberAccess ?? 'edit'), disabled: !mayChange,
          onChange: () => {
            changeState(() => { const saved = getModule(vaultModuleId)?.data.items.find((i) => i.id === itemId); if (saved) saved.memberAccess = a.id === 'edit' ? undefined : a.id; });
            drawPanel(); drawLabel();
          },
        }), ` ${a.label[0].toUpperCase()}${a.label.slice(1)}`))),
      h('p', { class: 'doc-share__hint' }, `${maker ? `${maker.id === me?.id ? 'You' : maker.name.split(' ')[0]} (who made it) and admins` : 'Admins'} can always edit.${mayChange ? '' : ' Only they can change this.'}`),
      sharingEditor(item),
    ];
  }

  /**
   * Shared with people and groups (item.sharedWith): each shows it in their
   * own vault, under "Shared with you" (or "Shared with this group").
   */
  function sharingEditor(item) {
    const entries = item.sharedWith ?? [];
    const mayShare = documentAccess(vaultModuleId, item, me) === 'edit';
    const nameOf = (entry) => (entry.kind === 'member' ? getMember(entry.id)?.name : getSpace(entry.id)?.name) ?? 'Someone';
    const save = (next) => {
      changeState(() => { const saved = getModule(vaultModuleId)?.data.items.find((i) => i.id === itemId); if (saved) saved.sharedWith = next.length ? next : undefined; });
      drawPanel(); drawLabel();
    };
    const list = entries.length ? h('ul', { class: 'doc-share__list doc-share__people' }, entries.map((entry, i) => h('li', { class: 'doc-share__row' },
      entry.kind === 'member' ? avatar(getMember(entry.id), 20) : icon('people', 16),
      h('span', { class: 'doc-share__where' }, nameOf(entry), entry.kind === 'space' ? h('span', { class: 'doc-share__hint' }, ' · everyone in the group') : null),
      mayShare ? accessPicker(entry.access, (value) => save(entries.map((e, j) => (j === i ? { ...e, access: value } : e))), { label: `What ${nameOf(entry)} can do` })
        : h('span', { class: 'file-access__badge' }, accessLabel(entry.access)),
      mayShare ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => save(entries.filter((_, j) => j !== i)) }, 'Remove') : null))) : null;
    if (!mayShare) return [h('h4', { class: 'doc-share__subheading' }, 'Also shared with'), list ?? h('p', { class: 'doc-share__hint' }, 'No one else.')];

    // Add: people (searched by name) and groups, with what they can do.
    const already = new Set(entries.map((e) => `${e.kind}:${e.id}`));
    const people = messageablePeople(me).filter((p) => !already.has(`member:${p.id}`));
    let chosen = [];
    const to = createPeopleSearch({ people, describe: (p) => recipientContext(me, p), label: 'Share with', placeholder: 'Add people by name or @username', onChange: (ids) => { chosen = ids; } });
    const groups = getState().spaces.filter((x) => x.kind === 'group' && x.memberIds.includes(me.id) && x.id !== space?.id && !already.has(`space:${x.id}`));
    const groupSelect = groups.length ? h('select', { class: 'input input--compact', 'aria-label': 'Share with a group' },
      h('option', { value: '' }, 'Or a group…'), groups.map((g) => h('option', { value: g.id }, g.name))) : null;
    let access = 'view';
    const share = () => {
      const groupId = groupSelect?.value || null;
      if (!chosen.length && !groupId) { to.focus(); return; }
      const at = Date.now();
      const added = [...chosen.map((id) => ({ kind: 'member', id, access, by: me.id, at })), ...(groupId ? [{ kind: 'space', id: groupId, access, by: me.id, at }] : [])];
      save([...entries, ...added]);
      for (const entry of added) {
        const recipients = entry.kind === 'member' ? [entry.id] : getSpace(entry.id)?.memberIds ?? [];
        notify({ recipientIds: recipients, actorId: me.id, kind: 'share', text: `${me.name} shared “${item.name}” with ${entry.kind === 'member' ? 'you' : getSpace(entry.id)?.name}. It’s in ${entry.kind === 'member' ? 'your' : 'the group’s'} vault.`, href: entry.kind === 'member' ? '#space-me' : `#space-${entry.id}` });
      }
      showToast(`Shared “${item.name}”. It’s in their vault now.`);
    };
    return [
      h('h4', { class: 'doc-share__subheading' }, 'Also shared with'),
      list ?? h('p', { class: 'doc-share__hint' }, 'No one else yet. People and groups you share it with find it in their vault.'),
      h('div', { class: 'doc-share__add' },
        to.element,
        h('div', { class: 'doc-share__add-row' },
          groupSelect,
          accessPicker(access, (value) => { access = value; }, { label: 'What they can do' }),
          h('button', { type: 'button', class: 'button button--small button--primary', onClick: share }, 'Share'))),
    ];
  }

  function sharedEditor() {
    const pages = pagesOf();
    if (!pages.length) return h('p', { class: 'doc-share__hint' }, 'Not on any page yet. While editing a page, add File from vault and choose it.');
    return h('ul', { class: 'doc-share__list' }, pages.map((share) => {
      const mine = can(share.space, me?.id, 'editHomepage');
      return h('li', { class: 'doc-share__row' },
        icon('dashboard', 14),
        h('span', { class: 'doc-share__where' }, `On the page: ${share.space.name} · ${share.module.title}`),
        mine ? accessPicker(share.access, (value) => { setShareAccess(share, value); drawPanel(); }, { label: 'What people who see the page can do' })
          : h('span', { class: 'file-access__badge' }, accessLabel(share.access)),
        mine ? h('button', {
          type: 'button', class: 'link-button link-button--danger',
          onClick: () => {
            const removed = takeOffPage(share);
            drawPanel(); drawLabel();
            showToast(`Took it off ${share.space.name}.`, removed ? { actionLabel: 'Undo', onAction: () => { restoreModule(removed); drawPanel(); drawLabel(); } } : {});
          },
        }, 'Take it off the page') : null);
    }));
  }

  function publishedEditor(item) {
    const pub = publicationOf(item);
    const posts = postsOf();
    const rows = posts.map((share) => {
      const mine = share.post.authorId === me?.id;
      return h('li', { class: 'doc-share__row' },
        icon('announcements', 14),
        h('span', { class: 'doc-share__where' }, `Post in ${share.space.name} · ${share.module.title}${share.post.createdAt ? ` · ${shortDate(share.post.createdAt)}` : ''}`),
        mine ? accessPicker(share.access, (value) => { setShareAccess(share, value); drawPanel(); }, { label: 'What people who see the post can do' })
          : h('span', { class: 'file-access__badge' }, accessLabel(share.access)),
        h('button', { type: 'button', class: 'link-button', onClick: () => { close(); requestModuleFocus(share.module.id, share.post.id); openModulePage(share.module.id); } }, 'Open ↗'));
    });
    let article = null;
    if (pub) {
      const { article: a, module } = pub;
      const authors = authorsOf(a).map((id) => (id === me?.id ? 'you' : getMember(id)?.name.split(' ')[0] ?? 'someone'));
      article = h('li', { class: `doc-share__row doc-share__pub doc-share__pub--${a.status}` },
        icon('newspaper', 14),
        h('span', { class: 'doc-share__where' },
          a.status === 'published'
            ? [h('strong', {}, 'Published'), ` ${shortDate(a.publishedAt)} in ${module.title}`, isAuthorOf(a, me?.id) || can(getSpaceOfModule(module.id), me?.id, 'moderate')
              ? h('span', { class: 'doc-share__views' }, ` · ${viewsLabel(a.views)} · ${(a.readers ?? 0).toLocaleString('en-US')} readers`) : null]
            : a.status === 'scheduled'
              ? [h('strong', {}, 'Scheduled'), ` in ${module.title}, for ${shortDate(a.publishAt)}`]
              : [h('strong', {}, 'Draft'), ` in ${module.title}, by ${authors.join(' and ')}`]),
        h('button', {
          type: 'button', class: 'link-button',
          onClick: () => { close(); requestModuleFocus(module.id, isAuthorOf(a, me?.id) && a.status !== 'published' ? `edit:${a.id}` : a.id); openModulePage(module.id); },
        }, a.status === 'published' ? 'Read it ↗' : 'Open the draft ↗'));
    }
    const verb = publishVerb([item]);
    return [
      posts.length || article ? h('ul', { class: 'doc-share__list' }, article, rows) : h('p', { class: 'doc-share__hint' }, 'Not published yet.'),
      h('div', { class: 'doc-share__publish' },
        h('button', { type: 'button', class: 'button button--primary button--small', onClick: () => { close(); openPublishDialog({ entries: [{ vaultModuleId, item: itemNow() ?? item }] }); } },
          icon(verb === 'Publish' ? 'newspaper' : 'announcements', 14), ` ${verb}`),
        h('span', { class: 'doc-share__hint' }, verb === 'Publish' ? 'To your blog or a group, as a post with a preview (a document can also become an article).' : 'To your blog or a group, as a post with a preview.')),
    ];
  }

  function drawPanel() {
    const item = itemNow();
    if (!item) { replaceChildren(panel); return; }
    const pages = pagesOf().length;
    replaceChildren(panel,
      h('div', { class: 'doc-share__top' }, h('strong', {}, 'Sharing and publishing'),
        h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Close', onClick: close }, icon('close', 14))),
      row('who', 'Who can open it', whoSummary(item), () => whoEditor(item)),
      row('shared', 'Shared in', pages ? `${pages} ${pages === 1 ? 'page' : 'pages'}` : 'Nowhere yet', sharedEditor),
      row('published', 'Published', publishedSummary(item), () => publishedEditor(item)));
  }

  function onOutside(event) {
    if (!root.contains(event.target) && !event.target.closest?.('.toast')) close();
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.stopPropagation(); close(); button.focus(); }
  }
  function open() {
    openRow = null;
    drawPanel();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true));
    document.addEventListener('keydown', onKey, true);
  }
  function close() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey, true);
    drawLabel();
  }

  drawLabel();
  return root;
}

/**
 * Share several vault files at once (selected in the vault) with people or
 * groups: each gets them in their own vault, under "Shared with you".
 */
export function openShareMany({ vaultModuleId, itemIds, onDone = () => {} }) {
  const me = getCurrentUser();
  const vaultSpace = getSpaceOfModule(vaultModuleId);
  const items = () => (getModule(vaultModuleId)?.data.items ?? []).filter((i) => itemIds.includes(i.id));
  let chosen = [];
  let access = 'view';
  const to = createPeopleSearch({ people: messageablePeople(me), describe: (p) => recipientContext(me, p), label: 'Share with', placeholder: 'Add people by name or @username', onChange: (ids) => { chosen = ids; } });
  const groups = getState().spaces.filter((x) => x.kind === 'group' && x.memberIds.includes(me.id) && x.id !== vaultSpace?.id);
  const groupSelect = groups.length ? h('select', { class: 'input input--compact', 'aria-label': 'Share with a group' },
    h('option', { value: '' }, 'Or a group…'), groups.map((g) => h('option', { value: g.id }, g.name))) : null;
  const count = itemIds.length;
  const content = h('div', { class: 'share-many' },
    h('div', { class: 'publish-dialog__header' }, h('h2', { class: 'publish-dialog__title' }, `Share ${count} ${count === 1 ? 'file' : 'files'}`),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => modal.close() }, icon('close', 18))),
    h('p', { class: 'publish-dialog__hint' }, 'They’ll find them in their own vault, under “Shared with you” (a group: “Shared with this group”).'),
    to.element,
    h('div', { class: 'doc-share__add-row' },
      groupSelect,
      accessPicker(access, (value) => { access = value; }, { label: 'What they can do' }),
      h('button', {
        type: 'button', class: 'button button--primary button--small',
        onClick: () => {
          const groupId = groupSelect?.value || null;
          if (!chosen.length && !groupId) { to.focus(); return; }
          const at = Date.now();
          const added = [...chosen.map((id) => ({ kind: 'member', id, access, by: me.id, at })), ...(groupId ? [{ kind: 'space', id: groupId, access, by: me.id, at }] : [])];
          changeState(() => {
            for (const item of items()) {
              const kept = (item.sharedWith ?? []).filter((e) => !added.some((a) => a.kind === e.kind && a.id === e.id));
              item.sharedWith = [...kept, ...added];
            }
          });
          for (const entry of added) {
            const recipients = entry.kind === 'member' ? [entry.id] : getSpace(entry.id)?.memberIds ?? [];
            notify({ recipientIds: recipients, actorId: me.id, kind: 'share', text: `${me.name} shared ${count} ${count === 1 ? 'file' : 'files'} with ${entry.kind === 'member' ? 'you' : getSpace(entry.id)?.name}. They’re in ${entry.kind === 'member' ? 'your' : 'the group’s'} vault.`, href: entry.kind === 'member' ? '#space-me' : `#space-${entry.id}` });
          }
          modal.close();
          showToast(`Shared ${count} ${count === 1 ? 'file' : 'files'}.`);
          onDone();
        },
      }, 'Share')));
  const modal = openModal(content, { label: 'Share files', className: 'publish-dialog-modal' });
  requestAnimationFrame(() => to.focus());
  return modal;
}
