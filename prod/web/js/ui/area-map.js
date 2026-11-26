/**
 * area-map.js — "Where are you, roughly?": a map of the world with a
 * circle, the way Craigslist asks. Drag the map under the circle, zoom
 * with the wheel, a pinch, or the buttons, drag the circle's edge (or use
 * the menu) to change how far you'd go, or type a place.
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │ [Type a city or neighborhood…]  [📍 Use my location]
 *   │   ~~~ the world: land, seas, cities ~~~           │
 *   │        ╭──────────╮                        [+]    │
 *   │        │    ●     ●── drag                 [−]    │
 *   │        ╰──────────╯                               │
 *   └──────────────────────────────────────────────────┘
 *   Within [3 miles ▾] of Juniper Lane                 [Save]
 *
 *   renderAreaMap({ initial, onSave, saveLabel })
 *     initial: { lat, lng, radiusMiles } or null (starts on the demo's town)
 *     onSave({ lat, lng, label, radiusMiles })
 *
 * How it's drawn (no map service, nothing personal sent anywhere):
 *   • Web Mercator, like every web map. Land comes from js/data/world-land.js
 *     (built in, simplified). If the page is allowed to, it then swaps in
 *     finer country outlines (Natural Earth data, from the open-source
 *     "datamaps" package on a public CDN; see loadDetail below). Only the
 *     outline file is fetched: where you look or what you type never
 *     leaves the page.
 *   • Places come from js/data/world-cities.js (about 500 cities, every
 *     country) and the demo's neighborhoods (js/utils/places.js).
 *
 * Street detail: when the page can reach them, a street map (MapLibre with
 * OpenFreeMap's OpenStreetMap tiles; js/ui/street-map.js) covers this one,
 * with the same circle, menu, search, and Save. If it can't load, this
 * built-in map is what you get.
 *
 * What a launch version adds: the street tiles and address search from
 * 3den's own servers (Protomaps and Photon; README, "The area map"). Only
 * the rough point and radius are ever saved, never an address.
 */

import { h, replaceChildren } from './dom.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';
import { PLACES, guessPlace, distanceMiles } from '../utils/places.js';
import { LAND, WATER } from '../data/world-land.js';
import { CITIES, COUNTRIES } from '../data/world-cities.js';
import { mountStreetMap } from './street-map.js';

const WIDTH = 600;
const HEIGHT = 360;
const WORLD = 1024; // the world's width in "world units"; zoom multiplies it
const MAX_LAT = 82;
const EARTH_MILES = 24901;
const MIN_ZOOM = 0.55; // the whole world fits
const MAX_ZOOM = 2600; // about a mile across the map
const RADIUS_STEPS = [0.5, 1, 2, 3, 5, 10, 15, 25, 50, 100];
const SVG = 'http://www.w3.org/2000/svg';

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const radiusLabel = (miles) => `${miles} ${miles === 1 ? 'mile' : 'miles'}`;

// ─── Projection (in world units, zoom 1) ────────────────────────────────────

const worldX = (lng) => ((lng + 180) / 360) * WORLD;
const worldY = (lat) => {
  const phi = (clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180;
  return (0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI)) * WORLD;
};
const lngOf = (x) => (x / WORLD) * 360 - 180;
const latOf = (y) => ((2 * Math.atan(Math.exp((0.5 - y / WORLD) * 2 * Math.PI)) - Math.PI / 2) * 180) / Math.PI;

const pathOf = (rings) => rings.map((ring) => `M${ring.map(([lng, lat]) => `${worldX(lng).toFixed(2)} ${worldY(lat).toFixed(2)}`).join('L')}Z`).join('');

// ─── Finer outlines, when the page may load them ────────────────────────────

const DETAIL_SOURCES = [
  'https://cdn.jsdelivr.net/npm/datamaps@0.5.9/dist/datamaps.world.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/datamaps/0.5.9/datamaps.world.min.js',
];
let detail = null; // Promise<string | null>: an SVG path of country outlines

