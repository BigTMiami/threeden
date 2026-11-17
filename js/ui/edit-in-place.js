// @ts-check
/**
 * Edit in place: tap a title, a date, or a name to change it right there,
 * instead of hunting for an Edit button and a separate form.
 *
 *   editInPlace('h1', {
 *     className: 'event-page__title',
 *     label: 'Event name',
 *     fields: [{ key: 'title', value: event.title }],
 *     onSave: ({ title }) => updateEvent(id, (e) => { e.title = title; }),
 *     canEdit,
 *   });
 *
 * Several fields (a date and two times) edit together; the change is saved
 * when focus leaves them all, or on Enter. Escape puts the old value back.
 * People who can't edit just see the text.
 */

import { h, replaceChildren } from './dom.js';

/**
 * @typedef {{ key: string, value: string, type?: string, label?: string, required?: boolean }} Field
 * @param {string} tag
 * @param {{
 *   fields: Field[],
 *   onSave: (values: Record<string, string>) => void,
 *   label: string,
 *   display?: string,
 *   className?: string,
 *   canEdit?: boolean,
 * }} options
 * @returns {HTMLElement}
 */
export function editInPlace(tag, { fields, onSave, label, display, className = '', canEdit = true }) {
  const text = display ?? fields.map((f) => f.value).join(' ');
  const element = /** @type {HTMLElement} */ (h(tag, { class: className }, text));
  if (!canEdit) return element;

  element.classList.add('in-place');
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', `${label}: ${text}. Press Enter to change it.`);
  element.title = 'Click to change';

  let open = false;

  const start = () => {
    if (open) return;
    open = true;
    element.classList.add('is-editing');
    element.removeAttribute('role');
    element.removeAttribute('title');
    element.tabIndex = -1;

    const inputs = fields.map((field) => /** @type {HTMLInputElement} */ (h('input', {
      class: `input in-place__input in-place__input--${field.type ?? 'text'}`,
      type: field.type ?? 'text',
      value: field.value ?? '',
      'aria-label': field.label ?? label,
      size: field.type && field.type !== 'text' ? undefined : String(Math.max(8, (field.value ?? '').length + 2)),
    })));

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const values = Object.fromEntries(fields.map((f, i) => [f.key, inputs[i].value.trim()]));
      const changed = fields.some((f, i) => values[f.key] !== (f.value ?? ''));
      const missing = fields.some((f, i) => (f.required ?? i === 0) && !values[f.key]);
      open = false;
      element.classList.remove('is-editing');
      element.setAttribute('role', 'button');
      element.title = 'Click to change';
      element.tabIndex = 0;
      replaceChildren(element, text);
      if (save && changed && !missing) onSave(values);
      else if (save === false) element.focus(); // Escape: stay put, for keyboards
    };

    const group = h('span', { class: 'in-place__group' }, inputs);
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); finish(true); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
    });
    group.addEventListener('focusout', (event) => {
      const next = /** @type {Node | null} */ (event.relatedTarget);
      if (next && group.contains(next)) return;
      // Let a click on a date picker settle before deciding focus really left.
      setTimeout(() => { if (!group.contains(document.activeElement)) finish(true); }, 0);
    });

    replaceChildren(element, group);
    inputs[0].focus();
    if (inputs[0].type === 'text') inputs[0].select();
  };

  element.addEventListener('click', (event) => {
    if (open || /** @type {HTMLElement} */ (event.target).closest('a, button')) return;
    start();
  });
  element.addEventListener('keydown', (event) => {
    if (event.target !== element) return;
    if (!open && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); start(); }
  });
  return element;
}
