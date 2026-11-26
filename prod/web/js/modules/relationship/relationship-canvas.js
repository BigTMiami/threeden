/**
 * relationship-canvas.js — draws a relationship map and lets people work
 * on it, like Oligrapher.
 *
 *   const canvas = createRelationshipCanvas({ editable: true, onSelect, onMoveNode, … });
 *   container.append(canvas.element);
 *   canvas.draw(map, selection);     // call again whenever the map changes
 *   canvas.fit();                    // zoom to show everything
 *
 * What you can do on it (editable):
 *   - drag a node or caption to move it
 *   - drag the empty background to pan; scroll or use the zoom buttons to zoom
 *   - click a node, connection or caption to select it (unrelated nodes fade)
 *   - drag the small "+" handle on a selected node onto another node to
 *     connect them
 *   - arrow keys nudge the selected node (Shift for bigger steps)
 *
 * When not editable (the homepage card), clicking a node still calls
 * onSelect, and panning/zooming is off; the map always fits the card.
 *
 * The canvas never changes the map itself. It reports what happened
 * through the callbacks and the page saves it and calls draw() again.
 * While something is being dragged, the canvas moves it on its own copy so
 * the drag stays smooth; the change is reported when it's dropped.
 */

import { h } from '../../ui/dom.js';
import { svg } from '../../ui/svg.js';
import { trackPointer } from '../../ui/pointer-tracker.js';
import { radiusOf, colorOf, nodeInitials, neighborhood, boundsOf } from './relationship-data.js';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const FIT_PADDING_PX = 24;
const NUDGE_PX = 10;
/** How far apart two connections between the same pair of nodes curve. */
const PARALLEL_BEND_PX = 28;

/**
 * @param {object}   options
 * @param {boolean}  options.editable
 * @param {function} [options.onSelect]       ({ type: 'node'|'edge'|'caption', id } | null)
 * @param {function} [options.onMoveNode]     (nodeId, x, y)
 * @param {function} [options.onMoveCaption]  (captionId, x, y)
 * @param {function} [options.onConnect]      (fromId, toId)
 * @param {function} [options.onBackgroundDoubleClick]  (x, y) in map coordinates
 * @param {string}   [options.label]          accessible name
 */
