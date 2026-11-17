/**
 * avatar.js — a round badge with a member's photo, or their initials on
 * their color (member.photo, member.color: Account settings → Profile).
 */

import { h } from './dom.js';

/**
 * @param {object|null} member  a member from the state, or null for "unassigned"
 * @param {number} size         diameter in pixels
 */
export function avatar(member, size = 24) {
  const style = { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px` };

  if (!member) {
    return h('span', { class: 'avatar avatar--empty', style, title: 'Unassigned' }, '?');
  }
  if (member.photo) {
    return h('span', {
      class: 'avatar avatar--photo',
      style: { ...style, backgroundColor: member.color, backgroundImage: `url("${member.photo}")` },
      title: member.name,
      role: 'img',
      'aria-label': member.name,
    });
  }
  return h('span', {
    class: 'avatar',
    style: { ...style, background: member.color },
    title: member.name,
  }, member.initials);
}

const PHOTO_SIZE = 256;

/**
 * A profile photo from an image file: the middle square, 256 × 256, as a
 * JPEG data URL (small enough to keep in the browser's storage).
 */
export function readAvatarPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type.startsWith('image/')) { reject(new Error('That file isn’t a picture.')); return; }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = PHOTO_SIZE;
      canvas.height = PHOTO_SIZE;
      canvas.getContext('2d').drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture couldn’t be opened.')); };
    image.src = url;
  });
}

/**
 * Several members' avatars, overlapping, like a little stack of coins.
 * Shows up to `max`, then "+N". An empty list shows the "unassigned" avatar.
 */
export function avatarStack(members, size = 24, max = 3) {
  if (members.length === 0) return avatar(null, size);

  const shown = members.slice(0, max);
  const extra = members.length - shown.length;

  return h('span', { class: 'avatar-stack', title: members.map((m) => m.name).join(', ') },
    shown.map((member) => avatar(member, size)),
    extra > 0
      ? h('span', { class: 'avatar avatar--more', style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px` } }, `+${extra}`)
      : null,
  );
}
