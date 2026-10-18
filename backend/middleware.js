/* Per-key token bucket rate limiting and a small audit trail.
   In-process by design: one server, one bucket table. A multi-instance
   deployment would move both to Redis. */

import { uid } from "./ids.js";

/* ---------------- rate limiting ---------------- */

export function createRateLimiter({ windowMs = 60_000, max = 60 } = {}) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map();

  function take(key, cost = 1) {
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: cost, resetAt: now + windowMs });
      return { allowed: true, remaining: max - cost, retryAfter: 0 };
    }
    bucket.count += cost;
    if (bucket.count > max) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }
    return { allowed: true, remaining: max - bucket.count, retryAfter: 0 };
  }

  /** Look at a bucket without spending from it. */
  function peek(key) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= Date.now()) return { allowed: true, remaining: max, retryAfter: 0 };
    return {
      allowed: bucket.count <= max,
      remaining: Math.max(0, max - bucket.count),
      retryAfter: Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000)),
    };
  }

  function reset(key) {
    buckets.delete(key);
  }

  function sweep() {
    const now = Date.now();
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }

  const timer = setInterval(sweep, windowMs);
  timer.unref?.();

  return {
    take,
    peek,
    reset,
    sweep,
    stop: () => clearInterval(timer),
    get size() {
      return buckets.size;
    },
  };
}

/** Group limits by route family so one noisy route cannot starve the rest. */
export const LIMITS = {
  auth: { windowMs: 60_000, max: 10 },
  write: { windowMs: 60_000, max: 120 },
  upload: { windowMs: 60_000, max: 20 },
  search: { windowMs: 60_000, max: 120 },
};

export function clientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) return forwarded.split(",")[0].trim();
  return request.ip || request.socket?.remoteAddress || "";
}

/* ---------------- audit trail ---------------- */

export function createAudit(db) {
  function record(request, { user = null, action, target = "", detail = {} } = {}) {
    let detailJson = "{}";
    try {
      detailJson = JSON.stringify(detail);
    } catch {
      detailJson = "{}";
    }
    db.prepare(
      `INSERT INTO audit_log (id, user_id, user_email, action, target, detail, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      uid(),
      user?.id ?? null,
      user?.email ?? "",
      String(action),
      String(target),
      detailJson.slice(0, 2000),
      clientIp(request),
      String(request.headers["user-agent"] ?? "").slice(0, 200),
      Date.now()
    );
  }

  function list({ userId = null, limit = 100 } = {}) {
    const rows = userId
      ? db
          .prepare("SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?")
          .all(userId, limit)
      : db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?").all(limit);
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      email: row.user_email,
      action: row.action,
      target: row.target,
      detail: safeParse(row.detail),
      ip: row.ip,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    }));
  }

  function purgeOlderThan(ms) {
    return db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(Date.now() - ms).changes;
  }

  return { record, list, purgeOlderThan };
}

function safeParse(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}
