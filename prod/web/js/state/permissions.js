// @ts-check
/**
 * permissions.js — who can do what in a group.
 *
 * Every group member has a role:
 *
 *   owner   one per group. Can do everything, including deleting the group
 *           and handing ownership to someone else.
 *   admin   runs the group day to day: settings, members, roles.
 *   member  everyone else.
 *
 * Each permission below says the *lowest* role allowed to do it. A group
 * can change these in Settings → Roles & permissions; for example, a
 * group where everyone may rearrange the homepage sets "Edit the
 * homepage" to Member. Higher roles can always do what lower ones can.
 *
 * On a personal homepage, its owner can do everything.
 *
 * These are plain functions over a space object, with no saving, so any
 * file can ask `can(space, memberId, 'editHomepage')`. The actions that
 * change roles and permissions are in groups.js.
 *
 * Saved on each group space:
 *   roles:       { [memberId]: 'owner' | 'admin' | 'member' }
 *   permissions: { [permissionId]: 'owner' | 'admin' | 'member' }  ← only the changed ones
 *
 * The roles and permissions themselves are in prod/shared/permissions.json,
 * which the server reads too (server/app/spaces/permissions.py), with test
 * cases both run (shared/permission-cases.json). The import path climbs out
 * of web/ on purpose: on disk it reaches prod/shared/ (for the checks and
 * tests), and in the browser it's /shared/permissions.json, which Caddy
 * serves from the same file (infra/Caddyfile).
 */

import table from '../../../shared/permissions.json' with { type: 'json' };

/** @type {{ id: string, label: string, rank: number, description: string }[]} */
export const ROLES = table.roles;

/** @type {{ id: string, label: string, description: string, defaultRole: string }[]} */
export const PERMISSIONS = table.permissions;

const RANKS = Object.fromEntries(ROLES.map((role) => [role.id, role.rank]));

export function roleLabel(roleId) {
  return ROLES.find((role) => role.id === roleId)?.label ?? 'Not a member';
}

/** Personal homepages and blogs have one person in them, who can do everything. */
export function isSingleOwner(space) {
  return space?.kind === 'personal' || space?.kind === 'blog';
}

/** A member's role in a space, or null if they aren't in it. */
export function roleOf(space, memberId) {
  if (!space || !memberId || !space.memberIds.includes(memberId)) return null;
  if (isSingleOwner(space)) return 'owner';
  if (viewingAsMember === space.id) return 'member';
  return space.roles?.[memberId] ?? 'member';
}

/**
 * "See it as a member": while set to a group's id, admins and the owner get
 * a plain member's role there, so the page shows exactly what members see.
 * Use store.setMemberView(), which also redraws.
 */
let viewingAsMember = null;
export function setViewingAsMember(spaceId) { viewingAsMember = spaceId ?? null; }
export function viewingAsMemberIn() { return viewingAsMember; }

/** The lowest role allowed to do something in this space. */
export function requiredRole(space, permissionId) {
  const permission = PERMISSIONS.find((p) => p.id === permissionId);
  if (!permission) throw new Error(`Unknown permission: "${permissionId}"`);
  return space.permissions?.[permissionId] ?? permission.defaultRole;
}

/** At least this role? `atLeast('admin', 'owner')` is true. */
export function atLeast(roleId, minimumRoleId) {
  return (RANKS[roleId] ?? 0) >= (RANKS[minimumRoleId] ?? Infinity);
}

/** May this member do this in this space? */
export function can(space, memberId, permissionId) {
  const role = roleOf(space, memberId);
  return Boolean(role) && atLeast(role, requiredRole(space, permissionId));
}

/**
 * Settings that aren't a configurable permission:
 *   - admins and the owner manage roles and the permissions table
 *   - only the owner can transfer ownership or delete the group
 */
export function canManageRoles(space, memberId) {
  return atLeast(roleOf(space, memberId), 'admin');
}

export function isOwner(space, memberId) {
  return roleOf(space, memberId) === 'owner';
}

/**
 * Can `actorId` change `targetId`'s role (or remove them)? Admins can
 * manage members and other admins, but nobody can change the owner's role
 * except by transferring ownership.
 */
export function canManageMember(space, actorId, targetId) {
  if (roleOf(space, targetId) === 'owner') return false;
  if (actorId === targetId) return false; // use "Leave group" instead
  return canManageRoles(space, actorId);
}
