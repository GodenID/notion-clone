/* Access control.
   A page is reachable by its owner, by anyone it is shared with directly, and by
   every member of the teamspace it lives in — each with their own role. */

import { roleAtLeast } from "../shared/contracts.js";

export const ACTIONS = {
  read: "read",
  comment: "comment",
  write: "write",
  share: "share",
  delete: "delete",
};

/** Minimum role required for each action, in role order (viewer < member < admin < owner). */
const REQUIRED = {
  [ACTIONS.read]: "viewer",
  [ACTIONS.comment]: "member",
  [ACTIONS.write]: "member",
  [ACTIONS.share]: "admin",
  [ACTIONS.delete]: "admin",
};

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to that page.") {
    super(message);
    this.name = "ForbiddenError";
    this.statusCode = 403;
  }
}

export function can(action, role) {
  const minimum = REQUIRED[action];
  if (!minimum) return false;
  return roleAtLeast(role, minimum);
}

function teamspaceRole(db, teamspaceId, userId) {
  if (!teamspaceId) return null;
  const row = db
    .prepare("SELECT role FROM teamspace_members WHERE teamspace_id = ? AND user_id = ?")
    .get(teamspaceId, userId);
  return row?.role ?? null;
}

function pageRole(db, pageId, userId) {
  const row = db
    .prepare("SELECT role FROM page_members WHERE page_id = ? AND user_id = ?")
    .get(pageId, userId);
  return row?.role ?? null;
}

/**
 * Resolve what a user may do with a page.
 * The strongest applicable role wins: owner > direct share > teamspace role.
 * Accepts either the repository's camelCase pages or raw database rows.
 */
export function accessFor(db, page, userId) {
  if (!page || !userId) return { role: null, owner: false, allowed: {} };

  const pageId = page.id;
  const ownerId = page.ownerId ?? page.owner_id ?? null;
  const teamspaceId = page.teamspaceId ?? page.teamspace_id ?? null;

  let role = null;
  let owner = false;

  if (ownerId === userId) {
    owner = true;
    role = "owner";
  } else {
    const direct = pageRole(db, pageId, userId);
    const team = teamspaceRole(db, teamspaceId, userId);
    if (direct && team) role = roleAtLeast(direct, team) ? direct : team;
    else role = direct || team;
  }

  const allowed = {};
  for (const action of Object.values(ACTIONS)) allowed[action] = can(action, role);
  return { role, owner, allowed };
}

export function assertAccess(db, page, userId, action) {
  const access = accessFor(db, page, userId);
  if (!access.allowed[action]) {
    const error = new ForbiddenError(
      action === ACTIONS.read
        ? "You do not have access to that page."
        : "You need more permission to change this page."
    );
    /* People who cannot see the page at all get a 404 so nothing leaks. */
    error.statusCode = access.allowed[ACTIONS.read] ? 403 : 404;
    throw error;
  }
  return access;
}

/** Direct invite. Owner keeps their own role. */
export function sharePage(db, pageId, userId, role = "viewer", createdBy = null) {
  db.prepare(
    `INSERT INTO page_members (page_id, user_id, role, created_by, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(page_id, user_id) DO UPDATE SET role = excluded.role`
  ).run(pageId, userId, role, createdBy, Date.now());
  return listPageMembers(db, pageId);
}

export function unsharePage(db, pageId, userId) {
  return db.prepare("DELETE FROM page_members WHERE page_id = ? AND user_id = ?").run(pageId, userId).changes > 0;
}

export function listPageMembers(db, pageId) {
  return db
    .prepare(
      `SELECT u.id, u.email, u.name, u.color, m.role, m.created_at
       FROM page_members m JOIN users u ON u.id = m.user_id
       WHERE m.page_id = ? ORDER BY u.name`
    )
    .all(pageId)
    .map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      color: row.color,
      initials: row.name
        .split(/\s+/)
        .map((part) => part[0] || "")
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      role: row.role,
      sharedAt: row.created_at,
    }));
}

/** True when the user can reach the page at all — used to filter lists and search. */
export function canSee(db, page, userId) {
  return accessFor(db, page, userId).allowed[ACTIONS.read];
}
