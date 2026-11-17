// @ts-check
/**
 * places.js — where things are, for "events near me".
 *
 * The prototype has no map service, so it knows a short list of areas in
 * and around the (made-up) city the demo is set in, each with a latitude
 * and longitude. An event can be pinned to one (event.area), and your
 * account has a home area (or your current location) and a radius
 * (member.location, set in Account settings → Your area).
 *
 *   PLACES                       the areas, nearest the middle of town first
 *   placeById('eastside')        → { id, name, lat, lng }
 *   guessPlace('Riverside Park, north field') → the Riverside Park area, or null
 *   distanceMiles(a, b)          → miles between two { lat, lng }
 *   RADIUS_OPTIONS               the radius choices, in miles (null = anywhere)
 *
 * A real 3den would use a geocoding service for addresses instead.
 */

export const PLACES = [
  { id: 'juniper', name: 'Juniper Lane', lat: 39.9612, lng: -75.1702 },
  { id: 'crestline', name: 'Crestline', lat: 39.9648, lng: -75.1655 },
  { id: 'downtown', name: 'Downtown', lat: 39.9526, lng: -75.1652 },
  { id: 'riverside', name: 'Riverside Park', lat: 39.9705, lng: -75.1820 },
  { id: 'eastside', name: 'Eastside', lat: 39.9560, lng: -75.1420 },
  { id: 'lincoln', name: 'Lincoln', lat: 39.9790, lng: -75.1590 },
  { id: 'westgate', name: 'Westgate', lat: 39.9550, lng: -75.2150 },
  { id: 'harbor', name: 'Harbor', lat: 39.9400, lng: -75.1400 },
  { id: 'north-hills', name: 'North Hills', lat: 40.0450, lng: -75.1800 },
  { id: 'maple-falls', name: 'Maple Falls', lat: 40.2400, lng: -75.2800 },
  { id: 'lake-ridge', name: 'Lake Ridge', lat: 40.4300, lng: -75.0500 },
  // New York, about 80 miles away: where the growth model's people live (js/data/demo/growth.js).
  { id: 'bushwick', name: 'Bushwick (NYC)', lat: 40.6944, lng: -73.9213 },
  { id: 'williamsburg', name: 'Williamsburg (NYC)', lat: 40.7081, lng: -73.9571 },
  { id: 'ridgewood', name: 'Ridgewood (NYC)', lat: 40.7044, lng: -73.9018 },
  { id: 'lower-east-side', name: 'Lower East Side (NYC)', lat: 40.7150, lng: -73.9843 },
  { id: 'crown-heights', name: 'Crown Heights (NYC)', lat: 40.6694, lng: -73.9422 },
  { id: 'harlem', name: 'Harlem (NYC)', lat: 40.8116, lng: -73.9465 },
  { id: 'astoria', name: 'Astoria (NYC)', lat: 40.7644, lng: -73.9235 },
  { id: 'park-slope', name: 'Park Slope (NYC)', lat: 40.6710, lng: -73.9814 },
];

/** Words in a location that point to an area (besides the area's own name). */
const LANDMARKS = {
  juniper: ['juniper', 'building a', 'building b', 'branch library'],
  crestline: ['crestline'],
  downtown: ['mill st', 'backroom', 'city hall'],
  riverside: ['riverside', 'river path'],
  eastside: ['eastside', 'pantry'],
  lincoln: ['lincoln elementary', 'lincoln'],
  westgate: ['westgate'],
  harbor: ['harbor', 'pier'],
  'north-hills': ['north hills'],
  'maple-falls': ['maple falls'],
  'lake-ridge': ['lake ridge'],
};

export const RADIUS_OPTIONS = [
  { miles: 1, label: 'Within 1 mile' },
  { miles: 3, label: 'Within 3 miles' },
  { miles: 5, label: 'Within 5 miles' },
  { miles: 10, label: 'Within 10 miles' },
  { miles: 25, label: 'Within 25 miles' },
  { miles: 50, label: 'Within 50 miles' },
  { miles: null, label: 'Anywhere' },
];

export function placeById(id) {
  return PLACES.find((place) => place.id === id) ?? null;
}

/** The area a written location most likely means, or null. */
export function guessPlace(text) {
  const lower = (text ?? '').toLowerCase();
  if (!lower.trim()) return null;
  const hit = PLACES.find((place) => (LANDMARKS[place.id] ?? [place.name.toLowerCase()]).some((word) => lower.includes(word)));
  return hit ?? null;
}

/** Miles between two points (the haversine formula). */
export function distanceMiles(a, b) {
  const EARTH_RADIUS_MILES = 3958.8;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/** "0.4 mi", "12 mi". */
export function formatMiles(miles) {
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

/** The nearest known area to a point (for "Near Eastside" after using your current location). */
export function nearestPlace(point) {
  return PLACES.reduce((best, place) => (distanceMiles(point, place) < distanceMiles(point, best) ? place : best), PLACES[0]);
}
