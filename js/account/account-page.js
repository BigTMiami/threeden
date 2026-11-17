// @ts-check
/**
 * account-page.js — your account settings (#account).
 *
 *   Account settings
 *   ── Profile ──────────  photo color, name, @username, email, bio   [Save]
 *   ── Your feed ────────  blogs on/off, who and what you see, order (js/feed/)
 *   ── Notifications ────  on this device and by email (notification-settings.js)
 *   ── Instagram ────────  connect, sync, find people (instagram-connect.js)
 *   ── Password ─────────  current + new password                    [Save]
 *   ── Your groups ──────  each group, your role, link to its settings
 *   ── Sign out / Delete account
 */

import { renderChildrenSection } from './child-account.js';
import { renderAreaMap } from '../ui/area-map.js';
import { renderInstagramSection } from './instagram-connect.js';
import { renderNotificationSection } from './notification-settings.js';
import { areaOf } from '../state/events.js';
import { FEATURES, uses, setUses } from '../state/features.js';
import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { avatar, readAvatarPhoto } from '../ui/avatar.js';
import { showToast } from '../ui/toast.js';
import { getCurrentUser, getVisibleSpaces, getPersonalSpace, getMember } from '../state/store.js';
import { blockedBy, mutedBy, setBlocked, setMuted } from '../state/blocks.js';
import { renderPrivacyCheckup } from './privacy-checkup.js';
import { roleOf, roleLabel } from '../state/permissions.js';
import {
  AVATAR_COLORS, usernameProblem, emailProblem, initialsFor, updateProfile, setPassword, signOut,
  groupsOwnedBy, deleteAccount, exportAccountData,
} from '../state/accounts.js';
import { hashPassword, checkPassword, passwordProblem } from './password.js';
import { goTo, settingsHref, spaceHref, getRoute } from '../router.js';
import { renderFeedSettingsSection } from '../feed/feed-settings-panel.js';
import { renderBlogSettingsSection } from './blog-settings-section.js';
import { THEMES, themeOf, setTheme } from '../ui/themes.js';
import { renderCalendarsSection } from './calendars-section.js';
import { renderCalendarFeedSection } from './calendar-feed-section.js';

/**
 * Account settings come in sections, one at a time, with tabs across the
 * top (#account-<section>). The older links to one setting (#account-feed,
 * #account-location, …) open its section and scroll to it.
 */
/** Ideas for "I can help with" (any words work). */
const HELP_IDEAS = ['driving', 'cooking', 'childcare', 'moving', 'translation', 'Spanish', 'spreadsheets', 'design', 'flyers', 'photos', 'tech help', 'legal questions', 'public speaking', 'first aid', 'carpentry', 'gardening'];

export const ACCOUNT_SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'calendars', label: 'Calendars' },
  { id: 'look', label: 'Theme' },
  { id: 'feed', label: 'Feed and blog' },
  { id: 'groups', label: 'Groups' },
  { id: 'children', label: 'Children' }, // child accounts you look after (child-account.js); a child sees "Family"
];
/** Which section each older link lands in. */
const SECTION_OF = { parts: 'feed', blog: 'feed', instagram: 'feed', location: 'privacy', blocked: 'privacy', data: 'privacy', theme: 'look', texts: 'notifications' };
export const accountSectionOf = (tab) => (ACCOUNT_SECTIONS.some((s) => s.id === tab) ? tab : SECTION_OF[tab] ?? 'profile');

