// @ts-check
/**
 * announcement-attach.js — the one "+ Add" menu on announcement composers
 * (Nov 18), on the card and on the full page. In order:
 *
 *   Poll                     a poll under the announcement (poll-view.js)
 *   File from your vault     a copy of a vault file, shown as a preview card
 *   Upload from camera roll  photos and videos from the device
 *
 * The menu places itself where all of it can be seen (placeMenuOnScreen in
 * media-attach.js), so a short card can't cut it off.
 *
 *   const add = announcementAttacher({ me, moduleId });
 *   form: add.slots (what's attached, above the words), add.button
 *   on submit: const { poll, media, files, error } = add.read();
 *   after posting: add.reset();
 *
 * Files are saved on the post as `post.files`: copies of vault items
 * (snapshotVaultItem), shown with renderAnnouncementFiles.
 */

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
      { icon: 'folder', text: 'File from your vault', hint: 'A note, spreadsheet, photo, or any other file', onPick: pickFromVault },
    ],
  });

  return {
    button: media.button,
    slots: [media.slot, fileSlot, poll.slot],
    read() {
      const { poll: made, error } = poll.read();
      return { poll: made ?? null, media: media.read(), files: files.map((f) => ({ ...f })), error };
    },
    reset() {
      poll.reset();
      media.clear();
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
