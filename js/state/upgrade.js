// @ts-check
/**
 * upgrade.js — bringing a saved state up to date when the prototype changes,
 * instead of throwing it away (Leo, Nov 16).
 *
 *   saved state (yours: what you made, changed, deleted)
 *        +  this version's sample data (js/data/demo-state.js)
 *        →  yours, plus only the sample content that's new since you last loaded
 *
 * How it tells what's new: a save remembers every id the sample data had
 * when it last loaded (`demoSeen`). On an update, anything in the new sample
 * data with an id it hasn't seen (a new group, post, event, person, module)
 * is added where it belongs. Everything else is left as you have it, so
 * your edits and deletions stay. Changes to sample content you've already
 * seen aren't pushed into your copy (that's what "Reset
 * demo" is for).
 *
 * When the saved shape changes, add a step to MIGRATIONS (oldest first);
 * each runs once, on saves from before its version. Most shape changes need
 * none: the app reads old shapes (normalizeTask, normalizeEvent, …).
 *
 *   DATA_VERSION                               bump when the sample data or the shape changes
 *   upgradeState(saved, makeDemo)              → { state, upgraded, added }
 *   stampFresh(state)                          a brand-new state: remember its ids
 */

/** Bump this when the sample data or the saved shape changes (it used to be the storage key's version). */
export const DATA_VERSION = 71;

/**
 * Steps for saves from before a version, oldest first.
 * @type {{ version: number, note: string, run: (state: any) => void }[]}
 */
const MIGRATIONS = [
  {
    version: 69,
    note: 'Canvas is no longer a feature: drop Canvas modules, Canvas vault files, and removed Canvas copies',
    run: (state) => {
      const isCanvasFile = (item) => item?.kind === 'module' && item.moduleType === 'canvas';
      for (const space of state.spaces ?? []) {
        space.modules = (space.modules ?? []).filter((m) => m.type !== 'canvas');
        for (const module of space.modules) {
          if (module.type === 'vault' && Array.isArray(module.data?.items)) module.data.items = module.data.items.filter((i) => !isCanvasFile(i));
        }
        if (Array.isArray(space.removedModules)) space.removedModules = space.removedModules.filter((r) => r.type !== 'canvas' && r.module?.type !== 'canvas');
      }
    },
  },
  {
    version: 70,
    note: 'Photo & video feeds become General feeds (in a grid); Photo carousels become Carousels of posts',
    run: (state) => {
      const convert = (module, ownerId) => {
        if (module?.type === 'photofeed') module.type = 'generalfeed';
        if (module?.type === 'carousel' && Array.isArray(module.data?.slides)) {
          const { slides, autoplay = true, seconds = 5 } = module.data;
          module.data = {
            posts: slides.map((slide, i) => ({
              id: `${module.id}-slide-${i}`, authorId: ownerId, createdAt: slide.addedAt ?? Date.now() - i, editedAt: null,
              text: slide.caption ?? '', media: slide.src ? [{ id: `${module.id}-photo-${i}`, kind: 'image', src: slide.src, caption: '' }] : [], attachments: [],
            })),
            events: [], autoplay, seconds,
          };
        }
      };
      for (const space of state.spaces ?? []) {
        for (const module of space.modules ?? []) convert(module, space.memberIds?.[0] ?? null);
        for (const removed of space.removedModules ?? []) convert(removed.module, space.memberIds?.[0] ?? null);
      }
    },
  },
  {
    version: 71,
    note: 'Announcements is the group Board: modules still called "Announcements" are renamed "Board" (old pinned posts become pins as they load)',
    run: (state) => {
      for (const space of state.spaces ?? []) {
        for (const module of space.modules ?? []) {
          if (module.type === 'announcements' && module.title === 'Announcements') module.title = 'Board';
        }
      }
    },
  }
];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Every `id` in the state (objects with a string id), in order. */
export function collectIds(value, out = []) {
  if (Array.isArray(value)) value.forEach((item) => collectIds(item, out));
  else if (isObject(value)) {
    if (typeof value.id === 'string') out.push(value.id);
    for (const [key, child] of Object.entries(value)) if (key !== 'demoSeen') collectIds(child, out);
  }
  return out;
}

/** Does this value hold anything new (an object with a new id, or a new id itself)? */
function holdsNew(value, newIds) {
  if (typeof value === 'string') return newIds.has(value);
  if (Array.isArray(value)) return value.some((item) => holdsNew(item, newIds));
  if (isObject(value)) return (typeof value.id === 'string' && newIds.has(value.id)) || Object.values(value).some((child) => holdsNew(child, newIds));
  return false;
}