/** Rings of [lng, lat] from a TopoJSON topology (its first object). */
export function ringsFromTopology(topology) {
  const { scale = [1, 1], translate = [0, 0] } = topology.transform ?? {};
  const arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      if (topology.transform) { x += dx; y += dy; } else { x = dx; y = dy; }
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
  const ringOf = (indexes) => indexes.flatMap((index, i) => {
    const points = index < 0 ? [...arcs[~index]].reverse() : arcs[index];
    return i ? points.slice(1) : points;
  });
  const rings = [];
  const object = Object.values(topology.objects)[0];
  for (const geometry of object.geometries ?? []) {
    if (geometry.type === 'Polygon') rings.push(...geometry.arcs.map(ringOf));
    if (geometry.type === 'MultiPolygon') for (const polygon of geometry.arcs) rings.push(...polygon.map(ringOf));
  }
  return rings;
}

function loadScript(src) {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.append(script);
    setTimeout(() => resolve(false), 8000);
  });
}

function loadDetail() {
  detail ??= (async () => {
    for (const src of DETAIL_SOURCES) {
      try {
        if (!(await loadScript(src))) continue;
        const topology = (window.Datamap ?? window.Datamaps)?.prototype?.worldTopo;
        if (!topology?.arcs) continue;
        const rings = ringsFromTopology(topology).filter((ring) => ring.length > 3);
        // Only use it if it looks like the world: plenty of outlines, every corner on the globe.
        const sane = rings.length > 100 && rings.every((ring) => ring.every(([lng, lat]) => Math.abs(lng) <= 180.5 && Math.abs(lat) <= 90.5));
        if (sane) return pathOf(rings);
      } catch { /* keep the built-in outlines */ }
    }
    return null;
  })();
  return detail;
}

// ─── Places ─────────────────────────────────────────────────────────────────

/** Every place the map knows: cities (ranked) and the demo's neighborhoods. */
const GAZETTEER = [
  ...CITIES.map(([name, country, lat, lng], rank) => ({ name, where: COUNTRIES[country] ?? country, lat, lng, rank })),
  ...PLACES.map((p) => ({ name: p.name, where: '', lat: p.lat, lng: p.lng, rank: 5000, local: true })),
];
const fullName = (place) => (place.where ? `${place.name}, ${place.where}` : place.name);
const plain = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function searchPlaces(query, limit = 6) {
  const q = plain(query.trim());
  if (!q) return [];
  const scored = [];
  for (const place of GAZETTEER) {
    const name = plain(fullName(place));
    const at = name.indexOf(q);
    if (at < 0) continue;
    scored.push({ place, score: (at === 0 ? 0 : name[at - 1] === ' ' ? 1000 : 3000) + place.rank });
  }
  const guess = guessPlace(query);
  const results = scored.sort((a, b) => a.score - b.score).map((s) => s.place);
  if (guess) { const hit = GAZETTEER.find((p) => p.local && p.name === guess.name); if (hit && !results.includes(hit)) results.unshift(hit); }
  return results.slice(0, limit);
}

/** "Juniper Lane", "Lyon, France", or "the open sea" — the nearest place worth naming. */
export function nameNear(point) {
  let best = null;
  let bestMiles = Infinity;
  for (const place of GAZETTEER) {
    if (Math.abs(place.lat - point.lat) > 6) continue;
    // Neighborhoods win close up; cities name the wider area.
    const miles = distanceMiles(point, place) * (place.local ? 1 : 1.6);
    if (miles < bestMiles) { best = place; bestMiles = miles; }
  }
  if (!best || bestMiles > 400) return null;
  return best.local || bestMiles < 30 ? fullName(best) : `${fullName(best)} (about ${Math.round(distanceMiles(point, best) / 10) * 10} miles away)`;
}

