/* Runs the browser harness against the static prototype server (localStorage mode),
   proving the app still works without a backend. */

import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.HARNESS_PORT || 5198);

const server = spawn(process.execPath, [join(root, "frontend", "server.mjs"), "--port", String(PORT)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/index.html`);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return false;
}

let code = 1;

try {
  if (!(await waitForServer())) {
    console.error("Static server never became ready.\n" + serverLog);
    process.exit(1);
  }
  const result = spawnSync(
    process.execPath,
    [join(root, "test", "harness-run.mjs"), "harness.html"],
    {
      stdio: "inherit",
      env: { ...process.env, HARNESS_EXTERNAL: "1", HARNESS_PORT: String(PORT) },
    }
  );
  code = result.status ?? 1;
} finally {
  server.kill();
}

process.exit(code);
