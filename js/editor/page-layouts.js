// @ts-check
/**
 * page-layouts.js — the ways a page (one tab of a group, blog, or homepage)
 * can be laid out. Chosen in edit mode with "Layout" in the bar at the
 * bottom (edit-bar.js); saved per tab (store.getPageLayout); drawn by grid.js.
 *
 *   grid        the 12-column grid: drag, drop, and resize anything (the default)
 *   spotlight   one module down the middle, growing with its content; the rest
 *               in a left and a right column
 *   sidebar     one module as the main column, the rest in a sidebar on the right
 *   magazine    one module across the top, the rest in three columns below
 *   channels    a list of the modules on the left; one open at a time, big
 *   tiles       every module the same size, three across
 *   split       two columns side by side
 *   single      one narrow column, each module as long as its content
 *   masonry     three columns, each module dropped into the shortest one
 *   lanes       modules as tall columns side by side, scrolling sideways
 *   storefront  one module across the top, then a main column and a rail
 *   timeline    one column along a spine, the most recently active module first
 *
 * `featured` names the column that holds one chosen module (layout.featuredId:
 * "Featured" in the bar, or drag a module onto that column). `slots` are
 * columns people place modules in by dragging (saved as module.slot); a
 * module whose slot doesn't fit the layout goes by its place in the order.
 * Everything else flows in the modules' order.
 *
 * arrange(kind, modules, featuredId, featuredRows) works out the columns; grid.js draws
 * them. A featured module that grows with its content (Spotlight, Main and
 * sidebar) gets a fixed height once someone drags its resize handle
 * (featuredRows; "Fit to content" in the bar undoes it). Frame modes: 'fixed' (the module's set height), 'grow' (as tall as
 * its content), 'fill' (the column's height), 'tile' (one shared height).
 */

export const LAYOUTS = [
  { id: 'grid', label: 'Grid', description: 'Drag, drop, and resize modules anywhere' },
  { id: 'spotlight', label: 'Spotlight', description: 'One module down the middle, others on both sides', featured: 'center' },
  { id: 'sidebar', label: 'Main and sidebar', description: 'One main module, the rest in a sidebar', featured: 'main' },
  { id: 'magazine', label: 'Magazine', description: 'One module across the top, three columns below', featured: 'hero' },
  { id: 'channels', label: 'Channels', description: 'A list of modules, one open at a time' },
  { id: 'tiles', label: 'Even tiles', description: 'Every module the same size' },
  { id: 'split', label: 'Split', description: 'Two columns side by side' },
  { id: 'single', label: 'Single column', description: 'A narrow stack, like a newsletter' },
  { id: 'masonry', label: 'Masonry', description: 'Three columns of different heights' },
  { id: 'lanes', label: 'Lanes', description: 'Tall columns that scroll sideways' },
  { id: 'storefront', label: 'Storefront', description: 'One module across the top, then a main column and a rail', featured: 'hero' },
  { id: 'timeline', label: 'Timeline', description: 'Most recently active first, along a spine' },
];

export const layoutById = (id) => LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];

/** Module types that make a good featured module, best first. */
export const FEATURE_FIRST = ['generalfeed', 'forum', 'textfeed', 'photofeed', 'articles', 'announcements', 'chat', 'events', 'calendar'];

/** The module to feature when none is chosen (or the chosen one is gone). */
export function defaultFeatured(modules) {
  return (modules.find((m) => FEATURE_FIRST.includes(m.type)) ?? modules[0])?.id ?? null;
}

/** The newest createdAt / updatedAt / at / sentAt in a module's data (looks a few levels down). */
export function lastActivity(module) {
  let newest = 0;
  const visit = (value, depth) => {
    if (!value || typeof value !== 'object' || depth > 4) return;
    if (Array.isArray(value)) { for (const item of value.slice(-200)) visit(item, depth + 1); return; }
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === 'number' && v > 1e12 && /^(createdAt|updatedAt|at|sentAt|editedAt)$/.test(key)) newest = Math.max(newest, v);
      else if (v && typeof v === 'object') visit(v, depth + 1);
    }
  };
  visit(module.data, 0);
  return newest;
}

