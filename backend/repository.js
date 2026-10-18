/* Repository layer: every SQL statement the API needs, in one place. */

import { now, uid } from "./ids.js";
import { slugify } from "../shared/contracts.js";

const WORKSPACE = "default";

/* ---------------- pages ---------------- */

function rowToPage(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    cover: row.cover ?? null,
    section: row.section,
    teamspaceId: row.teamspace_id,
    parentId: row.parent_id,
    favorite: Boolean(row.favorite),
    locked: Boolean(row.locked),
    fullWidth: Boolean(row.full_width),
    smallText: Boolean(row.small_text),
    font: row.font,
    slug: row.slug,
    trashedAt: row.trashed_at,
    ownerId: row.owner_id,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function uniqueSlug(db, base, excludeId = null) {
  let slug = base;
  let index = 2;
  while (true) {
    const existing = db
      .prepare("SELECT id FROM pages WHERE workspace_id = ? AND slug = ?")
      .get(WORKSPACE, slug);
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${index++}`;
  }
}

export function listPages(db, ownerId, { includeTrash = false } = {}) {
  const sql = includeTrash
    ? "SELECT * FROM pages WHERE owner_id = ? ORDER BY trashed_at IS NULL DESC, updated_at DESC"
    : "SELECT * FROM pages WHERE owner_id = ? AND trashed_at IS NULL ORDER BY updated_at DESC";
  return db.prepare(sql).all(ownerId).map(rowToPage);
}

export function getPage(db, id) {
  return rowToPage(db.prepare("SELECT * FROM pages WHERE id = ?").get(id));
}

export function getPageBySlug(db, slug) {
  return rowToPage(
    db.prepare("SELECT * FROM pages WHERE workspace_id = ? AND slug = ?").get(WORKSPACE, slug)
  );
}

export function createPage(db, ownerId, input = {}) {
  const id = input.id || uid();
  const stamp = now();
  const slug = uniqueSlug(db, slugify(input.title ?? "Untitled"));
  db.prepare(
    `INSERT INTO pages
      (id, workspace_id, title, icon, cover, section, teamspace_id, parent_id, owner_id,
       favorite, locked, full_width, small_text, font, slug, trashed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'default', ?, NULL, ?, ?)`
  ).run(
    id,
    WORKSPACE,
    input.title ?? "",
    input.icon ?? "📄",
    input.cover ?? null,
    input.section ?? "private",
    input.teamspaceId ?? null,
    input.parentId ?? null,
    ownerId,
    slug,
    stamp,
    stamp
  );
  db.prepare("INSERT INTO blocks (id, page_id, position, type, payload, created_at, updated_at) VALUES (?, ?, 0, 'paragraph', '{}', ?, ?)").run(
    uid(),
    id,
    stamp,
    stamp
  );
  reindexPage(db, id);
  return getPage(db, id);
}

const UPDATABLE = {
  title: "title",
  icon: "icon",
  cover: "cover",
  section: "section",
  teamspaceId: "teamspace_id",
  parentId: "parent_id",
  favorite: "favorite",
  locked: "locked",
  fullWidth: "full_width",
  smallText: "small_text",
  font: "font",
  trashedAt: "trashed_at",
};

export function updatePage(db, id, patch = {}) {
  const current = db.prepare("SELECT * FROM pages WHERE id = ?").get(id);
  if (!current) return null;

  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!(key in patch)) continue;
    let value = patch[key];
    if (["favorite", "locked", "fullWidth", "smallText"].includes(key)) value = value ? 1 : 0;
    sets.push(`${column} = ?`);
    params.push(value);
  }

  if (typeof patch.title === "string") {
    sets.push("slug = ?");
    params.push(uniqueSlug(db, slugify(patch.title), id));
  }

  if (!sets.length) return getPage(db, id);

  sets.push("updated_at = ?");
  params.push(now(), id);
  db.prepare(`UPDATE pages SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  reindexPage(db, id);
  return getPage(db, id);
}

export function deletePage(db, id) {
  const stamp = now();
  const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(id);
  if (!page) return 0;
  let count = 1;
  const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    const children = db.prepare("SELECT id FROM pages WHERE parent_id = ?").all(current);
    for (const child of children) {
      db.prepare("UPDATE pages SET trashed_at = COALESCE(trashed_at, ?) WHERE id = ?").run(stamp, child.id);
      db.prepare("UPDATE page_search SET body = '' WHERE page_id = ?").run(child.id);
      stack.push(child.id);
      count += 1;
    }
  }
  db.prepare("UPDATE pages SET trashed_at = ?, updated_at = ? WHERE id = ?").run(stamp, stamp, id);
  reindexPage(db, id);
  return count;
}

export function restorePage(db, id) {
  const stamp = now();
  const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(id);
  if (!page) return null;
  if (page.parent_id) {
    const parent = db.prepare("SELECT trashed_at FROM pages WHERE id = ?").get(page.parent_id);
    if (parent?.trashed_at) {
      db.prepare("UPDATE pages SET parent_id = NULL WHERE id = ?").run(id);
    }
  }
  db.prepare("UPDATE pages SET trashed_at = NULL, updated_at = ? WHERE id = ?").run(stamp, id);
  reindexPage(db, id);
  return getPage(db, id);
}

export function purgePage(db, id) {
  const count = db.prepare("DELETE FROM pages WHERE id = ?").run(id).changes;
  db.prepare("DELETE FROM page_search WHERE page_id = ?").run(id);
  return count;
}

/* ---------------- blocks ---------------- */

function rowToBlock(row) {
  let payload = {};
  try {
    payload = JSON.parse(row.payload || "{}");
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    type: row.type,
    text: payload.text ?? "",
    level: payload.level ?? 0,
    checked: payload.checked ?? false,
    ...payload,
  };
}

export function listBlocks(db, pageId) {
  return db
    .prepare("SELECT * FROM blocks WHERE page_id = ? ORDER BY position")
    .all(pageId)
    .map(rowToBlock);
}

export function replaceBlocks(db, pageId, blocks) {
  const stamp = now();
  transaction(db, () => {
    db.prepare("DELETE FROM blocks WHERE page_id = ?").run(pageId);
    const insert = db.prepare(
      "INSERT INTO blocks (id, page_id, position, type, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    blocks.forEach((block, index) => {
      const { id, type, ...rest } = block;
      insert.run(id || uid(), pageId, index, type || "paragraph", JSON.stringify(rest), stamp, stamp);
    });
    db.prepare("UPDATE pages SET updated_at = ? WHERE id = ?").run(stamp, pageId);
  });
  reindexPage(db, pageId);
  return listBlocks(db, pageId);
}

