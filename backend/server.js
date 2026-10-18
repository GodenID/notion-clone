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
  generateTotpSecret,
  hashPassword,
  purgeExpiredSessions,
  readSession,
  sessionCookie,
  verifyPassword,
  verifyTotp,
} from "./auth.js";
import * as repo from "./repository.js";
import {
  ACTIONS,
  accessFor,
  assertAccess,
  listPageMembers,
  sharePage,
  unsharePage,
} from "./permissions.js";
import { createAudit, createRateLimiter, clientIp, LIMITS as RATE_LIMITS } from "./middleware.js";
import { createMagicLinks } from "./magic-link.js";
import {
  buildAuthorizationUrl,
  exchangeCode,
  fetchOAuthUser,
  findOrCreateOAuthUser,
  getProvider,
  isProviderConfigured,
  listProviders,
  rowToUser,
} from "./oauth.js";
import { createRealtime } from "./realtime.js";
import { createCollabServer } from "./collab.js";
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

export async function buildServer({ databaseFile = DATABASE_FILE, logger = false, env = process.env } = {}) {
  const db = openDatabase(databaseFile);
  migrate(db);
  const q = querier(db);
  const storage = createStorage(UPLOAD_DIR, env);
  const realtime = createRealtime();
  const audit = createAudit(db);
  const magic = createMagicLinks(db);
  const rateLimiter = createRateLimiter({ windowMs: 60_000, max: RATE_LIMITS.auth.max });

  purgeExpiredSessions(db);
  magic.sweep();

  const app = Fastify({ logger, bodyLimit: LIMITS.jsonBytes });
  const collab = createCollabServer(app.server);
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

  /** Throttle helper: 429 + Retry-After when a client burns through a bucket. */
  function throttle(request, reply, bucket, key = "") {
    const limit = RATE_LIMITS[bucket] ?? RATE_LIMITS.write;
    const limiter = bucket === "auth" ? rateLimiter : createRateLimiterFor(bucket, limit);
    const result = limiter.take(`${bucket}:${key || clientIp(request)}`);
    reply.header("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
    if (!result.allowed) {
      reply.header("Retry-After", String(result.retryAfter));
      reply.code(429).send({ error: "Too many requests — slow down a moment." });
      return false;
    }
    return true;
  }

  const buckets = new Map();
  function createRateLimiterFor(bucket, limit) {
    if (!buckets.has(bucket)) buckets.set(bucket, createRateLimiter(limit));
    return buckets.get(bucket);
  }

  /** Resolve a page the caller may touch, or answer 403/404 and return null. */
  function resolvePage(request, reply, id, action = ACTIONS.read) {
    const user = requireUser(request, reply);
    if (!user) return null;
    const page = repo.getPage(db, id);
    if (!page) {
      reply.code(404).send({ error: "Page not found." });
      return null;
    }
    try {
      assertAccess(db, page, user.id, action);
    } catch (error) {
      audit.record(request, {
        user,
        action: `${action}.denied`,
        target: page.id,
        detail: { status: error.statusCode || 403 },
      });
      reply.code(error.statusCode || 403).send({ error: error.message });
      return null;
    }
    return { page, user };
  }

  app.decorate("requireUser", requireUser);
  app.decorate("db", db);
  app.decorate("repo", repo);
  app.decorate("realtime", realtime);
  app.decorate("collab", collab);

  /* ---------------- health ---------------- */
  app.get(apiUrl(API.health.path), async () => ({
    ok: true,
    driver: storage.driver,
    realtimeClients: realtime.clientCount,
    collabClients: collab.clientCount,
    collabRooms: collab.roomCount,
    db: databaseFile,
  }));

  /* ---------------- auth routes ---------------- */
  app.post(apiUrl(API.auth.register.path), async (request, reply) => {
    if (!throttle(request, reply, "auth")) return reply;
    const email = normalizeEmail(request.body?.email);
    const name = withinLimits(String(request.body?.name ?? "").trim(), LIMITS.name);
    const password = String(request.body?.password ?? "");

    if (!isEmail(email)) return reply.code(400).send({ error: "Enter a valid email address." });
    if (!name) return reply.code(400).send({ error: "Enter your name." });
    if (password.length < 8) {
      return reply.code(400).send({ error: "Use a password with at least 8 characters." });
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      audit.record(request, { action: "auth.register.duplicate", target: email });
      return reply.code(409).send({ error: "That email is already registered." });
    }

    const id = uid();
    const stamp = Date.now();
    const hash = await hashPassword(password);
    db.prepare(
      "INSERT INTO users (id, email, name, password_hash, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(id, email, name, hash, "#2383e2", stamp, stamp);

    const session = createSession(db, id, request.headers["user-agent"]);
    reply.header("Set-Cookie", sessionCookie(session.id));
    rateLimiter.reset(`auth:${clientIp(request)}`);
    audit.record(request, {
      user: { id, email },
      action: "auth.register",
      target: id,
    });
    return { user: { id, email, name, color: "#2383e2" } };
  });

  app.post(apiUrl(API.auth.login.path), async (request, reply) => {
    const email = normalizeEmail(request.body?.email);
    const password = String(request.body?.password ?? "");
    /* Keyed per account and per IP: an attack on one account never locks out
       everyone else behind the same address. */
    const bucketKey = `login:${email}:${clientIp(request)}`;

    /* Only failed attempts spend from the bucket: a correct password is never
       locked out, an attacker guessing one is. */
    const gate = rateLimiter.peek(bucketKey);
    reply.header("X-RateLimit-Remaining", String(gate.remaining));
    if (!gate.allowed) {
      reply.header("Retry-After", String(gate.retryAfter));
      audit.record(request, { action: "auth.login.throttled", target: email });
      return reply.code(429).send({ error: "Too many failed attempts — try again shortly." });
    }

    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!row || !(await verifyPassword(password, row.password_hash))) {
      rateLimiter.take(bucketKey);
      audit.record(request, { action: "auth.login.failed", target: email });
      return reply.code(401).send({ error: "Email or password is incorrect." });
    }
    const session = createSession(db, row.id, request.headers["user-agent"]);
    reply.header("Set-Cookie", sessionCookie(session.id));
    rateLimiter.reset(bucketKey);
    audit.record(request, {
      user: { id: row.id, email: row.email },
      action: "auth.login",
      target: row.id,
    });
    return { user: { id: row.id, email: row.email, name: row.name, color: row.color } };
  });

  app.post(apiUrl(API.auth.logout.path), async (request, reply) => {
    const session = currentUser(request);
    const sessionId = request.cookies?.[SESSION_COOKIE];
    destroySession(db, sessionId);
    reply.header("Set-Cookie", clearedSessionCookie());
    if (session) audit.record(request, { user: session.user, action: "auth.logout", target: session.user.id });
    return { ok: true };
  });

  app.get(apiUrl(API.auth.me.path), async (request, reply) => {
    const session = currentUser(request);
    if (!session) return reply.code(401).send({ error: "Not signed in." });
    return { user: session.user };
  });

  /* ---------------- password reset ---------------- */
  app.post(`${API.base}/auth/reset/request`, async (request, reply) => {
    if (!throttle(request, reply, "auth")) return reply;
    const email = normalizeEmail(request.body?.email);
    if (!isEmail(email)) return reply.code(400).send({ error: "Enter a valid email address." });

    const row = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
    if (row) {
      const token = magic.issue(row.id, { purpose: "reset", ip: clientIp(request) });
      await magic.send(row.email, token, { purpose: "reset" });
      audit.record(request, { user: { id: row.id, email }, action: "auth.reset.request", target: row.id });
    }
    /* Same answer either way so accounts cannot be enumerated. */
    return { ok: true, message: "If that account exists, a reset link is on its way." };
  });

  app.post(`${API.base}/auth/reset/verify`, async (request, reply) => {
    if (!throttle(request, reply, "auth")) return reply;
    const token = String(request.body?.token ?? "");
    const password = String(request.body?.password ?? "");
    if (password.length < 8) {
      return reply.code(400).send({ error: "Use a password with at least 8 characters." });
    }
    const result = magic.consume(token, "reset");
    if (!result.ok) {
      audit.record(request, { action: "auth.reset.failed", detail: { reason: result.reason } });
      return reply.code(400).send({ error: "That link is invalid, used, or expired." });
    }
    const hash = await hashPassword(password);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
      hash,
      Date.now(),
      result.userId
    );
    /* Revoke every session so a stolen session cannot outlive the reset. */
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(result.userId);
    audit.record(request, { action: "auth.reset.complete", target: result.userId });
    return { ok: true, message: "Password updated. Sign in with the new one." };
  });

  /* ---------------- two-factor authentication (TOTP) ---------------- */
  app.post(`${API.base}/auth/2fa/setup`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const secret = generateTotpSecret();
    db.prepare(
      "INSERT INTO user_settings (user_id, totp_secret, totp_enabled, created_at, updated_at) VALUES (?, ?, 0, ?, ?) ON CONFLICT(user_id) DO UPDATE SET totp_secret = excluded.totp_secret, totp_enabled = 0, updated_at = excluded.updated_at"
    ).run(user.id, secret, Date.now(), Date.now());
    audit.record(request, { user, action: "auth.2fa.setup", target: user.id });
    return {
      secret,
      otpauthUrl: `otpauth://totp/Notion%20Clone:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Notion%20Clone&digits=6&period=30`,
      qr: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`otpauth://totp/Notion%20Clone:${user.email}?secret=${secret}&issuer=Notion%20Clone`)}`,
    };
  });

  app.post(`${API.base}/auth/2fa/verify`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const code = String(request.body?.code ?? "").replace(/\s+/g, "");
    const row = db.prepare("SELECT totp_secret, totp_enabled FROM user_settings WHERE user_id = ?").get(user.id);
    if (!row?.totp_secret) return reply.code(400).send({ error: "Start the setup first." });
    if (!verifyTotp(row.totp_secret, code)) {
      audit.record(request, { user, action: "auth.2fa.verify.failed", target: user.id });
      return reply.code(400).send({ error: "That code is wrong or expired." });
    }
    db.prepare("UPDATE user_settings SET totp_enabled = 1, updated_at = ? WHERE user_id = ?").run(Date.now(), user.id);
    audit.record(request, { user, action: "auth.2fa.enabled", target: user.id });
    return { ok: true, enabled: true };
  });

  app.post(`${API.base}/auth/2fa/disable`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const code = String(request.body?.code ?? "").replace(/\s+/g, "");
    const row = db.prepare("SELECT totp_secret, totp_enabled FROM user_settings WHERE user_id = ?").get(user.id);
    if (row?.totp_enabled && !verifyTotp(row.totp_secret, code)) {
      return reply.code(400).send({ error: "That code is wrong or expired." });
    }
    db.prepare("DELETE FROM user_settings WHERE user_id = ?").run(user.id);
    audit.record(request, { user, action: "auth.2fa.disabled", target: user.id });
    return { ok: true, enabled: false };
  });

  app.get(`${API.base}/auth/2fa/status`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const row = db.prepare("SELECT totp_enabled FROM user_settings WHERE user_id = ?").get(user.id);
    return { enabled: Boolean(row?.totp_enabled) };
  });

  /* ---------------- OAuth ---------------- */
  app.get("/auth/oauth/providers", async (request, reply) => {
    const providers = listProviders()
      .filter((name) => isProviderConfigured(name))
      .map((name) => ({ name, displayName: getProvider(name).name }));
    return { providers };
  });

  app.get("/auth/oauth/:provider", async (request, reply) => {
    const provider = request.params.provider;
    const p = getProvider(provider);
    if (!p || !isProviderConfigured(provider)) {
      return reply.code(400).send({ error: `OAuth provider '${provider}' is not configured.` });
    }

    const clientId = process.env[p.clientIdEnv];
    const redirectUri = `${request.protocol}://${request.hostname}/auth/oauth/${provider}/callback`;
    const state = Buffer.from(JSON.stringify({ nonce: uid(), ts: Date.now() })).toString("base64url");
    reply.setCookie("oauth_state", state, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 600 });

    const url = buildAuthorizationUrl(provider, { clientId, redirectUri, state });
    return reply.redirect(url);
  });

  app.get("/auth/oauth/:provider/callback", async (request, reply) => {
    const provider = request.params.provider;
    const p = getProvider(provider);
    if (!p || !isProviderConfigured(provider)) {
      return reply.code(400).send({ error: `OAuth provider '${provider}' is not configured.` });
    }

    const { code, state, error: oauthError } = request.query;
    if (oauthError) {
      return reply.redirect(`/index.html?oauth_error=${encodeURIComponent(oauthError)}`);
    }
    if (!code || !state) {
      return reply.redirect("/index.html?oauth_error=missing_code");
    }

    const savedState = request.cookies?.oauth_state;
    if (!savedState || savedState !== state) {
      return reply.redirect("/index.html?oauth_error=invalid_state");
    }
    reply.clearCookie("oauth_state", { path: "/" });

    try {
      const clientId = process.env[p.clientIdEnv];
      const clientSecret = process.env[p.clientSecretEnv];
      const redirectUri = `${request.protocol}://${request.hostname}/auth/oauth/${provider}/callback`;

      const accessToken = await exchangeCode(provider, { code, clientId, clientSecret, redirectUri });
      const oauthUser = await fetchOAuthUser(provider, accessToken);

      const { user, isNew } = findOrCreateOAuthUser(db, provider, oauthUser);
      const session = createSession(db, user.id, request.headers["user-agent"]);
      reply.header("Set-Cookie", sessionCookie(session.id));

      audit.record(request, {
        user: rowToUser(user),
        action: isNew ? "auth.oauth.register" : "auth.oauth.login",
        target: user.id,
        detail: { provider },
      });

      return reply.redirect("/app.html");
    } catch (error) {
      audit.record(request, { action: "auth.oauth.failed", detail: { provider, error: error.message } });
      return reply.redirect(`/index.html?oauth_error=${encodeURIComponent(error.message)}`);
    }
  });

  /* ---------------- passwordless sign-in ---------------- */
  app.post(`${API.base}/auth/magic/request`, async (request, reply) => {
    if (!throttle(request, reply, "auth")) return reply;
    const email = normalizeEmail(request.body?.email);
    if (!isEmail(email)) return reply.code(400).send({ error: "Enter a valid email address." });

    const row = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
    /* Always answer the same way so the endpoint cannot be used to enumerate accounts. */
    if (row) {
      const token = magic.issue(row.id, { ip: clientIp(request) });
      await magic.send(row.email, token);
      audit.record(request, { user: { id: row.id, email }, action: "auth.magic.request", target: row.id });
    }
    return { ok: true, message: "If that account exists, a sign-in link is on its way." };
  });

  app.post(`${API.base}/auth/magic/verify`, async (request, reply) => {
    if (!throttle(request, reply, "auth")) return reply;
    const token = String(request.body?.token ?? "");
    const result = magic.consume(token, "login");
    if (!result.ok) {
      audit.record(request, { action: "auth.magic.failed", detail: { reason: result.reason } });
      return reply.code(400).send({ error: "That link is invalid, used, or expired." });
    }
    const user = db.prepare("SELECT id, email, name, color FROM users WHERE id = ?").get(result.userId);
    if (!user) return reply.code(400).send({ error: "That link is invalid, used, or expired." });

    const session = createSession(db, user.id, request.headers["user-agent"]);
    reply.header("Set-Cookie", sessionCookie(session.id));
    rateLimiter.reset(`auth:${clientIp(request)}`);
    audit.record(request, { user, action: "auth.magic.verify", target: user.id });
    return { user };
  });

  /* ---------------- workspace bootstrap ---------------- */
  app.get(apiUrl(API.workspace.path), async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const all = repo.listPages(db, user.id, { includeTrash: true, shared: true });
    const pages = all.filter((page) => !page.trashedAt);
    const trashed = all.filter((page) => page.trashedAt);
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
    const pages = repo
      .listPages(db, user.id, { includeTrash: true, shared: true })
      .filter((page) => (includeTrash ? true : !page.trashedAt));
    return { pages };
  });

  app.post(apiUrl(API.pages.create.path), async (request, reply) => {
    if (!throttle(request, reply, "write")) return reply;
    const user = requireUser(request, reply);
    if (!user) return reply;
    const page = repo.createPage(db, user.id, request.body ?? {});
    audit.record(request, { user, action: "page.create", target: page.id, detail: { title: page.title } });
    realtime.broadcast("page:created", { page }, { except: request.id });
    return reply.code(201).send({ page, blocks: repo.listBlocks(db, page.id) });
  });

  app.get(`${API.base}/pages/:id`, async (request, reply) => {
    const resolved = resolvePage(request, reply, request.params.id, ACTIONS.read);
    if (!resolved) return reply;
    const { page, user } = resolved;
    const access = accessFor(db, page, user.id);
    return {
      page,
      blocks: repo.listBlocks(db, page.id),
      options: repo.getPageOptions(db, page.id),
      role: access.role,
      permissions: access.allowed,
    };
  });

  app.patch(`${API.base}/pages/:id`, async (request, reply) => {
    if (!throttle(request, reply, "write")) return reply;
    const resolved = resolvePage(request, reply, request.params.id, ACTIONS.write);
    if (!resolved) return reply;
    const { page, user } = resolved;
    const updated = repo.updatePage(db, request.params.id, request.body ?? {});
    audit.record(request, { user, action: "page.update", target: page.id, detail: request.body ?? {} });
    realtime.broadcast("page:updated", { page: updated }, { except: request.id });
    return { page: updated };
  });

  app.put(`${API.base}/pages/:id/blocks`, async (request, reply) => {
    if (!throttle(request, reply, "write")) return reply;
    const resolved = resolvePage(request, reply, request.params.id, ACTIONS.write);
    if (!resolved) return reply;
    const { page, user } = resolved;
    const incoming = Array.isArray(request.body?.blocks) ? request.body.blocks : [];
    const blocks = incoming.slice(0, LIMITS.blocksPerPage).map((block) => ({
      ...block,
      id: withinLimits(block?.id, 64) || uid(),
      type: withinLimits(block?.type, 32) || "paragraph",
    }));
    const saved = repo.replaceBlocks(db, page.id, blocks);
    audit.record(request, {
      user,
      action: "page.blocks",
      target: page.id,
      detail: { count: saved.length },
    });
    realtime.broadcast("page:updated", { pageId: page.id, blocks: saved }, { except: request.id });
    return { blocks: saved };
  });

  app.post(`${API.base}/pages/:id/restore`, async (request, reply) => {
    const resolved = resolvePage(request, reply, request.params.id, ACTIONS.write);
    if (!resolved) return reply;
    const { page, user } = resolved;
    const restored = repo.restorePage(db, page.id);
    audit.record(request, { user, action: "page.restore", target: page.id });
    return { page: restored };
  });

  app.delete(`${API.base}/pages/:id`, async (request, reply) => {
    const resolved = resolvePage(request, reply, request.params.id, ACTIONS.delete);
    if (!resolved) return reply;
    const { page, user } = resolved;
    const purge = request.query?.purge === "1";
    const count = purge ? repo.purgePage(db, page.id) : repo.deletePage(db, page.id);
    audit.record(request, { user, action: purge ? "page.purge" : "page.trash", target: page.id });
    realtime.broadcast("page:deleted", { pageId: page.id }, { except: request.id });
    return { ok: true, count };
  });

  /* ---------------- page sharing ---------------- */
  app.get(`${API.base}/pages/:id/members`, async (request, reply) => {
    const resolved = resolvePage(request, reply, request.params.id, ACTIONS.read);
    if (!resolved) return reply;
    const { page, user } = resolved;
    const access = accessFor(db, page, user.id);
    return { members: listPageMembers(db, page.id), role: access.role };
  });

  app.post(`${API.base}/pages/:id/members`, async (request, reply) => {
    if (!throttle(request, reply, "write")) return reply;
    const resolved = resolvePage(request, reply, request.params.id, ACTIONS.share);
    if (!resolved) return reply;
    const { page, user } = resolved;
    const email = normalizeEmail(request.body?.email);
    const role = ["viewer", "member"].includes(request.body?.role) ? request.body.role : "viewer";
    const invitee = db.prepare("SELECT id, name, email FROM users WHERE email = ?").get(email);
    if (!invitee) {
      audit.record(request, { user, action: "page.share.unknown", target: page.id, detail: { email } });
      return reply.code(404).send({ error: "No account with that email yet." });
    }
    if (invitee.id === page.ownerId) {
      return reply.code(400).send({ error: "That person already owns this page." });
    }
    const members = sharePage(db, page.id, invitee.id, role, user.id);
    audit.record(request, {
      user,
      action: "page.share",
      target: page.id,
      detail: { email, role },
    });
    realtime.broadcast("page:updated", { pageId: page.id, members }, { except: request.id });
    return reply.code(201).send({ members });
  });

  app.delete(`${API.base}/pages/:id/members/:userId`, async (request, reply) => {
    const resolved = resolvePage(request, reply, request.params.id, ACTIONS.share);
    if (!resolved) return reply;
    const { page, user } = resolved;
    const removed = unsharePage(db, page.id, request.params.userId);
    if (!removed) return reply.code(404).send({ error: "That person has no access." });
    audit.record(request, { user, action: "page.unshare", target: page.id, detail: { userId: request.params.userId } });
    return { ok: true, members: listPageMembers(db, page.id) };
  });

  /* ---------------- audit trail ---------------- */
  app.get(`${API.base}/audit`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const limit = Math.min(Number(request.query?.limit) || 50, 200);
    return { entries: audit.list({ userId: user.id, limit }) };
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
    if (!throttle(request, reply, "write")) return reply;
    const user = requireUser(request, reply);
    if (!user) return reply;
    const teamspace = db.prepare("SELECT id FROM teamspaces WHERE id = ?").get(request.params.id);
    if (!teamspace) return reply.code(404).send({ error: "Teamspace not found." });

    const role = ["viewer", "member", "admin"].includes(request.body?.role)
      ? request.body.role
      : "member";
    const membership = db
      .prepare("SELECT role FROM teamspace_members WHERE teamspace_id = ? AND user_id = ?")
      .get(teamspace.id, user.id);
    if (membership?.role !== "owner" && membership?.role !== "admin") {
      audit.record(request, { user, action: "teamspace.member.denied", target: teamspace.id });
      return reply.code(403).send({ error: "Only admins can add members." });
    }

    const email = normalizeEmail(request.body?.email);
    const member = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email);
    if (!member) {
      audit.record(request, {
        user,
        action: "teamspace.member.unknown",
        target: teamspace.id,
        detail: { email },
      });
      return reply.code(404).send({ error: "No account with that email yet." });
    }
    repo.addMember(db, teamspace.id, member.id, role);
    audit.record(request, {
      user,
      action: "teamspace.member.add",
      target: teamspace.id,
      detail: { email, role },
    });
    return { members: repo.listMembers(db, teamspace.id) };
  });

  app.delete(`${API.base}/teamspaces/:id/members/:userId`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const membership = db
      .prepare("SELECT role FROM teamspace_members WHERE teamspace_id = ? AND user_id = ?")
      .get(request.params.id, user.id);
    if (membership?.role !== "owner" && membership?.role !== "admin") {
      return reply.code(403).send({ error: "Only admins can remove members." });
    }
    if (membership.role === "owner") {
      return reply.code(400).send({ error: "Transfer ownership before removing the owner." });
    }
    const removed = db
      .prepare("DELETE FROM teamspace_members WHERE teamspace_id = ? AND user_id = ?")
      .run(request.params.id, request.params.userId).changes;
    if (!removed) return reply.code(404).send({ error: "That person is not a member." });
    audit.record(request, {
      user,
      action: "teamspace.member.remove",
      target: request.params.id,
      detail: { userId: request.params.userId },
    });
    return { ok: true, members: repo.listMembers(db, request.params.id) };
  });

  /* ---------------- comments ---------------- */
  app.get(apiUrl(API.comments.list.path), async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const pageId = request.query?.pageId ?? null;
    const teamspaceId = request.query?.teamspaceId ?? null;
    if (!pageId && !teamspaceId) return reply.code(400).send({ error: "pageId or teamspaceId is required." });
    if (pageId) {
      const page = repo.getPage(db, pageId);
      if (!page || !accessFor(db, page, user.id).allowed[ACTIONS.read]) {
        return reply.code(404).send({ error: "Page not found." });
      }
    }
    return { comments: repo.listComments(db, { pageId, teamspaceId }) };
  });

  app.post(apiUrl(API.comments.create.path), async (request, reply) => {
    if (!throttle(request, reply, "write")) return reply;
    const user = requireUser(request, reply);
    if (!user) return reply;
    const text = withinLimits(String(request.body?.text ?? "").trim(), LIMITS.commentText);
    if (!text) return reply.code(400).send({ error: "Write something first." });
    if (request.body?.pageId && !resolvePage(request, reply, request.body.pageId, ACTIONS.comment)) {
      return reply;
    }
    const comment = repo.createComment(db, user.id, {
      pageId: request.body?.pageId ?? null,
      teamspaceId: request.body?.teamspaceId ?? null,
      text,
      anchor: request.body?.anchor ?? null,
    });
    audit.record(request, { user, action: "comment.create", target: comment.id });
    realtime.broadcast("comment:created", { comment });
    return reply.code(201).send({ comment });
  });

  app.patch(`${API.base}/comments/:id`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const comment = db
      .prepare("SELECT id, author_id FROM comments WHERE id = ?")
      .get(request.params.id);
    if (!comment) return reply.code(404).send({ error: "Comment not found." });
    if (comment.author_id !== user.id) {
      audit.record(request, { user, action: "comment.update.denied", target: comment.id });
      return reply.code(403).send({ error: "You can only edit your own comments." });
    }
    return { comment: repo.updateComment(db, comment.id, request.body ?? {}) };
  });

  app.delete(`${API.base}/comments/:id`, async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return reply;
    const comment = db
      .prepare("SELECT id, author_id, page_id FROM comments WHERE id = ?")
      .get(request.params.id);
    if (!comment) return reply.code(404).send({ error: "Comment not found." });

    let allowed = comment.author_id === user.id;
    if (!allowed && comment.page_id) {
      const page = repo.getPage(db, comment.page_id);
      allowed = page ? accessFor(db, page, user.id).allowed[ACTIONS.delete] : false;
    }
    if (!allowed) {
      audit.record(request, { user, action: "comment.delete.denied", target: comment.id });
      return reply.code(403).send({ error: "You cannot delete this comment." });
    }
    repo.removeComment(db, comment.id);
    audit.record(request, { user, action: "comment.delete", target: comment.id });
    return { ok: true };
  });

  /* ---------------- search ---------------- */
  app.get(apiUrl(API.search.path), async (request, reply) => {
    if (!throttle(request, reply, "search")) return reply;
    const user = requireUser(request, reply);
    if (!user) return reply;
    const results = repo.searchAccessible(db, user.id, request.query?.q ?? "");
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