/* Cloudflare Worker entry point — Hono app mirroring the Node backend. */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createD1Adapter } from "./d1-adapter.js";

const app = new Hono();

app.use("*", cors({ origin: "*", credentials: true }));

app.get("/api/health", (c) => {
  return c.json({ ok: true, driver: "d1", environment: c.env.ENVIRONMENT });
});

app.post("/api/debug/echo", async (c) => {
  const body = await c.req.json().catch((e) => ({ error: e.message }));
  return c.json({ received: body, contentType: c.req.header("Content-Type") });
});

/* ---------------- auth (PBKDF2 via Web Crypto) ---------------- */

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = [...salt].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const hashHex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2$${saltHex}$${hashHex}`;
}

async function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored || "").split("$");
  if (algo !== "pbkdf2" || !saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((b) => parseInt(b, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const computed = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed === hashHex;
}

function uid() {
  return crypto.randomUUID();
}

/* ---------------- routes ---------------- */

app.post("/api/auth/register", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 80);
  const password = String(body.password || "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return c.json({ error: "Enter a valid email address." }, 400);
  }
  if (!name) return c.json({ error: "Enter your name." }, 400);
  if (password.length < 8) return c.json({ error: "Use a password with at least 8 characters." }, 400);

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing && existing.id) return c.json({ error: "That email is already registered." }, 409);

  const id = uid();
  const stamp = Date.now();
  const hash = await hashPassword(password);
  db.prepare(
    "INSERT INTO users (id, email, name, password_hash, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, email, name, hash, "#2383e2", stamp, stamp);

  /* Create a session */
  const sessionId = `${uid()}.${crypto.randomUUID().replace(/-/g, "")}`;
  const expires = stamp + 1000 * 60 * 60 * 24 * 30;
  db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    sessionId,
    id,
    stamp,
    expires
  );

  /* Seed a starter page */
  const pageId = uid();
  const slug = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-") || "untitled";
  db.prepare(
    `INSERT INTO pages (id, workspace_id, title, icon, section, owner_id, slug, created_at, updated_at)
     VALUES (?, 'default', ?, '📄', 'private', ?, ?, ?, ?)`
  ).run(pageId, "Getting started", id, slug, stamp, stamp);
  db.prepare("INSERT INTO blocks (id, page_id, position, type, payload, created_at, updated_at) VALUES (?, ?, 0, 'paragraph', '{}', ?, ?)").run(
    uid(),
    pageId,
    stamp,
    stamp
  );

  c.header("Set-Cookie", `notion_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
  return c.json({ user: { id, email, name, color: "#2383e2" } });
});

app.post("/api/auth/login", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return c.json({ error: "Email or password is incorrect." }, 401);
  }

  const sessionId = `${uid()}.${crypto.randomUUID().replace(/-/g, "")}`;
  const stamp = Date.now();
  const expires = stamp + 1000 * 60 * 60 * 24 * 30;
  db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    sessionId,
    row.id,
    stamp,
    expires
  );

  c.header("Set-Cookie", `notion_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`);
  return c.json({ user: { id: row.id, email: row.email, name: row.name, color: row.color } });
});

app.post("/api/auth/logout", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const cookie = c.req.header("Cookie") || "";
  const match = cookie.match(/notion_session=([^;]+)/);
  if (match) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(decodeURIComponent(match[1]));
  }
  c.header("Set-Cookie", "notion_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Not signed in." }, 401);
  return c.json({ user: session.user });
});

