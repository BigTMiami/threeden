// @ts-check
/**
 * street-map.js — the detailed layer of the area map: streets, buildings,
 * parks, and place names, drawn by MapLibre GL JS from OpenFreeMap's
 * OpenStreetMap tiles.
 *
 *   mountStreetMap(stage, state, { onMove, onReady })
 *     → Promise<street | null>   (null: couldn't load, so the built-in map stays)
 *
 *   street.fitRadius()   zoom so the circle fills about three fifths of the height
 *   street.update()      redraw the circle (after the distance changes) and follow state.lat/lng
 *   street.zoomBy(f)     zoom in (f > 1) or out
 *   street.wholeWorld()
 *
 * The circle stays in the middle and the map moves under it, like the
 * built-in map. MapLibre handles dragging, pinching, the wheel, and the
 * arrow and + − keys; moving updates state.lat/lng and calls onMove().
 *
 * Where it comes from, and what it costs in privacy:
 *   • MapLibre's code from a public CDN (unpkg, then jsDelivr). A launch
 *     version should ship its own copy instead.
 *   • The map tiles from OpenFreeMap (tiles.openfreemap.org): free, no API
 *     key, no accounts, no cookies. Like any web server it sees which tiles
 *     load (roughly where on the map you're looking) and from what IP
 *     address. Nothing about who you are is sent.
 *   • REMINDER for the backend: move to Protomaps on 3den's own servers
 *     (one PMTiles file on object storage), so no outside service sees
 *     where people look. See HANDOFF.md, "Before the backend".
 *
 * If any of it can't load within a few seconds (no network, or a sandbox
 * like the artifact viewer that blocks other websites), this resolves to
 * null and nothing changes on the page.
 */

const LIBRARY = [
  { js: 'https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js', css: 'https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css' },
  { js: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl.js', css: 'https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl.css' },
];
export const STREET_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const LOAD_TIMEOUT_MS = 8000;
const EARTH_RADIUS_MILES = 3958.8;

let library = null; // Promise<maplibregl | null>, shared by every map on the page

function loadFile(tag, attrs) {
  return new Promise((resolve) => {
    const node = document.createElement(tag);
    Object.assign(node, attrs);
    node.onload = () => resolve(true);
    node.onerror = () => { node.remove(); resolve(false); };
    document.head.append(node);
    setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
  });
}

/** MapLibre, from the page if it's already there, or from a CDN. */
function loadLibrary() {
  library ??= (async () => {
    // @ts-ignore: set by the library's script
    if (window.maplibregl) return window.maplibregl;
    for (const source of LIBRARY) {
      loadFile('link', { rel: 'stylesheet', href: source.css, crossOrigin: 'anonymous' });
      if (await loadFile('script', { src: source.js, async: true, crossOrigin: 'anonymous' })) {
        // @ts-ignore
        if (window.maplibregl) return window.maplibregl;
      }
    }
    return null;
  })();
  return library;
}

/** A circle of `miles` around a point, as a GeoJSON polygon (64 sides). */
export function circlePolygon(lat, lng, miles, sides = 64) {
  const d = miles / EARTH_RADIUS_MILES;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const ring = [];
  for (let i = 0; i <= sides; i += 1) {
    const θ = (i / sides) * 2 * Math.PI;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
    ring.push([((((λ2 * 180) / Math.PI) + 540) % 360) - 180, (φ2 * 180) / Math.PI]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

/** [[west, south], [east, north]] around the circle. */
function circleBounds(lat, lng, miles) {
  const dLat = (miles / EARTH_RADIUS_MILES) * (180 / Math.PI);
  const dLng = dLat / Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  return [[lng - dLng, lat - dLat], [lng + dLng, lat + dLat]];
}

/**
 * Put the street map over `stage` (the built-in map's box). `state` is the
 * area map's own { lat, lng, radius } object, shared and kept up to date.
 */
export async function mountStreetMap(stage, state, { onMove = () => {}, onReady = (_street) => {} } = {}) {
  const maplibregl = await loadLibrary();
  if (!maplibregl || !stage.isConnected) return null;

  const box = document.createElement('div');
  box.className = 'area-map__street';
  box.setAttribute('role', 'application');
  box.setAttribute('aria-label', 'Street map. Drag to move it under the circle, scroll or pinch to zoom. Arrow keys move, plus and minus zoom, and the square brackets change the distance.');
  const pin = document.createElement('span');
  pin.className = 'area-map__street-pin';
  pin.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'area-map__street-label';
  label.setAttribute('aria-hidden', 'true');
  stage.append(box, pin, label);

  let map;
  try {
    map = new maplibregl.Map({
      container: box,
      style: STREET_STYLE,
      center: [state.lng, state.lat],
      zoom: 11,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
  } catch {
    box.remove(); pin.remove(); label.remove();
    return null;
  }
  map.touchZoomRotate?.disableRotation?.();

  // Wait for the style to load; give up (and leave the built-in map) if it doesn't.
  const loaded = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
    map.once('load', () => { clearTimeout(timer); resolve(true); });
    map.once('error', () => { clearTimeout(timer); resolve(false); });
  });
  if (!loaded || !stage.isConnected) {
    try { map.remove(); } catch { /* already gone */ }
    box.remove(); pin.remove(); label.remove();
    return null;
  }

  const accent = getComputedStyle(stage).getPropertyValue('--color-accent').trim() || '#2f5bd3';
  map.addSource('area', { type: 'geojson', data: circlePolygon(state.lat, state.lng, state.radius) });
  map.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': accent, 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': accent, 'line-width': 2.5 } });

  let moving = false; // true while we move the map ourselves
  const street = {
    map,
    update() {
      map.getSource('area')?.setData(circlePolygon(state.lat, state.lng, state.radius));
      label.textContent = `${state.radius} ${state.radius === 1 ? 'mile' : 'miles'}`;
      const c = map.getCenter();
      if (Math.abs(c.lat - state.lat) > 1e-6 || Math.abs(c.lng - state.lng) > 1e-6) {
        moving = true;
        map.jumpTo({ center: [state.lng, state.lat] });
        moving = false;
      }
    },
    fitRadius() {
      moving = true;
      const height = box.clientHeight || 360;
      // The circle's diameter is about three fifths of the map's height.
      const pad = Math.max(10, Math.round(height * 0.2));
      map.fitBounds(circleBounds(state.lat, state.lng, state.radius), { padding: pad, duration: 0, maxZoom: 16 });
      map.jumpTo({ center: [state.lng, state.lat] });
      moving = false;
      street.update();
    },
    zoomBy(factor) { map.zoomTo(map.getZoom() + Math.log2(factor), { duration: 200 }); },
    wholeWorld() { map.zoomTo(0.5, { duration: 300 }); },
  };

  map.on('move', () => {
    if (moving) return;
    const c = map.getCenter();
    state.lat = c.lat;
    state.lng = ((c.lng + 540) % 360) - 180;
    map.getSource('area')?.setData(circlePolygon(state.lat, state.lng, state.radius));
    onMove();
  });

  stage.classList.add('has-street-map');
  street.fitRadius();
  onReady(street);
  return street;
}