export function renderAccountPage(container) {
  const user = getCurrentUser();
  if (!user) return;
  const section = accountSectionOf(getRoute().tab);
  const redraw = () => redrawKeepingScroll(container);
  const social = !user.quick && uses(user, 'blogs');

  const sections = {
    profile: () => [user.quick ? renderQuickAccountSection(user) : null, renderProfileSection(user, container), user.quick ? null : renderPasswordSection(user), renderSignOutSection()],
    privacy: () => [user.quick ? null : renderPrivacyCheckup(user), renderLocationSection(user, redraw), renderBlockedSection(user, redraw), renderDataSection(user), renderDeleteSection(user)],
    notifications: () => [renderNotificationSection(user, redraw), user.phone ? renderTextsSection(user, redraw) : null],
    calendars: () => [renderCalendarFeedSection(user, redraw), renderCalendarsSection(user, redraw)],
    look: () => [renderThemeSection(user, redraw)],
    feed: () => [renderFeaturesSection(user, redraw), social ? renderFeedSettingsSection(user, redraw) : null, social ? renderBlogSettingsSection(user, redraw) : null, social ? renderInstagramSection(user, redraw) : null],
    groups: () => [renderGroupsSection(user)],
    children: () => [renderChildrenSection(user, redraw)],
  };

  replaceChildren(container,
    h('header', { class: 'settings-page__header account-page__header' },
      h('h1', { class: 'settings-page__title' }, 'Account settings'),
      h('p', { class: 'settings-page__subtitle' }, `Signed in as ${user.name} (@${user.username})`),
    ),
    h('nav', { class: 'settings-tabs account-tabs', 'aria-label': 'Account settings' }, ACCOUNT_SECTIONS.map((s) => h('a', {
      href: s.id === 'profile' ? '#account' : `#account-${s.id}`,
      class: `settings-tabs__tab${s.id === section ? ' is-active' : ''}`,
      'aria-current': s.id === section ? 'page' : null,
    }, s.id === 'children' && user.child ? 'Family' : s.label))),
    sections[section](),
  );
}

/**
 * Theme: how all of 3den looks to you (js/ui/themes.js). Daylight is
 * the default. Each card is a small preview in that theme's own colors;
 * picking one changes the page right away. Groups with a look of their own
 * keep it unless you tick the box.
 */
function renderThemeSection(user, redraw) {
  const current = themeOf(user);
  return h('section', { class: 'settings-section', id: 'theme-settings' },
    h('h2', { class: 'settings-section__title' }, 'Theme'),
    h('p', { class: 'settings-section__description' }, 'How 3den looks to you, everywhere: your homepage, groups, and blogs. Only you see your theme.'),
    h('div', { class: 'theme-picker', role: 'radiogroup', 'aria-label': 'Theme' }, THEMES.map((theme) => {
      const [page, surface, accent, text] = theme.swatch;
      const isActive = theme.id === current;
      return h('button', {
        type: 'button',
        class: `theme-card${isActive ? ' is-active' : ''}`,
        role: 'radio',
        'aria-checked': String(isActive),
        onClick: () => { setTheme(user.id, theme.id); redraw(); },
      },
        h('span', { class: 'theme-card__preview', 'aria-hidden': 'true', style: { background: theme.id === 'auto' ? `linear-gradient(135deg, ${page} 50%, #0f1729 50%)` : page } },
          h('span', { class: 'theme-card__bar', style: { color: text === '#e6ebf5' && theme.id === 'auto' ? '#202122' : text } }, '3den', h('span', { class: 'theme-card__dot', style: { background: accent } })),
          h('span', { class: 'theme-card__panel', style: { background: surface, border: `1px solid ${theme.id === 'contrast' ? text : 'rgba(127,127,127,0.25)'}` } },
            h('span', { class: 'theme-card__line', style: { width: '70%', background: text, opacity: 0.85 } }),
            h('span', { class: 'theme-card__line', style: { width: '90%', background: text, opacity: 0.35 } }),
            h('span', { class: 'theme-card__line', style: { width: '40%', background: accent } }))),
        h('span', { class: 'theme-card__name' }, theme.label, isActive ? h('span', { class: 'settings-field__hint' }, '· On') : null),
        h('span', { class: 'theme-card__description' }, theme.description));
    })),
  );
}

function redrawKeepingScroll(container) {
  const scroll = window.scrollY;
  renderAccountPage(container);
  window.scrollTo(0, scroll);
}

// ─── Blocked and muted (blocks.js) ──────────────────────────────────────────

