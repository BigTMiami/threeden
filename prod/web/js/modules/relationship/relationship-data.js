// @ts-check
/**
 * relationship-data.js — the shape of a relationship map, and helpers.
 *
 * A relationship map (like LittleSis's Oligrapher) shows who is connected
 * to whom, and how: people and organizations are nodes, and each
 * connection is a labeled line between two of them.
 *
 *    (Ortiz) ──oversees budget of──▶ [Parks dept]
 *       ▲
 *       └── donated to campaign ── [Business Assn]
 *
 * Data saved for a Relationship map module (and for a relationship map
 * file in the vault):
 *
 *   {
 *     description: 'Who decides what happens to the lot',
 *     nodes: [{
 *       id, name,
 *       kind: 'person' | 'organization',     ← circle or rounded square
 *       description: 'City council, District 4',   ← shown under the name
 *       x, y,                                ← position on the map
 *       size: 'small' | 'medium' | 'large',
 *       color: 'gray' | 'blue' | …,          ← see COLORS
 *       contactId: 'm-priya' | '',            ← who in the group keeps in touch
 *       url: '',                             ← a source or profile link
 *       notes: '',
 *     }],
 *     edges: [{
 *       id, from, to,                        ← node ids
 *       label: 'donated to',
 *       arrow: 'none' | 'forward' | 'back' | 'both',   ← forward = from → to
 *       dashed: false,                       ← unconfirmed or past relationship
 *       notes: '',
 *     }],
 *     captions: [{ id, text, x, y }],        ← free text on the map
 *   }
 */

import { makeId } from '../../ui/dom.js';

export const KINDS = [
  { id: 'person', label: 'Person' },
  { id: 'organization', label: 'Organization' },
];

export const SIZES = [
  { id: 'small', label: 'S', radius: 20 },
  { id: 'medium', label: 'M', radius: 28 },
  { id: 'large', label: 'L', radius: 38 },
];

export const COLORS = [
  { id: 'gray', label: 'Gray', fill: '#eaecf0', stroke: '#72777d' },
  { id: 'blue', label: 'Blue', fill: '#dbe7fb', stroke: '#3366cc' },
  { id: 'green', label: 'Green', fill: '#d5f0e2', stroke: '#14866d' },
  { id: 'orange', label: 'Orange', fill: '#fde6cc', stroke: '#ac6600' },
  { id: 'red', label: 'Red', fill: '#fbdcdc', stroke: '#b32424' },
  { id: 'purple', label: 'Purple', fill: '#eadff5', stroke: '#7b3fa0' },
];

export const ARROWS = [
  { id: 'none', label: '—', name: 'No direction' },
  { id: 'forward', label: '→', name: 'From first to second' },
  { id: 'back', label: '←', name: 'From second to first' },
  { id: 'both', label: '↔', name: 'Both ways' },
];

// ─── Creating ────────────────────────────────────────────────────────────────

export function createEmptyMap() {
  return { description: '', nodes: [], edges: [], captions: [] };
}

export function normalizeMap(data) {
  return {
    description: data?.description ?? '',
    nodes: (data?.nodes ?? []).map(normalizeNode),
    edges: (data?.edges ?? []).map(normalizeEdge),
    captions: data?.captions ?? [],
  };
}

export function normalizeNode(node) {
  return {
    name: '', kind: 'person', description: '', x: 0, y: 0, size: 'medium', color: 'gray', contactId: '', url: '', notes: '',
    ...node,
  };
}

export function normalizeEdge(edge) {
  return { label: '', arrow: 'forward', dashed: false, notes: '', ...edge };
}

export const createNode = (fields) => normalizeNode({ id: makeId('node'), ...fields });
export const createEdge = (fields) => normalizeEdge({ id: makeId('edge'), ...fields });
export const createCaption = (fields) => ({ id: makeId('caption'), text: 'Caption', x: 0, y: 0, ...fields });

// ─── Reading ─────────────────────────────────────────────────────────────────

export const radiusOf = (node) => (SIZES.find((s) => s.id === node.size) ?? SIZES[1]).radius;
export const colorOf = (node) => COLORS.find((c) => c.id === node.color) ?? COLORS[0];

