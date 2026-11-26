// @ts-check
/**
 * features.js — which parts of 3den someone uses: blogs (with the Feed),
 * groups, and messages. Each can be turned off in Account settings →
 * "Parts of 3den you use"; your homepage is always there.
 *
 *   uses(member, 'groups')            → true unless they turned groups off
 *   setUses(memberId, 'messages', false)
 *   FEATURES                          the three, with what turning each off means
 *
 * Turning a part off hides it, it doesn't delete anything:
 *   blogs     your blog is hidden, the Blog tab goes, no friend requests (member.socialOff)
 *   groups    the Groups tab goes, and groups leave your Dashboard; you stay
 *             in them, and can come back any time (member.groupsOff)
 *   messages  the Messages tab goes, and nobody can start a conversation
 *             with you; chats inside your groups still work (member.messagesOff)
 */

import { changeState, getMember } from './store.js';

export const FEATURES = [
  {
    id: 'blogs',
    label: 'Blogs and the Feed',
    on: 'Your blog, friends and follows, and the Feed.',
    off: 'Your blog is hidden, the Blog tab goes away, and no one can send you friend requests.',
  },
  {
    id: 'groups',
    label: 'Groups',
    on: 'Your groups, Explore, and events near you.',
    off: 'The Groups tab goes away and groups leave your Dashboard. You stay in your groups, and nothing is deleted.',
  },
  {
    id: 'messages',
    label: 'Messages',
    on: 'Direct messages and group conversations.',
    off: 'The Messages tab goes away, and no one can start a conversation with you. Chats inside your groups still work.',
  },
];

const FLAG = { blogs: 'socialOff', groups: 'groupsOff', messages: 'messagesOff' };

/** Does this person use this part of 3den? (Guests and missing people: yes.) */
export function uses(memberOrId, feature) {
  const member = typeof memberOrId === 'string' ? getMember(memberOrId) : memberOrId;
  return !member?.[FLAG[feature]];
}

export function setUses(memberId, feature, isOn) {
  changeState((state) => {
    const member = state.members.find((m) => m.id === memberId);
    member[FLAG[feature]] = !isOn;
  }, 'account', 'space', 'layout');
}
