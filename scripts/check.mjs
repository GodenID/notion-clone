/* Syntax-checks every source file in the repo so a typo cannot reach a browser. */

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skip = new Set(["node_modules", ".git", ".data", ".github", "vendor"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = join(dir, name);
    const info = statSync(full);
    if (info.isDirectory()) walk(full, out);
    else if (name.endsWith(".js") || name.endsWith(".mjs")) out.push(full);
  }
  return out;
}

const files = walk(root).sort();
let failed = 0;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed += 1;
    console.error(`FAIL ${relative(root, file)}`);
    console.error((result.stderr || "").split("\n").slice(0, 4).join("\n"));
  }
}

console.log(`${files.length - failed}/${files.length} modules parse cleanly.`);
if (failed) process.exitCode = 1;