function renderBlockedSection(user, redraw) {
  const row = (id, kind) => {
    const person = getMember(id);
    if (!person) return null;
    return h('li', { class: 'blocked-list__row' }, avatar(person, 28), h('span', { class: 'blocked-list__name' }, person.name, h('span', { class: 'settings-field__hint' }, kind === 'blocked' ? ' Blocked' : ' Muted')),
      h('button', {
        type: 'button', class: 'button button--small',
        onClick: () => { if (kind === 'blocked') setBlocked(user.id, id, false); else setMuted(user.id, id, false); showToast(`${kind === 'blocked' ? 'Unblocked' : 'Unmuted'} ${person.name}.`); redraw(); },
      }, kind === 'blocked' ? 'Unblock' : 'Unmute'));
  };
  const blocked = blockedBy(user.id);
  const muted = mutedBy(user.id).filter((id) => !blocked.includes(id));
  return h('section', { class: 'settings-section', id: 'blocked-settings' },
    h('h2', { class: 'settings-section__title' }, 'Blocked and muted'),
    blocked.length || muted.length
      ? h('ul', { class: 'blocked-list' }, blocked.map((id) => row(id, 'blocked')), muted.map((id) => row(id, 'muted')))
      : h('p', { class: 'settings-section__description' }, 'Nobody. To mute or block someone, use the … on one of their posts or on their blog. They aren’t told.'));
}

function section(title, description, ...children) {
  return h('section', { class: 'settings-section' },
    h('h2', { class: 'settings-section__title' }, title),
    description ? h('p', { class: 'settings-section__description' }, description) : null,
    ...children,
  );
}

function field(labelText, control, hint = null) {
  return h('label', { class: 'settings-field' },
    h('span', { class: 'settings-field__label' }, labelText),
    control,
    hint ? (typeof hint === 'string' ? h('span', { class: 'settings-field__hint' }, hint) : hint) : null,
  );
}

// ─── Profile ─────────────────────────────────────────────────────────────────