async function readSession(c, db) {
  const cookie = c.req.header("Cookie") || "";
  const match = cookie.match(/notion_session=([^;]+)/);
  if (!match) return null;
  const sessionId = decodeURIComponent(match[1]);
  const row = await c.env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.email, u.name, u.color
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`
  ).bind(sessionId).first();
  console.log("DEBUG readSession: sessionId=", sessionId);
  console.log("DEBUG readSession: row=", JSON.stringify(row));
  if (!row || !row.user_id) return null;
  if (row.expires_at < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }
  return { sessionId: row.session_id, user: { id: row.user_id, email: row.email, name: row.name, color: row.color } };
}

app.get("/api/workspace", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const user = session.user;

  const pages = db.prepare("SELECT * FROM pages WHERE owner_id = ? AND trashed_at IS NULL ORDER BY updated_at DESC").all(user.id);
  const trashed = db.prepare("SELECT * FROM pages WHERE owner_id = ? AND trashed_at IS NOT NULL ORDER BY updated_at DESC").all(user.id);
  const teamspaces = db.prepare(
    `SELECT t.* FROM teamspaces t JOIN teamspace_members m ON m.teamspace_id = t.id WHERE m.user_id = ? ORDER BY t.created_at DESC`
  ).all(user.id);

  return c.json({
    user,
    pages: pages.map(rowToPage),
    trashed: trashed.map(rowToPage),
    teamspaces: teamspaces.map(rowToTeamspace),
    syncedBlocks: {},
  });
});

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
    comments: [],
    blocks: [],
    versions: [],
    lastVersionAt: 0,
  };
}

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

app.get("/api/pages", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const includeTrash = c.req.query("trash") === "1";
  const sql = includeTrash
    ? "SELECT * FROM pages WHERE owner_id = ? ORDER BY trashed_at IS NULL DESC, updated_at DESC"
    : "SELECT * FROM pages WHERE owner_id = ? AND trashed_at IS NULL ORDER BY updated_at DESC";
  const pages = db.prepare(sql).all(session.user.id);
  return c.json({ pages: pages.map(rowToPage) });
});

app.post("/api/pages", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const body = await c.req.json().catch(() => ({}));
  const id = body.id || uid();
  const stamp = Date.now();
  const title = String(body.title ?? "").slice(0, 200);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
  db.prepare(
    `INSERT INTO pages (id, workspace_id, title, icon, cover, section, teamspace_id, parent_id, owner_id, favorite, locked, full_width, small_text, font, slug, trashed_at, created_at, updated_at)
     VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'default', ?, NULL, ?, ?)`
  ).run(id, title, body.icon ?? "📄", body.cover ?? null, body.section ?? "private", body.teamspaceId ?? null, body.parentId ?? null, session.user.id, slug, stamp, stamp);
  db.prepare("INSERT INTO blocks (id, page_id, position, type, payload, created_at, updated_at) VALUES (?, ?, 0, 'paragraph', '{}', ?, ?)").run(uid(), id, stamp, stamp);
  return c.json({ page: rowToPage(db.prepare("SELECT * FROM pages WHERE id = ?").get(id)), blocks: [] }, 201);
});

app.get("/api/pages/:id", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(c.req.param("id"));
  if (!page || page.owner_id !== session.user.id) return c.json({ error: "Page not found." }, 404);
  const blocks = db.prepare("SELECT * FROM blocks WHERE page_id = ? ORDER BY position").all(page.id);
  return c.json({
    page: rowToPage(page),
    blocks: blocks.map((b) => {
      let payload = {};
      try { payload = JSON.parse(b.payload || "{}"); } catch {}
      return { id: b.id, type: b.type, ...payload };
    }),
    options: {},
  });
});

app.patch("/api/pages/:id", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const body = await c.req.json().catch(() => ({}));
  const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(c.req.param("id"));
  if (!page || page.owner_id !== session.user.id) return c.json({ error: "Page not found." }, 404);

  const sets = [];
  const params = [];
  const fieldMap = {
    title: "title", icon: "icon", cover: "cover", section: "section",
    teamspaceId: "teamspace_id", parentId: "parent_id", favorite: "favorite",
    locked: "locked", fullWidth: "full_width", smallText: "small_text",
    font: "font", trashedAt: "trashed_at",
  };
  for (const [key, col] of Object.entries(fieldMap)) {
    if (key in body) {
      let value = body[key];
      if (["favorite", "locked", "fullWidth", "smallText"].includes(key)) value = value ? 1 : 0;
      sets.push(`${col} = ?`);
      params.push(value);
    }
  }
  if (typeof body.title === "string") {
    sets.push("slug = ?");
    params.push(body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled");
  }
  if (sets.length) {
    sets.push("updated_at = ?");
    params.push(Date.now(), page.id);
    db.prepare(`UPDATE pages SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  }
  const updated = db.prepare("SELECT * FROM pages WHERE id = ?").get(page.id);
  return c.json({ page: rowToPage(updated) });
});

app.put("/api/pages/:id/blocks", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const body = await c.req.json().catch(() => ({}));
  const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(c.req.param("id"));
  if (!page || page.owner_id !== session.user.id) return c.json({ error: "Page not found." }, 404);

  const blocks = Array.isArray(body.blocks) ? body.blocks : [];
  db.prepare("DELETE FROM blocks WHERE page_id = ?").run(page.id);
  const stamp = Date.now();
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const { id, type, ...rest } = block;
    db.prepare("INSERT INTO blocks (id, page_id, position, type, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id || uid(), page.id, i, type || "paragraph", JSON.stringify(rest), stamp, stamp
    );
  }
  db.prepare("UPDATE pages SET updated_at = ? WHERE id = ?").run(stamp, page.id);
  return c.json({ blocks: blocks.map((b, i) => ({ ...b, id: b.id || uid() })) });
});

app.delete("/api/pages/:id", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(c.req.param("id"));
  if (!page || page.owner_id !== session.user.id) return c.json({ error: "Page not found." }, 404);
  const stamp = Date.now();
  db.prepare("UPDATE pages SET trashed_at = ?, updated_at = ? WHERE id = ?").run(stamp, stamp, page.id);
  return c.json({ ok: true, count: 1 });
});

app.post("/api/pages/:id/restore", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(c.req.param("id"));
  if (!page || page.owner_id !== session.user.id) return c.json({ error: "Page not found." }, 404);
  db.prepare("UPDATE pages SET trashed_at = NULL, updated_at = ? WHERE id = ?").run(Date.now(), page.id);
  const updated = db.prepare("SELECT * FROM pages WHERE id = ?").get(page.id);
  return c.json({ page: rowToPage(updated) });
});

