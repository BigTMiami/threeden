// @ts-check
/**
 * copy-layout.js — "Copy this page's layout" in the Layouts menu (Nov 18).
 *
 * The prototype saves everything in this browser only, so a page someone
 * arranges (a group they set up just so) can't be seen from anywhere else.
 * This writes the page's shape as text: its tabs, each tab's layout, and
 * every module in order with its type, title, size, tab, and settings (but
 * not what people wrote in it: lists are emptied and long text is left
 * out). It opens in a box with Copy, ready to paste into a message or an
 * issue, so the layout can become a template or sample data.
 *
 *   openCopyLayout()   for the current space
 */

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { getCurrentSpace } from '../state/store.js';

/** A module's settings without its content: arrays empty, long strings and pictures left out. */
function settingsOf(data) {
  if (!data || typeof data !== 'object') return data ?? null;
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) out[key] = value.length && value.every((v) => typeof v === 'string' && v.length < 40) ? value : [];
    else if (typeof value === 'string') { if (value.length <= 120 && !value.startsWith('data:')) out[key] = value; }
    else if (value && typeof value === 'object') out[key] = settingsOf(value);
    else out[key] = value;
  }
  return out;
}

/** The page's shape, as plain data. */
export function layoutOf(space) {
  const tabs = space.tabs?.length ? space.tabs : [{ id: 'home', name: 'Home' }];
  return {
    name: space.name,
    kind: space.kind,
    ...(space.kind === 'group' ? { template: space.template, groupType: space.groupType || undefined, visibility: space.visibility, joining: space.joining } : {}),
    tabs: tabs.map((tab) => ({
      id: tab.id,
      name: tab.name,
      ...(tab.visibility ? { visibility: tab.visibility } : {}),
      layout: space.pageLayouts?.[tab.id] ?? { kind: 'grid' },
      modules: space.modules
        .filter((m) => (m.tabId ?? tabs[0].id) === tab.id)
        .map((m) => ({ id: m.id, type: m.type, title: m.title, span: m.span, rows: m.rows, ...(m.phoneOrder != null ? { phoneOrder: m.phoneOrder } : {}), data: settingsOf(m.data) })),
    })),
  };
}

export function openCopyLayout() {
  const space = getCurrentSpace();
  if (!space) return;
  const text = JSON.stringify(layoutOf(space), null, 2);
  const box = h('textarea', { class: 'input copy-layout__text', rows: '14', readonly: true, spellcheck: 'false', 'aria-label': 'This page’s layout' });
  box.value = text;
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); showToast('Layout copied. Paste it wherever you like.'); modal.close(); }
    catch { box.focus(); box.select(); showToast('Selected. Copy it with your keyboard or the Copy menu.'); }
  };
  const modal = openModal(h('div', { class: 'copy-layout' },
    h('div', { class: 'copy-layout__head' },
      h('h2', { class: 'copy-layout__title' }, `${space.name}: layout`),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => modal.close() }, icon('close', 16))),
    h('p', { class: 'settings-field__hint' }, 'Tabs, layouts, and every module with its size and settings, without what anyone wrote in them. Paste it into a message to share how this page is set up.'),
    box,
    h('div', { class: 'form-row' },
      h('button', { type: 'button', class: 'button button--primary', onClick: copy }, icon('layers', 14), ' Copy'),
      h('button', { type: 'button', class: 'button button--quiet', onClick: () => modal.close() }, 'Close'))),
  { label: 'Copy this page’s layout', className: 'copy-layout-modal' });
  requestAnimationFrame(() => box.select());
}
