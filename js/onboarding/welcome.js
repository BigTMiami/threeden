// @ts-check
/**
 * welcome.js — two one-time moments for new people.
 *
 * 1. The welcome splash — for someone who signed up without a link (no
 *    event, group or blog behind them), the first time they land: two
 *    seconds of "Welcome back to 3den" and an apple tree, fading to their
 *    homepage (welcome-splash.js). It replaced "What brought you here?" on
 *    Nov 15; starting a group and Explore are a tap away on the homepage.
 *
 * 2. "Dive into 3den?" — the first time someone without a blog opens the
 *    Blog tab. "Yes, set me up" makes their blog and opens their Feed;
 *    "Not now" shows the Feed as usual. Their own blog's address
 *    (My blog) keeps offering "Start your blog" until they do.
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
  if (isOwnBlogRoute(route, me)) return true; // My blog, before there is one
  if (route.page !== 'feed') return false;
  return getOnboarding()?.blogWelcome !== 'later';
}

export function renderBlogWelcome(container, route) {
  const me = getCurrentUser();
  const askedBefore = getOnboarding()?.blogWelcome === 'later' || isOwnBlogRoute(route, me);

  const yes = () => {
    changeState((state) => state.spaces.push(createStarterBlog(me.id, me.name)), 'space');
    updateOnboarding({ blogWelcome: 'yes' });
    showToast('Your blog is ready.');
    // The Feed itself (Nov 15): Friends is one tap away there.
    if (route.page === 'feed' && route.tab === 'feed') window.dispatchEvent(new HashChangeEvent('hashchange'));
    else goTo('#feed');
  };
  const later = () => {
    updateOnboarding({ blogWelcome: 'later' });
    if (route.page === 'feed') window.dispatchEvent(new HashChangeEvent('hashchange'));
    else goTo('#feed');
  };

  replaceChildren(container, h('div', { class: 'welcome welcome--blog' },
    h('h1', { class: 'welcome__title' }, askedBefore ? 'Start your blog' : 'Dive into 3den?'),
    h('p', { class: 'welcome__lede' }, 'Your blog, your friends, and your Feed live here.'),
    h('ul', { class: 'welcome__points' },
      h('li', {}, icon('image', 16), ' Post photos and updates on your own blog'),
      h('li', {}, icon('people', 16), ' Add friends: you see each other’s posts'),
      h('li', {}, icon('heart', 16), ' Your Feed shows what’s new from them, and from your groups')),
    h('div', { class: 'form-row' },
      h('button', { type: 'button', class: 'button button--primary', onClick: yes }, askedBefore ? 'Start my blog' : 'Yes, set me up'),
      askedBefore
        ? h('a', { class: 'button button--quiet', href: '#feed' }, 'Back to the Feed')
        : h('button', { type: 'button', class: 'button button--quiet', onClick: later }, 'Not now')),
    h('p', { class: 'welcome__note' }, 'Your blog is public: anyone with the link can read it. You choose who can comment.')));
}
