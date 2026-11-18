// @ts-check
/**
 * announcements-module.js — the Announcements module: updates for the group.
 *
 * Files in this folder:
 *   announcements-module.js  ← this file: the module definition
 *   announcements-card.js    the homepage card (post, pin, see what's new)
 *   announcements-page.js    the full page (search, filters, comments, seen by, edit)
 *   announcements-data.js    post and comment shapes, sorting and filtering
 *
 * Data shape: { posts: [...] }, see announcements-data.js.
 */

import { renderAnnouncementsCard } from './announcements-card.js';
import { renderAnnouncementsPage } from './announcements-page.js';

export const announcementsModule = {
  type: 'announcements',
  label: 'Announcements',
  description: 'Pinned updates for everyone',
  icon: 'announcements',
  defaultSpan: 8,
  defaultRows: 12,
  available: true,
  // Groups only since Nov 17: not something to add to your own homepage.
  spaceKinds: ['group'],

  createInitialData() {
    return { posts: [] };
  },

  render: renderAnnouncementsCard,
  renderFullPage: renderAnnouncementsPage,
};
