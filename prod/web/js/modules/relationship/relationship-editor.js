/**
 * relationship-editor.js — the full relationship map editor: toolbar,
 * map, and a side panel for whatever is selected.
 *
 *   [+ Person] [+ Organization] [+ Caption]  [Search…]      [−] [+] [Fit]
 *   ┌ map ──────────────────────────────────────┐ ┌ side panel ──────────┐
 *   │   (Ortiz) ──oversees──▶ [Parks dept]      │ │ selected node:       │
 *   │      ▲                                    │ │  name, description,  │
 *   │      └── donated to ── [Business Assn]    │ │  kind, size, color,  │
 *   │                                           │ │  contact, link,      │
 *   │                                           │ │  notes, connections  │
 *   └───────────────────────────────────────────┘ │ or a connection, a   │
 *                                                 │ caption, or the list │
 *                                                 └──────────────────────┘
 *
 * Used by the Relationship map module's full page, and (with its own
 * getMap/saveMap) by relationship maps saved in the vault. It doesn't know
 * where the map is stored:
 *
 *   renderRelationshipEditor(container, {
 *     getMap: () => …, saveMap: (map) => …,
 *     members, getMember, focusId,
 *   });
 *
 * The map opens fitted to show everyone; `focusId` selects one node
 * (its connections highlighted) without moving the view.
 */

import { h, replaceChildren, debounce } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { avatar } from '../../ui/avatar.js';
import { showToast } from '../../ui/toast.js';
import { createRelationshipCanvas } from './relationship-canvas.js';
import {
  KINDS, SIZES, COLORS, ARROWS, normalizeMap, createNode, createEdge, createCaption, connectionsOf, freeSpotNear, colorOf, describeEdge,
} from './relationship-data.js';

const TEXT_SAVE_DELAY_MS = 350;
const SEARCH_DELAY_MS = 150;
const ZOOM_STEP = 1.25;

/**
 * @param {HTMLElement} container
 * @param {object}   options
 * @param {function} options.getMap      () → the saved map
 * @param {function} options.saveMap     (map) → save it
 * @param {object[]} options.members     people who can be someone's contact
 * @param {function} options.getMember
 * @param {string}   [options.focusId]   a node to select and center on
 * @returns {function} cleanup
 */
