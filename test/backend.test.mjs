/* End-to-end backend test: auth, pages, blocks, search, uploads, comments, realtime. */

import assert from "node:assert/strict";
import { buildServer } from "../backend/server.js";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name} — ${error.message}`);
  }
}

const app = await buildServer({ databaseFile: ":memory:" });
await app.ready();

let cookie = "";
const call = (method, url, payload, options = {}) =>
  app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload }),
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(options.headers || {}),
    },
  });

function captureCookie(response) {
  const header = response.headers["set-cookie"];
  if (header) cookie = String(Array.isArray(header) ? header[0] : header).split(";")[0];
  return response;
}

async function test_() {}

await test("health endpoint reports the driver", async () => {
  const response = await call("GET", "/api/health");
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
});

await test("register rejects a bad email", async () => {
  const response = await call("POST", "/api/auth/register", {
    email: "nope",
    name: "Ada",
    password: "password123",
  });
  assert.equal(response.statusCode, 400);
});

await test("register rejects a short password", async () => {
  const response = await call("POST", "/api/auth/register", {
    email: "ada@example.com",
    name: "Ada",
    password: "short",
  });
  assert.equal(response.statusCode, 400);
});

await test("register creates a user and a session cookie", async () => {
  const response = captureCookie(
    await call("POST", "/api/auth/register", {
      email: "Ada@Example.com",
      name: "Ada Lovelace",
      password: "analytical-engine",
    })
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.email, "ada@example.com", "email should normalize");
  assert.match(cookie, /nookspace_session=/);
});

await test("duplicate registration is rejected", async () => {
  const response = await call("POST", "/api/auth/register", {
    email: "ada@example.com",
    name: "Ada Again",
    password: "analytical-engine",
  });
  assert.equal(response.statusCode, 409);
});

await test("workspace requires auth", async () => {
  const saved = cookie;
  cookie = "";
  const response = await call("GET", "/api/workspace");
  cookie = saved;
  assert.equal(response.statusCode, 401);
});

await test("wrong password is rejected", async () => {
  const saved = cookie;
  cookie = "";
  const response = await call("POST", "/api/auth/login", {
    email: "ada@example.com",
    password: "wrong-password",
  });
  cookie = saved;
  assert.equal(response.statusCode, 401);
});

let pageId = "";

await test("login works with the right password", async () => {
  const saved = cookie;
  cookie = "";
  const response = captureCookie(
    await call("POST", "/api/auth/login", {
      email: "ada@example.com",
      password: "analytical-engine",
    })
  );
  assert.equal(response.statusCode, 200);
  assert.match(cookie, /nookspace_session=/);
  if (!cookie) cookie = saved;
});

await test("me returns the signed-in user", async () => {
  const response = await call("GET", "/api/auth/me");
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.name, "Ada Lovelace");
});

await test("create page returns a page and a starter block", async () => {
  const response = await call("POST", "/api/pages", { title: "Roadmap", icon: "🗺️" });
  assert.equal(response.statusCode, 201);
  const body = response.json();
  pageId = body.page.id;
  assert.equal(body.page.title, "Roadmap");
  assert.match(body.page.slug, /^roadmap/);
  assert.equal(body.blocks.length, 1);
});

await test("page slugs stay unique", async () => {
  const response = await call("POST", "/api/pages", { title: "Roadmap" });
  assert.equal(response.statusCode, 201);
  assert.notEqual(response.json().page.slug, "roadmap");
});

await test("blocks are replaced wholesale", async () => {
  const response = await call("PUT", `/api/pages/${pageId}/blocks`, {
    blocks: [
      { id: "b1", type: "h1", text: "Q4 planning" },
      { id: "b2", type: "todo", text: "Ship the dashboard", checked: false },
      { id: "b3", type: "paragraph", text: "Notes about the roadmap" },
    ],
  });
  assert.equal(response.statusCode, 200);
  const blocks = response.json().blocks;
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, "h1");
  assert.equal(blocks[1].text, "Ship the dashboard");
});

await test("blocks survive a round trip", async () => {
  const response = await call("GET", `/api/pages/${pageId}`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().blocks.length, 3);
});

await test("FTS search finds block content", async () => {
  const response = await call("GET", "/api/search?q=dashboard");
  assert.equal(response.statusCode, 200);
  const results = response.json().results;
  assert.ok(results.length >= 1, "expected a hit");
  assert.equal(results[0].id, pageId);
});

await test("FTS search tolerates punctuation", async () => {
  const response = await call("GET", "/api/search?q=%22unbalanced");
  assert.equal(response.statusCode, 200);
  assert.ok(Array.isArray(response.json().results));
});

await test("page patch updates title and slug", async () => {
  const response = await call("PATCH", `/api/pages/${pageId}`, { title: "Roadmap 2026" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().page.slug, "roadmap-2026");
});

await test("trash then restore", async () => {
  const removed = await call("DELETE", `/api/pages/${pageId}`);
  assert.equal(removed.statusCode, 200);

  const list = await call("GET", "/api/pages");
  assert.equal(list.json().pages.length, 1, "trashed page hidden from the list");

  const restored = await call("POST", `/api/pages/${pageId}/restore`);
  assert.equal(restored.statusCode, 200);
  assert.equal(restored.json().page.trashedAt, null);

  const after = await call("GET", "/api/pages");
  assert.equal(after.json().pages.length, 2);
});

await test("comments are created, threaded, and deleted", async () => {
  const created = await call("POST", "/api/comments", {
    pageId,
    text: "Can we split this into two pages?",
  });
  assert.equal(created.statusCode, 201);
  const comment = created.json().comment;
  assert.equal(comment.author.name, "Ada Lovelace");
  assert.deepEqual(comment.reactions, {});

  const listed = await call("GET", `/api/comments?pageId=${pageId}`);
  assert.equal(listed.json().comments.length, 1);

  const updated = await call("PATCH", `/api/comments/${comment.id}`, {
    reactions: { "🎉": 2 },
    replies: [{ id: "r1", text: "Good idea", createdAt: Date.now() }],
    resolved: true,
  });
  assert.equal(updated.json().comment.reactions["🎉"], 2);
  assert.equal(updated.json().comment.replies.length, 1);
  assert.equal(updated.json().comment.resolved, true);

  const removed = await call("DELETE", `/api/comments/${comment.id}`);
  assert.equal(removed.statusCode, 200);
});

await test("teamspaces create with an owner membership", async () => {
  const created = await call("POST", "/api/teamspaces", { name: "Product", icon: "🚀" });
  assert.equal(created.statusCode, 201);
  const id = created.json().teamspace.id;

  const listed = await call("GET", "/api/teamspaces");
  const teamspace = listed.json().teamspaces.find((item) => item.id === id);
  assert.ok(teamspace);
  assert.equal(teamspace.members[0].role, "owner");
  assert.equal(teamspace.members[0].initials, "AL");
});

await test("uploads round trip through storage", async () => {
  const uploaded = await call("POST", "/api/uploads?name=note.txt", "hello upload", {
    headers: { "content-type": "text/plain" },
  });
  assert.equal(uploaded.statusCode, 201);
  const file = uploaded.json();
  assert.match(file.url, /^\/api\/uploads\//);
  assert.ok(file.sha256.length === 64);

  const fetched = await call("GET", `/api/uploads/${file.id}`);
  assert.equal(fetched.statusCode, 200);
  assert.equal(fetched.body, "hello upload");
});

await test("uploads support range requests", async () => {
  const uploaded = await call("POST", "/api/uploads?name=range.txt", "0123456789", {
    headers: { "content-type": "text/plain" },
  });
  const id = uploaded.json().id;
  const ranged = await call("GET", `/api/uploads/${id}`, undefined, {
    headers: { range: "bytes=2-5" },
  });
  assert.equal(ranged.statusCode, 206);
  assert.equal(ranged.body, "2345");
  assert.match(ranged.headers["content-range"], /bytes 2-5\/10/);
});

await test("another user cannot read someone else's page", async () => {
  const saved = cookie;
  cookie = "";
  captureCookie(
    await call("POST", "/api/auth/register", {
      email: "bob@example.com",
      name: "Bob Stone",
      password: "another-password",
    })
  );
  const response = await call("GET", `/api/pages/${pageId}`);
  const notFound = response.statusCode === 404 || response.statusCode === 403;
  assert.ok(notFound, `expected 404/403, got ${response.statusCode}`);
  cookie = saved;
});

await test("logout clears the session", async () => {
  await call("POST", "/api/auth/logout");
  const response = await call("GET", "/api/auth/me");
  assert.equal(response.statusCode, 401);
});

await test("frontend index is served", async () => {
  const response = await app.inject({ method: "GET", url: "/app.html" });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"], /text\/html/);
});

await test("slug routes fall back to the app shell", async () => {
  const response = await app.inject({ method: "GET", url: "/p/roadmap-2026" });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /NookSpace/);
});

await test("unknown api routes return json 404", async () => {
  const response = await app.inject({ method: "GET", url: "/api/nope" });
  assert.equal(response.statusCode, 404);
  assert.match(response.headers["content-type"], /application\/json/);
});

await app.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;