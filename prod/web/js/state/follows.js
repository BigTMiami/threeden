// @ts-check
/**
 * follows.js — following a person's blog or a group's public page, one-way.
 *
 * Friends (friends.js) are two-way: both say yes, and both see each other's
 * posts. Following needs no yes: you follow a band, a news outlet, or a
 * writer you like, and their public posts show up in your Feed. They see
 * how many followers they have, and get a notification.
 *
 * Saved on the follower: member.following = { people: [memberId…], spaces: [spaceId…] }
 *
 *   isFollowing(meId, { kind: 'person', id: 'm-jamal' })
 *   toggleFollow(meId, { kind: 'space', id: 'porchlights' })   → true if now following
 *   followerCount({ kind: 'space', id: 'porchlights' })
 *   followedPeopleIds(meId), followedSpaceIds(meId)
 *
 * Who can be followed: people with a blog (not someone who turned blogs
 * off), and groups with at least one public tab.
 */

import { changeState, getState, getMember, getSpace } from './store.js';
import { notify } from './notifications.js';

const LIST = { person: 'people', space: 'spaces' };

function followingOf(memberId) {
  const following = getMember(memberId)?.following;
  return { people: following?.people ?? [], spaces: following?.spaces ?? [] };
}

export function followedPeopleIds(memberId) {
  return followingOf(memberId).people;
}

export function followedSpaceIds(memberId) {
  return followingOf(memberId).spaces;
}

export function isFollowing(memberId, target) {
  return followingOf(memberId)[LIST[target.kind]].includes(target.id);
}

export function followerCount(target) {
  return getState().members.filter((m) => (m.following?.[LIST[target.kind]] ?? []).includes(target.id)).length;
}

/** Follow, or stop following. Returns true if now following. */
export function toggleFollow(memberId, target) {
  const wasFollowing = isFollowing(memberId, target);
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    const following = { people: member.following?.people ?? [], spaces: member.following?.spaces ?? [] };
    const list = LIST[target.kind];
    following[list] = wasFollowing ? following[list].filter((id) => id !== target.id) : [...following[list], target.id];
    member.following = following;
  }, 'person'); // no full redraw (store.js): the buttons that show it redraw themselves or listen for 'person'

  if (!wasFollowing) {
    const me = getMember(memberId);
    if (target.kind === 'person') {
      notify({ recipientIds: [target.id], actorId: memberId, kind: 'follow', text: `${me.name} started following your blog`, href: `#blog-${me.username}` });
    } else {
      const space = getSpace(target.id);
      const owners = Object.entries(space.roles ?? {}).filter(([, role]) => role === 'owner' || role === 'admin').map(([id]) => id);
      notify({ recipientIds: owners, actorId: memberId, kind: 'follow', text: `${me.name} started following ${space.name}`, spaceId: space.id });
    }
  }
  return !wasFollowing;
}

/** "1 follower", "12 followers". */
export function followersLabel(target) {
  const count = followerCount(target);
  return `${count} ${count === 1 ? 'follower' : 'followers'}`;
}
