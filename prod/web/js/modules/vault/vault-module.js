// @ts-check
/**
 * vault-module.js — the Vault module: shared folders, notes, links and uploads.
 *
 * Files in this folder:
 *   vault-module.js      ← this file: the module definition
 *   vault-card.js        the homepage card (browse folders, create, open)
 *   vault-page.js        the full page (folder tree, search, sort, grid, move)
 *   vault-actions.js     create / upload / rename / move / delete (used by both)
 *   vault-parts.js       the "+ New" menu, create form, open item (used by both)
 *   vault-item-views.js  an open note (editor) or file (preview)
 *   vault-data.js        the item shape and helpers for reading the item list
 *
 * Data shape: { items: [...] }, see vault-data.js.
 */

import { renderVaultCard } from './vault-card.js';
import { renderVaultPage } from './vault-page.js';

export const vaultModule = {
  type: 'vault',
  label: 'Vault',
  description: 'Files, folders, documents, and links',
  icon: 'vault',
  defaultSpan: 6,
  defaultRows: 11,
  available: true,

  createInitialData() {
    return { items: [] };
  },

  render: renderVaultCard,
  renderFullPage: renderVaultPage,
};
