// @ts-check
/**
 * document-sharing.js — the small "Sharing" button on an open document in a
 * vault (a note, an article, or a module file like a spreadsheet), and the
 * panel it opens: who can open and edit it, where it's shared, and whether
 * it's published.
 *
 *   [👥 4 members can edit · Draft ▾]      (🔒 Only you, on your homepage's vault)
 *   ┌ Sharing and publishing ───────────────────────────────┐
 *   │ WHO CAN OPEN IT                                         │
 *   │ In Union files, in Juniper Tenants Union (4 members).   │
 *   │ Members can [edit ▾]   (you and admins can always edit) │
 *   │ SHARED IN                                               │
 *   │ 📣 Post in Juniper Tenants Union · Shared   [Can view ▾] │
 *   │ ▣ On the page Juniper Tenants Union · Home  [Can edit ▾] │
 *   │ PUBLISHED                                               │
 *   │ 📰 Draft in The Bulletin · Priya and you   Open ↗       │
 *   │    or: Published Nov 14 · 214 views · 131 readers       │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Who can open it follows the vault: your homepage's vault is yours alone;
 * a group's vault is its members'. In a group, the document's maker (and
 * admins, who can moderate) set what the other members can do with it:
 * edit (the default), comment, or only view (item.memberAccess). Shares
 * (posts and pages, js/ui/file-access.js) each have their own "Can view /
 * comment / edit", changed here by whoever shared it.
 *
 *   documentShareButton({ vaultModuleId, itemId, toArticle })  → element
 *   documentAccess(vaultModuleId, item, me)  → 'edit' | 'comment' | 'view' | 'none'
 *   findShares(vaultModuleId, itemId)        → [{ kind: 'post' | 'page', … }]
 *   publicationOf(item)                      → { status, article, module } | null
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { accessPicker, accessLabel, documentAccess } from './file-access.js';

export { documentAccess };
import { getState, getModule, getSpaceOfModule, getCurrentUser, getMember, updateModuleData, changeState } from '../state/store.js';
import { can } from '../state/permissions.js';
import { requestModuleFocus } from '../editor/module-context.js';
import { openModulePage } from '../router.js';
import { normalizeArticle, viewsLabel, authorsOf, isAuthorOf } from '../modules/articles/articles-data.js';

const FEEDS = new Set(['photofeed', 'textfeed', 'generalfeed']);
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

/**
 * The button, and the panel under it.
 * `toArticle` (optional): { targets, onTurn(targetModuleId) } to offer "Turn into an article" when it isn't one yet.
 */