app.get("/api/search", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const q = c.req.query("q") || "";
  if (!q.trim()) return c.json({ results: [] });
  try {
    const ftsQuery = q.trim().split(/\s+/).map((t) => `"${t.replace(/"/g, "")}"*`).join(" ");
    const rows = db.prepare(
      `SELECT page_id AS id FROM page_search WHERE page_search MATCH ? AND owner_id = ? ORDER BY rank LIMIT 25`
    ).all(ftsQuery, session.user.id);
    const results = rows.map((r) => {
      const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(r.id);
      return page ? rowToPage(page) : null;
    }).filter(Boolean);
    return c.json({ results });
  } catch {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const rows = db.prepare(
      `SELECT page_id AS id FROM page_search WHERE owner_id = ? AND (title LIKE ? OR body LIKE ?) LIMIT 25`
    ).all(session.user.id, like, like);
    const results = rows.map((r) => {
      const page = db.prepare("SELECT * FROM pages WHERE id = ?").get(r.id);
      return page ? rowToPage(page) : null;
    }).filter(Boolean);
    return c.json({ results });
  }
});

app.get("/api/teamspaces", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const teamspaces = db.prepare(
    `SELECT t.* FROM teamspaces t JOIN teamspace_members m ON m.teamspace_id = t.id WHERE m.user_id = ? ORDER BY t.created_at DESC`
  ).all(session.user.id);
  return c.json({ teamspaces: teamspaces.map(rowToTeamspace) });
});

app.post("/api/teamspaces", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const body = await c.req.json().catch(() => ({}));
  const id = uid();
  const stamp = Date.now();
  const name = String(body.name || "Untitled teamspace").trim().slice(0, 80);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `teamspace-${id.slice(0, 6)}`;
  db.prepare(
    `INSERT INTO teamspaces (id, name, icon, color, description, slug, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, body.icon ?? "🚀", body.color ?? "#2f6b4f", body.description ?? "", slug, session.user.id, stamp, stamp);
  db.prepare("INSERT INTO teamspace_members (teamspace_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(id, session.user.id, stamp);
  const teamspace = db.prepare("SELECT * FROM teamspaces WHERE id = ?").get(id);
  return c.json({ teamspace: rowToTeamspace(teamspace) }, 201);
});

app.get("/api/comments", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const pageId = c.req.query("pageId");
  const teamspaceId = c.req.query("teamspaceId");
  if (!pageId && !teamspaceId) return c.json({ error: "pageId or teamspaceId is required." }, 400);
  const sql = pageId
    ? `SELECT c.*, u.name AS author_name, u.email AS author_email, u.color AS author_color FROM comments c JOIN users u ON u.id = c.author_id WHERE c.page_id = ? ORDER BY c.resolved, c.created_at DESC`
    : `SELECT c.*, u.name AS author_name, u.email AS author_email, u.color AS author_color FROM comments c JOIN users u ON u.id = c.author_id WHERE c.teamspace_id = ? ORDER BY c.resolved, c.created_at DESC`;
  const rows = db.prepare(sql).all(pageId || teamspaceId);
  const comments = rows.map((row) => ({
    id: row.id,
    pageId: row.page_id,
    teamspaceId: row.teamspace_id,
    author: { id: row.author_id, name: row.author_name, email: row.author_email, color: row.author_color },
    text: row.body,
    anchor: row.anchor ? JSON.parse(row.anchor) : null,
    replies: JSON.parse(row.replies || "[]"),
    reactions: JSON.parse(row.reactions || "{}"),
    resolved: Boolean(row.resolved),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return c.json({ comments });
});

app.post("/api/comments", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const body = await c.req.json().catch(() => ({}));
  const text = String(body.text || "").trim().slice(0, 4000);
  if (!text) return c.json({ error: "Write something first." }, 400);
  const id = uid();
  const stamp = Date.now();
  db.prepare(
    `INSERT INTO comments (id, page_id, teamspace_id, author_id, body, anchor, replies, reactions, resolved, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, '[]', '{}', 0, ?, ?)`
  ).run(id, body.pageId ?? null, body.teamspaceId ?? null, session.user.id, text, body.anchor ? JSON.stringify(body.anchor) : null, stamp, stamp);
  const row = db.prepare(`SELECT c.*, u.name AS author_name, u.email AS author_email, u.color AS author_color FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`).get(id);
  const comment = {
    id: row.id,
    pageId: row.page_id,
    teamspaceId: row.teamspace_id,
    author: { id: row.author_id, name: row.author_name, email: row.author_email, color: row.author_color },
    text: row.body,
    anchor: row.anchor ? JSON.parse(row.anchor) : null,
    replies: [],
    reactions: {},
    resolved: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return c.json({ comment }, 201);
});

app.get("/api/audit", async (c) => {
  const db = createD1Adapter(c.env.DB);
  const session = await readSession(c, db);
  if (!session) return c.json({ error: "Sign in to continue." }, 401);
  const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
  const rows = db.prepare("SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(session.user.id, limit);
  const entries = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.user_email,
    action: row.action,
    target: row.target,
    detail: JSON.parse(row.detail || "{}"),
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }));
  return c.json({ entries });
});

export { CollabRoom } from "./durable-objects/CollabRoom.js";

export default app;