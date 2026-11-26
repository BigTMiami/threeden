// @ts-check
/**
 * relationship-module.js — the Relationship map module: who is connected
 * to whom, and how (like LittleSis's Oligrapher). It replaced the Power map.
 *
 * Files in this folder:
 *   relationship-module.js   ← this file: the module definition, card and full page
 *   relationship-editor.js   the editor: toolbar, map, side panel (also used for vault maps)
 *   relationship-canvas.js   draws the map; dragging, panning, zooming, connecting
 *   relationship-data.js     the data shape, sizes and colors, helpers
 *
 * Data shape: { description, nodes, edges, captions }, see relationship-data.js.
 */

import { h } from '../../ui/dom.js';
import { sourceLabel } from '../../ui/source-tag.js';
import { createRelationshipCanvas } from './relationship-canvas.js';
import { renderRelationshipEditor } from './relationship-editor.js';
import { createEmptyMap, normalizeMap } from './relationship-data.js';

export const relationshipModule = {
  type: 'relationship',
  label: 'Relationship map',
  description: 'Who is connected to whom, and how',
  icon: 'relationship',
  defaultSpan: 6,
  defaultRows: 14,
  available: true,

  createInitialData: createEmptyMap,
  render: renderRelationshipCard,
  renderFullPage: (container, context) => renderRelationshipEditor(container, {
    getMap: context.getData,
    saveMap: context.saveData,
    members: context.members,
    getMember: context.getMember,
    focusId: context.takeFocusRequest(),
  }),

  // People and organizations you keep in touch with for a group also show
  // under your own relationship map (see linked-items.js).
  assignments: {
    items: (data) => data.nodes ?? [],
    isAssignedTo: (node, memberId) => node.contactId === memberId,
    describe: (node) => node.description ?? '',
  },
};

/** The homepage card: the whole map, fitted to the card. Click someone to open them full page. */
function renderRelationshipCard(container, context) {
  const map = normalizeMap(context.getData());
  const canvas = createRelationshipCanvas({
    editable: false,
    onSelect: (selection) => context.openFullPage(selection?.type === 'node' ? selection.id : undefined),
    label: 'Relationship map. Open the full page to edit it.',
  });

  const links = context.getLinkedItems();
  container.append(h('div', { class: 'relmap-card' },
    map.description ? h('p', { class: 'relmap-card__description' }, map.description) : null,
    map.nodes.length
      ? canvas.element
      : h('p', { class: 'module-empty' }, 'No one on the map yet. ', h('button', { type: 'button', class: 'link-button', onClick: () => context.openFullPage() }, 'Open the full page'), ' to add people and organizations and connect them.'),
    links.length ? h('section', { class: 'relmap-linked' },
      h('h3', { class: 'linked-heading' }, 'You keep in touch with, for your groups'),
      h('ul', { class: 'relmap-linked__list' }, links.map((link) => h('li', {},
        h('button', { type: 'button', class: 'relmap-linked__row', onClick: () => context.openLinkedItem(link) },
          h('span', { class: 'relmap-linked__name' }, link.item.name),
          link.status ? h('span', { class: 'relmap-linked__details' }, link.status) : null,
          sourceLabel(link)))))) : null,
  ));
  canvas.draw(map, null);
  return () => canvas.destroy();
}
