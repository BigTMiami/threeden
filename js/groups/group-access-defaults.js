// @ts-check
/**
 * group-access-defaults.js — where "Who can see it?" and "How do people
 * join?" start on the Create a group page (new-group-page.js), for each
 * template, and which joining choices a private group can have.
 */

/**
 * Where the two access choices start, for each kind of group. Bands, bars,
 * newsrooms, and households have admins add people (a public band can still
 * be followed); groups that want to grow on 3den are public and open.
 */
export const ACCESS_FOR_KIND = {
  friends: { visibility: 'private', joining: 'invite' },
  community: { visibility: 'public', joining: 'request' },
  online: { visibility: 'public', joining: 'open' },
  business: { visibility: 'public', joining: 'admins' },
  club: { visibility: 'public', joining: 'admins' },
  class: { visibility: 'private', joining: 'invite' },
  organizing: { visibility: 'public', joining: 'open' },
  news: { visibility: 'public', joining: 'admins' },
  nonprofit: { visibility: 'public', joining: 'request' },
  faith: { visibility: 'public', joining: 'request' },
  trip: { visibility: 'private', joining: 'invite' },
  hobby: { visibility: 'public', joining: 'open' },
  house: { visibility: 'private', joining: 'admins' },
  forum: { visibility: 'public', joining: 'open' },
  blank: { visibility: 'private', joining: 'invite' },
  family: { visibility: 'private', joining: 'admins' },
  other: { visibility: 'private', joining: 'invite' },
};
export const accessFor = (kind) => ACCESS_FOR_KIND[kind] ?? ACCESS_FOR_KIND.friends;

/** Nobody can find a private group to join it or ask, so only invites and admins work there. */
export const joiningAllowed = (visibility, joining) => visibility === 'public' || joining === 'invite' || joining === 'admins';
