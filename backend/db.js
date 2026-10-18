/* SQLite access layer: connection, migrations, and query helpers. */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");

export function openDatabase(file) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 4000");
  return db;
}

export function migrate(db, { log = () => {} } = {}) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)"
  );
  const applied = new Set(
    db
      .prepare("SELECT name FROM schema_migrations")
      .all()
      .map((row) => row.name)
  );

  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = readFileSync(join(migrationsDir, name), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
        name,
        Date.now()
      );
      db.exec("COMMIT");
      count += 1;
      log(`applied ${name}`);
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`migration ${name} failed: ${error.message}`);
    }
  }
  return count;
}

/** Small helper so route code reads like `one("SELECT * FROM pages WHERE id = ?", id)`. */
export function querier(db) {
  return {
    all(sql, ...params) {
      return db.prepare(sql).all(...params);
    },
    get(sql, ...params) {
      return db.prepare(sql).get(...params) ?? null;
    },
    run(sql, ...params) {
      return db.prepare(sql).run(...params);
    },
    transaction(fn) {
      db.exec("BEGIN");
      try {
        const value = fn();
        db.exec("COMMIT");
        return value;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

export function now() {
  return Date.now();
}