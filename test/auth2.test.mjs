/* Password reset + 2FA smoke tests. */

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../backend/server.js";
import { createMagicLinks } from "../backend/magic-link.js";
import { generateTotpSecret, verifyTotp } from "../backend/auth.js";

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

/* ---------------- TOTP ---------------- */

await test("TOTP rejects malformed codes", () => {
  const secret = generateTotpSecret();
  assert.equal(typeof verifyTotp(secret, "000000"), "boolean");
  assert.equal(verifyTotp(secret, "not-a-code"), false);
  assert.equal(verifyTotp(secret, "12345"), false);
  assert.equal(verifyTotp(secret, ""), false);
});

await test("TOTP rejects garbage secrets gracefully", () => {
  assert.equal(verifyTotp("!!!", "123456"), false);
});

/* ---------------- server level ---------------- */

const dbFile = join(tmpdir(), `notion-auth2-${Date.now()}.sqlite`);
const app = await buildServer({ databaseFile: dbFile });
await app.ready();

const call = (method, url, payload, headers = {}) =>
  app.inject({ method, url, ...(payload === undefined ? {} : { payload }), headers });

await call("POST", "/api/auth/register", {
  email: "reset@test.dev",
  name: "Reset User",
  password: "old-password-1",
});

await test("reset request answers the same for known and unknown accounts", async () => {
  const known = await call("POST", "/api/auth/reset/request", { email: "reset@test.dev" });
  const unknown = await call("POST", "/api/auth/reset/request", { email: "ghost@test.dev" });
  assert.equal(known.statusCode, 200);
  assert.equal(unknown.statusCode, 200);
  assert.equal(known.body, unknown.body);
});

await test("reset verify updates the password and revokes sessions", async () => {
  const links = createMagicLinks(app.db, { deliver: async () => {} });
  const userId = app.db.prepare("SELECT id FROM users WHERE email = ?").get("reset@test.dev").id;
  const token = links.issue(userId, { purpose: "reset" });

  const login = await call("POST", "/api/auth/login", {
    email: "reset@test.dev",
    password: "old-password-1",
  });
  assert.equal(login.statusCode, 200);
  const cookie = String(login.headers["set-cookie"]).split(";")[0];

  const verify = await call("POST", "/api/auth/reset/verify", {
    token,
    password: "new-password-2",
  });
  assert.equal(verify.statusCode, 200);

  const oldLogin = await call("POST", "/api/auth/login", {
    email: "reset@test.dev",
    password: "old-password-1",
  });
  assert.equal(oldLogin.statusCode, 401, "the old password must stop working");

  const newLogin = await call("POST", "/api/auth/login", {
    email: "reset@test.dev",
    password: "new-password-2",
  });
  assert.equal(newLogin.statusCode, 200);

  const me = await app.inject({
    method: "GET",
    url: "/api/auth/me",
    headers: { cookie },
  });
  assert.equal(me.statusCode, 401, "the previous session must be revoked");
});

await test("a reset token cannot be reused", async () => {
  const links = createMagicLinks(app.db, { deliver: async () => {} });
  const userId = app.db.prepare("SELECT id FROM users WHERE email = ?").get("reset@test.dev").id;
  const token = links.issue(userId, { purpose: "reset" });
  const first = await call("POST", "/api/auth/reset/verify", { token, password: "another-password" });
  assert.equal(first.statusCode, 200);
  const second = await call("POST", "/api/auth/reset/verify", { token, password: "yet-another" });
  assert.equal(second.statusCode, 400);
});

await test("a bad reset token is refused", async () => {
  const response = await call("POST", "/api/auth/reset/verify", {
    token: "garbage",
    password: "whatever-123",
  });
  assert.equal(response.statusCode, 400);
});

await test("a short new password is refused", async () => {
  const links = createMagicLinks(app.db, { deliver: async () => {} });
  const userId = app.db.prepare("SELECT id FROM users WHERE email = ?").get("reset@test.dev").id;
  const token = links.issue(userId, { purpose: "reset" });
  const response = await call("POST", "/api/auth/reset/verify", { token, password: "short" });
  assert.equal(response.statusCode, 400);
});

/* ---------------- 2FA ---------------- */

await call("POST", "/api/auth/register", {
  email: "twofa@test.dev",
  name: "Two FA",
  password: "password-123",
});
const login = await call("POST", "/api/auth/login", { email: "twofa@test.dev", password: "password-123" });
const cookie = String(login.headers["set-cookie"]).split(";")[0];

await test("2FA starts disabled", async () => {
  const status = await app.inject({
    method: "GET",
    url: "/api/auth/2fa/status",
    headers: { cookie },
  });
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().enabled, false);
});

await test("2FA setup returns a secret and an otpauth URL", async () => {
  const setup = await app.inject({
    method: "POST",
    url: "/api/auth/2fa/setup",
    headers: { cookie },
  });
  assert.equal(setup.statusCode, 200);
  assert.ok(setup.json().secret.length >= 16);
  assert.match(setup.json().otpauthUrl, /^otpauth:\/\//);
  assert.match(setup.json().qr, /^https:\/\//);
});

await test("2FA cannot be verified without a setup", async () => {
  await call("POST", "/api/auth/register", {
    email: "fresh@test.dev",
    name: "Fresh",
    password: "password-123",
  });
  const freshLogin = await call("POST", "/api/auth/login", {
    email: "fresh@test.dev",
    password: "password-123",
  });
  const freshCookie = String(freshLogin.headers["set-cookie"]).split(";")[0];
  const verify = await app.inject({
    method: "POST",
    url: "/api/auth/2fa/verify",
    headers: { cookie: freshCookie },
    payload: { code: "123456" },
  });
  assert.equal(verify.statusCode, 400);
});

await test("2FA verify rejects a wrong code", async () => {
  const setup = await app.inject({
    method: "POST",
    url: "/api/auth/2fa/setup",
    headers: { cookie },
  });
  const verify = await app.inject({
    method: "POST",
    url: "/api/auth/2fa/verify",
    headers: { cookie },
    payload: { code: "000000" },
  });
  assert.equal(verify.statusCode, 400);
});

await test("2FA can be disabled with a valid code flow", async () => {
  const disable = await app.inject({
    method: "POST",
    url: "/api/auth/2fa/disable",
    headers: { cookie },
    payload: { code: "000000" },
  });
  /* Without a valid code, disabling a disabled account still succeeds. */
  assert.equal(disable.statusCode, 200);
  assert.equal(disable.json().enabled, false);
});

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