export function renderRelationshipEditor(container, { getMap, saveMap, members, getMember, focusId = null }) {
  const view = {
    selection: focusId ? { type: 'node', id: focusId } : null,
    search: '',
  };

  const map = () => normalizeMap(getMap());

  /** Save a change; redraw the map, and the panel too unless typing is going on in it. */
  function update(changeFn, { redrawPanel = true } = {}) {
    const next = map();
    changeFn(next);
    saveMap(next);
    canvas.draw(map(), view.selection);
    if (redrawPanel) drawPanel();
  }

  const updateNode = (id, changes, options) => update((m) => Object.assign(m.nodes.find((n) => n.id === id), changes), options);
  const updateEdge = (id, changes, options) => update((m) => Object.assign(m.edges.find((e) => e.id === id), changes), options);
  const updateCaption = (id, changes, options) => update((m) => Object.assign(m.captions.find((c) => c.id === id), changes), options);

  function select(selection) {
    view.selection = selection;
    canvas.draw(map(), selection);
    drawPanel();
  }

  // ─── Adding and removing ───────────────────────────────────────────────────

  function addNode(kind, at = canvas.visibleCenter()) {
    const spot = freeSpotNear(map(), at.x, at.y);
    const node = createNode({ name: kind === 'organization' ? 'New organization' : 'New person', kind, ...spot });
    update((m) => m.nodes.push(node), { redrawPanel: false });
    select({ type: 'node', id: node.id });
    // Ready to type the name.
    requestAnimationFrame(() => { const input = panel.querySelector('.side-panel__title'); input?.focus(); input?.select(); });
  }

  function addCaption() {
    const center = canvas.visibleCenter();
    const caption = createCaption({ text: 'Caption', x: Math.round(center.x), y: Math.round(center.y) });
    update((m) => m.captions.push(caption), { redrawPanel: false });
    select({ type: 'caption', id: caption.id });
    requestAnimationFrame(() => { const input = panel.querySelector('textarea'); input?.focus(); input?.select(); });
  }

  function connect(fromId, toId) {
    if (fromId === toId) return;
    const edge = createEdge({ from: fromId, to: toId, label: '' });
    update((m) => m.edges.push(edge), { redrawPanel: false });
    select({ type: 'edge', id: edge.id });
    requestAnimationFrame(() => panel.querySelector('.relmap-panel__label-input')?.focus());
  }

  /** Remove the selection, with Undo. */
  function removeSelected() {
    const { selection } = view;
    if (!selection) return;
    const before = structuredClone(getMap());
    const current = map();
    let message = '';
    update((m) => {
      if (selection.type === 'node') {
        message = `Removed “${current.nodes.find((n) => n.id === selection.id)?.name}” and its connections.`;
        m.nodes = m.nodes.filter((n) => n.id !== selection.id);
        m.edges = m.edges.filter((e) => e.from !== selection.id && e.to !== selection.id);
      } else if (selection.type === 'edge') {
        message = 'Removed the connection.';
        m.edges = m.edges.filter((e) => e.id !== selection.id);
      } else {
        message = 'Removed the caption.';
        m.captions = m.captions.filter((c) => c.id !== selection.id);
      }
    }, { redrawPanel: false });
    select(null);
    showToast(message, { actionLabel: 'Undo', onAction: () => { saveMap(before); canvas.draw(map(), view.selection); drawPanel(); } });
  }

  // ─── Toolbar ───────────────────────────────────────────────────────────────

  const searchInput = h('input', {
    type: 'search',
    class: 'input page-search__input',
    placeholder: 'Find on the map',
    'aria-label': 'Find a person or organization on the map',
    onInput: debounce((event) => { view.search = event.target.value; if (!view.selection) drawPanel(); }, SEARCH_DELAY_MS),
    onKeydown: (event) => {
      if (event.key !== 'Enter') return;
      const query = searchInput.value.trim().toLowerCase();
      const match = map().nodes.find((n) => `${n.name} ${n.description}`.toLowerCase().includes(query));
      if (match) { select({ type: 'node', id: match.id }); canvas.centerOn(match.id); }
    },
  });

  const toolbar = h('div', { class: 'page-toolbar relmap-toolbar' },
    h('button', { type: 'button', class: 'button button--small', onClick: () => addNode('person') }, icon('plus', 14), ' Person'),
    h('button', { type: 'button', class: 'button button--small', onClick: () => addNode('organization') }, icon('plus', 14), ' Organization'),
    h('button', { type: 'button', class: 'button button--small button--quiet', onClick: addCaption }, icon('plus', 14), ' Caption'),
    h('label', { class: 'page-search' }, icon('search', 16), searchInput),
    h('span', { class: 'page-toolbar__spacer' }),
    h('div', { class: 'relmap-toolbar__zoom', role: 'group', 'aria-label': 'Zoom' },
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Zoom out', title: 'Zoom out', onClick: () => canvas.zoomBy(1 / ZOOM_STEP) }, '−'),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Zoom in', title: 'Zoom in', onClick: () => canvas.zoomBy(ZOOM_STEP) }, '+'),
      h('button', { type: 'button', class: 'button button--small button--quiet', title: 'Show the whole map', onClick: () => canvas.fit() }, 'Fit')),
  );

  // ─── The map ───────────────────────────────────────────────────────────────

  const canvas = createRelationshipCanvas({
    editable: true,
    onSelect: select,
    onMoveNode: (id, x, y) => updateNode(id, { x, y }, { redrawPanel: false }),
    onMoveCaption: (id, x, y) => updateCaption(id, { x, y }, { redrawPanel: false }),
    onConnect: connect,
    onBackgroundDoubleClick: (x, y) => addNode('person', { x, y }),
  });

  canvas.element.addEventListener('keydown', (event) => {
    if ((event.key === 'Delete' || event.key === 'Backspace') && view.selection) { event.preventDefault(); removeSelected(); }
    if (event.key === 'Escape' && view.selection) select(null);
  });

  // ─── Side panel ────────────────────────────────────────────────────────────

  const panel = h('aside', { class: 'side-panel relmap-panel', 'aria-label': 'Details' });

  function drawPanel() {
    const current = map();
    const { selection } = view;
    const item = selection && current[{ node: 'nodes', edge: 'edges', caption: 'captions' }[selection.type]].find((x) => x.id === selection.id);
    if (!item) { view.selection = null; replaceChildren(panel, renderOverview(current)); return; }
    if (selection.type === 'node') replaceChildren(panel, renderNodePanel(current, item));
    else if (selection.type === 'edge') replaceChildren(panel, renderEdgePanel(current, item));
    else replaceChildren(panel, renderCaptionPanel(item));
  }

  const field = (label, control, wide = false) => h('label', { class: `side-panel__field${wide ? ' side-panel__field--wide' : ''}` },
    h('span', { class: 'side-panel__label' }, label), control);

  const panelTop = (kicker) => h('div', { class: 'side-panel__top' },
    h('span', { class: 'side-panel__kicker' }, kicker),
    h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => select(null) }, icon('close', 16)));

  /** Nothing selected: what the map is about, and everyone on it. */
  function renderOverview(current) {
    const query = view.search.trim().toLowerCase();
    const nodes = current.nodes
      .filter((n) => !query || `${n.name} ${n.description}`.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
    const description = h('textarea', {
      class: 'input side-panel__notes',
      rows: '3',
      placeholder: 'What this map is about, e.g. who decides what happens to the empty lot',
      onInput: debounce((event) => update((m) => { m.description = event.target.value; }, { redrawPanel: false }), TEXT_SAVE_DELAY_MS),
    });
    description.value = current.description;

    return [
      h('span', { class: 'side-panel__kicker' }, 'This map'),
      field('About', description),
      h('p', { class: 'side-panel__hint' },
        'Double-click the map to add a person. Select someone and drag their ',
        h('strong', {}, '+'), ' onto another to connect them. Drag the background to move around; scroll to zoom.'),
      h('h3', { class: 'relmap-panel__heading' }, `On the map (${current.nodes.length})`),
      nodes.length === 0
        ? h('p', { class: 'module-empty' }, query ? `No one matches “${view.search.trim()}”.` : 'No one yet. Add a person or an organization.')
        : h('ul', { class: 'relmap-panel__list' }, nodes.map((node) => h('li', {},
          h('button', {
            type: 'button',
            class: 'relmap-panel__row',
            onClick: () => { select({ type: 'node', id: node.id }); canvas.centerOn(node.id); },
          },
            h('span', { class: `relmap-swatch relmap-swatch--${node.kind}`, style: { background: colorOf(node).fill, borderColor: colorOf(node).stroke } }),
            h('span', { class: 'relmap-panel__row-text' },
              h('span', { class: 'relmap-panel__row-name' }, node.name),
              node.description ? h('span', { class: 'relmap-panel__row-meta' }, node.description) : null),
            h('span', { class: 'relmap-panel__row-meta' }, String(connectionsOf(current, node.id).length)))))),
      current.edges.length ? h('p', { class: 'side-panel__hint' }, `${current.edges.length} ${current.edges.length === 1 ? 'connection' : 'connections'}.`) : null,
    ];
  }

  function renderNodePanel(current, node) {
    const save = (changes) => updateNode(node.id, changes, { redrawPanel: false });
    const saveText = (key) => debounce((event) => save({ [key]: event.target.value }), TEXT_SAVE_DELAY_MS);
    const connections = connectionsOf(current, node.id);
    const others = current.nodes.filter((n) => n.id !== node.id).sort((a, b) => a.name.localeCompare(b.name));
    const notes = h('textarea', { class: 'input side-panel__notes', rows: '4', placeholder: 'What you know, and where you learned it', onInput: saveText('notes') });
    notes.value = node.notes;

    return [
      panelTop(node.kind === 'organization' ? 'Organization' : 'Person'),
      h('input', { type: 'text', class: 'side-panel__title', value: node.name, 'aria-label': 'Name', onInput: saveText('name') }),
      field('Description', h('input', { type: 'text', class: 'input', value: node.description, placeholder: 'e.g. City council, District 4', onInput: saveText('description') })),
      h('div', { class: 'side-panel__grid' },
        field('Kind', segmented(KINDS.map((k) => ({ id: k.id, label: k.label })), node.kind, (kind) => updateNode(node.id, { kind }))),
        field('Size', segmented(SIZES.map((s) => ({ id: s.id, label: s.label })), node.size, (size) => updateNode(node.id, { size })))),
      field('Color', h('div', { class: 'relmap-panel__colors', role: 'group', 'aria-label': 'Color' },
        COLORS.map((color) => h('button', {
          type: 'button',
          class: `relmap-panel__color${color.id === node.color ? ' is-selected' : ''}`,
          style: { background: color.fill, borderColor: color.stroke },
          'aria-label': color.label,
          'aria-pressed': String(color.id === node.color),
          title: color.label,
          onClick: () => updateNode(node.id, { color: color.id }),
        })))),
      members.length > 1 ? field('Who keeps in touch', h('select', { class: 'input', onChange: (event) => updateNode(node.id, { contactId: event.target.value }) },
        h('option', { value: '' }, 'No one yet'),
        members.map((m) => h('option', { value: m.id, selected: m.id === node.contactId }, m.name)))) : null,
      field('Link', h('input', { type: 'url', class: 'input', value: node.url, placeholder: 'A source or profile, https://…', onInput: saveText('url') })),
      node.url && /^https?:\/\//.test(node.url) ? h('p', { class: 'side-panel__hint' }, h('a', { href: node.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open link ↗')) : null,
      field('Notes', notes),

      h('h3', { class: 'relmap-panel__heading' }, `Connections (${connections.length})`),
      connections.length ? h('ul', { class: 'relmap-panel__list' }, connections.map(({ edge, other }) => h('li', {},
        h('button', { type: 'button', class: 'relmap-panel__row', onClick: () => select({ type: 'edge', id: edge.id }) },
          h('span', { class: 'relmap-panel__row-text' },
            h('span', { class: 'relmap-panel__row-name' }, other?.name ?? '?'),
            h('span', { class: 'relmap-panel__row-meta' }, describeEdge(current, edge))))))) : h('p', { class: 'side-panel__hint' }, 'Not connected to anyone yet.'),
      others.length ? h('label', { class: 'side-panel__field' },
        h('span', { class: 'side-panel__label' }, 'Connect to'),
        h('select', {
          class: 'input',
          onChange: (event) => { if (event.target.value) connect(node.id, event.target.value); },
        }, h('option', { value: '' }, 'Choose…'), others.map((o) => h('option', { value: o.id }, o.name)))) : null,

      h('div', { class: 'side-panel__footer' },
        h('button', { type: 'button', class: 'link-button link-button--danger', onClick: removeSelected }, 'Remove from map'),
        node.contactId && getMember(node.contactId) ? h('span', {}, avatar(getMember(node.contactId), 18), ` ${getMember(node.contactId).name.split(' ')[0]} keeps in touch`) : null),
    ];
  }

  function renderEdgePanel(current, edge) {
    const from = current.nodes.find((n) => n.id === edge.from);
    const to = current.nodes.find((n) => n.id === edge.to);
    const saveText = (key) => debounce((event) => updateEdge(edge.id, { [key]: event.target.value }, { redrawPanel: false }), TEXT_SAVE_DELAY_MS);
    const notes = h('textarea', { class: 'input side-panel__notes', rows: '3', placeholder: 'Details, dates, sources', onInput: saveText('notes') });
    notes.value = edge.notes;

    return [
      panelTop('Connection'),
      h('p', { class: 'relmap-panel__pair' },
        h('button', { type: 'button', class: 'link-button', onClick: () => select({ type: 'node', id: from.id }) }, from?.name),
        h('span', { class: 'relmap-panel__pair-arrow' }, ARROWS.find((a) => a.id === edge.arrow)?.label),
        h('button', { type: 'button', class: 'link-button', onClick: () => select({ type: 'node', id: to.id }) }, to?.name)),
      field('Label', h('input', {
        type: 'text',
        class: 'input relmap-panel__label-input',
        value: edge.label,
        placeholder: 'e.g. donated to, board member of, works for',
        onInput: saveText('label'),
        onKeydown: (event) => { if (event.key === 'Enter') event.target.blur(); },
      })),
      field('Direction', segmented(ARROWS.map((a) => ({ id: a.id, label: a.label, title: a.name })), edge.arrow, (arrow) => updateEdge(edge.id, { arrow }))),
      h('label', { class: 'relmap-panel__check' },
        h('input', { type: 'checkbox', checked: edge.dashed, onChange: (event) => updateEdge(edge.id, { dashed: event.target.checked }) }),
        ' Dashed line (unconfirmed, or in the past)'),
      h('button', {
        type: 'button',
        class: 'link-button',
        onClick: () => updateEdge(edge.id, { from: edge.to, to: edge.from }),
      }, '⇄ Swap the two ends'),
      field('Notes', notes),
      h('div', { class: 'side-panel__footer' },
        h('button', { type: 'button', class: 'link-button link-button--danger', onClick: removeSelected }, 'Remove connection')),
    ];
  }

  function renderCaptionPanel(caption) {
    const text = h('textarea', {
      class: 'input side-panel__notes',
      rows: '4',
      onInput: debounce((event) => updateCaption(caption.id, { text: event.target.value }, { redrawPanel: false }), TEXT_SAVE_DELAY_MS),
    });
    text.value = caption.text;
    return [
      panelTop('Caption'),
      field('Text', text),
      h('p', { class: 'side-panel__hint' }, 'Drag the caption on the map to move it.'),
      h('div', { class: 'side-panel__footer' },
        h('button', { type: 'button', class: 'link-button link-button--danger', onClick: removeSelected }, 'Remove caption')),
    ];
  }

  // ─── Layout ────────────────────────────────────────────────────────────────

  container.append(toolbar, h('div', { class: 'page-layout relmap-layout' },
    h('div', { class: 'page-layout__main relmap-layout__map' }, canvas.element),
    panel));
  canvas.draw(map(), view.selection);
  drawPanel();

  return () => canvas.destroy();
}

/** A row of buttons where one is chosen, e.g. S | M | L. */
function segmented(options, value, onChange) {
  return h('div', { class: 'segmented', role: 'group' },
    options.map((option) => h('button', {
      type: 'button',
      class: `segmented__option${option.id === value ? ' is-active' : ''}`,
      'aria-pressed': String(option.id === value),
      title: option.title ?? null,
      onClick: () => onChange(option.id),
    }, option.label)));
}