/**
 * Yours, with what's new in `fresh` added. Lists of things with ids: yours
 * in your order, then the new ones. Lists of ids (memberIds): new ids added.
 * Objects: your values; a field only the new data has is added when it
 * holds something new. `added` counts the new things.
 */
function merge(saved, fresh, newIds, counter) {
  if (Array.isArray(saved) && Array.isArray(fresh)) {
    const withIds = fresh.filter((item) => isObject(item) && typeof item.id === 'string');
    if (withIds.length) {
      const freshById = new Map(withIds.map((item) => [item.id, item]));
      const savedIds = new Set(saved.filter(isObject).map((item) => item.id));
      const kept = saved.map((item) => (isObject(item) && freshById.has(item.id) ? merge(item, freshById.get(item.id), newIds, counter) : item));
      const added = withIds.filter((item) => newIds.has(item.id) && !savedIds.has(item.id));
      counter.added += added.length;
      return [...kept, ...added];
    }
    const newValues = fresh.filter((value) => typeof value === 'string' && newIds.has(value) && !saved.includes(value));
    return newValues.length ? [...saved, ...newValues] : saved;
  }
  if (isObject(saved) && isObject(fresh)) {
    const out = { ...saved };
    for (const [key, value] of Object.entries(fresh)) {
      if (key in saved) {
        if ((Array.isArray(saved[key]) && Array.isArray(value)) || (isObject(saved[key]) && isObject(value))) out[key] = merge(saved[key], value, newIds, counter);
      } else if (holdsNew(value, newIds)) {
        out[key] = structuredClone(value);
        counter.added += 1;
      }
    }
    return out;
  }
  return saved;
}

/**
 * Before Nov 16, starter modules in the sample data (on sample people's
 * homepages and blogs) got random ids ('mod-x7k2p9q') each time; now they're
 * steady ('blog-m-iris--generalfeed-1'). In an old save, give each such
 * module the steady id of the same kind of module in the same space, so the
 * update doesn't add them all again.
 */
function adoptSteadyModuleIds(saved, fresh) {
  const renames = new Map();
  const freshSpaces = new Map(fresh.spaces.map((space) => [space.id, space]));
  for (const space of saved.spaces ?? []) {
    const twin = freshSpaces.get(space.id);
    if (!twin) continue;
    const steady = (twin.modules ?? []).filter((m) => m.id.startsWith(`${space.id}--`));
    for (const module of space.modules ?? []) {
      if (!/^mod-[a-z0-9]{5,8}$/.test(module.id)) continue;
      const match = steady.find((m) => m.type === module.type && ![...renames.values()].includes(m.id));
      if (match) renames.set(module.id, match.id);
    }
  }
  if (!renames.size) return saved;
  const json = JSON.stringify(saved).replace(/"(mod-[a-z0-9]{5,8})"/g, (whole, id) => (renames.has(id) ? `"${renames.get(id)}"` : whole));
  return JSON.parse(json);
}

/** A brand-new state (from the sample data): remember its version and ids. */
export function stampFresh(state) {
  state.dataVersion = DATA_VERSION;
  state.demoSeen = [...new Set(collectIds(state))];
  return state;
}

/**
 * Bring a saved state up to date. `makeDemo()` builds this version's sample
 * data; it's only called when the save is from an older version.
 * @returns {{ state: any, upgraded: boolean, added: number }}
 */
export function upgradeState(original, makeDemo) {
  let saved = original;
  if (saved.dataVersion === DATA_VERSION) return { state: saved, upgraded: false, added: 0 };
  const fresh = makeDemo();
  // Saves from before Nov 16: sample modules that had random ids then have steady ones now. Match them up.
  if (!saved.demoSeen) saved = adoptSteadyModuleIds(saved, fresh);
  const freshIds = [...new Set(collectIds(fresh))];
  // Saves from before Nov 16 don't know what they've seen: count what they hold.
  const seen = new Set(saved.demoSeen ?? collectIds(saved));
  const newIds = new Set(freshIds.filter((id) => !seen.has(id)));
  const counter = { added: 0 };
  const state = newIds.size ? merge(saved, fresh, newIds, counter) : { ...saved };
  const from = saved.dataVersion ?? 67;
  for (const step of MIGRATIONS) {
    if (from < step.version) {
      try { step.run(state); } catch (error) { console.warn(`[3den] Upgrade step ${step.version} (${step.note}) failed:`, error); }
    }
  }
  state.dataVersion = DATA_VERSION;
  state.demoSeen = [...new Set([...seen, ...freshIds])];
  return { state, upgraded: true, added: counter.added };
}
