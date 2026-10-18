/* Full-stack smoke: boot the real server on a port, register through the API,
   seed the demo workspace, then edit a page and prove it survives a restart
   of the client (i.e. the data really lives on the server). */

import { buildServer } from "../backend/server.js";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const dbFile = join(tmpdir(), `notion-e2e-${Date.now()}.sqlite`);
const app = await buildServer({ databaseFile: dbFile });
await app.ready();

let cookie = "";
const call = (method, url, payload) =>
  app.inject({
    method,
    url,
    ...(payload === undefined ? {} : { payload }),
    headers: cookie ? { cookie } : {},
  });

const signIn = async (response) => {
  const header = response.headers["set-cookie"];
  cookie = String(Array.isArray(header) ? header[0] : header).split(";")[0];
  return response;
};

await test("register issues a session", async () => {
  const response = await signIn(
    await call("POST", "/api/auth/register", {
      email: "grace@example.com",
      name: "Grace Hopper",
      password: "compiler-1952",
    })
  );
  if (response.statusCode !== 200) throw new Error(`status ${response.statusCode}`);
  if (!cookie.startsWith("notion_session=")) throw new Error("no session cookie");
});

await test("a fresh workspace is empty", async () => {
  const response = await call("GET", "/api/workspace");
  const body = response.json();
  if (body.pages.length !== 0) throw new Error(`expected 0 pages, got ${body.pages.length}`);
});

await test("seeding three pages keeps client ids", async () => {
  for (const [id, title] of [
    ["seed-a", "Getting started"],
    ["seed-b", "Roadmap"],
    ["seed-c", "Meeting notes"],
  ]) {
    const response = await call("POST", "/api/pages", { id, title });
    if (response.statusCode !== 201) throw new Error(`status ${response.statusCode}`);
    if (response.json().page.id !== id) throw new Error(`server changed the id of ${id}`);
  }
  const list = await call("GET", "/api/workspace");
  if (list.json().pages.length !== 3) throw new Error("expected 3 pages");
});

await test("blocks written by the client are stored", async () => {
  const response = await call("PUT", "/api/pages/seed-a/blocks", {
    blocks: [
      { id: "b1", type: "h1", text: "Welcome" },
      { id: "b2", type: "todo", text: "Read the docs", checked: true },
    ],
  });
  if (response.json().blocks.length !== 2) throw new Error("expected 2 blocks");
});

await test("an edit is visible to the next read", async () => {
  await call("PATCH", "/api/pages/seed-b", { title: "Roadmap 2026", favorite: true });
  const response = await call("GET", "/api/pages/seed-b");
  const page = response.json().page;
  if (page.title !== "Roadmap 2026") throw new Error(`title is ${page.title}`);
  if (page.favorite !== true) throw new Error("favorite did not persist");
});

await test("search finds content written through the API", async () => {
  const response = await call("GET", "/api/search?q=docs");
  const results = response.json().results;
  if (!results.some((page) => page.id === "seed-a")) throw new Error("seed-a missing");
});

await test("a second user sees an empty workspace", async () => {
  const saved = cookie;
  cookie = "";
  await signIn(
    await call("POST", "/api/auth/register", {
      email: "alan@example.com",
      name: "Alan Turing",
      password: "enigma-1936",
    })
  );
  const response = await call("GET", "/api/workspace");
  if (response.json().pages.length !== 0) throw new Error("data leaked between users");
  cookie = saved;
});

await test("realtime greets a client and tracks presence", async () => {
  const { createRealtime } = await import("../backend/realtime.js");
  const realtime = createRealtime();
  const written = [];
  const listeners = {};
  const request = { raw: { on: (event, handler) => (listeners[event] = handler) } };
  const reply = { raw: { writeHead: () => {}, write: (chunk) => written.push(chunk) } };

  realtime.connect(request, reply, { id: "u1", name: "Grace", color: "#2383e2" });
  const body = () => written.join("");
  if (!body().includes("event: hello")) throw new Error("no hello event");
  if (!body().includes("Grace")) throw new Error("presence missing from hello");

  realtime.broadcast("page:updated", { pageId: "seed-a" });
  if (!body().includes("event: page:updated")) throw new Error("broadcast not delivered");
  if (!body().includes("seed-a")) throw new Error("payload missing");

  listeners.close();
  if (realtime.clientCount !== 0) throw new Error("client not cleaned up");
  if (realtime.presence().length !== 0) throw new Error("presence not cleared");
});

await test("data survives closing and reopening the database", async () => {
  await app.close();
  const reopened = await buildServer({ databaseFile: dbFile });
  const response = await reopened.inject({
    method: "GET",
    url: "/api/pages/seed-b",
    headers: { cookie },
  });
  if (response.statusCode !== 200) throw new Error(`status ${response.statusCode}`);
  if (response.json().page.title !== "Roadmap 2026") throw new Error("title lost on restart");
  await reopened.close();
});

for (const suffix of ["", "-wal", "-shm"]) {
  try {
    rmSync(`${dbFile}${suffix}`, { force: true });
  } catch {
    /* best effort cleanup */
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
