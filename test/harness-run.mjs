/* Boots the backend, runs the browser harness in headless Chrome, prints its report.
   Usage: npm run test:harness  */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.HARNESS_PORT || 5199);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (!chrome) {
  console.log("SKIP harness — no Chrome binary found. Set CHROME_PATH to run it.");
  process.exit(0);
}

const profile = mkdtempSync(join(tmpdir(), "notion-harness-"));
/* HARNESS_EXTERNAL=1 targets a server that is already running (e.g. the static
   prototype server) instead of booting the backend. */
const external = process.env.HARNESS_EXTERNAL === "1";
const server = external
  ? null
  : spawn(process.execPath, [join(root, "backend", "server.js")], {
      env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DATABASE_FILE: ":memory:" },
      stdio: ["ignore", "pipe", "pipe"],
    });

let serverLog = "";
if (server) {
  server.stdout.on("data", (chunk) => (serverLog += chunk));
  server.stderr.on("data", (chunk) => (serverLog += chunk));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      /* The static prototype server has no /api/health, so any answer counts. */
      if (response.ok || external) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

function dumpDom(url) {
  const result = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--virtual-time-budget=45000",
      `--user-data-dir=${profile}`,
      "--dump-dom",
      url,
    ],
    { encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 }
  );
  return result.stdout || "";
}

function extractReport(html) {
  const report = /<pre id="out"[^>]*>([\s\S]*?)<\/pre>/.exec(html);
  if (!report) return null;
  return report[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

let code = 0;

try {
  if (!(await waitForServer())) {
    console.error("Server never became ready.\n" + serverLog);
    process.exit(1);
  }

  const pages =
    process.argv.slice(2).filter((arg) => arg.endsWith(".html")).length > 0
      ? process.argv.slice(2).filter((arg) => arg.endsWith(".html"))
      : ["auth.html", "harness.html", "server-mode.html"];

  for (const page of pages) {
    console.log(`\n── ${page} ──`);
    const text = extractReport(dumpDom(`http://127.0.0.1:${PORT}/test/${page}`));
    if (text === null) {
      console.error(`No report found for ${page}.`);
      code = 1;
      continue;
    }

    let passed = 0;
    let failed = 0;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^PASS/.test(trimmed)) passed += 1;
      if (/^FAIL/.test(trimmed)) {
        failed += 1;
        code = 1;
      }
      console.log(trimmed);
    }
    console.log(`${passed} passed, ${failed} failed`);
  }
} finally {
  server?.kill();
  rmSync(profile, { recursive: true, force: true });
}

process.exit(code);
