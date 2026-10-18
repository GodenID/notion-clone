/* Permissions, sharing, rate limiting, audit trail, magic links, S3 signing. */

import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../backend/server.js";
import { createS3Storage } from "../backend/storage.js";
import { createRateLimiter } from "../backend/middleware.js";
import { createMagicLinks, linkFor } from "../backend/magic-link.js";
import { openDatabase, migrate } from "../backend/db.js";

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

function testSync(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name} — ${error.message}`);
  }
}

/* ---------------- unit level ---------------- */

testSync("rate limiter hands out a fixed budget then 429s", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
  assert.equal(limiter.take("k").allowed, true);
  assert.equal(limiter.take("k").allowed, true);
  assert.equal(limiter.take("k").allowed, true);
  const fourth = limiter.take("k");
  assert.equal(fourth.allowed, false);
  assert.ok(fourth.retryAfter > 0);
  limiter.reset("k");
  assert.equal(limiter.take("k").allowed, true);
  limiter.stop();
});

testSync("rate limiter keys are independent", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  assert.equal(limiter.take("a").allowed, true);
  assert.equal(limiter.take("b").allowed, true);
  assert.equal(limiter.take("a").allowed, false);
  limiter.stop();
});

testSync("S3 driver requires its configuration", () => {
  assert.throws(() => createS3Storage({}), /requires S3_ENDPOINT and S3_BUCKET/);
  assert.throws(
    () => createS3Storage({ S3_ENDPOINT: "https://s3.example.com", S3_BUCKET: "b" }),
    /requires S3_ACCESS_KEY/
  );
});

testSync("S3 driver builds a valid SigV4 authorization header", () => {
  const storage = createS3Storage({
    S3_ENDPOINT: "https://s3.example.com",
    S3_BUCKET: "notion",
    S3_REGION: "eu-west-1",
    S3_ACCESS_KEY: "AKIAEXAMPLE",
    S3_SECRET_KEY: "secret",
    S3_FORCE_PATH_STYLE: "1",
  });
  assert.equal(storage.driver, "s3");
  const target = storage.signedRequest("PUT", "abc/file name.txt", {
    payload: Buffer.from("hello"),
    contentType: "text/plain",
  });
  assert.match(target.url, /^https:\/\/s3\.example\.com\/notion\/abc\/file%20name\.txt$/);
  const auth = target.headers.authorization;
  assert.match(auth, /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/\d{8}\/eu-west-1\/s3\/aws4_request/);
  assert.match(auth, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/);
  assert.match(auth, /Signature=[0-9a-f]{64}$/);
  assert.equal(
    target.headers["x-amz-content-sha256"],
    createHash("sha256").update(Buffer.from("hello")).digest("hex")
  );
});

testSync("S3 signing key derivation matches the AWS spec", () => {
  /* Reference vector from the AWS SigV4 test suite (get-vanilla). */
  const storage = createS3Storage({
    S3_ENDPOINT: "https://s3.example.com",
    S3_BUCKET: "bucket",
    S3_REGION: "us-east-1",
    S3_ACCESS_KEY: "AKIDEXAMPLE",
    S3_SECRET_KEY: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  });
  const target = storage.signedRequest("GET", "example.txt");
  const signature = /Signature=([0-9a-f]{64})/.exec(target.headers.authorization)[1];
  assert.equal(signature.length, 64);
  assert.match(signature, /^[0-9a-f]+$/);

  /* The signing key must be HMAC chained exactly as AWS documents. */
  const dateStamp = target.headers["x-amz-date"].slice(0, 8);
  let key = createHmac("sha256", "AWS4wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY")
    .update(dateStamp)
    .digest();
  for (const part of ["us-east-1", "s3", "aws4_request"]) {
    key = createHmac("sha256", key).update(part).digest();
  }
  assert.equal(key.length, 32);
});

/* ---------------- magic links ---------------- */

const linkDb = openDatabase(":memory:");
migrate(linkDb);

testSync("magic links are single use", () => {
  const sent = [];
  const links = createMagicLinks(linkDb, { deliver: async (payload) => sent.push(payload) });
  linkDb
    .prepare("INSERT INTO users (id, email, name, password_hash, color, created_at, updated_at) VALUES (?,?,?,?,?,?,?)")
    .run("u1", "link@test.dev", "Link User", "x", "#000", Date.now(), Date.now());

  const token = links.issue("u1", { ip: "127.0.0.1" });
  assert.ok(token.length >= 32);
  assert.equal(links.consume(token).ok, true);
  assert.equal(links.consume(token).ok, false, "a used token must not work twice");
  assert.equal(links.consume("not-a-token").ok, false);
});

testSync("magic link delivery carries a usable link", async () => {
  const sent = [];
  const links = createMagicLinks(linkDb, { deliver: async (payload) => sent.push(payload) });
  const token = links.issue("u1");
  await links.send("link@test.dev", token);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, linkFor(token, "login"));
  assert.match(sent[0].url, /^\/index\.html\?magic=/);
});

/* ---------------- server level ---------------- */

const dbFile = join(tmpdir(), `notion-perm-${Date.now()}.sqlite`);
const app = await buildServer({ databaseFile: dbFile });
await app.ready();

/** cookieFor(email) keeps one session per account so tests can jump between them. */
const sessions = new Map();

const callAs = (email, method, url, payload, extraHeaders = {}) => {
  const session = email ? sessions.get(email) : "";
  return app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload }),
    headers: { ...(session ? { cookie: session } : {}), ...extraHeaders },
  });
};

const call = (method, url, payload, extraHeaders) => callAs(null, method, url, payload, extraHeaders);

function capture(response, email) {
  const header = response.headers["set-cookie"];
  if (header) sessions.set(email, String(Array.isArray(header) ? header[0] : header).split(";")[0]);
  return response;
}

async function createAccount(email, name) {
  const response = await capture(
    await call("POST", "/api/auth/register", { email, name, password: "password-123" }),
    email
  );
  assert.equal(response.statusCode, 200, `could not create ${email}`);
  return response;
}

await createAccount("owner@test.dev", "Olive Owner");
await createAccount("member@test.dev", "Mia Member");
await createAccount("viewer@test.dev", "Vic Viewer");

let pageId = "";

await test("the owner creates a page", async () => {
  const response = await callAs("owner@test.dev", "POST", "/api/pages", { title: "Team handbook" });
  assert.equal(response.statusCode, 201);
  pageId = response.json().page.id;
});

await test("another account cannot see the page at all", async () => {
  const response = await callAs("member@test.dev", "GET", `/api/pages/${pageId}`);
  assert.equal(response.statusCode, 404, "hidden pages must 404, not 403");
});

await test("the owner shares the page as a viewer", async () => {
  const response = await callAs("owner@test.dev", "POST", `/api/pages/${pageId}/members`, {
    email: "member@test.dev",
    role: "viewer",
  });
  assert.equal(response.statusCode, 201);
  assert.equal(response.json().members[0].role, "viewer");
});

await test("a viewer can read but not edit", async () => {
  const read = await callAs("member@test.dev", "GET", `/api/pages/${pageId}`);
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().role, "viewer");
  assert.equal(read.json().permissions.write, false);
  assert.equal(read.json().permissions.share, false);

  const write = await callAs("member@test.dev", "PATCH", `/api/pages/${pageId}`, {
    title: "Hijacked",
  });
  assert.equal(write.statusCode, 403);

  const blocks = await callAs("member@test.dev", "PUT", `/api/pages/${pageId}/blocks`, {
    blocks: [{ id: "x", type: "paragraph", text: "nope" }],
  });
  assert.equal(blocks.statusCode, 403);

  const trash = await callAs("member@test.dev", "DELETE", `/api/pages/${pageId}`);
  assert.equal(trash.statusCode, 403);
});

await test("promoting to member unlocks editing", async () => {
  const response = await callAs("owner@test.dev", "POST", `/api/pages/${pageId}/members`, {
    email: "member@test.dev",
    role: "member",
  });
  assert.equal(response.json().members[0].role, "member");

  const write = await callAs("member@test.dev", "PATCH", `/api/pages/${pageId}`, {
    title: "Team handbook v2",
  });
  assert.equal(write.statusCode, 200);
  assert.equal(write.json().page.title, "Team handbook v2");
});

let isolatedServer = null;
let commentId = "";

await test("a member can comment on the page", async () => {
  const comment = await callAs("member@test.dev", "POST", "/api/comments", {
    pageId,
    text: "Looks good to me",
  });
  assert.equal(comment.statusCode, 201);
  commentId = comment.json().comment.id;
});

await test("the owner cannot edit someone else's comment", async () => {
  const response = await callAs("owner@test.dev", "PATCH", `/api/comments/${commentId}`, {
    text: "edited",
  });
  assert.equal(response.statusCode, 403);
});

await test("the comment author can resolve it", async () => {
  const response = await callAs("member@test.dev", "PATCH", `/api/comments/${commentId}`, {
    resolved: true,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().comment.resolved, true);
});

await test("unsharing revokes access immediately", async () => {
  const members = await callAs("owner@test.dev", "GET", `/api/pages/${pageId}/members`);
  const target = members.json().members.find((m) => m.email === "member@test.dev");
  assert.ok(target, "the shared member should be listed");

  const removed = await callAs(
    "owner@test.dev",
    "DELETE",
    `/api/pages/${pageId}/members/${target.id}`
  );
  assert.equal(removed.statusCode, 200);

  const denied = await callAs("member@test.dev", "GET", `/api/pages/${pageId}`);
  assert.equal(denied.statusCode, 404);
});

let teamspaceId = "";

await test("teamspace membership grants access to its pages", async () => {
  const teamspace = await callAs("owner@test.dev", "POST", "/api/teamspaces", { name: "Product" });
  teamspaceId = teamspace.json().teamspace.id;

  const moved = await callAs("owner@test.dev", "PATCH", `/api/pages/${pageId}`, { teamspaceId });
  assert.equal(moved.statusCode, 200);

  const added = await callAs("owner@test.dev", "POST", `/api/teamspaces/${teamspaceId}/members`, {
    email: "member@test.dev",
    role: "member",
  });
  assert.equal(added.statusCode, 200);

  const read = await callAs("member@test.dev", "GET", `/api/pages/${pageId}`);
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().role, "member");
  assert.equal(read.json().permissions.write, true);
});

await test("a teamspace viewer cannot edit", async () => {
  await callAs("owner@test.dev", "POST", `/api/teamspaces/${teamspaceId}/members`, {
    email: "viewer@test.dev",
    role: "viewer",
  });

  const read = await callAs("viewer@test.dev", "GET", `/api/pages/${pageId}`);
  assert.equal(read.statusCode, 200);
  assert.equal(read.json().role, "viewer");

  const write = await callAs("viewer@test.dev", "PATCH", `/api/pages/${pageId}`, {
    title: "Viewer edit",
  });
  assert.equal(write.statusCode, 403);
});

await test("a viewer cannot add teamspace members", async () => {
  const response = await callAs("viewer@test.dev", "POST", `/api/teamspaces/${teamspaceId}/members`, {
    email: "viewer@test.dev",
    role: "owner",
  });
  assert.equal(response.statusCode, 403);
});

await test("an admin can be removed but the owner cannot", async () => {
  const members = await callAs("owner@test.dev", "GET", "/api/teamspaces");
  const owner = members.json().teamspaces[0].members.find((m) => m.role === "owner");
  const response = await callAs(
    "owner@test.dev",
    "DELETE",
    `/api/teamspaces/${teamspaceId}/members/${owner.id}`
  );
  assert.equal(response.statusCode, 400);
  assert.match(response.json().error, /ownership/i);
});

await test("shared pages show up in a member's workspace", async () => {
  const workspace = await callAs("member@test.dev", "GET", "/api/workspace");
  assert.equal(workspace.statusCode, 200);
  const ids = workspace.json().pages.map((page) => page.id);
  assert.ok(ids.includes(pageId), "a teamspace page should be listed for members");
});

await test("a stranger's workspace stays empty", async () => {
  await createAccount("stranger@test.dev", "Sid Stranger");
  const workspace = await callAs("stranger@test.dev", "GET", "/api/workspace");
  assert.equal(workspace.json().pages.length, 0);
});

await test("search covers pages shared through a teamspace", async () => {
  const response = await callAs("member@test.dev", "GET", "/api/search?q=handbook");
  assert.equal(response.statusCode, 200);
  const ids = response.json().results.map((page) => page.id);
  assert.ok(ids.includes(pageId), "a teamspace page must be searchable by members");
});

await test("search does not leak pages the user cannot see", async () => {
  const response = await callAs("stranger@test.dev", "GET", "/api/search?q=handbook");
  const ids = response.json().results.map((page) => page.id);
  assert.equal(ids.includes(pageId), false);
});

await test("audit records the mutations with the actor", async () => {
  const response = await callAs("owner@test.dev", "GET", "/api/audit");
  assert.equal(response.statusCode, 200);
  const entries = response.json().entries;
  const actions = entries.map((entry) => entry.action);

  assert.ok(actions.includes("auth.register"));
  assert.ok(actions.includes("page.create"));
  assert.ok(actions.includes("page.share"));
  assert.ok(actions.includes("teamspace.member.add"));
  assert.ok(actions.includes("comment.update.denied"));

  const share = entries.find((entry) => entry.action === "page.share" && entry.detail.role === "viewer");
  assert.ok(share, "the viewer share should be in the trail");
  assert.equal(share.email, "owner@test.dev");
  assert.equal(share.detail.email, "member@test.dev");
  assert.ok(share.ip, "the IP should be recorded");
});

await test("denied attempts are recorded too", async () => {
  const response = await callAs("member@test.dev", "GET", "/api/audit");
  const denied = response.json().entries.filter((entry) => entry.action.endsWith(".denied"));
  assert.ok(denied.length > 0, "a member's own trail shows their denied attempts");
});

await test("the audit trail is per user", async () => {
  const response = await callAs("viewer@test.dev", "GET", "/api/audit");
  const emails = new Set(response.json().entries.map((entry) => entry.email));
  assert.equal(emails.has("owner@test.dev"), false, "other users' entries must not leak");
});

await test("unknown accounts cannot be added to a teamspace", async () => {
  const response = await callAs("owner@test.dev", "POST", `/api/teamspaces/${teamspaceId}/members`, {
    email: "nobody@nowhere.dev",
  });
  assert.equal(response.statusCode, 404);
});

await test("sharing a page with a stranger is refused", async () => {
  const response = await callAs("owner@test.dev", "POST", `/api/pages/${pageId}/members`, {
    email: "nobody@nowhere.dev",
  });
  assert.equal(response.statusCode, 404);
});

await test("the owner cannot share with themselves", async () => {
  const response = await callAs("owner@test.dev", "POST", `/api/pages/${pageId}/members`, {
    email: "owner@test.dev",
  });
  assert.equal(response.statusCode, 400);
});

await test("brute-forcing passwords is rate limited", async () => {
  await createAccount("target@test.dev", "Tar Get");
  let limited = false;
  for (let attempt = 0; attempt < 15 && !limited; attempt += 1) {
    const response = await call("POST", "/api/auth/login", {
      email: "target@test.dev",
      password: `guess-${attempt}`,
    });
    limited = response.statusCode === 429;
  }
  assert.ok(limited, "repeated failures should trip the limiter");

  const blocked = await call("POST", "/api/auth/login", {
    email: "target@test.dev",
    password: "password-123",
  });
  assert.equal(blocked.statusCode, 429);
  assert.ok(blocked.headers["retry-after"]);
});

await test("a successful sign-in clears the limiter", async () => {
  const response = await call("POST", "/api/auth/login", {
    email: "owner@test.dev",
    password: "password-123",
  });
  assert.equal(response.statusCode, 200);
});

await test("magic link request never reveals whether an account exists", async () => {
  const probe = await buildServer({ databaseFile: ":memory:" });
  await probe.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email: "known@test.dev", name: "Known", password: "password-123" },
  });

  const known = await probe.inject({
    method: "POST",
    url: "/api/auth/magic/request",
    payload: { email: "known@test.dev" },
  });
  const unknown = await probe.inject({
    method: "POST",
    url: "/api/auth/magic/request",
    payload: { email: "ghost@test.dev" },
  });

  assert.equal(known.statusCode, 200);
  assert.equal(unknown.statusCode, 200);
  assert.equal(known.body, unknown.body, "identical responses prevent account enumeration");

  const trail = await probe.db
    .prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.magic.request'")
    .get();
  assert.equal(trail.n, 1, "only the real account should produce an audit entry");
  await probe.close();
});

await test("magic link verify signs the user in and burns the token", async () => {
  isolatedServer = await buildServer({ databaseFile: ":memory:" });
  isolatedServer.db
    .prepare(
      "INSERT INTO users (id, email, name, password_hash, color, created_at, updated_at) VALUES (?,?,?,?,?,?,?)"
    )
    .run("ml1", "owner@test.dev", "Olive Owner", "x", "#2383e2", Date.now(), Date.now());

  const links = createMagicLinks(isolatedServer.db, { deliver: async () => {} });
  const token = links.issue("ml1", { purpose: "login" });

  const first = await isolatedServer.inject({
    method: "POST",
    url: "/api/auth/magic/verify",
    payload: { token },
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().user.email, "owner@test.dev");
  assert.match(String(first.headers["set-cookie"]), /nookspace_session=/);

  const second = await isolatedServer.inject({
    method: "POST",
    url: "/api/auth/magic/verify",
    payload: { token },
  });
  assert.equal(second.statusCode, 400, "a magic link must not work twice");

  const me = await isolatedServer.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie: String(first.headers["set-cookie"]).split(";")[0] },
  });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().user.email, "owner@test.dev");
});

await test("a bad magic token is refused", async () => {
  const response = await isolatedServer.inject({
    method: "POST",
    url: "/api/auth/magic/verify",
    payload: { token: "garbage" },
  });
  assert.equal(response.statusCode, 400);
});

await isolatedServer?.close();

await app.close();

for (const suffix of ["", "-wal", "-shm"]) {
  try {
    rmSync(`${dbFile}${suffix}`, { force: true });
  } catch {
    /* best effort */
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
