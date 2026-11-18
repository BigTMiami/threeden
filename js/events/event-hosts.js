// @ts-check
/**
 * event-hosts.js — the "Hosts" field on a new or edited event.
 *
 *   Hosts   You're hosting. Add people or groups who host with you;
 *           hosts can edit the event.
 *           [(MA) Maya Ortiz ×]  Search by name or @username
 *           [👥 Porch Lights ×]  [Add a group… ▾]
 *
 * People come from anyone you can message (your groups, friends, and
 * family). Groups are the ones you're in, apart from the one the event
 * already lives in. A hosting group's members can all edit the event, and
 * it shows on that group's calendar too (js/editor/linked-items.js).
 *
 *   const hosts = hostsPicker({ me, cohostIds, hostGroupIds, homeGroupId,
 *     onChange: ({ cohostIds, hostGroupIds }) => … });
 *   form.append(hosts);
 */

import { h, replaceChildren } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { createPeopleSearch } from '../ui/people-search.js';
import { messageablePeople, recipientContext, suggestedIds } from '../messages/recipients.js';
import { getSpaces, getMember } from '../state/store.js';

/**
 * @param {object} options
 * @param {{ id: string }} options.me
 * @param {string[]} [options.cohostIds]
 * @param {string[]} [options.hostGroupIds]
 * @param {string|null} [options.homeGroupId]
 * @param {string} [options.label]
 * @param {string} [options.hint]
 * @param {(hosts: { cohostIds: string[], hostGroupIds: string[] }) => void} [options.onChange]
 */
export function hostsPicker({ me, cohostIds = [], hostGroupIds = [], homeGroupId = null, label = 'Hosts', hint = 'You’re hosting. Add people or groups who host with you. Hosts can edit it, and a group’s members all can.', onChange = () => {} }) {
  let people = [...cohostIds];
  let groups = [...hostGroupIds];
  const emit = () => onChange?.({ cohostIds: [...people], hostGroupIds: [...groups] });

  // Co-hosts already on the event stay choosable even if you can't message them.
  const choosable = [...messageablePeople(me), ...cohostIds.map(getMember).filter((m) => m && m.id !== me.id)]
    .filter((p, i, all) => all.findIndex((x) => x.id === p.id) === i);
  const search = createPeopleSearch({
    people: choosable,
    suggestedIds: suggestedIds(me),
    selectedIds: people,
    describe: (p) => recipientContext(me, p),
    label: 'Add a host',
    placeholder: 'Add people by name or @username',
    onChange: (ids) => { people = ids; emit(); },
  });

  const myGroups = () => getSpaces().filter((g) => g.kind === 'group' && g.memberIds.includes(me.id) && g.id !== homeGroupId);
  const groupSlot = h('div', { class: 'event-hosts__groups' });
  function drawGroups() {
    const chosen = groups.map((id) => getSpaces().find((g) => g.id === id)).filter(Boolean);
    const left = myGroups().filter((g) => !groups.includes(g.id));
    replaceChildren(groupSlot,
      chosen.map((g) => h('span', { class: 'chip event-hosts__group' }, icon('people', 13), ` ${g.name} `,
        h('button', {
          type: 'button', class: 'icon-button icon-button--subtle', 'aria-label': `${g.name} isn’t hosting`,
          onClick: () => { groups = groups.filter((id) => id !== g.id); emit(); drawGroups(); },
        }, icon('close', 10)))),
      left.length ? h('select', {
        class: 'input input--compact event-hosts__add-group', 'aria-label': 'Add a group as a host',
        onChange: (e) => { if (!e.target.value) return; groups = [...groups, e.target.value]; emit(); drawGroups(); },
      }, h('option', { value: '' }, 'Add a group…'), left.map((g) => h('option', { value: g.id }, g.name))) : null);
  }
  drawGroups();

  return h('div', { class: 'event-editor__field event-hosts' },
    h('span', { class: 'event-editor__label' }, label),
    h('span', { class: 'event-editor__hint' }, hint),
    search.element,
    groupSlot);
}
