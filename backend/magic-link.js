/* Passwordless sign-in.
   A token is stored hashed, expires in 15 minutes, and can only be used once.
   Delivery is pluggable: the dev transport prints the link, an SMTP transport
   can be dropped in without touching the routes. */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { uid } from "./ids.js";

const TTL = 15 * 60 * 1000;

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function createMagicLinks(db, { deliver } = {}) {
  const transport = deliver || createConsoleTransport();

  function issue(userId, { purpose = "login", ip = "" } = {}) {
    const token = randomBytes(32).toString("base64url");
    const stamp = Date.now();
    db.prepare(
      `INSERT INTO login_tokens (id, user_id, purpose, token_hash, expires_at, used_at, ip, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`
    ).run(uid(), userId, purpose, hashToken(token), stamp + TTL, String(ip).slice(0, 60), stamp);
    return token;
  }

  function consume(token, purpose = "login") {
    const hash = hashToken(token);
    const row = db
      .prepare("SELECT * FROM login_tokens WHERE token_hash = ? AND purpose = ?")
      .get(hash, purpose);
    if (!row) return { ok: false, reason: "invalid" };

    const stored = Buffer.from(row.token_hash, "hex");
    const given = Buffer.from(hash, "hex");
    if (stored.length !== given.length || !timingSafeEqual(stored, given)) {
      return { ok: false, reason: "invalid" };
    }
    if (row.used_at) return { ok: false, reason: "used" };
    if (row.expires_at < Date.now()) return { ok: false, reason: "expired" };

    db.prepare("UPDATE login_tokens SET used_at = ? WHERE id = ?").run(Date.now(), row.id);
    return { ok: true, userId: row.user_id };
  }

  function sweep() {
    return db.prepare("DELETE FROM login_tokens WHERE expires_at < ?").run(Date.now() - TTL).changes;
  }

  function purgeUsed() {
    return db.prepare("DELETE FROM login_tokens WHERE used_at IS NOT NULL").run().changes;
  }

  return {
    issue,
    consume,
    sweep,
    purgeUsed,
    async send(email, token, { purpose = "login" } = {}) {
      return transport({ email, token, purpose, url: linkFor(token, purpose) });
    },
  };
}

export function linkFor(token, purpose = "login") {
  const path = purpose === "invite" ? "/index.html?invite=" : "/index.html?magic=";
  return `${path}${encodeURIComponent(token)}`;
}

/** Dev transport: the link is printed, since there is no mail provider here. */
function createConsoleTransport() {
  return async ({ email, url, purpose }) => {
    console.log(`[magic-link] ${purpose} for ${email}: ${url}`);
    return { delivered: "console", url };
  };
}

/**
 * SMTP transport stub — wire a real provider in here.
 * `sendMail` receives { to, subject, text } and must resolve or reject.
 */
export function createSmtpTransport(sendMail, { from = "no-reply@nookspace.local" } = {}) {
  return async ({ email, url, purpose }) => {
    await sendMail({
      to: email,
      from,
      subject: purpose === "invite" ? "You have been invited to a teamspace" : "Your sign-in link",
      text: `${purpose === "invite" ? "Accept the invitation" : "Sign in"}: ${url}\n\nThe link works once and expires in 15 minutes.`,
    });
    return { delivered: "smtp", url };
  };
}