function transaction(db, fn) {
  db.exec("BEGIN");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/* ---------------- page options (colours, version snapshots, settings) ---------------- */

export function getPageOptions(db, pageId) {
  const row = db.prepare("SELECT payload FROM page_options WHERE page_id = ?").get(pageId);
  if (!row) return {};
  try {
    return JSON.parse(row.payload || "{}");
  } catch {
    return {};
  }
}

export function setPageOptions(db, pageId, patch) {
  const current = getPageOptions(db, pageId);
  const merged = { ...current, ...patch };
  db.prepare(
    `INSERT INTO page_options (page_id, payload, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(page_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
  ).run(pageId, JSON.stringify(merged), now());
  return merged;
}

/* ---------------- teamspaces ---------------- */

function rowToTeamspace(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    description: row.description,
    slug: row.slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTeamspaces(db, userId) {
  return db
    .prepare(
      `SELECT t.* FROM teamspaces t
       JOIN teamspace_members m ON m.teamspace_id = t.id
       WHERE m.user_id = ? ORDER BY t.created_at DESC`
    )
    .all(userId)
    .map(rowToTeamspace);
}

export function createTeamspace(db, userId, input = {}) {
  const id = input.id || uid();
  const stamp = now();
  const name = input.name?.trim() || "Untitled teamspace";
  db.prepare(
    `INSERT INTO teamspaces (id, name, icon, color, description, slug, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name,
    input.icon ?? "🚀",
    input.color ?? "#2f6b4f",
    input.description ?? "",
    slugify(name, `teamspace-${id.slice(0, 6)}`),
    userId,
    stamp,
    stamp
  );
  db.prepare(
    "INSERT INTO teamspace_members (teamspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)"
  ).run(id, userId, stamp);
  return rowToTeamspace(db.prepare("SELECT * FROM teamspaces WHERE id = ?").get(id));
}

export function addMember(db, teamspaceId, userId, role = "member") {
  db.prepare(
    `INSERT INTO teamspace_members (teamspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(teamspace_id, user_id) DO UPDATE SET role = excluded.role`
  ).run(teamspaceId, userId, role, now());
  return true;
}

export function listMembers(db, teamspaceId) {
  return db
    .prepare(
      `SELECT u.id, u.email, u.name, u.color, m.role
       FROM teamspace_members m JOIN users u ON u.id = m.user_id
       WHERE m.teamspace_id = ? ORDER BY u.name`
    )
    .all(teamspaceId)
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
    }));
}

