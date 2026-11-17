// @ts-check
/**
 * dom.js — tiny helpers for building DOM elements without a framework.
 *
 * The main helper is `h()` (short for "hyperscript"). It creates an element,
 * applies properties, and appends children in one call:
 *
 *   h('button', { class: 'btn', onClick: save }, 'Save')
 *
 * Property rules:
 *   - `class`            → element.className
 *   - `style`            → an object of CSS properties (custom properties
 *                          like '--event-color' work too), or a string
 *   - `dataset`          → an object copied onto element.dataset
 *   - `onSomething`      → addEventListener('something', handler)
 *   - `html`             → element.innerHTML (only use with trusted strings!)
 *   - any other key      → set as an attribute (false/null/undefined skip it)
 *
 * Children can be strings, numbers, elements, arrays, or null/false (skipped).
 */

export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') {
      element.className = value;
    } else if (key === 'style') {
      if (typeof value === 'string') element.style.cssText = value;
      else setStyles(element, value);
    } else if (key === 'dataset') {
      Object.assign(element.dataset, value);
    } else if (key === 'html') {
      element.innerHTML = value;
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'value' || key === 'checked' || key === 'selected') {
      // These must be set as properties, not attributes, to behave correctly.
      element[key] = value;
    } else {
      element.setAttribute(key, value === true ? '' : value);
    }
  }

  appendChildren(element, children);
  return element;
}

/** Apply an object of styles. Custom properties ('--name') need setProperty. */
function setStyles(element, styles) {
  for (const [property, value] of Object.entries(styles)) {
    if (property.startsWith('--')) element.style.setProperty(property, value);
    else element.style[property] = value;
  }
}

/** Append strings, nodes, or (nested) arrays of them to a parent element. */
export function appendChildren(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Remove every child of an element. */
export function clear(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

/** Replace all children of an element with new ones. */
export function replaceChildren(element, ...children) {
  clear(element);
  appendChildren(element, children);
}

/** Create a short random id, good enough for a prototype. */
export function makeId(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Wait until `delay` ms have passed without another call, then run `fn`. */
export function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
