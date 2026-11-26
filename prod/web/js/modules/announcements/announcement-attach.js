// @ts-check
/**
 * announcement-attach.js — the one "+ Add" menu on announcement composers
 * (Nov 18), on the card and on the full page. In order:
 *
 *   Poll                     a poll under the announcement (poll-view.js)
 *   Event                    one of your calendar's events, with its RSVP (event-picker.js;
 *                            Nov 20: only events already on a calendar, no new ones here)
 *   File from your vault     a copy of a vault file, shown as a preview card
 *   Upload from camera roll  photos and videos from the device
 *
 * The menu places itself where all of it can be seen (placeMenuOnScreen in
 * media-attach.js), so a short card can't cut it off.
 *
 *   const add = announcementAttacher({ me, moduleId });
 *   form: add.slots (what's attached, above the words), add.button
 *   on submit: const { poll, media, files, eventId, error } = add.read();
 *   after posting: add.reset();
 *
 * Files are saved on the post as `post.files`: copies of vault items
 * (snapshotVaultItem), shown with renderAnnouncementFiles.
 */

import { openEventPicker } from '../../events/event-picker.js';
import { findEvent } from '../../state/events.js';
import { h, replaceChildren } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { mediaAttacher } from '../../ui/media-attach.js';
import { pollAttacher } from '../../ui/poll-view.js';
import { openVaultFilePicker } from '../../editor/vault-file-picker.js';
import { snapshotVaultItem } from '../submissions/submission-items.js';
import { renderFilePreview } from '../blog-feeds/file-preview.js';
import { getModule, getSpaceOfModule } from '../../state/store.js';
import { iconForItem } from '../vault/vault-data.js';

export function announcementAttacher({ me, moduleId }) {
  const poll = pollAttacher({ me });
  /** @type {any[]} */
  let files = [];
  const fileSlot = h('div', { class: 'announcement-files__picked', hidden: true });
  let eventId = null;
  const eventSlot = h('div', { class: 'announcement-files__picked', hidden: true });
  function drawEvent() {
    const found = eventId ? findEvent(eventId) : null;
    eventSlot.hidden = !found;
    replaceChildren(eventSlot, found ? h('span', { class: 'announcement-files__chip announcement-event__chip' },
      icon('calendar', 14), h('span', {}, found.event.title),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': `Remove ${found.event.title}`, onClick: () => { eventId = null; drawEvent(); } }, icon('close', 12))) : null);
  }

  function drawFiles() {
    fileSlot.hidden = !files.length;
    replaceChildren(fileSlot, files.map((file, index) => h('span', { class: 'announcement-files__chip' },
      icon(iconForItem(file), 14), h('span', {}, file.name),
      h('button', {
        type: 'button', class: 'icon-button', 'aria-label': `Remove ${file.name}`,
        onClick: () => { files = files.filter((_, i) => i !== index); drawFiles(); },
      }, icon('close', 12)))));
  }

  function pickFromVault() {
    const space = getSpaceOfModule(moduleId);
    openVaultFilePicker({
      space,
      onPick: ({ vaultModuleId, itemId }) => {
        const item = (getModule(vaultModuleId)?.data?.items ?? []).find((i) => i.id === itemId);
        if (!item) return;
        files = [...files, snapshotVaultItem(item, vaultModuleId)];
        drawFiles();
      },
    });
  }

  const media = mediaAttacher({
    label: 'Add',
    cameraRoll: true,
    before: [
      { icon: 'list', text: 'Poll', hint: 'Ask a question with choices', onPick: () => poll.open() },
      { icon: 'calendar', text: 'Event', hint: 'One from your calendar: people RSVP from the post', onPick: () => openEventPicker({ me, onPick: (id) => { eventId = id; drawEvent(); } }) },
      { icon: 'folder', text: 'File from your vault', hint: 'A note, spreadsheet, photo, or any other file', onPick: pickFromVault },
    ],
  });

  return {
    button: media.button,
    slots: [media.slot, eventSlot, fileSlot, poll.slot],
    read() {
      const { poll: made, error } = poll.read();
      return { poll: made ?? null, media: media.read(), files: files.map((f) => ({ ...f })), eventId, error };
    },
    reset() {
      poll.reset();
      media.clear();
      eventId = null;
      drawEvent();
      files = [];
      drawFiles();
    },
  };
}

/** The vault files on an announcement, as preview cards. */
export function renderAnnouncementFiles(files = []) {
  if (!files?.length) return null;
  return h('div', { class: 'announcement-files' }, files.map((file) => renderFilePreview(file)));
}