function renderProfileSection(user, pageContainer) {
  let color = user.color;
  let photo = user.photo ?? null;
  let pictureOpen = false; // the small button by the avatar opens the picture options

  const nameInput = h('input', { type: 'text', class: 'input', value: user.name, 'aria-label': 'Display name' });
  const usernameInput = h('input', { type: 'text', class: 'input', value: user.username, spellcheck: 'false', 'aria-label': 'Username' });
  const emailInput = h('input', { type: 'email', class: 'input', value: user.email ?? '', 'aria-label': 'Email' });
  const bioInput = h('textarea', { class: 'input', rows: '3', placeholder: 'A line about you, shown to people in your groups', 'aria-label': 'About you' });
  // "I can help with…": a few words, comma separated. Organizers can search for them (member directory).
  const helpInput = h('input', { type: 'text', class: 'input', value: (user.helpWith ?? []).join(', '), placeholder: 'driving, Spanish, spreadsheets, cooking for a crowd', 'aria-label': 'I can help with', list: 'help-with-ideas' });
  const helpIdeas = h('datalist', { id: 'help-with-ideas' }, HELP_IDEAS.map((idea) => h('option', { value: idea })));
  bioInput.value = user.bio ?? '';
  const preview = h('div', { class: 'account-preview' });
  const picturePanel = h('div', { class: 'avatar-editor', id: 'avatar-editor' });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const photoInput = h('input', {
    type: 'file', accept: 'image/*', hidden: true,
    onChange: async () => {
      const [file] = photoInput.files;
      photoInput.value = '';
      if (!file) return;
      try {
        photo = await readAvatarPhoto(file);
        drawPreview();
        showToast('Looks good. Press Save profile to keep it.');
      } catch (problem) {
        showToast(problem.message);
      }
    },
  });

  function drawPreview() {
    const name = nameInput.value.trim() || user.name;
    replaceChildren(preview,
      h('span', { class: 'account-preview__avatar' },
        avatar({ ...user, name, initials: initialsFor(name), color, photo }, 56),
        h('button', {
          type: 'button', class: 'account-preview__edit',
          'aria-label': 'Change your picture', title: 'Change your picture',
          'aria-expanded': String(pictureOpen), 'aria-controls': 'avatar-editor',
          onClick: () => { pictureOpen = !pictureOpen; drawPreview(); },
        }, icon('pencil', 12))),
      h('span', { class: 'account-preview__text' },
        h('strong', {}, name),
        h('span', {}, `@${usernameInput.value || user.username}`)),
    );
    // The picture options: a photo, or (without one) the color behind your initials.
    picturePanel.hidden = !pictureOpen;
    replaceChildren(picturePanel,
      h('div', { class: 'form-row avatar-editor__photo' },
        h('button', { type: 'button', class: 'button button--small', onClick: () => photoInput.click() },
          icon('upload', 14), photo ? ' Upload a different photo' : ' Upload a photo'),
        photo ? h('button', { type: 'button', class: 'link-button link-button--danger', onClick: () => { photo = null; drawPreview(); } }, 'Remove photo') : null,
        photoInput),
      h('div', { class: 'avatar-editor__colors' },
        h('span', { class: 'settings-field__hint' }, photo ? 'Color behind your photo while it loads' : 'Or a color for your initials'),
        h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Avatar color' }, AVATAR_COLORS.map((swatch) => h('button', {
          type: 'button',
          class: `swatch swatch--small${swatch.toLowerCase() === color.toLowerCase() ? ' is-selected' : ''}`,
          style: { background: swatch },
          role: 'radio',
          'aria-checked': String(swatch.toLowerCase() === color.toLowerCase()),
          'aria-label': `Color ${swatch}`,
          onClick: () => { color = swatch; drawPreview(); },
        })))));
  }

  nameInput.addEventListener('input', drawPreview);
  usernameInput.addEventListener('input', () => {
    usernameInput.value = usernameInput.value.toLowerCase().replace(/^@/, '');
    drawPreview();
  });

  const form = h('form', {
    class: 'settings-form',
    onSubmit: (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const username = usernameInput.value.trim();
      const email = emailInput.value.trim();
      // Email can be left empty by people who signed up with a phone number.
      const emailCheck = email ? emailProblem(email, user.id) : (user.phone ? '' : 'Add an email address.');
      const problem = (!name && 'Your name can’t be empty.') || usernameProblem(username, user.id) || emailCheck;
      if (problem) {
        error.textContent = problem;
        return;
      }
      error.textContent = '';
      const helpWith = [...new Set(helpInput.value.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 12);
      updateProfile(user.id, { name, username, email: email || null, bio: bioInput.value.trim(), helpWith, color, photo });
      showToast('Profile saved.');
      renderAccountPage(pageContainer); // the header shows the new name
    },
  },
    preview,
    picturePanel,
    field('Display name', nameInput, 'How your name appears to others.'),
    field('Username', usernameInput, 'People mention you with @username. Lowercase letters, numbers, dots, and underscores.'),
    field('Email', emailInput, user.phone ? `Optional. You signed up with ${user.phone}.` : null),
    field('About you', bioInput),
    field('I can help with', h('span', {}, helpInput, helpIdeas), 'A few words, with commas. People in your groups see them in the member directory, and organizers can look for them.'),
    error,
    h('div', { class: 'form-row' }, h('button', { type: 'submit', class: 'button button--primary' }, 'Save profile')),
  );

  drawPreview();
  return section('Profile', null, form);
}

// ─── Parts of 3den you use ───────────────────────────────────────────────────

