/* Notion Clone backend — Fastify API, SQLite storage, session auth, SSE realtime. */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";

import { openDatabase, migrate, querier } from "./db.js";
import {
  SESSION_COOKIE,
  clearedSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  purgeExpiredSessions,
  readSession,
  sessionCookie,
  verifyPassword,
} from "./auth.js";
import * as repo from "./repository.js";
import { createRealtime } from "./realtime.js";
import { MAX_UPLOAD_BYTES, createStorage, guessMime, sanitizeName } from "./storage.js";
import { uid } from "./ids.js";
import { API, LIMITS, apiUrl, isEmail, normalizeEmail, withinLimits } from "../shared/contracts.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const frontendDir = join(root, "frontend");

const PORT = Number(process.env.PORT || process.env.port || 5173);
const HOST = process.env.HOST || "127.0.0.1";
const DATABASE_FILE = process.env.DATABASE_FILE || join(root, ".data", "notion.sqlite");
const UPLOAD_DIR = join(root, ".data", "uploads");

export async function buildServer({ databaseFile = DATABASE_FILE, logger = false } = {}) {
  const db = openDatabase(databaseFile);
  migrate(db);
  const q = querier(db);
  const storage = createStorage(UPLOAD_DIR);
  const realtime = createRealtime();

  purgeExpiredSessions(db);

  const app = Fastify({ logger, bodyLimit: LIMITS.jsonBytes });
  app.register(cookie);

  /* Raw binary uploads: accept any content type and hand back a Buffer. */
  app.addContentTypeParser("*", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  /* ---------------- auth helpers ---------------- */
  function currentUser(request) {
    const sessionId = request.cookies?.[SESSION_COOKIE];
    return readSession(db, sessionId);
  }

  function requireUser(request, reply) {
    const session = currentUser(request);
    if (!session) {
      reply.code(401).send({ error: "Sign in to continue." });
      return null;
    }
    return session.user;
  }

  app.decorate("requireUser", requireUser);
  app.decorate("db", db);
  app.decorate("repo", repo);
  app.decorate("realtime", realtime);

  /* ---------------- health ---------------- */
  app.get(apiUrl(API.health.path), async () => ({
    ok: true,
    driver: storage.driver,
    realtimeClients: realtime.clientCount,
    db: databaseFile,
  }));

  /* ---------------- auth routes ---------------- */
  app.post(apiUrl(API.auth.register.path), async (request, reply) => {
    const email = normalizeEmail(request.body?.email);
    const name = withinLimits(String(request.body?.name ?? "").trim(), LIMITS.name);
    const password = String(request.body?.password ?? "");

    if (!isEmail(email)) return reply.code(400).send({ error: "Enter a valid email address." });
    if (!name) return reply.code(400).send({ error: "Enter your name." });
    if (password.length < 8) {
      return reply.code(400).send({ error: "Use a password with at least 8 characters." });
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) return reply.code(409).send({ error: "That email is already registered." });

    const id = uid();
    const stamp = Date.now();
    const hash = await hashPassword(password);
    db.prepare(
      "INSERT INTO users (id, email, name, password_hash, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, email, name, hash, "#2383e2", stamp, stamp);

    const session = createSession(db, id, request.headers["user-agent"]);
    reply.header("Set-Cookie", sessionCookie(session.id));
    return { user: { id, email, name, color: "#2383e2" } };
  });

  app.post(apiUrl(API.auth.login.path), async (request, reply) => {
    const email = normalizeEmail(request.body?.email);
    const password = String(request.body?.password ?? "");
    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      return reply.code(401).send({ error: "Email or password is incorrect." });
    }
    const session = createSession(db, row.id, request.headers["user-agent"]);
    reply.header("Set-Cookie", sessionCookie(session.id));
    return { user: { id: row.id, email: row.email, name: row.name, color: row.color } };
  });

  app.post(apiUrl(API.auth.logout.path), async (request, reply) => {
    const sessionId = request.cookies?.[SESSION_COOKIE];
    destroySession(db, sessionId);
    reply.header("Set-Cookie", clearedSessionCookie());
    return { ok: true };
  });

  app.get(apiUrl(API.auth.me.path), async (request, reply) => {
    const session = currentUser(request);
    if (!session) return reply.code(401).send({ error: "Not signed in." });
    return { user: session.user };
  });

  /* ---------------- workspace bootstrap ---------------- */
  app.get(apiUrl(API.workspace.path), async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const pages = repo.listPages(db, user.id);
    const trashed = repo.listPages(db, user.id, { includeTrash: true }).filter((page) => page.trashedAt);
    const teamspaces = repo.listTeamspaces(db, user.id).map((teamspace) => ({
      ...teamspace,
      members: repo.listMembers(db, teamspace.id),
    }));
    return { user, pages, trashed, teamspaces, syncedBlocks: {} };
  });

  /* ---------------- pages ---------------- */
  app.get(apiUrl(API.pages.list.path), async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const includeTrash = request.query?.trash === "1";
    return { pages: repo.listPages(db, user.id, { includeTrash }) };
  });

  app.post(apiUrl(API.pages.create.path), async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const page = repo.createPage(db, user.id, request.body ?? {});
    realtime.broadcast("page:created", { page }, { except: request.id });
    return reply.code(201).send({ page, blocks: repo.listBlocks(db, page.id) });
  });

  app.get(`${API.base}/pages/:id`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const page = repo.getPage(db, request.params.id);
    if (!page || page.ownerId !== user.id) return reply.code(404).send({ error: "Page not found." });
    return { page, blocks: repo.listBlocks(db, page.id), options: repo.getPageOptions(db, page.id) };
  });

  app.patch(`${API.base}/pages/:id`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const existing = repo.getPage(db, request.params.id);
    if (!existing || existing.ownerId !== user.id) {
      return reply.code(404).send({ error: "Page not found." });
    }
    const page = repo.updatePage(db, request.params.id, request.body ?? {});
    realtime.broadcast("page:updated", { page }, { except: request.id });
    return { page };
  });

  app.put(`${API.base}/pages/:id/blocks`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const existing = repo.getPage(db, request.params.id);
    if (!existing || existing.ownerId !== user.id) {
      return reply.code(404).send({ error: "Page not found." });
    }
    const incoming = Array.isArray(request.body?.blocks) ? request.body.blocks : [];
    const blocks = incoming.slice(0, LIMITS.blocksPerPage).map((block) => ({
      ...block,
      id: withinLimits(block?.id, 64) || uid(),
      type: withinLimits(block?.type, 32) || "paragraph",
    }));
    const saved = repo.replaceBlocks(db, request.params.id, blocks);
    realtime.broadcast("page:updated", { pageId: request.params.id, blocks: saved }, { except: request.id });
    return { blocks: saved };
  });

  app.post(`${API.base}/pages/:id/restore`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const page = repo.restorePage(db, request.params.id);
    if (!page || page.ownerId !== user.id) return reply.code(404).send({ error: "Page not found." });
    return { page };
  });

  app.delete(`${API.base}/pages/:id`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const page = repo.getPage(db, request.params.id);
    if (!page || page.ownerId !== user.id) return reply.code(404).send({ error: "Page not found." });
    const count = request.query?.purge === "1" ? repo.purgePage(db, page.id) : repo.deletePage(db, page.id);
    realtime.broadcast("page:deleted", { pageId: page.id }, { except: request.id });
    return { ok: true, count };
  });

  /* ---------------- teamspaces ---------------- */
  app.get(apiUrl(API.teamspaces.list.path), async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    return {
      teamspaces: repo.listTeamspaces(db, user.id).map((teamspace) => ({
        ...teamspace,
        members: repo.listMembers(db, teamspace.id),
      })),
    };
  });

  app.post(apiUrl(API.teamspaces.create.path), async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const teamspace = repo.createTeamspace(db, user.id, request.body ?? {});
    return reply.code(201).send({ teamspace });
  });

  app.post(`${API.base}/teamspaces/:id/members`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const email = normalizeEmail(request.body?.email);
    const member = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (!member) return reply.code(404).send({ error: "No account with that email yet." });
    repo.addMember(db, request.params.id, member.id, request.body?.role ?? "member");
    return { members: repo.listMembers(db, request.params.id) };
  });

  /* ---------------- comments ---------------- */
  app.get(apiUrl(API.comments.list.path), async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const pageId = request.query?.pageId ?? null;
    const teamspaceId = request.query?.teamspaceId ?? null;
    if (!pageId && !teamspaceId) return reply.code(400).send({ error: "pageId or teamspaceId is required." });
    return { comments: repo.listComments(db, { pageId, teamspaceId }) };
  });

  app.post(apiUrl(API.comments.create.path), async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const text = withinLimits(String(request.body?.text ?? "").trim(), LIMITS.commentText);
    if (!text) return reply.code(400).send({ error: "Write something first." });
    const comment = repo.createComment(db, user.id, {
      pageId: request.body?.pageId ?? null,
      teamspaceId: request.body?.teamspaceId ?? null,
      text,
      anchor: request.body?.anchor ?? null,
    });
    realtime.broadcast("comment:created", { comment });
    return reply.code(201).send({ comment });
  });

  app.patch(`${API.base}/comments/:id`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const comment = repo.updateComment(db, request.params.id, request.body ?? {});
    if (!comment) return reply.code(404).send({ error: "Comment not found." });
    return { comment };
  });

  app.delete(`${API.base}/comments/:id`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const removed = repo.removeComment(db, request.params.id);
    if (!removed) return reply.code(404).send({ error: "Comment not found." });
    return { ok: true };
  });

  /* ---------------- search ---------------- */
  app.get(apiUrl(API.search.path), async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const results = repo.searchPages(db, user.id, request.query?.q ?? "");
    return { results };
  });

  /* ---------------- uploads ---------------- */
  app.post(apiUrl(API.uploads.create.path), { bodyLimit: MAX_UPLOAD_BYTES }, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;

    const rawName = request.query?.name || request.headers["x-file-name"] || "file";
    const name = sanitizeName(rawName);
    const buffer = await readRawBody(request);
    if (!buffer?.length) return reply.code(400).send({ error: "The upload is empty." });
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return reply.code(413).send({ error: "Files are limited to 25 MB." });
    }

    const stored = await storage.put(buffer, name);
    const upload = repo.createUpload(db, user.id, {
      name,
      ext: extnameOf(name),
      mime: guessMime(name),
      size: stored.bytes,
      sha256: stored.sha256,
      storageKey: stored.key,
    });
    return reply.code(201).send({ ...upload, url: `${apiUrl(API.uploads.get.path)}/${upload.id}` });
  });

  app.get(`${API.base}/uploads/:id`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const upload = repo.getUpload(db, request.params.id);
    if (!upload) return reply.code(404).send({ error: "File not found." });

    const { buffer, size } = await storage.get(upload.storage_key);
    const inline = /^(audio|video|image)\//.test(upload.mime) || upload.mime === "application/pdf";
    reply
      .header("Content-Type", upload.mime)
      .header("Accept-Ranges", "bytes")
      .header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${upload.name.replace(/"/g, "")}"`)
      .header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; sandbox");

    const range = request.headers.range;
    const match = typeof range === "string" ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
    if (match && size > 0) {
      const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (Number.isFinite(start) && start >= 0 && start <= end) {
        const slice = buffer.subarray(start, end + 1);
        return reply
          .code(206)
          .header("Content-Range", `bytes ${start}-${end}/${size}`)
          .header("Content-Length", slice.length)
          .send(slice);
      }
    }

    return reply.header("Content-Length", buffer.length).send(buffer);
  });

  /* ---------------- realtime ---------------- */
  app.get(apiUrl(API.realtime.path), (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    return realtime.connect(request, reply, user);
  });

  /* ---------------- frontend ---------------- */
  await app.register(fastifyStatic, {
    root: frontendDir,
    prefix: "/",
    index: ["index.html"],
    wildcard: false,
  });

  /* Shared contracts are imported by the browser directly (single static root, so we
   serve this prefix by hand instead of registering @fastify/static twice). */
  const sharedDir = join(root, "shared");
  app.get("/shared/:file", async (request, reply) => {
    const name = String(request.params.file || "");
    if (!/^[A-Za-z0-9._-]+\.js$/.test(name)) {
      return reply.code(404).send({ error: "Not found." });
    }
    try {
      const body = await readFileSafe(join(sharedDir, name));
      return reply
        .header("Content-Type", "text/javascript; charset=utf-8")
        .header("Cache-Control", "no-store")
        .send(body);
    } catch {
      return reply.code(404).send({ error: "Not found." });
    }
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith(API.base)) {
      return reply.code(404).send({ error: "Not found." });
    }
    const detailRoute = /^\/(p|t)\/[^/]+\/?$/.test(request.url) || request.url === "/app";
    return reply.type("text/html").send(await readFileSafe(join(frontendDir, "app.html")));
  });

  app.addHook("onClose", async () => {
    db.close();
  });

  return app;
}

/* ---------------- small helpers ---------------- */

function extnameOf(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

async function readRawBody(request) {
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return Buffer.from(request.body);

  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    request.raw.resume();
    return null;
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of request.raw) {
    total += chunk.length;
    if (total > MAX_UPLOAD_BYTES) {
      request.raw.destroy();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readFileSafe(path) {
  const { readFile } = await import("node:fs/promises");
  return readFile(path);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  (async () => {
    const app = await buildServer({ logger: process.env.LOG === "1" });
    try {
      await app.listen({ port: PORT, host: HOST });
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
    console.log(`Notion clone API  → http://localhost:${PORT}`);
    console.log(`Frontend          → http://localhost:${PORT}/app.html`);
    console.log(`Health            → http://localhost:${PORT}/api/health`);
  })();
}

export { querier };