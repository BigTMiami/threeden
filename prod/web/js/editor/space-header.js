// @ts-check
/**
 * space-header.js — the top of a homepage: the cover (if the space has
 * one), the space's name, a line of details, and buttons.
 *
 *   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ cover photo ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
 *   Group:     [237]  237 Hart Street
 *                     🔒 Private group · 4 members · You're the owner
 *                     The four of us at 237 Hart Street…   [⚙ Settings] [Edit homepage]
 *   Personal:  (LL)   My homepage
 *                     🔒 Only you can see this page        [Customize] [Edit homepage]
 *   Blog:      (LL)   Leo's blog
 *                     🌐 Public blog · @leo
 *                     Urban policy student…   yours: [Customize] [Edit blog]
 *                                             others': [+ Add friend] [Message]
 *
 * Under it, the homepage's tabs (when there's more than one, or in edit
 * mode, where tabs are added, renamed, moved and removed):
 *
 *   [ Home | Projects | Archive ]                       (edit: + Add tab)
 *
 * In view mode the name is a heading. In edit mode it becomes a text field
 * and the "Edit homepage" button turns into "Done". "Edit homepage" only
 * shows for people whose role allows it (js/state/permissions.js).
 */

import { renderBlogQuestion } from '../groups/blog-choice.js';
import { passkeyNeededIn, groupSecurity } from '../state/security.js';
import { isChild, isWaitingFor } from '../state/children.js';
import { personMenu } from '../feed/post-menu.js';
import { renderWelcomeChecklist } from '../groups/welcome-checklist.js';
import { renderGroupSuggestion } from '../groups/group-suggestions.js';
import { openLibrarySheet } from './library.js';
import { editingControls, previewControls, isPagePreview } from './edit-bar.js';
import { formatShortDate } from '../utils/dates.js';
import { openShareCard } from '../ui/share-card.js';
import { canHaveLinksPage, linksHref } from '../groups/links-page.js';
import { upcomingEventsIn } from '../modules/dashboard/dashboard-data.js';
import { setPageMeta } from '../ui/page-meta.js';
import { isPublicGroup, joiningOf } from '../state/group-access.js';
import { uses } from '../state/features.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { groupInitials } from '../utils/initials.js';
import {
  getCurrentSpace, getCurrentUser, getMember, getSpaceMembers, isEditMode, setEditMode, renameCurrentSpace, resetToDemo, subscribe, isGuestBrowsing,
  getTabs, getCurrentTabId, addTab, renameTab, moveTab, moveTabTo, removeTab, restoreTab, setTabVisibility, HOME_TAB_ID,
  isVisitingGroup, } from '../state/store.js';
import { hasRequestedToJoin, joinOrRequest, declineJoinRequest, acceptInvite, renameSpace, setSpaceDescription } from '../state/groups.js';
import { editInPlace } from '../ui/edit-in-place.js';
import { renderThanksOnBlog } from '../events/event-thanks.js';
import { renderMetInPerson } from '../ui/met-in-person.js';
import { healthNudge } from '../groups/health-tab.js';
import { openDirectConversation } from '../state/messages.js';
import { friendStatus, sendFriendRequest, acceptFriendRequest, removeFriendship, restoreFriendship } from '../state/friends.js';
import { onlineMemberIds } from '../state/presence.js';
import { can, canManageRoles } from '../state/permissions.js';
import { isGroupMuted, setGroupMuted } from '../state/notifications.js';
import { requireAccount } from '../onboarding/guest.js';
import { isFollowing, toggleFollow, followersLabel, followerCount } from '../state/follows.js';
import { normalizeAppearance, coverStyle } from '../groups/appearance.js';
import { settingsHref, goTo, spaceHref } from '../router.js';
import { effectiveSpace, isPreviewing } from '../groups/settings-drafts.js';

const RESET_CONFIRM_WINDOW_MS = 4000;

let headerElement = null;

export function initSpaceHeader(container) {
  headerElement = container;
  subscribe('mode', renderSpaceHeader);
  subscribe('space', renderSpaceHeader);
  subscribe('layout', () => { if (isEditMode()) renderSpaceHeader(); }); // the Layouts menu follows the layout
  subscribe('account', renderSpaceHeader); // friend requests change the blog's buttons
  subscribe('person', renderSpaceHeader); // so do follows
  renderSpaceHeader();
}