/** Blogs (and the Feed), groups, and messages: tick the ones you use. */
function renderFeaturesSection(user, redraw) {
  return h('section', { class: 'settings-section', id: 'parts-settings' },
    h('h2', { class: 'settings-section__title' }, 'Parts of 3den you use'),
    h('p', { class: 'settings-section__description' }, 'Use only what you need. Your homepage is always there, and turning a part off hides it without deleting anything.'),
    h('div', { class: 'settings-choices' }, FEATURES.map((feature) => {
      const isOn = uses(user, feature.id);
      return h('label', { class: 'settings-choice' },
        h('input', {
          type: 'checkbox',
          checked: isOn,
          onChange: (event) => {
            setUses(user.id, feature.id, event.target.checked);
            showToast(event.target.checked ? `${feature.label} ${feature.id === 'blogs' ? 'are' : 'is'} back on.` : `${feature.label} turned off. Turn ${feature.id === 'blogs' ? 'them' : 'it'} back on here any time.`);
            redraw();
          },
        }),
        h('span', {}, h('strong', {}, feature.label), h('span', { class: 'settings-field__hint' }, isOn ? feature.on : `Off. ${feature.off}`)));
    })));
}

// ─── Your area ───────────────────────────────────────────────────────────────

/**
 * Where you are, and how far you'd go: Explore shows public events within
 * this distance (js/groups/groups-page.js). Only you see it.
 * Saved as member.location = { placeId | lat, lng, label, radiusMiles }.
 */
function renderLocationSection(user, redraw) {
  const area = areaOf(user);
  return h('section', { class: 'settings-section', id: 'location-settings' },
    h('h2', { class: 'settings-section__title' }, 'Your area'),
    h('p', { class: 'settings-section__description' }, area
      ? `Explore shows public events within ${area.radiusMiles ?? 5} miles of ${area.label.replace(/^Near /, '')}. Only you see this.`
      : 'Set a rough area to explore events near you. Only you see it.'),
    renderAreaMap({
      initial: area ? { ...area.point, radiusMiles: area.radiusMiles ?? 5 } : null,
      saveLabel: area ? 'Save changes' : 'Save my area',
      onSave: (location) => {
        updateProfile(user.id, { location: { placeId: null, ...location } });
        showToast('Saved. Explore now shows events near you.');
        redraw();
      },
    }));
}

// ─── Quick accounts and texts ────────────────────────────────────────────────

/** A quick account (made answering an event): what it can do, and the way to a full one. */
function renderQuickAccountSection(user) {
  return section('You have a quick account',
    `You answered an event with ${user.phone ? 'your phone number' : 'your email'}, so you can use your homepage, events, and messages. Groups and blogs need a full account: a username and a password.`,
    h('a', { class: 'button button--primary', href: '#finish-account' }, 'Make my full account'));
}

/** People who gave a phone number can have notifications texted to them too. */
function renderTextsSection(user, redraw) {
  const toggle = h('input', {
    type: 'checkbox',
    checked: Boolean(user.textNotifications),
    onChange: (event) => {
      updateProfile(user.id, { textNotifications: event.target.checked });
      showToast(event.target.checked ? `We’ll text ${user.phone} too.` : 'No more texts.');
      redraw();
    },
  });
  return section('Text notifications', `Get your notifications by text at ${user.phone}, as well as in 3den.`,
    h('label', { class: 'settings-choice' }, toggle, h('span', {}, 'Text me my notifications (event changes, invitations, mentions)')),
    h('p', { class: 'settings-field__hint' }, 'Prototype: nothing is really sent. Notifications that would be texted say so in the bell.'));
}

// ─── Password ────────────────────────────────────────────────────────────────

