// @ts-check
/**
 * svg.js — a tiny helper for building SVG elements, like h() for HTML.
 *
 *   svg('circle', { cx: 10, cy: 10, r: 4, class: 'dot' })
 *   svg('g', { transform: 'translate(5 5)' }, child1, child2)
 *
 * Attributes are set as-is (null and undefined are skipped); children can
 * be elements, strings (become text), or null (skipped).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attributes = {}, ...children) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined && value !== false) element.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}
