// @ts-check
/**
 * forum-module.js — the Forum module: threads with tags, votes and replies.
 *
 * Files in this folder:
 *   forum-module.js  ← this file: the module definition
 *   forum-card.js    the homepage card (sort, filter, vote, start a thread)
 *   forum-page.js    the full page (tags, search, threaded replies, editing, pin/lock)
 *   forum-parts.js   votes, bylines and flags (used by both)
 *   forum-data.js    thread and reply shapes, ranking, and the reply tree
 *
 * Data shape: { tags: [...], threads: [...] }, see forum-data.js.
 */

import { renderForumCard } from './forum-card.js';
import { renderForumPage } from './forum-page.js';
import { DEFAULT_TAGS } from './forum-data.js';

export const forumModule = {
  type: 'forum',
  label: 'Forum',
  description: 'Threads with upvotes and replies',
  icon: 'forum',
  defaultSpan: 7,
  defaultRows: 13,
  available: true,

  createInitialData() {
    return { tags: [...DEFAULT_TAGS], threads: [] };
  },

  render: renderForumCard,
  renderFullPage: renderForumPage,
};