function renderPasswordSection(user) {
  const hasPassword = Boolean(user.password);
  const currentInput = h('input', { type: 'password', class: 'input', autocomplete: 'current-password', 'aria-label': 'Current password' });
  const newInput = h('input', { type: 'password', class: 'input', autocomplete: 'new-password', 'aria-label': 'New password' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  const form = h('form', {
    class: 'settings-form',
    onSubmit: async (event) => {
      event.preventDefault();
      if (hasPassword && !(await checkPassword(currentInput.value, user.password))) {
        error.textContent = 'Your current password isn’t right.';
        return;
      }
      const problem = passwordProblem(newInput.value);
      if (problem) {
        error.textContent = problem;
        return;
      }
      setPassword(user.id, await hashPassword(newInput.value));
      form.reset();
      error.textContent = '';
      showToast(hasPassword ? 'Password changed.' : 'Password set. You’ll need it to sign in from now on.');
    },
  },
    hasPassword ? field('Current password', currentInput) : null,
    field(hasPassword ? 'New password' : 'Choose a password', newInput, 'At least 8 characters.'),
    error,
    h('div', { class: 'form-row' }, h('button', { type: 'submit', class: 'button' }, hasPassword ? 'Change password' : 'Set password')),
  );

  return section('Password',
    hasPassword ? null : 'This is a demo account with no password, so anyone using this browser can sign in as it.',
    form);
}

// ─── Groups ──────────────────────────────────────────────────────────────────

function renderGroupsSection(user) {
  const groups = getVisibleSpaces().filter((space) => space.kind === 'group');
  const personal = getPersonalSpace();

  return section('Your groups', null,
    groups.length
      ? h('ul', { class: 'settings-list' }, groups.map((group) => h('li', { class: 'settings-list__row' },
          h('a', { href: spaceHref(group.id), class: 'settings-list__name' }, group.name),
          h('span', { class: 'settings-list__meta' }, roleLabel(roleOf(group, user.id))),
          h('a', { href: settingsHref(group.id), class: 'settings-list__action' }, 'Group settings'),
        )))
      : h('p', { class: 'module-empty' }, 'You’re not in any groups yet.'),
    h('div', { class: 'form-row' },
      h('a', { class: 'button', href: '#new-group' }, icon('plus', 14), ' Create a group'),
      personal ? h('a', { class: 'button button--quiet', href: settingsHref(personal.id, 'appearance') }, 'Customize my homepage') : null,
    ),
  );
}

// ─── Sign out and delete ─────────────────────────────────────────────────────

function renderSignOutSection() {
  return section('Sign out', null,
    h('button', {
      type: 'button',
      class: 'button',
      onClick: () => {
        signOut();
        goTo('#signin');
        showToast('Signed out.');
      },
    }, 'Sign out'),
  );
}

/** Download everything 3den keeps about you, as one file (exportAccountData). */
function renderDataSection(user) {
  return h('section', { class: 'settings-section', id: 'data-settings' },
    h('h2', { class: 'settings-section__title' }, 'Your data'),
    h('p', { class: 'settings-section__description' }, 'Everything 3den keeps about you in one file: your account, homepage, blog, groups, messages, and everything you’ve posted or answered.'),
    h('button', {
      type: 'button', class: 'button',
      onClick: () => {
        const data = exportAccountData(user.id);
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const link = h('a', { href: url, download: `3den-${user.username}-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Downloading your data.');
      },
    }, icon('download', 14), ' Download my data'));
}

function renderDeleteSection(user) {
  const owned = groupsOwnedBy(user.id);
  if (owned.length) {
    return section('Delete account',
      `You own ${owned.map((g) => g.name).join(', ')}. Hand ${owned.length === 1 ? 'it' : 'them'} to someone else (or delete ${owned.length === 1 ? 'it' : 'them'}) in group settings before deleting your account.`);
  }

  const confirmInput = h('input', { type: 'text', class: 'input', placeholder: user.username, 'aria-label': 'Type your username to confirm' });
  const button = h('button', { type: 'button', class: 'button button--danger', disabled: true }, 'Delete my account');
  confirmInput.addEventListener('input', () => { button.disabled = confirmInput.value.trim() !== user.username; });
  const alsoPosts = h('input', { type: 'checkbox' });
  button.addEventListener('click', () => {
    if (deleteAccount(user.id, { deletePosts: alsoPosts.checked })) {
      goTo('#signin');
      showToast('Your account was deleted.');
    }
  });

  return section('Delete account',
    'You’ll leave all your groups, and your homepage and blog will be deleted. This can’t be undone, so download your data first if you want a copy.',
    h('label', { class: 'settings-check' }, alsoPosts, ' Also delete everything I posted in groups, and the messages I sent', h('span', { class: 'settings-field__hint' }, ' Otherwise they stay, shown as from a former member.')),
    field(`Type ${user.username} to confirm`, confirmInput),
    h('div', { class: 'form-row' }, button),
  );
}
