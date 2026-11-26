/**
 * icons.js — the app's line icons.
 *
 * Each icon is a list of SVG path strings drawn on a 24×24 grid with a
 * stroke (no fill), so icons pick up the surrounding text color.
 *
 * Usage:
 *   import { icon } from './icons.js';
 *   button.append(icon('trash'));
 *
 * To add an icon, add an entry to ICON_PATHS below.
 */

const ICON_PATHS = {
  // Modules
  announcements: ['M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z', 'M15 9a4 4 0 0 1 0 6', 'M18 6a8 8 0 0 1 0 12'],
  calendar: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  todo: ['M4 6l2 2 3-3', 'M4 13l2 2 3-3', 'M12 7h8', 'M12 14h8', 'M12 20h8'],
  note: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 12h7', 'M9 16h5'],
  gantt: ['M4 5h9', 'M8 10h10', 'M6 15h7', 'M11 20h9'],
  kanban: ['M4 4h4v16H4z', 'M10 4h4v10h-4z', 'M16 4h4v13h-4z'],
  relationship: ['M4 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M16 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M10 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M8 6h8', 'M7 8l4 8', 'M17 8l-4 8'],
  forum: ['M4 5h16v11H9l-5 4z', 'M8 9h8', 'M8 12h5'],
  vault: ['M3 7h7l2 2h9v10H3z'],

  // Actions
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  grip: ['M9 6h.01', 'M15 6h.01', 'M9 12h.01', 'M15 12h.01', 'M9 18h.01', 'M15 18h.01'],
  arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14', 'M6 13l6 6 6-6'],
  settings: ['M4 7h10', 'M18 7h2', 'M16 5v4', 'M4 17h4', 'M12 17h8', 'M10 15v4'],
  pin: ['M12 17v5', 'M8 3h8l-1 6 3 4H6l3-4z'],
  check: ['M5 12l4 4 10-10'],
  chevronLeft: ['M15 5l-7 7 7 7'],
  chevronRight: ['M9 5l7 7-7 7'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronUp: ['M6 15l6-6 6 6'],
  lock: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M14 6l4 4'],
  brush: ['M15 4l5 5-8 8-5-5z', 'M7 12c-3 0-4 3-4 6 2 0 5 0 6-2'],
  eraser: ['M7 20h10', 'M5 15l8-8 6 6-5 5H9z'],
  fill: ['M5 11l7-7 7 7-7 7z', 'M19 15c0 2 1 3 1 4a1 1 0 0 1-2 0c0-1 1-2 1-4z'],
  line: ['M5 19L19 5'],
  rect: ['M4 6h16v12H4z'],
  ellipse: ['M12 5c5 0 8 3 8 7s-3 7-8 7-8-3-8-7 3-7 8-7z'],
  textTool: ['M5 6h14', 'M12 6v13', 'M9 19h6'],
  dropper: ['M14 4l6 6', 'M17 7l-9 9-4 1 1-4 9-9'],
  layers: ['M12 4l8 4-8 4-8-4z', 'M4 12l8 4 8-4', 'M4 16l8 4 8-4'],
  eyeOff: ['M3 3l18 18', 'M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.3 3.9', 'M6.6 6.6A17 17 0 0 0 2 12s4 6 10 6a9.7 9.7 0 0 0 4.4-1'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  hand: ['M8 13V6a1.5 1.5 0 0 1 3 0v5', 'M11 11V4.5a1.5 1.5 0 0 1 3 0V11', 'M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 13'],

  newspaper: ['M4 5h13v14H6a2 2 0 0 1-2-2V5z', 'M17 9h3v8a2 2 0 0 1-2 2', 'M7 9h7', 'M7 12.5h7', 'M7 16h4'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  reset: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v4h4'],
  resize: ['M20 12l-8 8', 'M20 18l-2 2'],
  arrowLeft: ['M19 12H5', 'M11 6l-6 6 6 6'],
  arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
  expand: ['M14 4h6v6', 'M20 4l-7 7', 'M10 20H4v-6', 'M4 20l7-7'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],

  // Forum
  upvote: ['M12 5l7 8h-4v6H9v-6H5z'],
  downvote: ['M12 19l-7-8h4V5h6v6h4z'],
  reply: ['M10 9V5l-7 7 7 7v-4c5 0 8 1.5 11 5-1-6-4-10-11-11z'],

  // Vault items
  folder: ['M3 7h7l2 2h9v10H3z'],
  file: ['M6 3h9l4 4v14H6z', 'M14 3v5h5'],
  link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7', 'M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 20h16'],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4', 'M15 9h.01'],
  home: ['M4 11l8-7 8 7', 'M6 9.5V20h12V9.5', 'M10 20v-6h4v6'],
  cart: ['M3 4h3l2.5 11h10l2-8H7', 'M10 20h.01', 'M17 20h.01'],
  ticket: ['M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z', 'M14 7v10'],
  heart: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  wheel: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 3v18', 'M3 12h18', 'M5.6 5.6l12.8 12.8', 'M18.4 5.6L5.6 18.4'],
  chat: ['M4 5h16v11H9l-5 4z'],
  send: ['M4 12l16-8-6 16-2-7z'],
  share: ['M12 15V3', 'M8 7l4-4 4 4', 'M8 11H5v10h14V11h-3'],
  mail: ['M3 6h18v12H3z', 'M3 7l9 6 9-6'],
  video: ['M3 7h12v10H3z', 'M15 10l6-3v10l-6-3z'],
  wallet: ['M4 7h15a1 1 0 0 1 1 1v11H4z', 'M4 7V6a2 2 0 0 1 2-2h10v3', 'M15 13h5'],
  globe: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
  slides: ['M3 6h18v11H3z', 'M9 21h.01', 'M12 21h.01', 'M15 21h.01'],
  phone: ['M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M11 18h2'],
  crop: ['M6 2v14a2 2 0 0 0 2 2h14', 'M2 6h14a2 2 0 0 1 2 2v14'],
  survey: ['M8 4h8v3H8z', 'M6 5.5H5v15h14v-15h-1', 'M8 11l1.5 1.5L12 10', 'M14 11.5h3', 'M8 16l1.5 1.5L12 15', 'M14 16.5h3'],
  clock: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 7v5l3 2'],
  bell: ['M6 16V11a6 6 0 0 1 12 0v5l2 2H4z', 'M10 20a2 2 0 0 0 4 0'],
  bellOff: ['M6 16V11a6 6 0 0 1 12 0v5l2 2H4z', 'M10 20a2 2 0 0 0 4 0', 'M4 4l16 16'],
  dashboard: ['M4 4h7v9H4z', 'M13 4h7v5h-7z', 'M13 11h7v9h-7z', 'M4 15h7v5H4z'],

  // Text editing (js/ui/rich-text-editor.js)
  undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
  redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
  listBullet: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  listNumber: ['M10 6h10', 'M10 12h10', 'M10 18h10', 'M4 5l1.5-1V9', 'M3.5 14.5a1.5 1.5 0 0 1 3 .5L3.5 19h3'],
  checklist: ['M3 5h5v5H3z', 'M4 7.5l1.3 1.3L7.5 6', 'M3 14h5v5H3z', 'M11 7.5h10', 'M11 16.5h10'],
  indent: ['M4 5h16', 'M11 10h9', 'M11 14h9', 'M4 19h16', 'M4 9.5l3 2.5-3 2.5'],
  outdent: ['M4 5h16', 'M11 10h9', 'M11 14h9', 'M4 19h16', 'M7 9.5L4 12l3 2.5'],
  alignLeft: ['M4 6h16', 'M4 10h10', 'M4 14h16', 'M4 18h10'],
  alignCenter: ['M4 6h16', 'M7 10h10', 'M4 14h16', 'M7 18h10'],
  alignRight: ['M4 6h16', 'M10 10h10', 'M4 14h16', 'M10 18h10'],
  quote: ['M5 11h4v6H4v-5c0-3 1.5-5 4-6', 'M15 11h4v6h-5v-5c0-3 1.5-5 4-6'],
  rule: ['M4 12h16', 'M8 7h8', 'M8 17h8'],
  table: ['M4 5h16v14H4z', 'M4 10h16', 'M4 15h16', 'M10 5v14'],
  highlight: ['M14 4l6 6-8 8H6v-6z', 'M4 21h16'],
  clearFormat: ['M7 5h11', 'M12.5 5L9 19', 'M14 14l6 6', 'M20 14l-6 6'],
  strike: ['M5 12h14', 'M16 7a4 3 0 0 0-4-2c-2.5 0-4 1.2-4 3', 'M8 17a4 3 0 0 0 4 2c2.5 0 4-1.2 4-3'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  info: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 11v6', 'M12 7.5h.01'],
  bookmark: ['M6 3h12v18l-6-4-6 4z'],
  bookmarkFilled: ['M6 3h12v18l-6-4-6 4z', 'M9 7h6', 'M9 10h6'],
  hash: ['M5 9h14', 'M5 15h14', 'M10 4L8 20', 'M16 4l-2 16'],
  mic: ['M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3', 'M9 21h6'],
  stop: ['M7 7h10v10H7z'],
  play: ['M8 5l11 7-11 7z'],
  paperclip: ['M20 12l-7.5 7.5a5 5 0 0 1-7-7L13 5a3.3 3.3 0 0 1 4.7 4.7L10.5 17a1.7 1.7 0 0 1-2.4-2.4L15 7.7'],
  block: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M5.6 5.6l12.8 12.8'],
  shield: ['M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z', 'M9 12l2 2 4-4'],
  help: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6', 'M12 17h.01'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z'],
  bellRing: ['M6 16V11a6 6 0 0 1 12 0v5l2 2H4z', 'M10 21h4', 'M3 7a9 9 0 0 1 3-4', 'M21 7a9 9 0 0 0-3-4'],
  hand2: ['M8 12V5a1.5 1.5 0 0 1 3 0v6', 'M11 11V4a1.5 1.5 0 0 1 3 0v7', 'M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 4 16.5L3.2 13a1.5 1.5 0 0 1 2.7-1.2L8 15'],
  sort: ['M7 4v16', 'M3 16l4 4 4-4', 'M17 20V4', 'M13 8l4-4 4 4'],
  filter: ['M4 5h16l-6 7v6l-4 2v-8z'],
  repeat: ['M17 3l3 3-3 3', 'M4 11V9a3 3 0 0 1 3-3h13', 'M7 21l-3-3 3-3', 'M20 13v2a3 3 0 0 1-3 3H4'],
  user: ['M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8z', 'M4 21a8 8 0 0 1 16 0'],
  compass: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M15.5 8.5l-2 5-5 2 2-5z'],
  people: ['M9 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 1 0 0 7z', 'M2.5 20a6.5 6.5 0 0 1 13 0', 'M16 4.3a3.5 3.5 0 0 1 0 6.4', 'M18 14a6 6 0 0 1 3.5 6'],
  code: ['M9 7l-5 5 5 5', 'M15 7l5 5-5 5'],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Build an <svg> element for the named icon.
 * Icons are decorative by default (hidden from screen readers); give the
 * surrounding button an aria-label instead.
 */
export function icon(name, size = 16) {
  const paths = ICON_PATHS[name];
  if (!paths) throw new Error(`Unknown icon: "${name}"`);

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', name === 'grip' ? '3' : '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