// ─── The map ────────────────────────────────────────────────────────────────

export function renderAreaMap({ initial = null, onSave, saveLabel = 'Save my area' }) {
  const start = initial?.lat != null ? initial : PLACES[0];
  const state = { lat: start.lat, lng: start.lng, radius: initial?.radiusMiles ?? 3, zoom: 1 };

  /** Screen pixels per mile at the middle of the map. */
  const pxPerMile = () => (WORLD * state.zoom) / (EARTH_MILES * Math.cos((state.lat * Math.PI) / 180));
  /** Zoom so the circle fills about three fifths of the map's height. */
  let street = null; // the street map over this one, once it loads (street-map.js)
  const fit = () => {
    state.zoom = clamp((0.3 * HEIGHT * EARTH_MILES * Math.cos((state.lat * Math.PI) / 180)) / (state.radius * WORLD), MIN_ZOOM, MAX_ZOOM);
    street?.fitRadius();
  };
  fit();

  const el = (tag, attrs = {}, text = null) => {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text != null) node.textContent = text;
    return node;
  };

  const root = h('div', { class: 'area-map' });
  const svg = el('svg', {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'area-map__svg', role: 'application', tabindex: '0',
    'aria-label': 'Map of the world. Drag to move it under the circle, scroll or pinch to zoom, and drag the circle’s edge to change the distance. Arrow keys move, plus and minus zoom, and the square brackets change the distance.',
  });
  const world = el('g');
  const landPath = el('path', { d: pathOf(LAND), class: 'area-map__land' });
  const waterPath = el('path', { d: pathOf(WATER), class: 'area-map__water' });
  world.append(landPath, waterPath);
  const lines = el('g');
  const labels = el('g');
  const overlay = el('g');
  svg.append(el('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, class: 'area-map__sea' }), world, lines, labels, overlay);

  const summaryText = h('span', {});
  const suggestions = h('ul', { class: 'area-map__suggestions', id: `area-map-suggestions-${Math.random().toString(36).slice(2, 7)}`, 'aria-label': 'Places that match', hidden: true });
  const radiusSelect = h('select', {
    class: 'area-map__radius', 'aria-label': 'How far you’d go',
    onChange: (event) => { state.radius = Number(event.target.value); fit(); draw(); },
  });

  // Finer outlines replace the built-in ones if they can be loaded.
  loadDetail().then((d) => {
    if (!d || !landPath.isConnected) return;
    landPath.setAttribute('d', d);
    landPath.classList.add('is-detailed');
    waterPath.remove(); // the finer outlines already leave the seas and lakes open
  });

  const toScreen = (point) => ({
    x: WIDTH / 2 + (worldX(point.lng) - worldX(state.lng)) * state.zoom,
    y: HEIGHT / 2 + (worldY(point.lat) - worldY(state.lat)) * state.zoom,
  });
  const svgPoint = (event) => {
    const rect = svg.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * WIDTH, y: ((event.clientY - rect.top) / rect.height) * HEIGHT };
  };
  /** Move the middle by a number of screen pixels. */
  function pan(dx, dy) {
    const x = worldX(state.lng) - dx / state.zoom;
    const y = worldY(state.lat) - dy / state.zoom;
    state.lng = clamp(lngOf(x), -180, 180);
    state.lat = clamp(latOf(y), -MAX_LAT + 2, MAX_LAT - 2);
  }
  function zoomBy(factor) {
    if (street) { street.zoomBy(factor); return; }
    state.zoom = clamp(state.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    draw();
  }

  function draw() {
    const cx = worldX(state.lng);
    const cy = worldY(state.lat);
    world.setAttribute('transform', `translate(${(WIDTH / 2 - cx * state.zoom).toFixed(2)} ${(HEIGHT / 2 - cy * state.zoom).toFixed(2)}) scale(${state.zoom})`);

    // Lines of latitude and longitude, closer together as you zoom in.
    const degreesAcross = (WIDTH / (WORLD * state.zoom)) * 360;
    const step = [30, 10, 5, 1, 0.5, 0.1, 0.05, 0.01].find((s) => degreesAcross / s >= 3) ?? 0.01;
    const west = lngOf(cx - WIDTH / 2 / state.zoom);
    const east = lngOf(cx + WIDTH / 2 / state.zoom);
    const north = latOf(cy - HEIGHT / 2 / state.zoom);
    const south = latOf(cy + HEIGHT / 2 / state.zoom);
    lines.replaceChildren();
    for (let lng = Math.ceil(Math.max(west, -180) / step) * step; lng <= Math.min(east, 180); lng += step) {
      const { x } = toScreen({ lng, lat: state.lat });
      lines.append(el('line', { x1: x, y1: 0, x2: x, y2: HEIGHT, class: 'area-map__grid' }));
    }
    for (let lat = Math.ceil(Math.max(south, -MAX_LAT) / step) * step; lat <= Math.min(north, MAX_LAT); lat += step) {
      const { y } = toScreen({ lng: state.lng, lat });
      lines.append(el('line', { x1: 0, y1: y, x2: WIDTH, y2: y, class: 'area-map__grid' }));
    }

    // Places: the best-known in view first, skipping any whose label would sit on another.
    labels.replaceChildren();
    const taken = [];
    const showLocal = pxPerMile() > 4;
    let shown = 0;
    for (const place of GAZETTEER) {
      if (shown >= 28) break;
      if (place.local && !showLocal) continue;
      if (place.lng < west || place.lng > east || place.lat < south || place.lat > north) continue;
      const { x, y } = toScreen(place);
      const width = place.name.length * 5.6 + 12;
      if (taken.some((t) => Math.abs(t.y - y) < 13 && x < t.x + t.width && t.x < x + width)) continue;
      taken.push({ x, y, width });
      shown += 1;
      const inside = distanceMiles(place, state) <= state.radius;
      labels.append(el('circle', { cx: x, cy: y, r: place.local ? 2.5 : 3, class: `area-map__place${inside ? ' is-inside' : ''}` }));
      labels.append(el('text', { x: x + 6, y: y + 4, class: `area-map__label${inside ? ' is-inside' : ''}` }, place.name));
    }

    // The circle, the pin in the middle, and the handle on its edge.
    const r = clamp(state.radius * pxPerMile(), 3, WIDTH);
    const handle = el('circle', { cx: WIDTH / 2 + Math.min(r, WIDTH / 2 - 14), cy: HEIGHT / 2, r: 9, class: 'area-map__handle' });
    handle.dataset.handle = 'radius';
    overlay.replaceChildren(
      el('circle', { cx: WIDTH / 2, cy: HEIGHT / 2, r, class: 'area-map__circle' }),
      el('circle', { cx: WIDTH / 2, cy: HEIGHT / 2, r: 5, class: 'area-map__pin' }),
      handle,
      el('text', { x: WIDTH / 2, y: HEIGHT / 2 - Math.min(r, HEIGHT / 2 - 24) - 8, class: 'area-map__radius-text', 'text-anchor': 'middle' }, radiusLabel(state.radius)));

    drawSummary();
    street?.update();
  }

  /** The distance menu and "of Juniper Lane" (also redrawn as the street map moves). */
  function drawSummary() {
    const steps = RADIUS_STEPS.includes(state.radius) ? RADIUS_STEPS : [...RADIUS_STEPS, state.radius].sort((a, b) => a - b);
    replaceChildren(radiusSelect, steps.map((miles) => h('option', { value: String(miles), selected: miles === state.radius }, radiusLabel(miles))));
    summaryText.textContent = ` of ${nameNear(state) ?? 'here'}`;
  }

  // Dragging: the handle resizes the circle; anywhere else moves the map. Two fingers zoom.
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  svg.addEventListener('pointerdown', (event) => {
    svg.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, svgPoint(event));
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.zoom };
      drag = null;
      return;
    }
    drag = event.target.dataset?.handle === 'radius' ? { mode: 'radius' } : { mode: 'move', last: svgPoint(event) };
    svg.classList.add('is-dragging');
  });
  svg.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const point = svgPoint(event);
    pointers.set(event.pointerId, point);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      state.zoom = clamp((pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance, MIN_ZOOM, MAX_ZOOM);
      draw();
      return;
    }
    if (!drag) return;
    if (drag.mode === 'radius') {
      const miles = Math.hypot(point.x - WIDTH / 2, point.y - HEIGHT / 2) / pxPerMile();
      state.radius = clamp(miles < 5 ? Math.round(miles * 2) / 2 : miles < 30 ? Math.round(miles) : Math.round(miles / 5) * 5, RADIUS_STEPS[0], RADIUS_STEPS.at(-1));
    } else {
      pan(point.x - drag.last.x, point.y - drag.last.y);
      drag.last = point;
    }
    draw();
  });
  const endDrag = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag) return;
    const wasRadius = drag.mode === 'radius';
    drag = null;
    svg.classList.remove('is-dragging');
    if (wasRadius) { fit(); draw(); }
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('wheel', (event) => {
    // Inside a homepage module the wheel scrolls the page; Ctrl + wheel (a pinch) zooms.
    if (!event.ctrlKey && !event.metaKey && svg.closest('.module-grid')) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.25 : 0.8);
  }, { passive: false });
  // Keyboard: arrows move, + and − zoom, [ and ] change the distance. A screen
  // reader hears where the circle is now (mapStatus), a moment after the last key.
  const mapStatus = h('span', { class: 'visually-hidden', 'aria-live': 'polite' });
  let statusTimer = null;
  const announceWhere = () => { clearTimeout(statusTimer); statusTimer = setTimeout(() => { mapStatus.textContent = `${radiusLabel(state.radius)} of ${nameNear(state) ?? 'here'}`; }, 400); };
  function onMapKey(event) {
    const moves = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
    if (moves[event.key] && !street) { event.preventDefault(); pan(...moves[event.key]); draw(); announceWhere(); }
    if (event.key === '+' || event.key === '=') { zoomBy(1.5); announceWhere(); }
    if (event.key === '-') { zoomBy(1 / 1.5); announceWhere(); }
    if (event.key === '[' || event.key === ']') {
      const i = RADIUS_STEPS.findIndex((m) => m >= state.radius);
      state.radius = RADIUS_STEPS[Math.max(0, Math.min(RADIUS_STEPS.length - 1, (i < 0 ? RADIUS_STEPS.length - 1 : i) + (event.key === ']' ? 1 : -1)))];
      fit(); draw(); announceWhere();
    }
  }
  svg.addEventListener('keydown', onMapKey);

  // Typing a place.
  const search = h('input', {
    type: 'search', class: 'input area-map__search', placeholder: 'Type a city or neighborhood',
    'aria-label': 'Where you are', autocomplete: 'off', 'aria-controls': suggestions.id, 'aria-expanded': 'false',
    onInput: () => drawSuggestions(),
    onKeydown: (event) => {
      // Down arrow goes into the matches; Escape closes them.
      if (event.key === 'ArrowDown' && !suggestions.hidden) { event.preventDefault(); suggestions.querySelector('button')?.focus(); return; }
      if (event.key === 'Escape' && !suggestions.hidden) { suggestions.hidden = true; search.setAttribute('aria-expanded', 'false'); return; }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const [place] = searchPlaces(search.value, 1);
      if (place) goTo(place);
      else showToast('We couldn’t find that. Try the nearest city, or drag the map to where you are.');
    },
  });
  function drawSuggestions() {
    const matches = searchPlaces(search.value);
    suggestions.hidden = !matches.length;
    search.setAttribute('aria-expanded', String(matches.length > 0));
    replaceChildren(suggestions, matches.map((place) => h('li', {},
      h('button', { type: 'button', class: 'area-map__suggestion', onClick: () => goTo(place) }, icon('pin', 13), ` ${fullName(place)}`))));
  }
  // Up and down move through the matches; Escape goes back to typing.
  suggestions.addEventListener('keydown', (event) => {
    const buttons = [...suggestions.querySelectorAll('button')];
    const i = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') { event.preventDefault(); buttons[Math.min(buttons.length - 1, i + 1)]?.focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); if (i <= 0) search.focus(); else buttons[i - 1].focus(); }
    if (event.key === 'Escape') { suggestions.hidden = true; search.setAttribute('aria-expanded', 'false'); search.focus(); }
  });
  function goTo(place) {
    state.lat = place.lat;
    state.lng = place.lng;
    search.value = fullName(place);
    suggestions.hidden = true;
    fit();
    draw();
  }

  const useHere = h('button', {
    type: 'button', class: 'button button--small',
    onClick: () => {
      if (!navigator.geolocation) { showToast('This browser can’t share your location. Type a place or drag the map.'); return; }
      navigator.geolocation.getCurrentPosition(
        // Rounded to about a mile before anything else sees it.
        ({ coords }) => { state.lat = Math.round(coords.latitude * 50) / 50; state.lng = Math.round(coords.longitude * 50) / 50; fit(); draw(); },
        () => showToast('Couldn’t get your location. Type a place or drag the map.'),
        { timeout: 10000 },
      );
    },
  }, icon('pin', 14), ' Use my location');

  const PRIVACY_NOTE = 'Only this rough area is kept (to about half a mile), never an exact address. Only you see it.';
  const privacy = h('p', { class: 'area-map__privacy' }, PRIVACY_NOTE);
  const zoomButton = (label, text, factor) => h('button', { type: 'button', class: 'area-map__zoom-button', 'aria-label': label, title: label, onClick: () => zoomBy(factor) }, text);

  replaceChildren(root,
    h('div', { class: 'area-map__bar' }, h('span', { class: 'area-map__search-wrap' }, search, suggestions), useHere),
    h('div', { class: 'area-map__stage' }, svg,
      h('span', { class: 'area-map__zoom' }, zoomButton('Zoom in', '+', 1.6), zoomButton('Zoom out', '−', 1 / 1.6),
        h('button', { type: 'button', class: 'area-map__zoom-button', 'aria-label': 'See the whole world', title: 'See the whole world', onClick: () => { if (street) street.wholeWorld(); else { state.zoom = MIN_ZOOM; draw(); } } }, icon('globe', 14)))),
    h('div', { class: 'area-map__footer' },
      h('p', { class: 'area-map__summary' }, icon('pin', 14), ' Within ', radiusSelect, summaryText, mapStatus),
      h('button', {
        type: 'button', class: 'button button--primary',
        onClick: () => onSave({ lat: Number(state.lat.toFixed(2)), lng: Number(state.lng.toFixed(2)), label: `Near ${(nameNear(state) ?? 'here').replace(/ \(about.*\)$/, '')}`, radiusMiles: state.radius }),
      }, saveLabel)),
    privacy);
  draw();

  // Streets, when the page can load them (street-map.js); otherwise this map stays.
  const stage = root.querySelector('.area-map__stage');
  requestAnimationFrame(() => mountStreetMap(stage, state, {
    onMove: () => { drawSummary(); announceWhere(); },
    onReady: (ready) => {
      street = ready;
      ready.map.getContainer().addEventListener('keydown', onMapKey);
      privacy.textContent = `${PRIVACY_NOTE} The street map comes from OpenFreeMap (OpenStreetMap data), which keeps no accounts or cookies.`;
    },
  }));
  return root;
}