/** Letters for a node: the first and last words, skipping small ones. "Parks department" → "PD", "Council member Ortiz" → "CO". */
export function nodeInitials(name) {
  const SMALL_WORDS = new Set(['of', 'the', 'and', 'for', 'on', 'in', 'a', 'an', '&']);
  const words = name.split(/\s+/).filter((w) => w && !SMALL_WORDS.has(w.toLowerCase()));
  if (words.length === 0) return '?';
  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];
  return picked.map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')[0]?.toUpperCase() ?? '').join('') || '?';
}

/** The edges touching a node, and the node at the other end of each. */
export function connectionsOf(map, nodeId) {
  return map.edges
    .filter((e) => e.from === nodeId || e.to === nodeId)
    .map((edge) => ({ edge, other: map.nodes.find((n) => n.id === (edge.from === nodeId ? edge.to : edge.from)), isFrom: edge.from === nodeId }));
}

/** Ids of a node and everything directly connected to it (for highlighting). */
export function neighborhood(map, nodeId) {
  const ids = new Set([nodeId]);
  for (const { other } of connectionsOf(map, nodeId)) if (other) ids.add(other.id);
  return ids;
}

/** The box around everything on the map, with room for names. */
export function boundsOf(map) {
  const points = [
    ...map.nodes.flatMap((n) => [{ x: n.x - radiusOf(n) - 40, y: n.y - radiusOf(n) - 10 }, { x: n.x + radiusOf(n) + 40, y: n.y + radiusOf(n) + 34 }]),
    ...map.captions.flatMap((c) => [{ x: c.x - 10, y: c.y - 20 }, { x: c.x + Math.min(400, c.text.length * 7.5), y: c.y + 10 }]),
  ];
  if (points.length === 0) return { minX: -200, minY: -150, maxX: 200, maxY: 150 };
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

/** "Parks department → oversees → Elm St Garden" for lists and screen readers. */
export function describeEdge(map, edge) {
  const from = map.nodes.find((n) => n.id === edge.from)?.name ?? '?';
  const to = map.nodes.find((n) => n.id === edge.to)?.name ?? '?';
  const arrow = { none: '—', forward: '→', back: '←', both: '↔' }[edge.arrow];
  return `${from} ${arrow} ${edge.label || 'connected'} ${arrow} ${to}`;
}

/**
 * A spot for a new node: near the middle of what's visible, nudged so it
 * doesn't land exactly on another node.
 */
export function freeSpotNear(map, x, y) {
  let spot = { x: Math.round(x), y: Math.round(y) };
  for (let tries = 0; tries < 20 && map.nodes.some((n) => Math.hypot(n.x - spot.x, n.y - spot.y) < 70); tries += 1) {
    const angle = tries * 2.4;
    spot = { x: Math.round(x + Math.cos(angle) * 80 * (1 + tries / 6)), y: Math.round(y + Math.sin(angle) * 80 * (1 + tries / 6)) };
  }
  return spot;
}

// ─── Converting old power maps ───────────────────────────────────────────────

/**
 * Turn a Power map's data into a relationship map (the Power map module was
 * replaced). Stance becomes left-to-right position and influence top-to-
 * bottom, so the layout feels familiar; the goal becomes the description.
 */
export function fromPowerMap(powerMap) {
  const colorForStance = (support) => (support >= 60 ? 'green' : support <= 40 ? 'red' : 'gray');
  return {
    description: powerMap.goal ? `Goal: ${powerMap.goal}` : '',
    nodes: (powerMap.actors ?? []).map((actor) => normalizeNode({
      id: actor.id,
      name: actor.name,
      kind: actor.kind === 'organization' ? 'organization' : 'person',
      description: actor.role ?? '',
      x: Math.round(((actor.support ?? 50) - 50) * 9),
      y: Math.round((50 - (actor.influence ?? 50)) * 6),
      size: (actor.influence ?? 50) >= 70 ? 'large' : (actor.influence ?? 50) >= 40 ? 'medium' : 'small',
      color: colorForStance(actor.support ?? 50),
      contactId: actor.ownerId ?? '',
      notes: [actor.notes, actor.nextStep ? `Next step: ${actor.nextStep}` : ''].filter(Boolean).join('\n'),
    })),
    edges: [],
    captions: [],
  };
}