export function documentShareButton({ vaultModuleId, itemId, toArticle = null }) {
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

  /** "Only you", "4 members can edit", plus "· Shared in 2 places" and the publication status. */
  function summary() {
    const item = itemNow();
    if (!item) return '';
    const shares = findShares(vaultModuleId, itemId);
    const pub = publicationOf(item);
    const who = space?.kind === 'group'
      ? `${space.memberIds.length} members can ${MEMBER_ACCESS.find((a) => a.id === (item.memberAccess ?? 'edit'))?.label ?? 'edit'}`
      : 'Only you';
    const where = shares.length ? `Shared in ${shares.length} ${shares.length === 1 ? 'place' : 'places'}` : null;
    const status = pub ? { draft: 'Draft', scheduled: 'Scheduled', published: 'Published' }[pub.status] : item.article ? 'Not published' : null;
    return [who, where, status].filter(Boolean).join(' · ');
  }

  function drawLabel() {
    label.textContent = ` ${summary()} `;
    const pub = publicationOf(itemNow());
    button.classList.toggle('is-published', pub?.status === 'published');
  }

  function section(title, ...children) {
    return h('section', { class: 'doc-share__section' }, h('h3', { class: 'doc-share__heading' }, title), ...children);
  }

  function drawPanel() {
    const item = itemNow();
    if (!item) { replaceChildren(panel); return; }
    const shares = findShares(vaultModuleId, itemId);
    const pub = publicationOf(item);
    const mayChange = canSetAccess(space, item, me);
    const vault = getModule(vaultModuleId);
    const maker = getMember(item.createdBy);

    // Who can open it
    const who = space?.kind === 'group'
      ? [
        h('p', { class: 'doc-share__line' }, `In ${vault?.title ?? 'the vault'}, in ${space.name}: its ${space.memberIds.length} members can open it.`),
        h('p', { class: 'doc-share__line' }, 'Members can ',
          mayChange
            ? h('select', {
              class: 'input input--compact doc-share__member-access', 'aria-label': 'What members can do',
              onChange: (event) => {
                const value = event.target.value;
                changeState(() => { const saved = getModule(vaultModuleId)?.data.items.find((i) => i.id === itemId); if (saved) saved.memberAccess = value === 'edit' ? undefined : value; });
                drawPanel(); drawLabel();
              },
            }, MEMBER_ACCESS.map((a) => h('option', { value: a.id, selected: a.id === (item.memberAccess ?? 'edit') }, a.label)))
            : h('strong', {}, MEMBER_ACCESS.find((a) => a.id === (item.memberAccess ?? 'edit'))?.label ?? 'edit'),
          '.'),
        h('p', { class: 'doc-share__hint' }, `${maker ? `${maker.id === me?.id ? 'You' : maker.name.split(' ')[0]} (who made it) and admins` : 'Admins'} can always edit.`),
      ]
      : [h('p', { class: 'doc-share__line' }, icon('lock', 12), ` In ${vault?.title ?? 'your vault'} on your homepage: only you can open it, unless you share it.`)];

    // Shared in
    const shareRows = shares.length
      ? h('ul', { class: 'doc-share__list' }, shares.map((share) => {
        const mine = share.kind === 'post' ? share.post.authorId === me?.id : can(share.space, me?.id, 'editHomepage');
        const where = share.kind === 'post'
          ? `Post in ${share.space.name} · ${share.module.title}${share.post.createdAt ? ` · ${shortDate(share.post.createdAt)}` : ''}`
          : `On the page: ${share.space.name} · ${share.module.title}`;
        return h('li', { class: 'doc-share__row' },
          icon(share.kind === 'post' ? 'announcements' : 'dashboard', 14),
          h('span', { class: 'doc-share__where' }, where),
          mine ? accessPicker(share.access, (value) => { setShareAccess(share, value); drawPanel(); }, { label: `What people who see the ${share.kind} can do` })
            : h('span', { class: 'file-access__badge' }, accessLabel(share.access)));
      }))
      : h('p', { class: 'doc-share__hint' }, 'Not shared anywhere yet. Add it to a post with “From your vault”, or drag it onto a page while editing.');

    // Published
    let published;
    if (pub) {
      const { article, module } = pub;
      const authors = authorsOf(article).map((id) => (id === me?.id ? 'you' : getMember(id)?.name.split(' ')[0] ?? 'someone'));
      const openIt = h('button', {
        type: 'button', class: 'link-button',
        onClick: () => { close(); requestModuleFocus(module.id, isAuthorOf(article, me?.id) && article.status !== 'published' ? `edit:${article.id}` : article.id); openModulePage(module.id); },
      }, article.status === 'published' ? 'Read it ↗' : 'Open the draft ↗');
      published = h('div', { class: `doc-share__pub doc-share__pub--${article.status}` },
        icon('newspaper', 14),
        h('span', { class: 'doc-share__where' },
          article.status === 'published'
            ? [h('strong', {}, 'Published'), ` ${shortDate(article.publishedAt)} in ${module.title}`, isAuthorOf(article, me?.id) || can(getSpaceOfModule(module.id), me?.id, 'moderate')
              ? h('span', { class: 'doc-share__views' }, ` · ${viewsLabel(article.views)} · ${(article.readers ?? 0).toLocaleString('en-US')} readers`) : null]
            : article.status === 'scheduled'
              ? [h('strong', {}, 'Scheduled'), ` in ${module.title}, for ${shortDate(article.publishAt)}`]
              : [h('strong', {}, 'Draft'), ` in ${module.title}, by ${authors.join(' and ')}`]),
        openIt);
    } else if (toArticle?.targets?.length) {
      const pick = toArticle.targets.length > 1 ? h('select', { class: 'input input--compact', 'aria-label': 'Where the article goes' }, toArticle.targets.map((t) => h('option', { value: t.moduleId }, t.label))) : null;
      published = h('div', { class: 'doc-share__pub' },
        icon('newspaper', 14),
        h('span', { class: 'doc-share__where' }, h('strong', {}, 'Not published.'), item.article ? ' Publish it to Articles as a draft first.' : ' It can become an article.'),
        pick,
        h('button', { type: 'button', class: 'button button--small', onClick: () => { close(); toArticle.onTurn(pick ? pick.value : toArticle.targets[0].moduleId); } }, item.article ? 'Publish to Articles' : 'Turn into an article'));
    } else {
      published = h('p', { class: 'doc-share__hint' }, shares.some((s) => s.kind === 'post') ? 'Posted, not published as an article.' : 'Not published. To publish it, add Articles to this group or your blog.');
    }

    replaceChildren(panel,
      h('div', { class: 'doc-share__top' }, h('strong', {}, 'Sharing and publishing'),
        h('button', { type: 'button', class: 'icon-button icon-button--small', 'aria-label': 'Close', onClick: close }, icon('close', 14))),
      section('Who can open it', who),
      section('Shared in', shareRows),
      section('Published', published));
  }

  function onOutside(event) {
    if (!root.contains(event.target)) close();
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.stopPropagation(); close(); button.focus(); }
  }
  function open() {
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