export function renderSpaceHeader() {
  // While previewing unsaved settings, show the space as it would be.
  const space = effectiveSpace(getCurrentSpace());
  const me = getCurrentUser();
  if (!space || !me) {
    replaceChildren(headerElement);
    return;
  }
  const isPersonal = space.kind === 'personal';
  const isBlog = space.kind === 'blog';
  const isMine = space.memberIds.includes(me.id);
  // Public pages get their own title and description for search engines and link previews.
  setPageMeta(canHaveLinksPage(space) ? {
    title: isBlog ? `${getMember(space.memberIds[0])?.name}’s blog` : `${space.name}${space.groupType ? ` · ${space.groupType}` : ''}`,
    description: (isBlog ? getMember(space.memberIds[0])?.bio : space.description) || '',
  } : null);
  const editMode = isEditMode();
  const canEdit = can(space, me.id, 'editHomepage') && !isPreviewing(space.id);
  const { cover } = normalizeAppearance(space.appearance);
  const banner = coverStyle(cover);

  // A blog in edit mode: click the title or the About to change it, right there.
  const blogEditing = isBlog && editMode && canEdit;
  const nameElement = blogEditing
    ? editInPlace('h1', {
        className: 'space-header__name',
        label: 'Blog name',
        fields: [{ key: 'name', value: space.name }],
        onSave: ({ name }) => { renameSpace(space.id, name); showToast('Renamed.'); },
      })
    : editMode
    ? h('input', {
        class: 'space-header__name-input',
        type: 'text',
        value: space.name,
        'aria-label': { personal: 'Homepage name', blog: 'Blog name' }[space.kind] ?? 'Group name',
        onChange: (event) => renameCurrentSpace(event.target.value),
      })
    : editInPlace('h1', {
        className: 'space-header__name',
        label: { personal: 'Homepage name', blog: 'Blog name' }[space.kind] ?? 'Group name',
        canEdit: can(space, me.id, 'editDetails') && !isPreviewing(space.id) && !isGuestBrowsing(),
        fields: [{ key: 'name', value: space.name }],
        onSave: ({ name }) => { renameSpace(space.id, name); showToast('Renamed.'); },
      });

  const tabs = renderTabs(space, editMode && canEdit);
  const blogAbout = isBlog && !editMode ? renderBlogAbout(space, me) : null;
  headerElement.classList.toggle('has-cover', Boolean(banner));
  headerElement.classList.toggle('has-tabs', Boolean(tabs));
  replaceChildren(headerElement,
    banner ? h('div', { class: `space-header__cover space-header__cover--${cover.height}`, style: banner, 'aria-hidden': 'true' }) : null,
    h('div', { class: 'space-header__identity' },
      renderBadge(space),
      h('div', {},
        nameElement,
        // One short line. The icon says who can see it (hover for the words).
        h('p', { class: 'space-header__meta', title: isBlog ? 'Public: anyone can see this blog' : space.kind !== 'group' ? null : isPublicGroup(space) ? 'Public group: anyone can find it and see its public pages' : 'Private group: only members can see it' },
          icon(isBlog || (space.kind === 'group' && isPublicGroup(space)) ? 'globe' : 'lock', 13), ' ',
          // What the group is ("Band", "News outlet"), first.
          space.kind === 'group' && space.groupType ? [h('strong', { class: 'space-header__type' }, space.groupType), ' · '] : null,
          describeSpace(space, me),
          space.kind === 'group' && isMine ? renderOnlineCount(space) : null,
          blogAbout ? [' · ', blogAbout.toggle] : null),
        // A blog keeps its header to the name and one line; the rest opens under "About".
        blogEditing ? aboutInPlace(space) : blogAbout ? blogAbout.panel : space.description ? h('p', { class: 'space-header__description' }, space.description) : null,
        // A group from the 3den server (js/api/sync.js): only its events and RSVPs are saved there so far.
        space.server ? h('p', { class: 'space-header__server-note' }, icon('info', 13), ' Events and RSVPs are saved on the 3den server. Anything else you change here stays in this browser for now.') : null,
        // Organizers: one quiet line when something needs a nudge (health-tab.js).
        space.kind === 'group' && !editMode && canManageRoles(space, me.id) && !isPreviewing(space.id) ? healthNudge(space, me) : null,
      ),
    ),
    editMode ? null : renderWelcomeChecklist(space, me),
    editMode || !isMine ? null : renderBlogQuestion(space, me, () => renderSpaceHeader()), // after joining: show your blog here? (blog-choice.js)
    // The group asks for passkeys and you haven't added one (its Security settings).
    !editMode && isMine && space.kind === 'group' && passkeyNeededIn(space, me.id) ? h('p', { class: 'passkey-ask', role: 'status' },
      icon('shield', 14), ` ${space.name} asks ${groupSecurity(space).requirePasskey === 'everyone' ? 'everyone' : 'admins'} to sign in with a passkey.`,
      h('a', { class: 'button button--small', href: '#account-security' }, 'Add a passkey')) : null,
    editMode ? null : renderGroupSuggestion(space, me), // a new group grows when it needs to
    h('div', { class: 'space-header__actions' },
      editMode ? renderResetButton() : null,
      isVisitingGroup(space) ? renderFollowButton(me, { kind: 'space', id: space.id }, space.name, false) : null,
      isVisitingGroup(space) ? renderJoinButton(space, me) : null,
      space.kind === 'group' && isMine && !editMode ? renderMuteButton(space, me) : null,
      !editMode && isMine && !me.isGuest && canHaveLinksPage(space) ? renderShareButton(space) : null,
      // Someone else's blog: be friends, or get in touch.
      // Someone else's blog: follow them (one-way), or be friends (two-way).
      isBlog && !isMine && friendStatus(me.id, space.memberIds[0]) !== 'friends'
        ? renderFollowButton(me, { kind: 'person', id: space.memberIds[0] }, getMember(space.memberIds[0])?.name ?? 'them', true) : null,
      isBlog && !isMine ? renderFriendButtons(me.id, space.memberIds[0]) : null,
      // Mute or block them (blocks.js).
      isBlog && !isMine && getMember(space.memberIds[0]) ? personMenu({ id: space.memberIds[0], name: getMember(space.memberIds[0]).name }, () => renderSpaceHeader()) : null,
      // Message: unless either of you turned messages off.
      isBlog && !isMine && uses(me, 'messages') && uses(space.memberIds[0], 'messages') ? h('button', {
        type: 'button',
        class: 'button',
        onClick: () => {
          const ownerId = space.memberIds[0];
          if (requireAccount({
            reason: `to message ${getMember(ownerId)?.name ?? 'them'}`,
            action: 'continue',
            arrival: { source: 'blog', itemId: ownerId },
            then: (newId) => { history.replaceState(null, '', `#messages-${openDirectConversation(newId, ownerId).id}`); },
          })) return;
          goTo(`#messages-${openDirectConversation(me.id, ownerId).id}`);
        },
      }, icon('chat', 16), ' Message') : null,
      // Members who can't edit the page still reach the group's settings (notifications, leaving).
      editMode || !isMine || canEdit ? null : h('a', {
        class: 'button',
        href: settingsHref(space.id, isPersonal || isBlog ? 'layout' : null),
      }, icon('settings', 16), ' Settings'),
      // On a phone, the module list stays out of the way until you ask for it.
      canEdit && editMode ? h('button', {
        type: 'button',
        class: 'button space-header__add-modules',
        onClick: () => openLibrarySheet(),
      }, icon('plus', 16), ' Add modules') : null,
      // One way in: Edit opens the page itself, its layout, or its settings.
      // While editing, Edit becomes Layouts, Preview, and Done editing (edit-bar.js);
      // while previewing, "Previewing" and Back to editing.
      canEdit && editMode ? editingControls() : null,
      isPagePreview() ? previewControls(space) : null,
      // A blog's Edit goes straight into edit mode.
      canEdit && !editMode && !isPagePreview() && isBlog ? h('button', { type: 'button', class: 'button', onClick: () => setEditMode(true) }, icon('pencil', 16), ' Edit') : null,
      canEdit && !editMode && !isPagePreview() && !isBlog ? friendMenu('Edit', 'pencil', 'Edit this page, its layout, or its settings', [
        [isBlog ? 'Edit this blog' : 'Edit this page', () => setEditMode(true)],
        space.kind === 'personal' ? ['Layout and templates', () => goTo(settingsHref(space.id, 'layout'))] : null,
        [space.kind === 'group' ? 'Group settings' : 'Settings', () => goTo(settingsHref(space.id))],
      ]) : null,
    ),
    tabs,
  );
}

