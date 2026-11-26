// @ts-check
/**
 * coming-soon.js — module types that are planned but not built yet.
 *
 * They appear in the library with a "Soon" label so people can see what's
 * coming, but they can't be added to the page. When one gets built, give it
 * its own file (see registry.js) and remove it from this list.
 */

export function plannedModule(type, label, description, icon) {
  return {
    type,
    label,
    description,
    icon,
    defaultSpan: 6,
    defaultRows: 10,
    available: false,
    createInitialData: () => ({}),
    render: () => {},
  };
}

export const comingSoonModules = [
];
