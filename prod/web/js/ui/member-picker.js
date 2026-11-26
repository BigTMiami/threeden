// @ts-check
/**
 * member-picker.js — choose one or more group members.
 *
 * Shows a button with the chosen members' avatars. Clicking it opens a
 * small checklist of everyone in the group:
 *
 *   [ (LL)(AA) ]  ←  button
 *   ┌───────────────────┐
 *   │ ☑ (LL) Leo L      │
 *   │ ☑ (AA) Anna A     │
 *   │ ☐ (WW) William W  │
 *   │ ☐ (TM) Tino M     │
 *   │ Clear             │
 *   └───────────────────┘
 *
 * Usage:
 *   const picker = createMemberPicker({
 *     members, selectedIds: ['m-leo'], label: 'Assign "Pay rent"',
 *     onChange: (ids) => save(ids),
 *   });
 *   row.append(picker.element);
 *   picker.setSelected([]);   // e.g. after a form is submitted
 *
 * The checklist is attached to <body> and positioned next to the button,
 * so modules with scrolling bodies can't cut it off. It follows the button
 * when the page scrolls. Only one checklist is open at a time; it closes on
 * Escape, an outside click, or when its button scrolls out of view.
 */

import { placeMenuOnScreen } from './media-attach.js';
import { h, replaceChildren } from './dom.js';
import { avatar, avatarStack } from './avatar.js';

const POPOVER_WIDTH = 220;

/** The checklist that's currently open (only one at a time), and how to close it. */
let openPopover = null;

export function createMemberPicker({ members, selectedIds = [], onChange, label = 'Choose people', size = 24 }) {
  let selected = [...selectedIds];

  const button = h('button', {
    type: 'button',
    class: 'member-picker',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
  });

  function drawButton() {
    const chosen = members.filter((m) => selected.includes(m.id));
    button.setAttribute('aria-label', `${label}: ${chosen.length ? chosen.map((m) => m.name).join(', ') : 'nobody'}`);
    button.title = chosen.length ? chosen.map((m) => m.name).join(', ') : 'Unassigned';
    replaceChildren(button, avatarStack(chosen, size));
  }

  function toggle(memberId) {
    selected = selected.includes(memberId)
      ? selected.filter((id) => id !== memberId)
      // Keep the group's member order, so avatars don't shuffle around.
      : members.map((m) => m.id).filter((id) => id === memberId || selected.includes(id));
    drawButton();
    onChange([...selected]);
  }

  function clearAll() {
    selected = [];
    drawButton();
    onChange([]);
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation(); // Don't also trigger the row or card underneath.
    if (openPopover?.button === button) closeOpenPopover();
    else openChecklist();
  });

  function openChecklist() {
    closeOpenPopover();

    const list = h('div', { class: 'member-popover', role: 'group', 'aria-label': label });

    function drawList() {
      replaceChildren(list,
        members.map((member) => h('label', { class: 'member-popover__option' },
          h('input', {
            type: 'checkbox',
            checked: selected.includes(member.id),
            onChange: () => { toggle(member.id); drawList(); },
          }),
          avatar(member, 22),
          h('span', { class: 'member-popover__name' }, member.name),
        )),
        h('button', {
          type: 'button',
          class: 'link-button member-popover__clear',
          onClick: () => { clearAll(); drawList(); },
        }, 'Clear'),
      );
    }

    drawList();
    document.body.append(list);
    positionNextTo(list, button);
    button.setAttribute('aria-expanded', 'true');

    const onOutsidePointer = (event) => {
      if (!list.contains(event.target) && !button.contains(event.target)) closeOpenPopover();
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        closeOpenPopover();
        button.focus();
      }
    };
    const onScroll = (event) => {
      if (list.contains(event.target)) return;
      if (!button.isConnected || !isInViewport(button)) closeOpenPopover();
      else positionNextTo(list, button);
    };

    document.addEventListener('pointerdown', onOutsidePointer, true);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', closeOpenPopover);

    openPopover = {
      button,
      close() {
        list.remove();
        button.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', onOutsidePointer, true);
        document.removeEventListener('keydown', onKeydown);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', closeOpenPopover);
      },
    };

    list.querySelector('input')?.focus();
  }

  drawButton();

  return {
    element: button,
    getSelected: () => [...selected],
    setSelected(ids) {
      selected = [...ids];
      drawButton();
    },
  };
}

export function closeOpenPopover() {
  openPopover?.close();
  openPopover = null;
}

function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

/** Place the checklist under the button (or above it, if there's no room below). */
/** Under the button, or above it; inside the screen and above the phone tab bar (placeMenuOnScreen). */
function positionNextTo(popover, anchor) {
  popover.style.width = `${POPOVER_WIDTH}px`;
  placeMenuOnScreen(popover, anchor);
}