/**
 * A blog's About while editing: the text, or a prompt to add one. Click it
 * (or Enter) for a text box; it saves when you click away, Esc cancels.
 */
function aboutInPlace(space) {
  const text = space.description ?? '';
  const element = /** @type {HTMLElement} */ (h('p', {
    class: `space-header__description in-place blog-about-edit${text ? '' : ' is-empty'}`,
    role: 'button', tabIndex: 0, title: 'Click to change',
    'aria-label': text ? `About: ${text}. Press Enter to change it.` : 'Add an About',
  }, text || '+ Add an About: who you are and what you post about'));
  let open = false;
  const start = () => {
    if (open) return;
    open = true;
    const box = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'input blog-about-edit__input', rows: '3', maxlength: '300', 'aria-label': 'About', placeholder: 'Who you are and what you post about' }));
    box.value = text;
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      open = false;
      if (save && box.value.trim() !== text) { setSpaceDescription(space.id, box.value); showToast('About saved.'); }
      else box.replaceWith(element);
    };
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); element.focus(); }
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finish(true); }
    });
    box.addEventListener('blur', () => finish(true));
    element.replaceWith(box);
    box.focus();
  };
  element.addEventListener('click', start);
  element.addEventListener('keydown', (event) => { if (!open && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); start(); } });
  return element;
}

