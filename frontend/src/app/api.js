/* API client.
   The app runs in two modes:
     server — a real backend (Fastify + SQLite) is reachable, data lives on the server
     local  — no backend reachable, everything falls back to localStorage (demo mode)
   Mode is detected once at boot and exposed as `mode`. */

import { API, apiUrl } from "../../../shared/contracts.js";

let mode = "local";
let listeners = new Set();

export function getMode() {
  return mode;
}

export function isServer() {
  return mode === "server";
}

export function onModeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setMode(next) {
  if (mode === next) return;
  mode = next;
  for (const fn of listeners) fn(mode);
}

async function ping() {
  try {
    const response = await fetch(apiUrl(API.health.path), {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return false;
    const body = await response.json();
    return Boolean(body?.ok);
  } catch {
    return false;
  }
}

export async function detectMode() {
  /* ?mode=local or ?mode=server pins the mode — handy for debugging and for
     the browser harness, which must run without a session. */
  const forced = new URLSearchParams(window.location.search).get("mode");
  if (forced === "local") {
    setMode("local");
    return mode;
  }
  const ok = await ping();
  setMode(ok ? "server" : "local");
  return mode;
}

/* ---------------- low level ---------------- */

/** Contract paths are relative to /api; anything already absolute is left alone. */
function endpoint(path) {
  const value = String(path ?? "");
  return value.startsWith(API.base) ? value : apiUrl(value);
}

async function request(method, path, { body, headers, raw, signal } = {}) {
  const response = await fetch(endpoint(path), {
    method,
    credentials: "same-origin",
    headers: {
      ...(raw ? {} : body === undefined ? {} : { "content-type": "application/json" }),
      ...(headers || {}),
    },
    ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
    signal,
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

const get = (path, options) => request("GET", path, options);
const post = (path, body, options) => request("POST", path, { ...options, body });
const patch = (path, body, options) => request("PATCH", path, { ...options, body });
const put = (path, body, options) => request("PUT", path, { ...options, body });
const del = (path, options) => request("DELETE", path, options);

/* ---------------- auth ---------------- */

export const auth = {
  async register({ email, name, password }) {
    return post(API.auth.register.path, { email, name, password });
  },
  async login({ email, password }) {
    return post(API.auth.login.path, { email, password });
  },
  async logout() {
    return post(API.auth.logout.path, {});
  },
  async me() {
    return get(API.auth.me.path);
  },
  async requestMagicLink(email) {
    return post("/auth/magic/request", { email });
  },
  async verifyMagicLink(token) {
    return post("/auth/magic/verify", { token });
  },
};

/* ---------------- workspace ---------------- */

export const workspace = {
  load() {
    return get(API.workspace.path);
  },
};

/* ---------------- pages ---------------- */

export const pages = {
  list({ includeTrash = false } = {}) {
    return get(`${API.pages.list.path}${includeTrash ? "?trash=1" : ""}`);
  },
  create(input) {
    return post(API.pages.create.path, input);
  },
  get(id) {
    return get(`${API.base}/pages/${id}`);
  },
  update(id, patchBody) {
    return patch(`${API.base}/pages/${id}`, patchBody);
  },
  remove(id, { purge = false } = {}) {
    return del(`${API.base}/pages/${id}${purge ? "?purge=1" : ""}`);
  },
  restore(id) {
    return post(`${API.base}/pages/${id}/restore`, {});
  },
  saveBlocks(id, blocks) {
    return put(`${API.base}/pages/${id}/blocks`, { blocks });
  },
};

/* ---------------- comments ---------------- */

export const comments = {
  list({ pageId, teamspaceId }) {
    const query = pageId ? `?pageId=${pageId}` : `?teamspaceId=${teamspaceId}`;
    return get(`${API.comments.list.path}${query}`);
  },
  create(input) {
    return post(API.comments.create.path, input);
  },
  update(id, patchBody) {
    return patch(`${API.base}/comments/${id}`, patchBody);
  },
  remove(id) {
    return del(`${API.base}/comments/${id}`);
  },
};

/* ---------------- teamspaces ---------------- */

export const teamspaces = {
  list() {
    return get(API.teamspaces.list.path);
  },
  create(input) {
    return post(API.teamspaces.create.path, input);
  },
  addMember(id, input) {
    return post(`${API.base}/teamspaces/${id}/members`, input);
  },
};

/* ---------------- search ---------------- */

export const search = {
  query(q) {
    return get(`${API.search.path}?q=${encodeURIComponent(q)}`);
  },
};

/* ---------------- uploads ---------------- */

export const uploads = {
  async upload(file, onProgress) {
    const response = await fetch(
      `${apiUrl(API.uploads.create.path)}?name=${encodeURIComponent(file.name)}`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/octet-stream" },
        body: file,
      }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Upload failed");
    void onProgress;
    return payload;
  },
};

/* ---------------- realtime ---------------- */

let source = null;

export function connectRealtime(handlers = {}) {
  if (!isServer() || source) return () => {};
  try {
    source = new EventSource(apiUrl(API.realtime.path));
  } catch {
    return () => {};
  }

  for (const [event, handler] of Object.entries(handlers)) {
    if (!handler) continue;
    source.addEventListener(event, (message) => {
      let data = null;
      try {
        data = JSON.parse(message.data);
      } catch {
        data = null;
      }
      handler(data);
    });
  }

  source.onerror = () => {
    /* EventSource retries on its own; nothing to do but stay quiet. */
  };

  return () => {
    source?.close();
    source = null;
  };
}

export { API, apiUrl };