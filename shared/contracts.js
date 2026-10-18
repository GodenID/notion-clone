/* Shared contracts between the frontend and the backend.
   Imported by both sides so the API shape lives in exactly one place. */

/* ---------------- block + property vocabulary ---------------- */

export const BLOCK_TYPES = [
  "paragraph",
  "h1",
  "h2",
  "h3",
  "toggleh1",
  "toggleh2",
  "toggleh3",
  "bulleted",
  "numbered",
  "todo",
  "toggle",
  "quote",
  "callout",
  "divider",
  "breadcrumb",
  "image",
  "video",
  "audio",
  "file",
  "embed",
  "attachment",
  "bookmark",
  "code",
  "math",
  "table",
  "database",
  "pagelink",
  "page",
  "synced",
  "button",
  "template",
  "columns2",
  "columns3",
  "columns4",
  "columns5",
  "toc",
  "date",
];

export const PROPERTY_TYPES = [
  "title",
  "text",
  "number",
  "date",
  "checkbox",
  "select",
  "multiselect",
  "status",
  "formula",
  "rollup",
  "relation",
  "people",
  "files",
  "url",
  "uniqueId",
  "createdTime",
  "updatedTime",
];

export const DATABASE_VIEWS = ["table", "board", "gallery", "list", "calendar", "timeline"];

export const ROLES = { owner: "owner", admin: "admin", member: "member", viewer: "viewer" };

export const ROLE_ORDER = ["viewer", "member", "admin", "owner"];

export function roleAtLeast(role, minimum) {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);
}

/* ---------------- API surface ---------------- */

export const API = {
  base: "/api",
  auth: {
    register: { method: "POST", path: "/auth/register" },
    login: { method: "POST", path: "/auth/login" },
    logout: { method: "POST", path: "/auth/logout" },
    me: { method: "GET", path: "/auth/me" },
  },
  workspace: { method: "GET", path: "/workspace" },
  pages: {
    list: { method: "GET", path: "/pages" },
    create: { method: "POST", path: "/pages" },
    get: { method: "GET", path: "/pages/:id" },
    update: { method: "PATCH", path: "/pages/:id" },
    remove: { method: "DELETE", path: "/pages/:id" },
    restore: { method: "POST", path: "/pages/:id/restore" },
    blocks: { method: "PUT", path: "/pages/:id/blocks" },
  },
  comments: {
    list: { method: "GET", path: "/comments" },
    create: { method: "POST", path: "/comments" },
    remove: { method: "DELETE", path: "/comments/:id" },
  },
  teamspaces: {
    list: { method: "GET", path: "/teamspaces" },
    create: { method: "POST", path: "/teamspaces" },
    update: { method: "PATCH", path: "/teamspaces/:id" },
    remove: { method: "DELETE", path: "/teamspaces/:id" },
    members: { method: "POST", path: "/teamspaces/:id/members" },
  },
  search: { method: "GET", path: "/search" },
  uploads: {
    create: { method: "POST", path: "/uploads" },
    get: { method: "GET", path: "/uploads/:id" },
  },
  realtime: { path: "/realtime/stream" },
  health: { method: "GET", path: "/health" },
};

/** Build a full API path from a relative contract entry. */
export function apiUrl(path) {
  if (!path) return "";
  return String(path).startsWith(API.base) ? String(path) : `${API.base}${path}`;
}

export const REALTIME_EVENTS = [
  "page:created",
  "page:updated",
  "page:deleted",
  "comment:created",
  "presence:update",
  "hello",
];

/* ---------------- validation helpers ---------------- */

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value ?? "").trim());
}

export function slugify(value, fallback = "untitled") {
  const base = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || fallback;
}

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** Clamp a client payload to a sane size so one request cannot blow up the DB. */
export function withinLimits(value, max) {
  return typeof value === "string" ? value.slice(0, max) : value;
}

export const LIMITS = {
  email: 160,
  name: 80,
  password: 200,
  pageTitle: 200,
  blockText: 20000,
  commentText: 4000,
  blocksPerPage: 800,
  jsonBytes: 512 * 1024,
};

/* ---------------- websocket/presence ---------------- */

export function presenceKey(userId, connectionId) {
  return `${userId}:${connectionId}`;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}