/**
 * A blog's "About": its description, who has met the blogger in person, and
 * thank-yous from events (js/ui/met-in-person.js, js/events/event-thanks.js),
 * folded under one link so the header stays the name and one line.
 *   → { toggle, panel } or null when there's nothing to show
 */
let blogAboutOpen = false;
function renderBlogAbout(space, me) {
  const ownerId = space.memberIds[0];
  const parts = [
    space.description ? h('p', { class: 'space-header__description' }, space.description) : null,
    renderMetInPerson(ownerId, me),
    renderThanksOnBlog(ownerId),
  ].filter((part) => part && !part.hidden);
  if (!parts.length) return null;
  const panel = h('div', { class: 'blog-about', id: `blog-about-${space.id}`, hidden: !blogAboutOpen }, parts);
  const toggle = h('button', {
    type: 'button', class: 'link-button blog-about__toggle', 'aria-expanded': String(blogAboutOpen), 'aria-controls': `blog-about-${space.id}`,
    onClick: () => {
      blogAboutOpen = !blogAboutOpen;
      panel.hidden = !blogAboutOpen;
      toggle.setAttribute('aria-expanded', String(blogAboutOpen));
    },
  }, 'About');
  return { toggle, panel };
}

/**
 * Visiting a public group's public tabs: join it (anyone can join), ask to
 * (ask to join), or a note that members are invited or added by admins.
 * Following (next to this) works either way.
 */
function renderJoinButton(space, me) {
  if ((space.invites ?? []).some((i) => i.memberId === me.id)) {
    return h('button', {
      type: 'button',
      class: 'button button--primary',
      onClick: () => { if (acceptInvite(space.id, me.id) === 'asked') { showToast(`We asked your parent if you can join ${space.name}.`); renderSpaceHeader(); } else showToast(`You joined ${space.name}.`); },
    }, icon('check', 16), isChild(me.id) ? ' Ask a parent' : ' Accept invitation');
  }
  if (isChild(me.id) && isWaitingFor(me.id, space.id)) {
    return h('span', { class: 'space-header__friend' }, h('span', { class: 'space-header__friend-state' }, icon('clock', 14), ' Waiting for a parent’s OK'));
  }
  if (hasRequestedToJoin(space, me.id)) {
    return h('span', { class: 'space-header__friend' },
      h('span', { class: 'space-header__friend-state' }, icon('check', 14), ' Asked to join'),
      h('button', { type: 'button', class: 'link-button', onClick: () => { declineJoinRequest(space.id, me.id); renderSpaceHeader(); } }, 'Cancel'));
  }
  const joining = joiningOf(space);
  // Invitation-only groups: nothing to press, so nothing to show.
  if (joining === 'invite' || joining === 'admins') return null;
  const open = joining === 'open';
  return h('button', {
    type: 'button',
    class: 'button button--primary',
    onClick: () => {
      if (requireAccount({
        reason: `to ${open ? 'join' : 'ask to join'} ${space.name}`,
        action: open ? 'join' : 'ask to join',
        arrival: { source: 'group', spaceId: space.id },
        then: (newId) => {
          if (joinOrRequest(space.id, newId) === 'joined') history.replaceState(null, '', spaceHref(space.id));
        },
      })) return;
      const result = joinOrRequest(space.id, me.id);
      if (result === 'asked') { showToast(`We asked your parent if you can join ${space.name}.`); renderSpaceHeader(); }
      else if (result === 'joined') { showToast(`You joined ${space.name}.`); goTo(spaceHref(space.id)); }
      else { showToast(`Asked to join ${space.name}. Its admins will see your request.`); renderSpaceHeader(); }
    },
  }, icon('plus', 16), isChild(me.id) ? ' Ask a parent to join' : open ? ' Join group' : ' Ask to join');
}

/**
 * Mute or unmute a group's news (announcements, new events, new threads).
 * Mentions and things assigned to you still come through.
 */