/** Split modules between two named slots: their saved slot if it fits, else the first half / second half. */
function bySlot(modules, [first, second]) {
  const out = { [first]: [], [second]: [] };
  const unplaced = [];
  for (const m of modules) (m.slot === first || m.slot === second ? out[m.slot] : unplaced).push(m);
  const half = Math.ceil(modules.length / 2);
  for (const m of unplaced) (out[first].length < half ? out[first] : out[second]).push(m);
  return out;
}

const frames = (modules, mode) => modules.map((module) => ({ module, mode }));

/**
 * The columns for a layout:
 *   { className, rows: [{ className, columns: [{ slot, drop, className, frames: [{ module, mode }] }] }] }
 * `drop` says what dropping on the column does: 'featured' (feature the module),
 * 'slot' (place it in this column), 'order' (move it in the order), or null.
 */
export function arrange(kind, modules, featuredId, featuredRows = null) {
  const def = layoutById(kind);
  const featured = def.featured ? modules.find((m) => m.id === featuredId) ?? modules.find((m) => m.id === defaultFeatured(modules)) : null;
  const rest = modules.filter((m) => m !== featured);
  const column = (slot, drop, list, mode, className = '') => ({ slot, drop, className, frames: frames(list, mode) });
  // The featured module: as tall as its content, or the height set with its handle.
  const featuredColumn = (slot, className) => ({ slot, drop: 'featured', className,
    frames: featured ? [{ module: featured, mode: featuredRows ? 'fixed' : 'grow', rows: featuredRows, featured: true }] : [] });
  const row = (className, ...columns) => ({ className, columns });

  switch (kind) {
    case 'spotlight': {
      const sides = bySlot(rest, ['left', 'right']);
      return { rows: [row('layout-row--spotlight',
        column('left', 'slot', sides.left, 'fixed', 'layout-col--side'),
        featuredColumn('center', 'layout-col--center'),
        column('right', 'slot', sides.right, 'fixed', 'layout-col--side'))] };
    }
    case 'sidebar':
      return { rows: [row('layout-row--sidebar',
        featuredColumn('main', 'layout-col--main'),
        column('side', 'order', rest, 'fixed', 'layout-col--side'))] };
    case 'magazine':
    case 'storefront': {
      const hero = row('layout-row--hero', column('hero', 'featured', featured ? [featured] : [], 'fixed', 'layout-col--hero'));
      if (kind === 'storefront') {
        const parts = bySlot(rest, ['main', 'rail']);
        if (!parts.main.length && parts.rail.length) parts.main.push(parts.rail.shift());
        return { rows: [hero, row('layout-row--storefront',
          column('main', 'slot', parts.main, 'fixed', 'layout-col--main'),
          column('rail', 'slot', parts.rail, 'fixed', 'layout-col--side'))] };
      }
      const cols = [[], [], []];
      rest.forEach((m, i) => cols[i % 3].push(m));
      return { rows: [hero, row('layout-row--three', ...cols.map((list, i) => column(`col${i}`, 'order', list, 'fixed', 'layout-col--third')))] };
    }
    case 'split': {
      const sides = bySlot(modules, ['left', 'right']);
      return { rows: [row('layout-row--split', column('left', 'slot', sides.left, 'fixed', 'layout-col--half'), column('right', 'slot', sides.right, 'fixed', 'layout-col--half'))] };
    }
    case 'single':
      return { rows: [row('layout-row--single', column('single', 'order', modules, 'grow', 'layout-col--single'))] };
    case 'tiles':
      return { rows: [row('layout-row--tiles', column('tiles', 'order', modules, 'tile', 'layout-col--tiles'))] };
    case 'masonry': {
      // Each module into the shortest column so far, by its set height.
      const cols = [[], [], []];
      const heights = [0, 0, 0];
      for (const m of modules) {
        const i = heights.indexOf(Math.min(...heights));
        cols[i].push(m);
        heights[i] += (m.rows ?? 10) + 1;
      }
      return { rows: [row('layout-row--three', ...cols.map((list, i) => column(`col${i}`, 'order', list, 'fixed', 'layout-col--third')))] };
    }
    case 'lanes':
      return { rows: [row('layout-row--lanes', column('lanes', 'order', modules, 'fill', 'layout-col--lanes'))] };
    case 'timeline': {
      const sorted = [...modules].sort((a, b) => lastActivity(b) - lastActivity(a));
      return { rows: [row('layout-row--timeline', column('timeline', null, sorted, 'fixed', 'layout-col--timeline'))] };
    }
    default:
      return null; // grid and channels are drawn by grid.js itself
  }
}
