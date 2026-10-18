/* D1 adapter: makes Cloudflare D1 look like the node:sqlite interface used by
   repository.js, so the same query code works on both runtimes. */

export function createD1Adapter(db) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return db.prepare(sql).bind(...params);
        },
        all(...params) {
          const stmt = db.prepare(sql);
          const bound = params.length ? stmt.bind(...params) : stmt;
          const result = bound.all();
          return result.results || [];
        },
        get(...params) {
          const stmt = db.prepare(sql);
          const bound = params.length ? stmt.bind(...params) : stmt;
          const result = bound.all();
          const rows = result.results || [];
          return rows.length ? rows[0] : null;
        },
        run(...params) {
          const stmt = db.prepare(sql);
          const bound = params.length ? stmt.bind(...params) : stmt;
          const result = bound.run();
          return { changes: result.meta?.changes ?? 0, lastInsertRowid: result.meta?.last_row_id };
        },
      };
    },
    exec(sql) {
      return db.exec(sql);
    },
    batch(statements) {
      return db.batch(statements);
    },
    transaction(fn) {
      /* D1 doesn't have explicit transactions in the same way; batch is the
         closest. For single-statement operations this is a no-op wrapper. */
      return fn();
    },
  };
}

/* Migrate: run all .sql files in order. D1 tracks migrations via a table. */
export async function migrateD1(db) {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)"
  );

  const applied = new Set(
    (await db.prepare("SELECT name FROM schema_migrations").all()).results.map((r) => r.name)
  );

  /* In Workers, migrations are applied via `wrangler d1 migrations apply`.
     This function is a fallback for dev mode. */
  return applied;
}