function renderMuteButton(space, me) {
  const muted = isGroupMuted(me.id, space.id);
  return h('button', {
    type: 'button',
    class: `button space-header__mute${muted ? ' is-muted' : ''}`,
    'aria-pressed': String(muted),
    title: muted
      ? 'Muted: you won’t be notified about announcements, new events, or new threads. Mentions still reach you.'
      : 'Notified about announcements, new events, and new threads. Click to mute.',
    onClick: () => {
      setGroupMuted(me.id, space.id, !muted);
      showToast(muted ? `You’ll hear about news in ${space.name} again.` : `Muted ${space.name}. Mentions and things assigned to you still come through.`);
      renderSpaceHeader();
    },
  }, icon(muted ? 'bellOff' : 'bell', 16), muted ? ' Muted' : ' Mute');
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

/**
 * Drag a tab along the strip to move it (edit mode, Nov 20). It follows the
 * pointer; the tab it would land before or after is marked; letting go
 * moves it there (moveTabTo; Home stays first). A press that doesn't move
 * is a click. Mouse, pen, and touch alike.
 */
function makeTabDraggable(link, tabId) {
  // A link is draggable by the browser itself (to the desktop, another tab), which swallows the pointer: not here.
  link.draggable = false;
  link.addEventListener('dragstart', (event) => event.preventDefault());
  link.addEventListener('pointerdown', (down) => {
    if (down.button !== 0 || renamingTabId) return;
    const strip = link.closest('.space-tabs');
    if (!strip) return;
    const startX = down.clientX;
    const startY = down.clientY;
    let dragging = false;
    let target = null; // { index, el, side }
    const others = () => [...strip.querySelectorAll('.space-tabs__tab[data-tab-id]')].filter((el) => el !== link);
    const clearMarks = () => strip.querySelectorAll('.is-drop-before, .is-drop-after').forEach((el) => el.classList.remove('is-drop-before', 'is-drop-after'));
    const onMove = (move) => {
      const dx = move.clientX - startX;
      if (!dragging) {
        if (Math.abs(dx) < 6) return;
        dragging = true;
        try { link.setPointerCapture(down.pointerId); } catch { /* fine */ }
        link.classList.add('is-dragging');
        strip.classList.add('is-reordering');
      }
      move.preventDefault();
      link.style.transform = `translate(${dx}px, ${move.clientY - startY}px)`;
      // Where would it land? Before the first tab on a lower row, or on the
      // pointer's row with its middle right of the pointer (tabs wrap on phones).
      const tabs = others();
      let index = tabs.length;
      for (let i = 0; i < tabs.length; i += 1) {
        const box = tabs[i].getBoundingClientRect();
        const below = move.clientY < box.top;
        const sameRow = move.clientY >= box.top && move.clientY <= box.bottom;
        if (below || (sameRow && move.clientX < box.left + box.width / 2)) { index = i; break; }
      }
      index = Math.max(1, index); // never before the first tab
      clearMarks();
      const before = tabs[index];
      if (before) before.classList.add('is-drop-before'); else tabs[tabs.length - 1]?.classList.add('is-drop-after');
      target = { index };
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!dragging) return;
      // The click that follows a drag isn't a click.
      link.addEventListener('click', (click) => { click.preventDefault(); click.stopImmediatePropagation(); }, { capture: true, once: true });
      link.classList.remove('is-dragging');
      link.style.transform = '';
      strip.classList.remove('is-reordering');
      clearMarks();
      if (target) {
        const name = link.textContent?.trim();
        if (moveTabTo(tabId, target.index)) showToast(`Moved “${name}”.`);
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });
}

/** Which tab is being renamed (kept across redraws). */
let renamingTabId = null;

function renderTabs(space, canEditTabs) {
  const tabs = getTabs(space);
  if (tabs.length < 2 && !canEditTabs) return null;
  const currentId = getCurrentTabId();
  const current = tabs.find((t) => t.id === currentId);
  const currentIndex = tabs.indexOf(current);

  const tabLink = (tab) => {
    const isCurrent = tab.id === currentId;
    if (canEditTabs && renamingTabId === tab.id) {
      // Finish once: Enter or leaving saves, Escape cancels. (The redraw that
      // removes the box blurs it; without the guard that saved and redrew again.)
      let finished = false;
      const finish = (save) => {
        if (finished) return;
        finished = true;
        renamingTabId = null;
        if (save) renameTab(tab.id, input.value); else renderSpaceHeader();
      };
      const input = h('input', {
        type: 'text',
        class: 'input input--compact space-tabs__rename',
        value: tab.name,
        'aria-label': 'Tab name',
        onKeydown: (event) => {
          if (event.key === 'Enter') { event.preventDefault(); finish(true); }
          if (event.key === 'Escape') { event.preventDefault(); finish(false); }
        },
        // Later, not inside the blur: a redraw that removes the box also blurs it.
        onBlur: () => setTimeout(() => { if (input.isConnected) finish(true); }, 0), // gone: a redraw drew a fresh box, which carries on
      });
      requestAnimationFrame(() => { input.focus(); input.select(); });
      return input;
    }
    // Members see a globe on the tabs anyone can see.
    const showGlobe = space.kind === 'group' && tab.visibility === 'public' && isPublicGroup(space) && !isVisitingGroup(space);
    // In edit mode (Nov 20): click the open tab (or double-click any) to rename it,
    // and drag any tab but the first to move it.
    const movable = canEditTabs && tab.id !== HOME_TAB_ID;
    const link = h('a', {
      href: spaceHref(space.id, tab.id),
      class: `space-tabs__tab${isCurrent ? ' is-active' : ''}${movable ? ' is-movable' : ''}`,
      'aria-current': isCurrent ? 'page' : null,
      'data-tab-id': tab.id,
      title: canEditTabs
        ? (movable ? 'Drag to move · click to open, then click again to rename' : 'Click to rename (the first tab stays first)')
        : showGlobe ? 'Public: anyone with the link can see this tab' : null,
      onClick: canEditTabs && isCurrent ? (event) => { event.preventDefault(); renamingTabId = tab.id; renderSpaceHeader(); } : null,
      onDblclick: canEditTabs ? (event) => { event.preventDefault(); renamingTabId = tab.id; renderSpaceHeader(); } : null,
    }, showGlobe ? h('span', { class: 'space-tabs__globe', 'aria-label': 'Public' }, icon('globe', 12)) : null, tab.name);
    if (movable) makeTabDraggable(link, tab.id);
    return link;
  };

  // In a public group: make the current tab public, or members-only again.
  // A private group shows nothing to outsiders, so the button is off there.
  const groupIsPublic = isPublicGroup(space);
  const isPublic = groupIsPublic && current?.visibility === 'public';
  const visibilityToggle = canEditTabs && space.kind === 'group' && current ? h('button', {
    type: 'button',
    class: 'button button--small space-tabs__visibility',
    disabled: !groupIsPublic,
    title: !groupIsPublic
      ? 'This group is private, so every tab is members-only. To make tabs public, make the group public in Settings → General first.'
      : isPublic ? 'Anyone with the link can see this tab. Click to make it members-only.' : 'Only members can see this tab. Click to make it public.',
    onClick: () => {
      setTabVisibility(current.id, isPublic ? 'members' : 'public');
      showToast(isPublic
        ? `“${current.name}” is members-only now.`
        : `“${current.name}” is public: anyone with the link can see it. Other tabs stay members-only.`);
    },
  }, icon(isPublic ? 'globe' : 'lock', 12), isPublic ? ' Public tab' : ' Members-only tab') : null;

  return h('nav', { class: 'space-tabs', 'aria-label': 'Tabs' },
    tabs.map(tabLink),
    canEditTabs ? h('span', { class: 'space-tabs__tools' },
      visibilityToggle,
      // Every tab can be renamed, the first one too ("Home" → "About", "Shows"…);
      // the first tab just can't be moved or removed.
      h('button', { type: 'button', class: 'link-button', onClick: () => { renamingTabId = currentId; renderSpaceHeader(); } }, 'Rename'),
      currentId !== HOME_TAB_ID ? [
        h('button', { type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': 'Move tab left', disabled: currentIndex <= 1, onClick: () => moveTab(currentId, -1) }, icon('chevronLeft', 14)),
        h('button', { type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': 'Move tab right', disabled: currentIndex >= tabs.length - 1, onClick: () => moveTab(currentId, 1) }, icon('chevronRight', 14)),
        h('button', {
          type: 'button',
          class: 'link-button link-button--danger',
          onClick: () => {
            const removed = removeTab(currentId);
            goTo(spaceHref(space.id));
            showToast(`Removed the “${current.name}” tab. Its modules moved to “${tabs[0].name}”.`, { actionLabel: 'Undo', onAction: () => { restoreTab(removed); goTo(spaceHref(space.id, removed.tab.id)); } });
          },
        }, 'Remove tab'),
      ] : null,
      h('button', {
        type: 'button',
        class: 'button button--small',
        onClick: () => {
          const tab = addTab('New tab');
          renamingTabId = tab.id;
          goTo(spaceHref(space.id, tab.id));
        },
      }, icon('plus', 12), ' Add tab')) : null,
  );
}

/**
 * On someone else's blog: where you stand with them, and what you can do.
 *   none → [+ Add friend]   sent → [Request sent] Cancel   received → [Accept] [Decline]
 *   friends → [✓ Friends] Unfriend
 */
/**
 * Follow a blog or a group's public page: their public posts show up in
 * your Feed, no yes needed. Someone who isn't signed in is asked to make a
 * free account first (js/onboarding/guest.js), then follows.
 */
/**
 * Share a public group or a blog: an Instagram-ready picture and the
 * link-in-bio page (js/groups/links-page.js), whose link it copies.
 */
function renderShareButton(space) {
  const isBlog = space.kind === 'blog';
  const owner = isBlog ? getMember(space.memberIds[0]) : null;
  return h('button', {
    type: 'button',
    class: 'button',
    title: 'A picture to post, and a link for your Instagram bio',
    onClick: () => {
      const next = upcomingEventsIn(space).find((o) => o.event.visibility === 'public');
      openShareCard({
        title: isBlog ? owner.name : space.name,
        emoji: space.groupType === 'Band' ? '🎸' : isBlog ? '👋' : '📣',
        color: space.appearance?.accent ?? '#3366cc',
        lines: [isBlog ? `@${owner.username}` : space.groupType, next ? `Next: ${next.event.title}, ${formatShortDate(next.date)}` : space.description],
        byline: 'Follow for shows and events',
        link: `${window.location.origin}${window.location.pathname}${linksHref(space.id)}`,
      });
    },
  }, icon('send', 15), ' Share');
}

function renderFollowButton(me, target, name, isMain) {
  const following = !me.isGuest && isFollowing(me.id, target);
  return h('button', {
    type: 'button',
    class: following ? 'button space-header__following' : `button${isMain ? ' button--primary' : ''}`,
    'aria-pressed': String(following),
    title: following ? `You follow ${name}. Click to stop.` : `See ${name}’s public posts in your Feed`,
    onClick: () => {
      if (requireAccount({
        reason: `to follow ${name}`,
        action: 'follow',
        arrival: { source: 'follow', ...(target.kind === 'space' ? { spaceId: target.id } : { itemId: target.id }) },
        then: (newId) => toggleFollow(newId, target),
      })) return;
      const now = toggleFollow(me.id, target);
      showToast(now ? `Following ${name}. Their public posts will show in your Feed.` : `Stopped following ${name}.`);
      renderSpaceHeader();
    },
  }, icon(following ? 'check' : 'plus', 16), following ? ' Following' : ' Follow');
}

/**
 * The friend button on someone's blog: always one word.
 *   Friend     → sends a request
 *   Requested  → menu: Cancel request
 *   Respond    → menu: Accept, Decline
 *   Friends    → menu: Unfriend
 */
function renderFriendButtons(meId, otherId) {
  const other = getMember(otherId);
  if (!other) return null;
  const status = friendStatus(meId, otherId);
  if (status === 'none') {
    return h('button', {
      type: 'button',
      class: 'button',
      onClick: () => {
        if (requireAccount({
          reason: `to add ${other.name} as a friend`,
          action: 'add friend',
          arrival: { source: 'blog', itemId: otherId },
          then: (newId) => sendFriendRequest(newId, otherId),
        })) return;
        sendFriendRequest(meId, otherId);
        showToast(`Friend request sent to ${other.name}.`);
      },
    }, icon('plus', 16), ' Friend');
  }
  if (status === 'sent') {
    return friendMenu('Requested', 'check', `Friend request sent to ${other.name}`, [
      ['Cancel request', () => { removeFriendship(meId, otherId); showToast('Request canceled.'); }],
    ]);
  }
  if (status === 'received') {
    return friendMenu('Respond', 'people', `${other.name} sent you a friend request`, [
      ['Accept', () => { acceptFriendRequest(meId, otherId); showToast(`You and ${other.name} are now friends.`); }],
      ['Decline', () => { removeFriendship(meId, otherId); showToast('Request declined.'); }],
    ], { primary: true });
  }
  if (status === 'friends') {
    return friendMenu('Friends', 'check', `You and ${other.name} are friends`, [
      ['Unfriend', () => { const copy = removeFriendship(meId, otherId); showToast(`You and ${other.name} are no longer friends.`, { actionLabel: 'Undo', onAction: () => restoreFriendship(copy) }); }, true],
    ]);
  }
  return null;
}

/**
 * Open a menu on the side that fits: under the button's left edge or its
 * right edge, whichever keeps it on screen (on phones Edit sits at the left).
 */
function keepOnScreen(list) {
  list.style.left = '';
  list.style.right = '';
  const margin = 8;
  const box = list.getBoundingClientRect();
  if (box.left < margin) {
    list.style.left = '0';
    list.style.right = 'auto';
  } else if (box.right > window.innerWidth - margin) {
    list.style.left = 'auto';
    list.style.right = '0';
  }
}

/** A one-word button that opens a small menu of [label, run, danger?] choices. */
function friendMenu(label, iconName, title, choices, { primary = false } = {}) {
  const list = h('div', { class: 'post-menu__list friend-menu__list', role: 'menu', hidden: true });
  const button = h('button', {
    type: 'button', class: `button${primary ? ' button--primary' : ''}`, title, 'aria-haspopup': 'true', 'aria-expanded': 'false',
    onClick: () => setOpen(list.hidden),
  }, icon(iconName, 16), ` ${label}`);
  const wrapper = h('div', { class: 'post-menu friend-menu' }, button, list);
  const closeIfOutside = (event) => { if (!wrapper.contains(event.target)) setOpen(false); };
  const onKey = (event) => { if (event.key === 'Escape') { setOpen(false); button.focus(); } };
  function setOpen(open) {
    list.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      keepOnScreen(list);
      document.addEventListener('pointerdown', closeIfOutside);
      document.addEventListener('keydown', onKey);
      list.querySelector('button')?.focus();
    } else {
      document.removeEventListener('pointerdown', closeIfOutside);
      document.removeEventListener('keydown', onKey);
    }
  }
  replaceChildren(list, choices.filter(Boolean).map(([text, run, danger]) => h('button', {
    type: 'button', role: 'menuitem', class: `post-menu__item${danger ? ' post-menu__item--danger' : ''}`,
    onClick: () => { setOpen(false); run(); },
  }, text)));
  return wrapper;
}

/**
 * "Reset demo" needs two clicks, since confirm() dialogs are blocked in the
 * sandbox and resetting throws away every change.
 */
function renderResetButton() {
  let isArmed = false;
  let disarmTimer = null;

  const button = h('button', { type: 'button', class: 'button button--quiet' }, icon('reset', 16), ' Reset demo');

  button.addEventListener('click', () => {
    if (!isArmed) {
      isArmed = true;
      button.textContent = 'Click again to reset';
      button.classList.add('button--danger');
      disarmTimer = setTimeout(() => renderSpaceHeader(), RESET_CONFIRM_WINDOW_MS);
      return;
    }
    clearTimeout(disarmTimer);
    resetToDemo();
    showToast('Everything reset to the demo.');
  });

  return button;
}

/** A personal homepage or blog shows the owner's avatar; a group shows its initials. */
function renderBadge(space) {
  if (space.kind === 'personal' || space.kind === 'blog') {
    const owner = getMember(space.memberIds[0]) ?? getCurrentUser();
    return h('div', {
      class: 'space-header__badge space-header__badge--personal',
      style: owner.photo ? { backgroundColor: owner.color, backgroundImage: `url("${owner.photo}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: owner.color },
      'aria-hidden': 'true',
    }, owner.photo ? null : owner.initials);
  }
  return h('div', { class: 'space-header__badge', 'aria-hidden': 'true' }, groupInitials(space.name));
}

/** " · ● 2 online" — hover (or focus) for who. */
function renderOnlineCount(space) {
  const online = onlineMemberIds(space).map(getMember).filter(Boolean);
  // Just you? That's not news.
  if (!online.some((m) => m.id !== getCurrentUser().id)) return null;
  const names = online.map((m) => (m.id === getCurrentUser().id ? 'you' : m.name)).join(', ');
  return h('span', { class: 'online-count', tabindex: '0', title: `Online now: ${names}`, 'aria-label': `${online.length} online now: ${names}` },
    ' · ', h('span', { class: 'online-dot', 'aria-hidden': 'true' }), ` ${online.length} online`);
}

function describeSpace(space, me) {
  if (space.kind === 'personal') return 'Only you can see this page';
  if (space.kind === 'blog') {
    const owner = getMember(space.memberIds[0]);
    // The globe before it already says "public"; hovering says so in words.
    const followers = followerCount({ kind: 'person', id: owner?.id });
    return `@${owner?.username}${followers ? ` · ${followersLabel({ kind: 'person', id: owner?.id })}` : ''}`;
  }
  // Groups: how many people, and followers once there are some. Who can see
  // it is the icon; how to join is the button (or nothing); your role is in Settings.
  const count = getSpaceMembers(space).length;
  const followers = followerCount({ kind: 'space', id: space.id });
  const label = `${count} ${count === 1 ? 'member' : 'members'}`;
  // Members can open the directory (directory-page.js) from the count.
  const people = space.memberIds.includes(me.id) && !me.isGuest
    ? h('a', { class: 'space-header__members-link', href: `#directory-${space.id}`, title: 'See who’s in the group' }, label) : label;
  return [people, followers ? ` · ${followersLabel({ kind: 'space', id: space.id })}` : ''];
}