export function createRelationshipCanvas(options) {
  const { editable, onSelect, onMoveNode, onMoveCaption, onConnect, onBackgroundDoubleClick, label = 'Relationship map' } = options;

  let map = { nodes: [], edges: [], captions: [] };
  let selection = null;
  /** What's on screen: map point (x, y) is drawn at (x * zoom + panX, y * zoom + panY). */
  const view = { panX: 0, panY: 0, zoom: 1 };
  let hasFitted = false;

  const world = svg('g', { class: 'relmap__world' });
  const root = svg('svg', { class: 'relmap__svg', role: 'img', 'aria-label': label },
    svg('defs', {},
      arrowMarker('relmap-arrow-end', 'auto'),
      arrowMarker('relmap-arrow-start', 'auto-start-reverse'),
      arrowMarker('relmap-arrow-end-selected', 'auto', 'is-selected'),
      arrowMarker('relmap-arrow-start-selected', 'auto-start-reverse', 'is-selected')),
    world);
  const element = h('div', { class: `relmap${editable ? ' relmap--editable' : ''}`, tabindex: editable ? '0' : null }, root);

  // ─── Coordinates ───────────────────────────────────────────────────────────

  function applyView() {
    world.setAttribute('transform', `translate(${view.panX} ${view.panY}) scale(${view.zoom})`);
  }

  /** Screen (client) point → map point. */
  function toMap(clientX, clientY) {
    const rect = root.getBoundingClientRect();
    return { x: (clientX - rect.left - view.panX) / view.zoom, y: (clientY - rect.top - view.panY) / view.zoom };
  }

  /** Zoom to show the whole map (or a sensible default when it's empty). */
  function fit() {
    const width = root.clientWidth;
    const height = root.clientHeight;
    if (!width || !height) return;
    const box = boundsOf(map);
    const zoom = Math.min(MAX_ZOOM, 1.2, Math.max(MIN_ZOOM,
      Math.min((width - FIT_PADDING_PX * 2) / (box.maxX - box.minX), (height - FIT_PADDING_PX * 2) / (box.maxY - box.minY))));
    view.zoom = zoom;
    view.panX = width / 2 - ((box.minX + box.maxX) / 2) * zoom;
    view.panY = height / 2 - ((box.minY + box.maxY) / 2) * zoom;
    hasFitted = true;
    applyView();
  }

  /** Zoom by a factor, keeping the given screen point (default: the middle) still. */
  function zoomBy(factor, clientX = null, clientY = null) {
    const rect = root.getBoundingClientRect();
    const sx = clientX === null ? rect.width / 2 : clientX - rect.left;
    const sy = clientY === null ? rect.height / 2 : clientY - rect.top;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
    view.panX = sx - ((sx - view.panX) / view.zoom) * zoom;
    view.panY = sy - ((sy - view.panY) / view.zoom) * zoom;
    view.zoom = zoom;
    applyView();
  }

  /** Pan so a node is in the middle. */
  function centerOn(nodeId) {
    const node = map.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    view.panX = root.clientWidth / 2 - node.x * view.zoom;
    view.panY = root.clientHeight / 2 - node.y * view.zoom;
    applyView();
  }

  /** The middle of what's visible, in map coordinates (for placing new things). */
  function visibleCenter() {
    const rect = root.getBoundingClientRect();
    return toMap(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // ─── Drawing ───────────────────────────────────────────────────────────────

  function draw(nextMap = map, nextSelection = selection) {
    map = nextMap;
    selection = nextSelection;

    // Selecting a node highlights it and its direct connections.
    const focusIds = selection?.type === 'node' ? neighborhood(map, selection.id) : null;
    const nodesById = new Map(map.nodes.map((n) => [n.id, n]));

    const edgeLayer = svg('g', { class: 'relmap__edges' });
    const pairCounts = new Map();
    for (const edge of map.edges) {
      const from = nodesById.get(edge.from);
      const to = nodesById.get(edge.to);
      if (!from || !to) continue;
      // Two connections between the same pair curve away from each other.
      const pairKey = [edge.from, edge.to].sort().join('|');
      const index = pairCounts.get(pairKey) ?? 0;
      pairCounts.set(pairKey, index + 1);
      const isFaded = focusIds && !(focusIds.has(edge.from) && focusIds.has(edge.to) && (edge.from === selection.id || edge.to === selection.id));
      edgeLayer.append(drawEdge(edge, from, to, index, { isSelected: selection?.type === 'edge' && selection.id === edge.id, isFaded }));
    }

    const nodeLayer = svg('g', { class: 'relmap__nodes' },
      map.nodes.map((node) => drawNode(node, {
        isSelected: selection?.type === 'node' && selection.id === node.id,
        isFaded: focusIds && !focusIds.has(node.id),
      })));

    const captionLayer = svg('g', { class: 'relmap__captions' },
      map.captions.map((caption) => drawCaption(caption, selection?.type === 'caption' && selection.id === caption.id)));

    world.replaceChildren(edgeLayer, captionLayer, nodeLayer);

    if (!hasFitted) fit();
    else applyView();
  }

  function drawNode(node, { isSelected, isFaded }) {
    const radius = radiusOf(node);
    const color = colorOf(node);
    const shape = node.kind === 'organization'
      ? svg('rect', { x: -radius, y: -radius, width: radius * 2, height: radius * 2, rx: radius * 0.3, class: 'relmap__shape', fill: color.fill, stroke: color.stroke })
      : svg('circle', { r: radius, class: 'relmap__shape', fill: color.fill, stroke: color.stroke });

    const group = svg('g', {
      class: `relmap__node${isSelected ? ' is-selected' : ''}${isFaded ? ' is-faded' : ''}`,
      transform: `translate(${node.x} ${node.y})`,
      'data-node-id': node.id,
    },
      isSelected ? svg('circle', { r: radius + 6, class: 'relmap__halo' }) : null,
      shape,
      svg('text', { class: 'relmap__initials', 'text-anchor': 'middle', dy: '0.35em', 'font-size': Math.round(radius * 0.62) }, nodeInitials(node.name)),
      svg('text', { class: 'relmap__name', 'text-anchor': 'middle', y: radius + 15 }, node.name),
      node.description ? svg('text', { class: 'relmap__description', 'text-anchor': 'middle', y: radius + 29 }, truncate(node.description, 34)) : null,
      // The handle for dragging out a new connection.
      editable && isSelected ? svg('g', { class: 'relmap__connect-handle', transform: `translate(${radius + 4} ${-radius - 4})` },
        svg('title', {}, 'Drag onto another node to connect them'),
        svg('circle', { r: 9 }),
        svg('path', { d: 'M-4 0h8M0 -4v8' })) : null,
      svg('title', {}, node.description ? `${node.name}: ${node.description}` : node.name),
    );

    group.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.relmap__connect-handle')) { startConnecting(event, node); return; }
      event.stopPropagation();
      if (!editable) return;
      startMoving(event, group, node, (x, y) => onMoveNode?.(node.id, x, y));
    });
    group.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelect?.({ type: 'node', id: node.id });
    });
    return group;
  }

  function drawEdge(edge, from, to, index, { isSelected, isFaded }) {
    // Curve: 0 for the first connection between a pair, then ±28, ±56…
    const bend = index === 0 ? 0 : Math.ceil(index / 2) * PARALLEL_BEND_PX * (index % 2 ? 1 : -1);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length; // perpendicular, for the bend
    const ny = dx / length;
    const control = { x: (from.x + to.x) / 2 + nx * bend * 2, y: (from.y + to.y) / 2 + ny * bend * 2 };

    // Stop the line at each node's edge so arrowheads show.
    const start = pointToward(from, control, radiusOf(from) + 3);
    const end = pointToward(to, control, radiusOf(to) + 3);
    const d = `M${start.x} ${start.y} Q${control.x} ${control.y} ${end.x} ${end.y}`;
    const markerSuffix = isSelected ? '-selected' : '';

    // The label sits at the middle of the curve, along the line, never upside down.
    const mid = { x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x, y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y };
    let angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
    if (angle > 90 || angle < -90) angle += 180;

    const group = svg('g', { class: `relmap__edge${isSelected ? ' is-selected' : ''}${isFaded ? ' is-faded' : ''}${edge.dashed ? ' is-dashed' : ''}`, 'data-edge-id': edge.id },
      svg('path', { d, class: 'relmap__edge-hit' }),
      svg('path', {
        d,
        class: 'relmap__edge-line',
        'marker-end': edge.arrow === 'forward' || edge.arrow === 'both' ? `url(#relmap-arrow-end${markerSuffix})` : null,
        'marker-start': edge.arrow === 'back' || edge.arrow === 'both' ? `url(#relmap-arrow-start${markerSuffix})` : null,
      }),
      edge.label ? svg('text', {
        class: 'relmap__edge-label',
        'text-anchor': 'middle',
        transform: `translate(${mid.x} ${mid.y}) rotate(${angle})`,
        dy: '-0.45em',
      }, edge.label) : null,
    );
    group.addEventListener('pointerdown', (event) => event.stopPropagation());
    group.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelect?.({ type: 'edge', id: edge.id });
    });
    return group;
  }

  function drawCaption(caption, isSelected) {
    const lines = caption.text.split('\n');
    const group = svg('g', { class: `relmap__caption${isSelected ? ' is-selected' : ''}`, transform: `translate(${caption.x} ${caption.y})`, 'data-caption-id': caption.id },
      svg('text', {}, lines.map((line, i) => svg('tspan', { x: 0, dy: i === 0 ? 0 : '1.3em' }, line || ' '))));
    group.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      if (editable) startMoving(event, group, caption, (x, y) => onMoveCaption?.(caption.id, x, y));
    });
    group.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelect?.({ type: 'caption', id: caption.id });
    });
    return group;
  }

  // ─── Dragging ──────────────────────────────────────────────────────────────

  /** Move a node or caption with the pointer; report where it was dropped. */
  function startMoving(downEvent, group, item, onDrop) {
    const startX = item.x;
    const startY = item.y;
    trackPointer(downEvent, {
      onStart: () => group.classList.add('is-dragging'),
      onMove: (point, { dx, dy }) => {
        // Move the item on the canvas's copy and redraw, so lines follow.
        item.x = Math.round(startX + dx / view.zoom);
        item.y = Math.round(startY + dy / view.zoom);
        draw();
      },
      onEnd: () => onDrop(item.x, item.y),
      onCancel: () => { item.x = startX; item.y = startY; draw(); },
    });
  }

  /** Drag from a node's "+" handle to another node. */
  function startConnecting(downEvent, fromNode) {
    downEvent.stopPropagation();
    let line = null;
    let target = null;
    const findTarget = (point) => {
      const nodeElement = document.elementFromPoint(point.x, point.y)?.closest('.relmap__node');
      return nodeElement && nodeElement.dataset.nodeId !== fromNode.id ? nodeElement : null;
    };
    trackPointer(downEvent, {
      threshold: 2,
      onStart: () => {
        line = svg('line', { class: 'relmap__connect-line', x1: fromNode.x, y1: fromNode.y, x2: fromNode.x, y2: fromNode.y });
        world.append(line);
      },
      onMove: (point) => {
        const p = toMap(point.x, point.y);
        line.setAttribute('x2', p.x);
        line.setAttribute('y2', p.y);
        const next = findTarget(point);
        if (next !== target) {
          target?.classList.remove('is-drop-target');
          target = next;
          target?.classList.add('is-drop-target');
        }
      },
      onEnd: () => {
        line.remove();
        if (target) onConnect?.(fromNode.id, target.dataset.nodeId);
        target = null;
      },
      onCancel: () => { line?.remove(); target?.classList.remove('is-drop-target'); },
    });
  }

  // Drag the background to pan; click it to clear the selection.
  root.addEventListener('pointerdown', (event) => {
    if (!editable) return;
    element.focus({ preventScroll: true });
    const startX = view.panX;
    const startY = view.panY;
    trackPointer(event, {
      onStart: () => element.classList.add('is-panning'),
      onMove: (point, { dx, dy }) => { view.panX = startX + dx; view.panY = startY + dy; applyView(); },
      onEnd: () => element.classList.remove('is-panning'),
      onCancel: () => { view.panX = startX; view.panY = startY; applyView(); element.classList.remove('is-panning'); },
    });
  });
  root.addEventListener('click', () => onSelect?.(null));
  root.addEventListener('dblclick', (event) => {
    if (!editable || event.target.closest('.relmap__node, .relmap__edge, .relmap__caption')) return;
    const point = toMap(event.clientX, event.clientY);
    onBackgroundDoubleClick?.(Math.round(point.x), Math.round(point.y));
  });

  if (editable) {
    root.addEventListener('wheel', (event) => {
      // On a homepage the wheel scrolls the page; Ctrl + wheel (or a trackpad pinch) zooms. Its full page zooms with the wheel.
      if (!event.ctrlKey && !event.metaKey && root.closest('.module-grid')) return;
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
    }, { passive: false });

    // Arrow keys nudge the selected node.
    element.addEventListener('keydown', (event) => {
      if (selection?.type !== 'node' || !event.key.startsWith('Arrow')) return;
      const node = map.nodes.find((n) => n.id === selection.id);
      if (!node) return;
      const step = event.shiftKey ? NUDGE_PX * 4 : NUDGE_PX;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const [dx, dy] = moves[event.key];
      event.preventDefault();
      onMoveNode?.(node.id, node.x + dx, node.y + dy);
    });
  }

  // Refit when the box changes size (cards being resized, the window…) until
  // someone pans or zooms on purpose (on the card, always).
  let lastSize = '';
  const resizeObserver = new ResizeObserver(() => {
    const size = `${root.clientWidth}x${root.clientHeight}`;
    if (size === lastSize) return;
    lastSize = size;
    if (!editable || !hasFitted) fit();
  });
  resizeObserver.observe(root);

  return {
    element,
    draw,
    fit,
    zoomBy,
    centerOn,
    visibleCenter,
    destroy: () => resizeObserver.disconnect(),
  };
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function arrowMarker(id, orient, extraClass = '') {
  return svg('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient, class: `relmap__arrow ${extraClass}` },
    svg('path', { d: 'M0 0L10 5L0 10z' }));
}

/** The point `distance` away from a node's center, toward `target`. */
function pointToward(node, target, distance) {
  const dx = target.x - node.x;
  const dy = target.y - node.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: node.x + (dx / length) * distance, y: node.y + (dy / length) * distance };
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
