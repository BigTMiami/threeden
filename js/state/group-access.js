// @ts-check
/**
 * group-access.js — two separate choices about who gets into a group:
 *
 *   Who can see it (space.visibility)
 *     public    on Explore and in search; anyone can see the tabs you make
 *               public (a band's photos and gigs), follow it, and RSVP to
 *               its public events
 *     private   hidden from Explore and search; only members see anything
 *
 *   How people join (space.joining)
 *     open      anyone can join, right away
 *     request   people ask, and an admin says yes
 *     invite    any member can invite people; anyone with the invite link joins
 *     admins    only admins add members
 *
 * So a band or a news outlet can be public but add its own members, and a
 * private club can still let anyone with the link in.
 *
 * Older saves had one setting, space.privacy ('Public', 'Request to join',
 * 'Invite only', 'Private'); visibilityOf() and joiningOf() read those too.
 */

export const VISIBILITY_OPTIONS = [
  { id: 'public', label: 'Public', description: 'Anyone can find it on Explore and in search, see the tabs you make public, and follow it. Good for bands, news outlets, and organizations.' },
  { id: 'private', label: 'Private', description: 'Hidden from Explore and search. Only members see anything.' },
];

export const JOINING_OPTIONS = [
  { id: 'open', label: 'Anyone can join', short: 'Open to join', description: 'People join right away.' },
  { id: 'request', label: 'Ask to join', short: 'Ask to join', description: 'People ask, and an admin says yes.' },
  { id: 'invite', label: 'Invite only', short: 'Invite only', description: 'Any member can invite people, and anyone with the invite link can join.' },
  { id: 'admins', label: 'Admins add people', short: 'Admins add members', description: 'Only admins add members. On a public group, everyone else can still follow it.' },
];

const FROM_OLD_PRIVACY = {
  Public: ['public', 'open'],
  'Request to join': ['public', 'request'],
  'Invite only': ['private', 'invite'],
  Private: ['private', 'admins'],
};

export function visibilityOf(space) {
  return space?.visibility ?? FROM_OLD_PRIVACY[space?.privacy]?.[0] ?? 'private';
}

export function joiningOf(space) {
  return space?.joining ?? FROM_OLD_PRIVACY[space?.privacy]?.[1] ?? 'admins';
}

export const isPublicGroup = (space) => visibilityOf(space) === 'public';

/** "Public group · Ask to join" */
export function accessLabel(space) {
  const visibility = VISIBILITY_OPTIONS.find((v) => v.id === visibilityOf(space)).label;
  const joining = (JOINING_OPTIONS.find((j) => j.id === joiningOf(space)) ?? JOINING_OPTIONS[1]).short;
  return `${visibility} group · ${joining}`;
}
