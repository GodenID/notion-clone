/* Runs every unit and integration test file, one Node process per file. */

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const testDir = dirname(fileURLToPath(import.meta.url));
const unitOnly = process.argv.includes("--unit");

const files = readdirSync(testDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .filter((name) => (unitOnly ? !name.includes("backend") : true))
  .sort();

let failed = 0;

for (const name of files) {
  console.log(`\n── ${name} ──`);
  const result = spawnSync(process.execPath, [join(root, "test", name)], { stdio: "inherit" });
  if (result.status !== 0) failed += 1;
}

console.log(`\n${failed ? `${failed} test file(s) failed.` : "All test files passed."}`);
if (failed) process.exitCode = 1;