/* ---------------- comments ---------------- */

function rowToComment(row) {
  if (!row) return null;
  const parse = (value, fallback) => {
    try {
      return JSON.parse(value || "null") ?? fallback;
    } catch {
      return fallback;
    }
  };
  return {
    id: row.id,
    pageId: row.page_id,
    teamspaceId: row.teamspace_id,
    author: {
      id: row.author_id,
      name: row.author_name,
      email: row.author_email,
      color: row.author_color,
      initials: row.author_name
        .split(/\s+/)
        .map((part) => part[0] || "")
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    },
    text: row.body,
    anchor: parse(row.anchor, null),
    replies: parse(row.replies, []),
    reactions: parse(row.reactions, {}),
    resolved: Boolean(row.resolved),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COMMENT_SELECT = `
  SELECT c.*, u.name AS author_name, u.email AS author_email, u.color AS author_color
  FROM comments c JOIN users u ON u.id = c.author_id`;

export function listComments(db, { pageId, teamspaceId }) {
  if (pageId) {
    return db
      .prepare(`${COMMENT_SELECT} WHERE c.page_id = ? ORDER BY c.resolved, c.created_at DESC`)
      .all(pageId)
      .map(rowToComment);
  }
  return db
    .prepare(`${COMMENT_SELECT} WHERE c.teamspace_id = ? ORDER BY c.resolved, c.created_at DESC`)
    .all(teamspaceId)
    .map(rowToComment);
}

export function createComment(db, authorId, input = {}) {
  const id = uid();
  const stamp = now();
  db.prepare(
    `INSERT INTO comments (id, page_id, teamspace_id, author_id, body, anchor, replies, reactions, resolved, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', '{}', 0, ?, ?)`
  ).run(
    id,
    input.pageId ?? null,
    input.teamspaceId ?? null,
    authorId,
    input.text ?? "",
    input.anchor ? JSON.stringify(input.anchor) : null,
    stamp,
    stamp
  );
  return rowToComment(db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(id));
}

export function updateComment(db, id, patch = {}) {
  const sets = [];
  const params = [];
  if (typeof patch.resolved === "boolean") {
    sets.push("resolved = ?");
    params.push(patch.resolved ? 1 : 0);
  }
  if (typeof patch.reactions === "object" && patch.reactions) {
    sets.push("reactions = ?");
    params.push(JSON.stringify(patch.reactions));
  }
  if (Array.isArray(patch.replies)) {
    sets.push("replies = ?");
    params.push(JSON.stringify(patch.replies));
  }
  if (typeof patch.text === "string") {
    sets.push("body = ?");
    params.push(patch.text);
  }
  if (!sets.length) return null;
  sets.push("updated_at = ?");
  params.push(now(), id);
  db.prepare(`UPDATE comments SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  return rowToComment(db.prepare(`${COMMENT_SELECT} WHERE c.id = ?`).get(id));
}

export function removeComment(db, id) {
  return db.prepare("DELETE FROM comments WHERE id = ?").run(id).changes > 0;
}

/* ---------------- uploads ---------------- */

export function createUpload(db, ownerId, input) {
  const id = uid();
  db.prepare(
    `INSERT INTO uploads (id, owner_id, name, ext, mime, size, sha256, storage_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    ownerId,
    input.name,
    input.ext ?? "",
    input.mime ?? "application/octet-stream",
    input.size ?? 0,
    input.sha256 ?? "",
    input.storageKey ?? `${id}${input.ext ?? ""}`,
    now()
  );
  return db.prepare("SELECT * FROM uploads WHERE id = ?").get(id);
}

export function getUpload(db, id) {
  return db.prepare("SELECT * FROM uploads WHERE id = ?").get(id) ?? null;
}

/* ---------------- search ---------------- */

function blockText(block) {
  if (typeof block.text === "string") return block.text.replace(/<[^>]+>/g, " ");
  if (Array.isArray(block.columns)) return block.columns.join(" ");
  if (Array.isArray(block.rows)) return block.rows.flat().join(" ");
  if (block.attachment?.name) return block.attachment.name;
  if (block.file?.name) return block.file.name;
  if (Array.isArray(block.template)) return block.template.map((row) => row.text || "").join(" ");
  return "";
}

export function reindexPage(db, pageId) {
  const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(pageId);
  db.prepare("DELETE FROM page_search WHERE page_id = ?").run(pageId);
  if (!page || page.trashed_at) return false;

  const body = listBlocks(db, pageId).map(blockText).join(" ").trim();
  db.prepare("INSERT INTO page_search (title, body, page_id, owner_id) VALUES (?, ?, ?, ?)").run(
    page.title || "",
    body,
    pageId,
    page.owner_id
  );
  db.prepare(
    "INSERT INTO search_meta (page_id, indexed_at) VALUES (?, ?) ON CONFLICT(page_id) DO UPDATE SET indexed_at = excluded.indexed_at"
  ).run(pageId, now());
  return true;
}

/** FTS5 query with a safe fallback to LIKE when the user types odd characters. */
export function searchPages(db, ownerId, query, limit = 25) {
  const cleaned = String(query || "").trim();
  if (!cleaned) return [];

  const ftsQuery = cleaned
    .split(/\s+/)
    .map((token) => `"${token.replace(/"/g, "")}"*`)
    .join(" ");

  try {
    const rows = db
      .prepare(
        `SELECT s.page_id AS id, bm25(page_search) AS rank
         FROM page_search s
         WHERE page_search MATCH ? AND s.owner_id = ?
         ORDER BY rank LIMIT ?`
      )
      .all(ftsQuery, ownerId, limit);
    return hydrateSearch(db, rows);
  } catch {
    const like = `%${cleaned.replace(/[%_]/g, "")}%`;
    const rows = db
      .prepare(
        `SELECT s.page_id AS id, 0 AS rank FROM page_search s
         WHERE s.owner_id = ? AND (s.title LIKE ? OR s.body LIKE ?)
         LIMIT ?`
      )
      .all(ownerId, like, like, limit);
    return hydrateSearch(db, rows);
  }
}

function hydrateSearch(db, rows) {
  return rows
    .map((row) => {
      const page = getPage(db, row.id);
      if (!page || page.trashedAt) return null;
      const snippetRow = db
        .prepare("SELECT substr(body, 1, 220) AS snippet FROM page_search WHERE page_id = ?")
        .get(row.id);
      return { ...page, snippet: snippetRow?.snippet || "" };
    })
    .filter(Boolean);
}

export { WORKSPACE };