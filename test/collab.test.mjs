/* WebSocket collaboration relay smoke test. */

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
await app.listen({ port: 0, host: "127.0.0.1" });
const address = app.server.address();
const port = address.port;

const WebSocket = (await import("ws")).default;

await test("two clients in the same room relay binary messages", async () => {
  const url = `ws://127.0.0.1:${port}/ws/collab/room-1`;
  const a = new WebSocket(url);
  const b = new WebSocket(url);

  await Promise.all([
    new Promise((resolve) => a.on("open", resolve)),
    new Promise((resolve) => b.on("open", resolve)),
  ]);

  const received = new Promise((resolve) => {
    b.on("message", (data, isBinary) => {
      assert.equal(isBinary, true);
      resolve(Buffer.from(data));
    });
  });

  const payload = Buffer.from([1, 2, 3, 4, 5]);
  a.send(payload, { binary: true });

  const got = await received;
  assert.deepEqual(got, payload);

  a.close();
  b.close();
});

await test("clients in different rooms do not see each other's messages", async () => {
  const a = new WebSocket(`ws://127.0.0.1:${port}/ws/collab/room-a`);
  const b = new WebSocket(`ws://127.0.0.1:${port}/ws/collab/room-b`);

  await Promise.all([
    new Promise((resolve) => a.on("open", resolve)),
    new Promise((resolve) => b.on("open", resolve)),
  ]);

  let leaked = false;
  b.on("message", () => {
    leaked = true;
  });

  a.send(Buffer.from([9, 9, 9]), { binary: true });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(leaked, false, "messages must not cross rooms");

  a.close();
  b.close();
});

await test("health reports collab client count", async () => {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = await response.json();
  assert.equal(typeof body.collabClients, "number");
  assert.equal(typeof body.collabRooms, "number");
});

await app.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;