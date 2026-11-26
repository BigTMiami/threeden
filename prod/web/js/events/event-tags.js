// @ts-check
/**
 * event-tags.js — a few tags people can put on an event, so others can find
 * the kind of thing they like (Explore filters by them).
 *
 *   EVENT_TAGS                       the tags: { id, label, emoji }
 *   tagLabels(event)                 → [{ id, label, emoji }] for the event's tags
 *   renderEventTags(event)           → a row of little tag chips, or null
 *   tagPicker(selected, onChange)    → buttons to choose up to MAX_TAGS tags
 *
 * Saved as event.tags: ['music', 'free'].
 */

import { h } from '../ui/dom.js';

export const MAX_TAGS = 3;

export const EVENT_TAGS = [
  { id: 'music', label: 'Music', emoji: '🎵' },
  { id: 'food', label: 'Food & drink', emoji: '🍲' },
  { id: 'community', label: 'Community', emoji: '🏘️' },
  { id: 'meeting', label: 'Meeting', emoji: '🗣️' },
  { id: 'workshop', label: 'Workshop', emoji: '🛠️' },
  { id: 'volunteering', label: 'Volunteering', emoji: '🤝' },
  { id: 'arts', label: 'Arts & books', emoji: '🎨' },
  { id: 'sports', label: 'Sports', emoji: '⚽' },
  { id: 'outdoors', label: 'Outdoors', emoji: '🌳' },
  { id: 'family', label: 'Family-friendly', emoji: '👨‍👩‍👧' },
  { id: 'party', label: 'Party', emoji: '🎉' },
  { id: 'free', label: 'Free', emoji: '🆓' },
];

export function tagLabels(event) {
  return (event.tags ?? []).map((id) => EVENT_TAGS.find((tag) => tag.id === id)).filter(Boolean);
}

export function renderEventTags(event) {
  const tags = tagLabels(event);
  if (tags.length === 0) return null;
  return h('span', { class: 'event-tags', 'aria-label': 'Tags' },
    tags.map((tag) => h('span', { class: 'event-tag' }, `${tag.emoji} ${tag.label}`)));
}

/** Toggle buttons for choosing tags; at most MAX_TAGS. */
export function tagPicker(selected, onChange) {
  let chosen = [...selected];
  const root = h('div', { class: 'tag-picker', role: 'group', 'aria-label': `Tags (up to ${MAX_TAGS})` });

  function draw() {
    root.replaceChildren(...EVENT_TAGS.map((tag) => {
      const isOn = chosen.includes(tag.id);
      return h('button', {
        type: 'button',
        class: `tag-picker__tag${isOn ? ' is-on' : ''}`,
        'aria-pressed': String(isOn),
        disabled: !isOn && chosen.length >= MAX_TAGS,
        onClick: () => {
          chosen = isOn ? chosen.filter((id) => id !== tag.id) : [...chosen, tag.id];
          onChange(chosen);
          draw();
        },
      }, `${tag.emoji} ${tag.label}`);
    }));
  }
  draw();
  return root;
}
