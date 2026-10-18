/* Auth: scrypt password hashing and opaque session tokens stored in SQLite. */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { uid } from "./ids.js";

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;
const SESSION_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(String(password), salt, KEY_LENGTH);
  return `scrypt$${salt}$${Buffer.from(derived).toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [algorithm, salt, hash] = String(stored || "").split("$");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const derived = await scrypt(String(password), salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export function createSession(db, userId, userAgent = "") {
  const id = `${uid()}.${randomBytes(24).toString("base64url")}`;
  const created = Date.now();
  db.prepare(
    "INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)"
  ).run(id, userId, created, created + SESSION_TTL, String(userAgent).slice(0, 200));
  return { id, expiresAt: created + SESSION_TTL };
}

export function readSession(db, sessionId) {
  if (!sessionId) return null;
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.email, u.name, u.color
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(sessionId);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return null;
  }
  return {
    sessionId: row.session_id,
    user: { id: row.user_id, email: row.email, name: row.name, color: row.color },
  };
}

export function destroySession(db, sessionId) {
  if (!sessionId) return false;
  return db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId).changes > 0;
}

export function purgeExpiredSessions(db) {
  return db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now()).changes;
}

export const SESSION_COOKIE = "notion_session";

export function sessionCookie(id, { secure = false, maxAge = SESSION_TTL / 1000 } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(id)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAge)}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearedSessionCookie({ secure = false } = {}) {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}