// @ts-check
/**
 * post-reactions.js — the Like · Comment row for a blog post (Send is in
 * the card's … menu: blogPostSend),
 * following the blogger's rules (Account settings → Your blog).
 *
 *   blogPostReactions({
 *     key,          ← where its likes and comments are kept (js/state/reactions.js)
 *     ownerId,      ← whose blog it's on
 *     about,        ← { title, moduleId, itemId } for notifications
 *     share,        ← { title, attachment } for "Send", or null
 *     spaceId,      ← (optional) a group's id, for a post in a group's feed:
 *                     then the group's rules apply instead (members comment)
 *   })
 *
 * Used on blogs (js/modules/blog-feeds/) and in the Feed (js/feed/feed-page.js).
 */

import { reactionsBar } from './reactions-bar.js';
import { showToast } from './toast.js';
import { openShareDialog } from './share-dialog.js';
import { getCurrentUser, getMember, getSpaces, getSpace, getState } from '../state/store.js';
import { getFriendIds } from '../state/friends.js';
import { permissionsFor, groupPermissionsFor, getReactions, toggleLike, addComment, deleteComment, restoreComment } from '../state/reactions.js';

/**
 * "Send to someone" for a post, following the same rules as the row (the
 * blogger's or the group's), for the card's … menu; null when it can't be sent.
 */
export function blogPostSend({ ownerId, share = null, spaceId = null }) {
  if (!share) return null;
  const me = getCurrentUser();
  const group = spaceId ? getSpace(spaceId) : null;
  const rules = group?.kind === 'group' ? groupPermissionsFor(group, me?.id) : permissionsFor(ownerId, me?.id);
  return rules.canShare && me && !me.isGuest ? () => openShareDialog({ ...share, candidateIds: shareCandidates(me.id) }) : null;
}

export function blogPostReactions({ key, ownerId, about, share = null, startOpen = false, spaceId = null }) {
  const notifyAbout = { ...about, ownerId };
  const group = spaceId ? getSpace(spaceId) : null;
  return reactionsBar(() => {
    const me = getCurrentUser();
    const rules = group?.kind === 'group' ? groupPermissionsFor(group, me?.id) : permissionsFor(ownerId, me?.id);
    const { likes, comments } = getReactions(key);
    const ownerFirst = getMember(ownerId)?.name.split(' ')[0] ?? 'the blogger';
    return {
      // How a signed-out reader found 3den, if liking or commenting signs them up.
      arrival: group?.kind === 'group' ? { source: 'group', spaceId: group.id } : { source: 'blog', itemId: ownerId },
      liked: likes.includes(me?.id),
      likeCount: likes.length,
      showLikes: rules.showLikes,
      canLike: rules.canLike,
      onLike: () => toggleLike(key, notifyAbout),
      comments,
      showComments: rules.showComments,
      canComment: rules.canComment,
      cantCommentReason: {
        friends: `Only ${ownerFirst}’s friends can comment.`,
        members: `Only members of ${group?.name ?? 'the group'} can comment.`,
      }[rules.commentRule] ?? 'Comments are off.',
      onComment: (body) => addComment(key, body, notifyAbout),
      canDelete: (comment) => comment.authorId === me?.id || rules.isOwner,
      onDelete: (comment) => {
        const index = (getReactions(key).comments ?? []).findIndex((c) => c.id === comment.id);
        deleteComment(key, comment.id);
        showToast('Comment deleted.', { actionLabel: 'Undo', onAction: () => restoreComment(key, comment, index) });
      },
      // Send lives in the card's … menu (blogPostSend), not in this row.
    };
  }, { startOpen });
}

/**
 * Who you can send a public post to: your friends, people in your groups,
 * and people you've messaged.
 */
export function shareCandidates(memberId) {
  const groupmates = getSpaces().filter((s) => s.kind === 'group' && s.memberIds.includes(memberId)).flatMap((s) => s.memberIds);
  const messaged = (getState().conversations ?? []).filter((c) => c.kind === 'direct' && c.memberIds.includes(memberId)).flatMap((c) => c.memberIds);
  return [...new Set([...getFriendIds(memberId), ...groupmates, ...messaged])].filter((id) => id !== memberId);
}
