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

/* TOTP helpers — RFC 6238, 6 digits, 30 second step, SHA-1. */
function base32Encode(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  while (output.length % 8 !== 0) output += "=";
  return output;
}

function base32Decode(text) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = String(text).replace(/=+$/, "").toUpperCase().replace(/\\s+/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of cleaned) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function verifyTotp(secret, code, { window = 1 } = {}) {
  const expected = String(code || "").replace(/\\s+/g, "");
  if (!/^\\d{6}$/.test(expected)) return false;
  const key = base32Decode(secret);
  const step = 30;
  const now = Math.floor(Date.now() / 1000 / step);
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = now + offset;
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const hmac = createHmac("sha1", key).update(buffer).digest();
    const otp = hotp(hmac, 6);
    if (timingSafeEqual(Buffer.from(otp), Buffer.from(expected))) return true;
  }
  return false;
}

function hotp(hmac, digits) {
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export const SESSION_COOKIE = "nookspace_session";

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