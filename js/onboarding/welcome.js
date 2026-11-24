// @ts-check
/**
 * welcome.js — two one-time moments for new people.
 *
 * 1. The welcome splash — for someone who signed up without a link (no
 *    event, group or blog behind them), the first time they land: two
 *    seconds of "Welcome to 3den" and an apple tree, fading to their
 *    homepage (welcome-splash.js). It replaced "What brought you here?" on
 *    Nov 15; starting a group and Explore are a tap away on the homepage.
 *
 * 2. "Start your blog?" — when someone without a blog opens their own blog
 *    (the Blog tab, or My blog). "Start my blog" makes it; "Not now" goes
 *    to the Feed. A blog is always their choice, but the Feed and friends
 *    aren't behind it: everyone has those from the start (Nov 22; until
 *    then the first visit to the Feed asked "Dive into 3den?" first).
 *
 *   needsWelcomeSplash()          → show the splash over the homepage?
 *   welcomeOnce()                 marks it seen and shows it
 *   needsBlogWelcome(route)       → show question 2 instead of the page?
 *   renderBlogWelcome(container, route)
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { showToast } from '../ui/toast.js';
import { getCurrentUser, getBlogOf, changeState } from '../state/store.js';
import { createStarterBlog } from '../data/starters.js';
import { goTo } from '../router.js';
import { getOnboarding, updateOnboarding } from './onboarding-state.js';
import { showWelcomeSplash } from './welcome-splash.js';

// ─── 1. A new account's first look: the welcome splash ─────────────────────

/** Someone who signed up with no link behind them, the first time they land: the welcome splash (welcome-splash.js). */
export function needsWelcomeSplash() {
  const record = getOnboarding();
  return Boolean(record && record.source === 'direct' && !record.answered);
}

/** Show it once: it's marked seen, and the homepage draws under it. */
export function welcomeOnce() {
  updateOnboarding({ answered: true });
  showWelcomeSplash();
}

// ─── 2. Dive into 3den? (the Blog tab) ──────────────────────────────────────

/** Is this the person's own blog address? */
const isOwnBlogRoute = (route, me) => route.blogUsername === me.username;

export function needsBlogWelcome(route) {
  const me = getCurrentUser();
  if (!me || me.isGuest || getBlogOf(me.id)) return false;
  return isOwnBlogRoute(route, me); // My blog, before there is one (the Feed opens as is)
}

export function renderBlogWelcome(container, route) {
  const me = getCurrentUser();

  const yes = () => {
    changeState((state) => state.spaces.push(createStarterBlog(me.id, me.name)), 'space');
    updateOnboarding({ blogWelcome: 'yes' });
    showToast('Your blog is ready.');
    window.dispatchEvent(new HashChangeEvent('hashchange')); // their blog, now that there is one
  };
  const later = () => {
    updateOnboarding({ blogWelcome: 'later' });
    goTo('#feed');
  };

  replaceChildren(container, h('div', { class: 'welcome welcome--blog' },
    h('h1', { class: 'welcome__title' }, 'Start your blog?'),
    h('p', { class: 'welcome__lede' }, 'A page of your own for photos and updates. Your Feed and friends work either way.'),
    h('ul', { class: 'welcome__points' },
      h('li', {}, icon('image', 16), ' Post photos and updates on your own blog'),
      h('li', {}, icon('people', 16), ' Your friends see your posts in their Feed'),
      h('li', {}, icon('heart', 16), ' Turn it off any time in Account settings')),
    h('div', { class: 'form-row' },
      h('button', { type: 'button', class: 'button button--primary', onClick: yes }, 'Start my blog'),
      h('button', { type: 'button', class: 'button button--quiet', onClick: later }, 'Not now')),
    h('p', { class: 'welcome__note' }, 'Your blog is public: anyone with the link can read it. You choose who can comment.')));
}
