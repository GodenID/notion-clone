import { createEditor } from "./editor.js";
import {
  auth as apiAuth,
  comments as apiComments,
  connectRealtime,
  detectMode,
  isServer,
  pages as apiPages,
  search as apiSearch,
  teamspaces as apiTeamspaces,
  workspace as apiWorkspace,
} from "./api.js";
import {
  formatShortcut,
  fuzzyRank,
  matchesShortcut,
  SHORTCUT_GROUPS,
} from "./commands.js";
import {
  avatarColor,
  childPages,
  clearSession,
  createBlock,
  createPage,
  createPageFromTemplate,
  createTeamspace,
  deleteTeamspace,
  duplicatePage,
  emptyTrash,
  ensureValidView,
  findPageBySlug,
  findTeamspaceBySlug,
  getPage,
  getTeamspace,
  initials,
  isLive,
  livePages,
  loadSession,
  loadState,
  movePageTo,
  PAGE_TEMPLATES,
  pageBreadcrumb,
  purgePage,
  relativeUpdated,
  restorePage,
  saveSession,
  saveState,
  teamspacePages,
  trashedPages,
  trashPage,
  uid,
  updatePageSlug,
  updateTeamspaceSlug,
} from "./store.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const session = loadSession();

const app = $("#app");
const editorEl = $("#editor");
const titleEl = $("#page-title");
const iconEl = $("#page-icon");
const coverEl = $("#page-cover");
const metaEl = $("#page-meta");
const breadcrumbsEl = $("#breadcrumbs");
const favoriteBtn = $("#favorite-btn");
const pageMenuBtn = $("#page-menu-btn");
const pageEl = $("#page");
const teamspaceView = $("#teamspace-view");
const pageScroll = $("#page-scroll");
const sidebarScrim = $("#sidebar-scrim");
const toastEl = $("#toast");

const state = loadState();
ensureValidView(state);

/* ---------------- routes / SEO ---------------- */
function pathForView() {
  const view = state.activeView;
  if (view.type === "teamspace") {
    const teamspace = getTeamspace(state, view.id);
    return teamspace ? `/t/${teamspace.slug}` : null;
  }
  const page = getPage(state, view.id);
  return page ? `/p/${page.slug}` : null;
}

function shareUrl() {
  const path = pathForView();
  return path ? `${location.origin}${path}` : location.href;
}

function syncUrl(mode = "push") {
  const path = pathForView();
  if (!path || path === location.pathname) return;
  try {
    if (mode === "push") history.pushState({}, "", path);
    else history.replaceState({}, "", path);
  } catch {
    /* file previews cannot rewrite the path */
  }
}

function routeFromLocation() {
  const parts = location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 2 && parts[0] === "p") return { type: "page", slug: parts[1] };
  if (parts.length === 2 && parts[0] === "t") return { type: "teamspace", slug: parts[1] };
  return null;
}

function applyRoute(route) {
  if (!route) return null;
  if (route.type === "page") {
    const page = findPageBySlug(state, route.slug);
    if (!page || !isLive(page)) return false;
    state.activeView = { type: "page", id: page.id };
    return true;
  }
  const teamspace = findTeamspaceBySlug(state, route.slug);
  if (!teamspace) return false;
  state.activeView = { type: "teamspace", id: teamspace.id };
  return true;
}

function updateDocumentMeta() {
  const view = state.activeView;
  let title = "Notion Clone – Workspace";
  let description = "A working Notion-style workspace for notes, docs, teamspaces, and projects.";
  let type = "website";

  if (view.type === "teamspace") {
    const teamspace = getTeamspace(state, view.id);
    if (teamspace) {
      title = `${teamspace.name} – Teamspace | Notion Clone`;
      description = teamspace.description || `Pages, notes, and projects in the ${teamspace.name} teamspace.`;
    }
  } else {
    const page = getPage(state, view.id);
    if (page) {
      title = `${page.title || "Untitled"} – Notion Clone`;
      const first = page.blocks?.find((block) => stripHtml(block.text));
      description =
        (first ? stripHtml(first.text) : "").slice(0, 160) ||
        "A page in your Notion Clone workspace.";
      type = "article";
    }
  }

  const url = shareUrl();
  document.title = title;

  const setMeta = (id, attribute, value) => {
    const element = document.getElementById(id);
    if (element) element.setAttribute(attribute, value);
  };
  setMeta("meta-description", "content", description);
  setMeta("og-title", "content", title);
  setMeta("og-description", "content", description);
  setMeta("og-url", "content", url);
  setMeta("og-type", "content", type);
  setMeta("canonical-link", "href", url);
}

const COVERS = [
  "linear-gradient(115deg, #1d3b2f, #2f6b4f 45%, #88b37a 80%, #d9e6b8)",
  "linear-gradient(115deg, #1c2b4a, #2f5a8a 45%, #7fa6c9 80%, #dfe9f2)",
  "linear-gradient(115deg, #4a2c2a, #8c4a3c 45%, #d59a72 80%, #f2e0cd)",
  "linear-gradient(115deg, #2c2a4a, #5a4f8a 45%, #a99ac9 80%, #e6e1f2)",
  "linear-gradient(115deg, #3d3d3d, #6b6b6b 45%, #b3b3b3 80%, #eeeeee)",
  "linear-gradient(115deg, #7a4a1f, #c07a2f 45%, #e5b56b 80%, #f6e3c4)",
  "linear-gradient(115deg, #123f3a, #1f7a6b 45%, #6fc2ab 80%, #d6f0e5)",
  "linear-gradient(115deg, #3a123f, #7a2f86 45%, #c47ad0 80%, #f0d9f4)",
];

const ICONS = [
  "📄", "📝", "📚", "💡", "🎯", "🚀", "⚡", "✨", "🔥", "🌱",
  "🧠", "🗺️", "📊", "📈", "🗓️", "📌", "🔖", "🎨", "🛠️", "⚙️",
  "🏢", "🏠", "🧪", "🔍", "🧭", "🌍", "🍀", "☕", "🎧", "🏆",
  "💬", "📮", "🧩", "🪄", "🗂️",
];

const TEAMSPACE_COLORS = ["#2f6b4f", "#2f5a8a", "#8c4a3c", "#5a4f8a", "#b07d2b", "#1f7a6b", "#7a2f86", "#4b5563"];

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

const stripHtml = (html) => {
  const holder = document.createElement("div");
  holder.innerHTML = html || "";
  return (holder.textContent ?? "").trim();
};

function nameFromEmail(email) {
  const local = String(email || "").split("@")[0];
  return (
    local
      .replace(/[^a-z0-9]+/gi, " ")
      .replace(/\b[a-z]/gi, (char) => char.toUpperCase())
      .trim() || "Member"
  );
}

function makeMember({ name = "", email = "", role = "Member", color = "" } = {}) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const displayName = String(name).trim() || nameFromEmail(normalizedEmail);
  return {
    id: uid(),
    name: displayName,
    email: normalizedEmail,
    initials: initials(displayName),
    color: color || avatarColor(normalizedEmail || displayName),
    role: role === "Admin" ? "Admin" : "Member",
  };
}

function memberRow(member, { removable = false, onRemove = null } = {}) {
  const row = document.createElement("div");
  row.className = "ts-member";

  const avatar = document.createElement("span");
  avatar.className = "member-avatar member-avatar--static";
  avatar.style.background =
    member.color || avatarColor(member.email || member.name || "member");
  avatar.textContent = member.initials || initials(member.name || member.email || "?");
  avatar.title = member.name || "Member";

  const info = document.createElement("span");
  info.className = "ts-member__info";
  const name = document.createElement("span");
  name.className = "ts-member__name";
  const nameText = document.createElement("span");
  nameText.className = "ts-member__name-text";
  nameText.textContent = member.name || "Member";
  name.appendChild(nameText);
  if (
    session &&
    member.email &&
    String(member.email).toLowerCase() === session.email.toLowerCase()
  ) {
    const you = document.createElement("span");
    you.className = "ts-member__you";
    you.textContent = "You";
    name.appendChild(you);
  }
  const email = document.createElement("span");
  email.className = "ts-member__email";
  email.textContent = member.email || "No email";
  info.append(name, email);

  const role = document.createElement("span");
  role.className = `ts-member__role${member.role === "Admin" ? " is-admin" : ""}`;
  role.textContent = member.role === "Admin" ? "Admin" : "Member";

  row.append(avatar, info, role);

  if (removable) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ts-member__remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => onRemove?.(member));
    row.appendChild(remove);
  }

  return row;
}

/* ---------------- theme ---------------- */
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  $("#theme-icon").textContent = theme === "dark" ? "☀" : "◐";
  $("#theme-label").textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add("is-visible"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("is-visible");
    setTimeout(() => (toastEl.hidden = true), 220);
  }, 2400);
}

/* ---------------- persistence ---------------- */
function persist({ sidebar = true, topbar = true } = {}) {
  saveState(state);
  scheduleHistory();
  if (sidebar) renderSidebar();
  if (topbar) renderTopbar();
  refreshSidebarTree();
  setSyncStatus("saving");
  scheduleServerSync(currentPage());
  syncStatusTimer = setTimeout(() => setSyncStatus("saved"), 900);
}

/* ---------------- server sync ----------------
   When the backend is reachable it owns the data. Edits are pushed with a short
   debounce, and localStorage stays as an offline cache so the demo still works. */

const serverSync = { timer: null, inFlight: false, pending: false };

function scheduleServerSync(page) {
  if (!isServer() || !page) return;
  clearTimeout(serverSync.timer);
  serverSync.timer = setTimeout(() => pushPage(page), 700);
}

function pageToServer(page) {
  return {
    title: page.title,
    icon: page.icon,
    cover: page.cover ?? null,
    section: page.section,
    teamspaceId: page.teamspaceId ?? null,
    parentId: page.parentId ?? null,
    favorite: Boolean(page.favorite),
    locked: Boolean(page.locked),
    fullWidth: Boolean(page.fullWidth),
    smallText: Boolean(page.smallText),
    font: page.font || "default",
    trashedAt: page.trashedAt ?? null,
  };
}

async function pushPage(page) {
  if (!isServer() || !page) return;
  if (serverSync.inFlight) {
    serverSync.pending = true;
    return;
  }
  serverSync.inFlight = true;
  try {
    await apiPages.update(page.id, pageToServer(page));
    await apiPages.saveBlocks(page.id, page.blocks || []);
    page.syncedAt = Date.now();
  } catch (error) {
    if (error?.status === 404) toast("That page no longer exists on the server");
  } finally {
    serverSync.inFlight = false;
    if (serverSync.pending) {
      serverSync.pending = false;
      scheduleServerSync(currentPage());
    }
  }
}

async function pushNewPage(page) {
  if (!isServer() || !page) return;
  try {
    await apiPages.create({ id: page.id, ...pageToServer(page) });
    await apiPages.saveBlocks(page.id, page.blocks || []);
    page.blocksLoaded = true;
  } catch {
    /* keep working locally; the next edit retries */
  }
}

function serverPageToLocal(page) {
  return {
    id: page.id,
    title: page.title,
    icon: page.icon,
    cover: page.cover ?? null,
    section: page.section,
    teamspaceId: page.teamspaceId,
    parentId: page.parentId,
    favorite: Boolean(page.favorite),
    locked: Boolean(page.locked),
    fullWidth: Boolean(page.fullWidth),
    smallText: Boolean(page.smallText),
    font: page.font || "default",
    slug: page.slug,
    trashedAt: page.trashedAt ?? null,
    updatedAt: page.updatedAt,
    createdAt: page.createdAt,
    comments: [],
    blocks: [],
    versions: [],
    lastVersionAt: 0,
    remote: true,
  };
}

/** Load the server workspace into local state, seeding it the first time we see it. */
async function hydrateFromServer() {
  const data = await apiWorkspace.load();
  const serverPages = data.pages || [];
  const trashed = data.trashed || [];

  if (!serverPages.length && !trashed.length) {
    for (const page of state.pages) {
      await pushNewPage(page);
      await pushNewPageComments(page);
    }
    for (const teamspace of state.teamspaces) {
      await apiTeamspaces.create({
        id: teamspace.id,
        name: teamspace.name,
        icon: teamspace.icon,
        color: teamspace.color,
        description: teamspace.description,
      });
    }
    return { seeded: true };
  }

  const localById = new Map(state.pages.map((page) => [page.id, page]));
  state.pages = [...serverPages, ...trashed].map((page) => {
    const local = localById.get(page.id);
    return {
      ...serverPageToLocal(page),
      comments: local?.comments || [],
      blocks: local?.blocks || [],
      versions: local?.versions || [],
    };
  });
  state.teamspaces = (data.teamspaces || []).map((teamspace) => ({ ...teamspace, comments: [] }));
  return { seeded: false };
}

async function pushNewPageComments(page) {
  for (const comment of page.comments || []) {
    try {
      await apiComments.create({ pageId: page.id, text: comment.text, anchor: comment.anchor });
    } catch {
      /* comments are best effort during bootstrap */
    }
  }
}

/** Fetch a page's blocks the first time it is opened while the server owns the data. */
async function ensurePageBlocks(page) {
  if (!isServer() || !page || page.blocksLoaded) return;
  try {
    const data = await apiPages.get(page.id);
    if (data?.blocks) page.blocks = data.blocks;
    if (data?.role) page.role = data.role;
    if (data?.permissions) page.permissions = data.permissions;
    page.blocksLoaded = true;
    if (data?.options?.versions) page.versions = data.options.versions;
    if (state.activeView.type === "page" && state.activeView.id === page.id) {
      renderAll({ scrollTop: false });
      applyPermissionUI(page);
    }
  } catch {
    page.blocksLoaded = true; // stop retrying on every navigation
  }
}

function applyPermissionUI(page) {
  const badge = document.getElementById("role-badge");
  const title = document.getElementById("page-title");
  if (!badge || !title) return;
  const role = page?.role || (page?.ownerId ? "owner" : "");
  const writable = page?.permissions?.write ?? true;
  badge.textContent = role ? role.charAt(0).toUpperCase() + role.slice(1) : "";
  badge.hidden = !role || role === "owner";
  title.setAttribute("contenteditable", String(writable));
  title.classList.toggle("is-readonly", !writable);
  const editor = document.getElementById("editor");
  if (editor) editor.classList.toggle("is-readonly", !writable);
  if (!writable && !page._readOnlyNotified) {
    page._readOnlyNotified = true;
    toast("This page is read-only for you");
  }
}

/* Sub-pages created from a Page block need the tree redrawn. */
let sidebarRefreshQueued = false;
function refreshSidebarTree() {
  if (sidebarRefreshQueued) return;
  sidebarRefreshQueued = true;
  queueMicrotask(() => {
    sidebarRefreshQueued = false;
    renderSidebar();
  });
}

/* ---------------- undo / redo ---------------- */
const historyStack = [];
let historyIndex = -1;
let historyTimer = null;
let historyReady = false;
let applyingHistory = false;

function historySnapshot() {
  return {
    pages: structuredClone(state.pages),
    teamspaces: structuredClone(state.teamspaces),
    syncedBlocks: structuredClone(state.syncedBlocks || {}),
    activeView: { ...state.activeView },
  };
}

function recordHistoryNow() {
  if (!historyReady || applyingHistory) return;
  const snapshot = historySnapshot();
  const key = JSON.stringify(snapshot);
  if (historyStack[historyIndex]?.key === key) return;
  historyStack.splice(historyIndex + 1);
  historyStack.push({ key, snapshot, at: Date.now() });
  if (historyStack.length > 40) historyStack.shift();
  historyIndex = historyStack.length - 1;
}

function scheduleHistory() {
  if (!historyReady || applyingHistory) return;
  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    historyTimer = null;
    recordHistoryNow();
  }, 350);
}

function flushHistory() {
  if (historyTimer) {
    clearTimeout(historyTimer);
    historyTimer = null;
    recordHistoryNow();
  }
}

function applyHistorySnapshot(index) {
  const entry = historyStack[index];
  if (!entry) return;
  applyingHistory = true;
  state.pages = structuredClone(entry.snapshot.pages);
  state.teamspaces = structuredClone(entry.snapshot.teamspaces);
  state.syncedBlocks = structuredClone(entry.snapshot.syncedBlocks || {});
  state.activeView = { ...entry.snapshot.activeView };
  ensureValidView(state);
  saveState(state);
  historyIndex = index;
  renderAll({ scrollTop: false });
  syncUrl("replace");
  applyingHistory = false;
}

function undo() {
  flushHistory();
  if (historyIndex <= 0) {
    toast("Nothing to undo");
    return;
  }
  applyHistorySnapshot(historyIndex - 1);
  toast("Undid last change");
}

function redo() {
  flushHistory();
  if (historyIndex >= historyStack.length - 1) {
    toast("Nothing to redo");
    return;
  }
  applyHistorySnapshot(historyIndex + 1);
  toast("Redid change");
}

/* ---------------- page versions ---------------- */
function pushVersion(page) {
  if (!page) return;
  page.versions = Array.isArray(page.versions) ? page.versions : [];
  page.versions.unshift({
    id: uid(),
    at: Date.now(),
    title: page.title,
    icon: page.icon,
    blocks: structuredClone(page.blocks),
  });
  page.versions = page.versions.slice(0, 10);
}

function captureVersion(page) {
  if (!page || page.locked) return;
  const now = Date.now();
  if (now - (page.lastVersionAt || 0) < 60000) return;
  page.lastVersionAt = now;
  pushVersion(page);
  saveState(state);
}

const editor = createEditor({
  container: editorEl,
  onCreatePage: ({ parentId, from } = {}) => {
    const host = currentPage();
    if (!host || host.locked) return null;
    const source = from ? getPage(state, from) : null;
    const created = createPage(state, {
      section: host.section,
      teamspaceId: host.teamspaceId,
      parentId: parentId ?? host.id,
      title: source ? `${source.title || "Untitled"} (copy)` : "",
      icon: source ? source.icon || "📄" : "📄",
    });
    if (source) {
      created.blocks = source.blocks.map((block) => ({ ...structuredClone(block), id: uid() }));
      created.cover = source.cover ?? null;
    }
    persist();
    return created;
  },
  onSave: () => {
    const page = currentPage();
    if (page) {
      rebaseCommentAnchors(page);
      updatePageMeta(page);
    }
    persist({ sidebar: false, topbar: false });
    if (page) {
      captureVersion(page);
      refreshCommentHighlights();
    }
  },
  onToast: toast,
  getPages: () => state.pages.filter(isLive),
  onOpenPage: (id, options) => openPage(id, options),
  onComment: (anchor) => startBlockComment(anchor),
  onCommentAnchorClick: (anchor) => focusCommentAnchor(anchor),
  getSynced: () => state.syncedBlocks || {},
  onSyncedUpdate: (syncId, text) => {
    state.syncedBlocks = state.syncedBlocks || {};
    state.syncedBlocks[syncId] = { text, updatedAt: Date.now() };
    persist({ sidebar: false, topbar: false });
  },
  getMembers: () => {
    const host = currentPage();
    const teamspace = host?.teamspaceId ? getTeamspace(state, host.teamspaceId) : null;
    const members = teamspace?.members || [];
    return members.length ? members : [profileMember()];
  },
});

/* ---------------- current view ---------------- */
function currentPage() {
  return state.activeView.type === "page" ? getPage(state, state.activeView.id) : null;
}

function currentTeamspace() {
  return state.activeView.type === "teamspace" ? getTeamspace(state, state.activeView.id) : null;
}

function isActivePage(id) {
  return state.activeView.type === "page" && state.activeView.id === id;
}

function isActiveTeamspace(id) {
  return state.activeView.type === "teamspace" && state.activeView.id === id;
}

/* ---------------- render: main ---------------- */
function renderAll({ scrollTop = true } = {}) {
  ensureValidView(state);
  const view = state.activeView;

  if (view.type === "teamspace") {
    const teamspace = getTeamspace(state, view.id);
    pageEl.hidden = true;
    teamspaceView.hidden = false;
    renderTeamspaceHome(teamspace);
  } else {
    const page = getPage(state, view.id);
    teamspaceView.hidden = true;
    pageEl.hidden = false;
    renderPage(page);
  }

  renderTopbar();
  renderSidebar();
  updateUser();
  if (commentsOpen) renderComments();
  if (!findBar.hidden) {
    if (state.activeView.type === "page") updateFindCount();
    else closeFind();
  }
  if (scrollTop) pageScroll.scrollTop = 0;
}

function renderPage(page) {
  if (!page) return;
  titleEl.textContent = page.title;
  iconEl.textContent = page.icon || "📄";
  titleEl.dataset.placeholder = "Untitled";

  pageEl.classList.toggle("is-full", Boolean(page.fullWidth));
  pageEl.classList.toggle("is-small", Boolean(page.smallText));
  pageEl.classList.toggle("is-serif", page.font === "serif");
  pageEl.classList.toggle("is-mono", page.font === "mono");
  pageEl.classList.toggle("is-locked", Boolean(page.locked));

  if (page.cover === null || page.cover === undefined) {
    coverEl.hidden = true;
    pageEl.classList.remove("has-cover");
  } else {
    coverEl.hidden = false;
    coverEl.style.background = COVERS[page.cover % COVERS.length];
    pageEl.classList.add("has-cover");
  }

  updatePageMeta(page);
  favoriteBtn.classList.toggle("is-active", Boolean(page.favorite));
  favoriteBtn.setAttribute("aria-pressed", String(Boolean(page.favorite)));
  favoriteBtn.hidden = false;
  pageMenuBtn.hidden = false;
  editor.render(page);
  applyPageLock(page);
  editor.applyCommentHighlights(commentAnchorsForPage(page));
  renderBacklinks(page);
}

function commentAnchorsForPage(page) {
  return (page?.comments || [])
    .filter((comment) => comment.anchor?.blockId)
    .map((comment) => ({
      ...comment.anchor,
      commentId: comment.id,
      resolved: Boolean(comment.resolved),
    }));
}

function rebaseCommentAnchors(page) {
  for (const comment of page?.comments || []) {
    const anchor = comment.anchor;
    if (!anchor || anchor.start == null || anchor.end == null) continue;
    const block = page.blocks.find((item) => item.id === anchor.blockId);
    if (!block) {
      anchor.orphaned = true;
      continue;
    }
    if (!anchor.quote) {
      anchor.start = null;
      anchor.end = null;
      continue;
    }
    const text = blockPlainText(block);
    if (anchor.start <= text.length && text.slice(anchor.start, anchor.end) === anchor.quote) {
      anchor.orphaned = false;
      continue;
    }
    const index = text.indexOf(anchor.quote);
    if (index >= 0) {
      anchor.start = index;
      anchor.end = index + anchor.quote.length;
      anchor.orphaned = false;
    } else {
      anchor.orphaned = true;
    }
  }
}

function refreshCommentHighlights() {
  const page = currentPage();
  if (page) editor.applyCommentHighlights(commentAnchorsForPage(page));
}

function focusCommentAnchor(anchor) {
  openComments();
  requestAnimationFrame(() => {
    const item = commentsListEl.querySelector(
      `[data-comment-id="${CSS.escape(anchor.commentId || "")}"]`
    );
    if (!item) return;
    item.scrollIntoView({ block: "nearest" });
    item.classList.add("is-highlighted");
    setTimeout(() => item.classList.remove("is-highlighted"), 1400);
  });
}

function blockPlainText(block) {
  if (!block) return "";
  if (block.type === "attachment") return block.attachment?.name || "";
  if (block.type === "database") {
    const properties = (block.properties || []).map((property) => property.name).join(" ");
    const rows = (block.rows || [])
      .map((row) => Object.values(row.cells || {}).join(" "))
      .join(" ");
    return `${properties} ${rows}`.replace(/\s+/g, " ").trim();
  }
  if (block.type === "synced") {
    const synced = state.syncedBlocks?.[block.syncId];
    return stripHtml(synced?.text ?? block.text ?? "");
  }
  const parts = [];
  if (block.text) parts.push(stripHtml(block.text));
  if (block.body) parts.push(stripHtml(block.body));
  if (block.caption) parts.push(stripHtml(block.caption));
  if (Array.isArray(block.rows)) parts.push(block.rows.flat().join(" "));
  if (Array.isArray(block.columns)) parts.push(block.columns.map(stripHtml).join(" "));
  if (block.title) parts.push(block.title);
  if (block.label) parts.push(block.label);
  if (block.file?.name) parts.push(block.file.name);
  if (block.attachment?.name) parts.push(block.attachment.name);
  if (Array.isArray(block.template)) {
    parts.push(block.template.map((row) => row.text || "").join(" "));
  }
  if (block.type === "page" && block.pageId) {
    const target = getPage(state, block.pageId);
    if (target) parts.push(target.title || "Untitled");
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function pageRawText(page) {
  if (!page) return "";
  return [page.title || "", ...(page.blocks || []).map(blockPlainText)]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function pageWordCount(page) {
  const text = pageRawText(page);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function updatePageMeta(page = currentPage()) {
  if (!page) return;
  const words = pageWordCount(page);
  const wordLabel = words === 1 ? "1 word" : `${words} words`;
  metaEl.textContent = `${relativeUpdated(page)} · ${wordLabel}${page.locked ? " · Locked" : ""}`;
}

function applyPageLock(page) {
  const locked = Boolean(page?.locked);
  titleEl.setAttribute("contenteditable", String(!locked));
  editorEl.querySelectorAll("[contenteditable]:not([data-atomic])").forEach((element) => {
    element.setAttribute("contenteditable", locked ? "false" : "true");
  });
  editorEl
    .querySelectorAll(
      ".pagelink-select, .block__date, .db-cell-select, .db-cell-date, .db-cell-number, .db-cell-check, .db-filter, .db-sort-prop, .db-sort-dir, .db-board-group, .db-cal-nav, .db-cal-add, .db-chip-select"
    )
    .forEach((element) => {
      element.disabled = locked;
    });
  editorEl.querySelectorAll(".table-actions button, .media-btn, .block-button, .template-button, .page-card, .breadcrumb-item").forEach((element) => {
    element.toggleAttribute("disabled", locked);
  });
  if (locked) editor.closeSlash();
}

function requireUnlocked(page) {
  if (page?.locked) {
    toast("Unlock the page to edit it");
    return false;
  }
  return true;
}

function renderBacklinks(page) {
  const backlinksEl = $("#backlinks");
  const backlinksList = $("#backlinks-list");
  const sources = state.pages.filter(
    (item) =>
      isLive(item) &&
      item.id !== page.id &&
      (item.blocks || []).some((block) => block.type === "pagelink" && block.pageId === page.id)
  );

  backlinksEl.hidden = sources.length === 0;
  backlinksList.replaceChildren();

  for (const source of sources) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "backlink";
    button.innerHTML = `<span>${source.icon || "📄"}</span><span>${escapeHtml(
      source.title || "Untitled"
    )}</span>`;
    button.addEventListener("click", () => openPage(source.id));
    backlinksList.appendChild(button);
  }
}

/* ---------------- render: teamspace home ---------------- */
function renderTeamspaceHome(teamspace) {
  if (!teamspace) return;
  const pages = teamspacePages(state, teamspace.id).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  $("#ts-home-cover").style.background = `linear-gradient(115deg, ${teamspace.color}, ${teamspace.color}cc 55%, ${teamspace.color}55)`;
  $("#ts-home-icon").textContent = teamspace.icon || "🚀";
  $("#ts-home-title").textContent = teamspace.name;
  $("#ts-home-desc").textContent =
    teamspace.description || "Add a short description so your team knows what lives in this teamspace.";
  $("#ts-home-desc").classList.toggle("is-empty", !teamspace.description);

  const memberList = Array.isArray(teamspace.members) ? teamspace.members : [];
  const memberCount = memberList.length;
  const members = $("#ts-home-members");
  members.innerHTML = "";
  for (const member of memberList.slice(0, 6)) {
    const avatar = document.createElement("span");
    avatar.className = "member-avatar";
    avatar.style.background =
      member.color || avatarColor(member.email || member.name || "member");
    avatar.textContent = member.initials || initials(member.name || "?");
    avatar.title = `${member.name || "Member"}${member.role ? ` · ${member.role}` : ""}`;
    members.appendChild(avatar);
  }
  if (memberCount > 6) {
    const more = document.createElement("span");
    more.className = "member-avatar member-avatar--more";
    more.textContent = `+${memberCount - 6}`;
    more.title = `${memberCount - 6} more members`;
    members.appendChild(more);
  }
  const label = document.createElement("span");
  label.className = "ts-members__label";
  label.textContent = memberCount === 1 ? "1 member" : `${memberCount} members`;
  members.appendChild(label);

  const invite = document.createElement("button");
  invite.className = "ts-invite";
  invite.id = "ts-invite";
  invite.textContent = "+ Invite";
  invite.addEventListener("click", () => openInviteModal(teamspace.id));
  members.appendChild(invite);

  const memberCountEl = $("#ts-member-count");
  if (memberCountEl) memberCountEl.textContent = String(memberCount);
  const memberRows = $("#ts-home-member-list");
  if (memberRows) {
    memberRows.replaceChildren();
    if (!memberCount) {
      const empty = document.createElement("div");
      empty.className = "ts-member-empty";
      empty.textContent = "No members yet. Invite your first teammate.";
      memberRows.appendChild(empty);
    } else {
      for (const member of memberList) memberRows.appendChild(memberRow(member));
    }
  }

  $("#ts-home-meta").innerHTML = `
    <span>${pages.length} ${pages.length === 1 ? "page" : "pages"}</span>
    <span>${memberCount} ${memberCount === 1 ? "member" : "members"}</span>
    <span>Teamspace · shared with your workspace</span>`;

  const grid = $("#ts-home-grid");
  grid.innerHTML = "";

  for (const page of pages) {
    const card = document.createElement("button");
    card.className = "ts-card";
    card.dataset.openPage = page.id;
    const snippet = stripHtml(page.blocks?.[0]?.text) || "Empty page";
    const parent = page.parentId ? getPage(state, page.parentId) : null;
    card.innerHTML = `
      <span class="ts-card__top">
        <span class="ts-card__icon">${page.icon || "📄"}</span>
        <span class="ts-card__title">${escapeHtml(page.title || "Untitled")}</span>
      </span>
      <span class="ts-card__snippet">${escapeHtml(snippet)}</span>
      <span class="ts-card__meta">${relativeUpdated(page)}${parent ? ` · in ${escapeHtml(parent.title || "Untitled")}` : ""}</span>`;
    card.addEventListener("click", () => openPage(page.id));
    grid.appendChild(card);
  }

  const newCard = document.createElement("button");
  newCard.className = "ts-card ts-card--new";
  newCard.innerHTML = "<span>+</span><span>New page</span>";
  newCard.addEventListener("click", () => createPageInTeamspace(teamspace.id));
  grid.appendChild(newCard);

  if (pages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ts-empty";
    empty.textContent = "No pages yet. Create the first one for this teamspace.";
    grid.insertBefore(empty, newCard);
  }
}

/* ---------------- render: topbar ---------------- */
function crumbButton({ label, icon, pageId, teamspaceId }) {
  const button = document.createElement("button");
  button.className = "crumb";
  if (pageId) button.dataset.navPage = pageId;
  if (teamspaceId) button.dataset.navTeamspace = teamspaceId;
  button.innerHTML = `<span class="crumb__icon">${icon || "📄"}</span><span class="crumb__label">${escapeHtml(
    label || "Untitled"
  )}</span>`;
  return button;
}

function renderTopbar() {
  breadcrumbsEl.innerHTML = "";
  const view = state.activeView;

  if (view.type === "teamspace") {
    const teamspace = getTeamspace(state, view.id);
    if (!teamspace) return;
    breadcrumbsEl.appendChild(crumbButton({ label: teamspace.name, icon: teamspace.icon, teamspaceId: teamspace.id }));
    $("#edited-label").textContent = `${teamspacePages(state, teamspace.id).length} pages`;
    favoriteBtn.hidden = true;
    pageMenuBtn.hidden = true;
    updateCommentsBadge();
    updateDocumentMeta();
    return;
  }

  const page = getPage(state, view.id);
  if (!page) return;

  const teamspace = page.teamspaceId ? getTeamspace(state, page.teamspaceId) : null;
  if (teamspace) {
    breadcrumbsEl.appendChild(
      crumbButton({ label: teamspace.name, icon: teamspace.icon, teamspaceId: teamspace.id })
    );
    const sep = document.createElement("span");
    sep.className = "crumb__sep";
    sep.textContent = "/";
    breadcrumbsEl.appendChild(sep);
  }

  const chain = pageBreadcrumb(state, page);
  chain.forEach((crumb, index) => {
    breadcrumbsEl.appendChild(crumbButton({ label: crumb.title || "Untitled", icon: crumb.icon, pageId: crumb.id }));
    if (index < chain.length - 1) {
      const sep = document.createElement("span");
      sep.className = "crumb__sep";
      sep.textContent = "/";
      breadcrumbsEl.appendChild(sep);
    }
  });

  $("#edited-label").textContent = relativeUpdated(page);
  favoriteBtn.classList.toggle("is-active", Boolean(page.favorite));
  favoriteBtn.setAttribute("aria-pressed", String(Boolean(page.favorite)));
  favoriteBtn.hidden = false;
  pageMenuBtn.hidden = false;
  updateCommentsBadge();
  updateDocumentMeta();
}

/* ---------------- render: sidebar ---------------- */
function pageNode(page) {
  const node = document.createElement("div");
  node.className = "page-tree__node";

  const row = document.createElement("div");
  row.className = `page-row${isActivePage(page.id) ? " is-active" : ""}`;
  row.dataset.pageId = page.id;
  row.setAttribute("role", "button");
  row.tabIndex = 0;
  row.innerHTML = `
    <span class="page-row__icon">${page.icon || "📄"}</span>
    <span class="page-row__label">${escapeHtml(page.title || "Untitled")}</span>
    <span class="page-row__actions">
      <button data-new-child="${page.id}" aria-label="Add page inside" title="Add a page inside">+</button>
      <button data-row-menu="${page.id}" aria-label="Page options" title="Page options">⋯</button>
    </span>`;
  node.appendChild(row);

  const children = childPages(state, page.id, {
    section: page.section,
    ...(page.section === "teamspace" ? { teamspaceId: page.teamspaceId } : {}),
  });

  if (children.length) {
    const wrap = document.createElement("div");
    wrap.className = "page-row__children";
    for (const child of children) wrap.appendChild(pageNode(child));
    node.appendChild(wrap);
  }
  return node;
}

function teamspaceNode(teamspace) {
  const node = document.createElement("div");
  node.className = "teamspace-node";

  const collapsed = state.collapsedTeamspaces.includes(teamspace.id);
  const row = document.createElement("div");
  row.className = `page-row teamspace-row${isActiveTeamspace(teamspace.id) ? " is-active" : ""}`;
  row.dataset.teamspaceRow = teamspace.id;
  row.setAttribute("role", "button");
  row.tabIndex = 0;
  row.innerHTML = `
    <button class="twisty${collapsed ? "" : " is-open"}" data-toggle-teamspace="${teamspace.id}" aria-label="${
      collapsed ? "Expand" : "Collapse"
    } teamspace" aria-expanded="${String(!collapsed)}">▸</button>
    <span class="page-row__icon">${teamspace.icon || "🚀"}</span>
    <span class="page-row__label">${escapeHtml(teamspace.name)}</span>
    <span class="page-row__actions">
      <button data-new-ts-page="${teamspace.id}" aria-label="New page in teamspace" title="New page in teamspace">+</button>
      <button data-ts-menu="${teamspace.id}" aria-label="Teamspace options" title="Teamspace options">⋯</button>
    </span>`;
  node.appendChild(row);

  if (!collapsed) {
    const pages = childPages(state, null, { section: "teamspace", teamspaceId: teamspace.id });
    const wrap = document.createElement("div");
    wrap.className = "page-row__children teamspace-pages";
    if (pages.length) {
      for (const page of pages) wrap.appendChild(pageNode(page));
    } else {
      const empty = document.createElement("div");
      empty.className = "teamspace-empty";
      empty.textContent = "No pages yet";
      wrap.appendChild(empty);
    }
    node.appendChild(wrap);
  }

  return node;
}

function renderSidebar() {
  const favorites = state.pages.filter((page) => isLive(page) && page.favorite);

  const favoritesTree = $('[data-tree="favorites"]');
  const favoritesSection = $('[data-section="favorites"]');
  favoritesTree.replaceChildren(...favorites.map((page) => pageNode(page)));
  favoritesSection.hidden = favorites.length === 0;

  const privateTree = $('[data-tree="private"]');
  const privateRoots = childPages(state, null, { section: "private" });
  privateTree.replaceChildren(...privateRoots.map((page) => pageNode(page)));

  const teamspacesTree = $('[data-tree="teamspaces"]');
  teamspacesTree.replaceChildren(...state.teamspaces.map((teamspace) => teamspaceNode(teamspace)));
}

/* ---------------- session / account ---------------- */
function profileMember() {
  return {
    id: session?.email || "you",
    name: session?.name || "You",
    email: session?.email || "you@example.com",
    initials: initials(session?.name || "You"),
    color: session?.color || "#4b5563",
    role: "Admin",
  };
}

function updateUser() {
  if (!session) return;
  const avatar = $("#user-avatar");
  avatar.textContent = initials(session.name);
  avatar.style.background = session.color;
  $("#user-name").textContent = session.name;
  $("#user-email").textContent = session.email;
  $("#ws-avatar").textContent = initials(session.name);
  $("#ws-avatar").style.background = session.color;
  $("#ws-name").textContent = state.workspace.name;
}

/* ---------------- navigation ---------------- */
function openPage(id, { scrollTop = true, blockId = null } = {}) {
  const page = getPage(state, id);
  if (!page || !isLive(page)) return;
  state.activeView = { type: "page", id };
  persist();
  renderAll({ scrollTop });
  syncUrl("push");
  closeSidebarOnMobile();
  if (blockId) {
    requestAnimationFrame(() => editor.scrollToBlock(blockId));
  }
  ensurePageBlocks(page);
}

function openTeamspace(id, { scrollTop = true } = {}) {
  if (!getTeamspace(state, id)) return;
  state.activeView = { type: "teamspace", id };
  persist();
  renderAll({ scrollTop });
  syncUrl("push");
  closeSidebarOnMobile();
}

function createPageInTeamspace(teamspaceId) {
  const teamspace = getTeamspace(state, teamspaceId);
  if (!teamspace) return;
  state.collapsedTeamspaces = state.collapsedTeamspaces.filter((id) => id !== teamspaceId);
  const page = createPage(state, { section: "teamspace", teamspaceId });
  persist();
  openPage(page.id);
  setTimeout(() => titleEl.focus(), 30);
}

function createPrivatePage() {
  const page = createPage(state, { section: "private" });
  persist();
  openPage(page.id);
  setTimeout(() => titleEl.focus(), 30);
}

function closeSidebarOnMobile() {
  app.classList.remove("sidebar-open");
  sidebarScrim.hidden = true;
}

/* ---------------- sidebar events ---------------- */
$("#sidebar-scroll").addEventListener("click", (event) => {
  const toggle = event.target.closest("[data-toggle-teamspace]");
  if (toggle) {
    event.stopPropagation();
    const id = toggle.dataset.toggleTeamspace;
    if (state.collapsedTeamspaces.includes(id)) {
      state.collapsedTeamspaces = state.collapsedTeamspaces.filter((item) => item !== id);
    } else {
      state.collapsedTeamspaces.push(id);
    }
    persist();
    return;
  }

  const newTeamspacePage = event.target.closest("[data-new-ts-page]");
  if (newTeamspacePage) {
    event.stopPropagation();
    createPageInTeamspace(newTeamspacePage.dataset.newTsPage);
    return;
  }

  const teamspaceMenuButton = event.target.closest("[data-ts-menu]");
  if (teamspaceMenuButton) {
    event.stopPropagation();
    openTeamspaceMenu(teamspaceMenuButton.dataset.tsMenu, teamspaceMenuButton.getBoundingClientRect());
    return;
  }

  const teamspaceRow = event.target.closest("[data-teamspace-row]");
  if (teamspaceRow) {
    openTeamspace(teamspaceRow.dataset.teamspaceRow);
    return;
  }

  const newChild = event.target.closest("[data-new-child]");
  if (newChild) {
    event.stopPropagation();
    const parent = getPage(state, newChild.dataset.newChild);
    if (!parent) return;
    const page = createPage(state, {
      section: parent.section,
      teamspaceId: parent.teamspaceId,
      parentId: parent.id,
    });
    persist();
    openPage(page.id);
    setTimeout(() => titleEl.focus(), 30);
    return;
  }

  const rowMenu = event.target.closest("[data-row-menu]");
  if (rowMenu) {
    event.stopPropagation();
    openPageMenuFor(rowMenu.dataset.rowMenu, rowMenu.getBoundingClientRect());
    return;
  }

  const row = event.target.closest("[data-page-id]");
  if (row) openPage(row.dataset.pageId);
});

$("#sidebar-scroll").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-page-id], [data-teamspace-row]");
  if (!row) return;
  event.preventDefault();
  if (row.dataset.pageId) openPage(row.dataset.pageId);
  if (row.dataset.teamspaceRow) openTeamspace(row.dataset.teamspaceRow);
});

$("#new-teamspace-btn").addEventListener("click", () => openTeamspaceModal(null));

$$("[data-new-page]").forEach((button) => {
  button.addEventListener("click", () => {
    const page = createPage(state, { section: button.dataset.newPage });
    persist();
    openPage(page.id);
    setTimeout(() => titleEl.focus(), 30);
  });
});

sidebarScrim.addEventListener("click", closeSidebarOnMobile);

/* ---------------- topbar ---------------- */
breadcrumbsEl.addEventListener("click", (event) => {
  const pageCrumb = event.target.closest("[data-nav-page]");
  if (pageCrumb) {
    openPage(pageCrumb.dataset.navPage);
    return;
  }
  const teamspaceCrumb = event.target.closest("[data-nav-teamspace]");
  if (teamspaceCrumb) openTeamspace(teamspaceCrumb.dataset.navTeamspace);
});

favoriteBtn.addEventListener("click", () => {
  const page = currentPage();
  if (!page) return;
  page.favorite = !page.favorite;
  page.updatedAt = Date.now();
  persist();
  renderAll({ scrollTop: false });
  toast(page.favorite ? "Added to favorites" : "Removed from favorites");
});

$("#share-btn").addEventListener("click", openShare);

/* ---------------- share with people ---------------- */
const shareDialog = document.getElementById("share-dialog");
const shareEmailInput = document.getElementById("share-email");
const shareRoleSelect = document.getElementById("share-role");
const shareAddButton = document.getElementById("share-add");
const shareError = document.getElementById("share-error");
const shareMembersList = document.getElementById("share-members");

async function refreshShareMembers() {
  const page = currentPage();
  if (!page || !isServer()) return;
  try {
    const data = await apiPages.members(page.id);
    shareMembersList.innerHTML = "";
    for (const member of data.members || []) {
      const item = document.createElement("li");
      item.className = "share-dialog__member";
      item.innerHTML = `
        <span class="share-dialog__avatar">${member.initials}</span>
        <span class="share-dialog__name">${member.name}</span>
        <span class="share-dialog__email">${member.email}</span>
        <span class="share-dialog__role">${member.role}</span>
        <button class="share-dialog__remove" data-user="${member.id}" aria-label="Remove access">✕</button>
      `;
      shareMembersList.appendChild(item);
    }
  } catch (error) {
    shareError.textContent = error.message || "Could not load members";
    shareError.hidden = false;
  }
}

async function openSharePeople() {
  const page = currentPage();
  if (!page) {
    toast("Open a page first");
    return;
  }
  if (!isServer()) {
    toast("Sharing needs the backend");
    return;
  }
  shareError.hidden = true;
  if (shareEmailInput) shareEmailInput.value = "";
  if (shareMembersList) shareMembersList.innerHTML = "";
  if (shareDialog && typeof shareDialog.showModal === "function") shareDialog.showModal();
  else shareDialog?.setAttribute("open", "");
  await refreshShareMembers();
}

async function addShareMember() {
  const page = currentPage();
  if (!page || !shareEmailInput) return;
  shareError.hidden = true;
  try {
    await apiPages.addMember(page.id, {
      email: shareEmailInput.value.trim(),
      role: shareRoleSelect?.value || "viewer",
    });
    shareEmailInput.value = "";
    await refreshShareMembers();
    toast("Access granted");
  } catch (error) {
    shareError.textContent = error.message || "Could not share";
    shareError.hidden = false;
  }
}

async function removeShareMember(userId) {
  const page = currentPage();
  if (!page) return;
  try {
    await apiPages.removeMember(page.id, userId);
    await refreshShareMembers();
  } catch (error) {
    toast(error.message || "Could not remove access");
  }
}

shareAddButton?.addEventListener("click", addShareMember);
shareMembersList?.addEventListener("click", (event) => {
  const button = event.target.closest(".share-dialog__remove");
  if (button) removeShareMember(button.dataset.user);
});
shareDialog?.addEventListener("close", () => {
  if (shareError) shareError.hidden = true;
});

/* ---------------- sync status ---------------- */
const syncStatus = document.getElementById("sync-status");
let syncStatusTimer = null;

function setSyncStatus(state) {
  if (!syncStatus) return;
  clearTimeout(syncStatusTimer);
  syncStatus.hidden = false;
  syncStatus.className = `sync-status sync-status--${state}`;
  syncStatus.textContent =
    state === "saving" ? "Saving…" :
    state === "saved" ? "Saved" :
    state === "offline" ? "Offline" :
    state === "error" ? "Sync error" : "";
  if (state === "saved") {
    syncStatusTimer = setTimeout(() => (syncStatus.hidden = true), 1600);
  }
}

/* ---------------- share ---------------- */
const shareModal = $("#share-modal");
const shareUrlInput = $("#share-url");

function openShare() {
  const view = state.activeView;
  const item = view.type === "teamspace" ? getTeamspace(state, view.id) : getPage(state, view.id);
  if (!item) return;
  $("#share-title").textContent =
    view.type === "teamspace" ? `Share ${item.name}` : `Share "${item.title || "Untitled"}"`;
  shareUrlInput.value = shareUrl();
  shareModal.hidden = false;
  setTimeout(() => {
    shareUrlInput.focus();
    shareUrlInput.select();
  }, 30);
}

function closeShare() {
  shareModal.hidden = true;
}

$("#share-copy").addEventListener("click", async () => {
  shareUrlInput.focus();
  shareUrlInput.select();
  try {
    await navigator.clipboard.writeText(shareUrlInput.value);
    toast("Link copied to clipboard");
  } catch {
    document.execCommand("copy");
    toast("Link copied");
  }
});

$("#share-open").addEventListener("click", () => {
  window.open(shareUrl(), "_blank", "noopener");
});

$("#share-done").addEventListener("click", closeShare);
shareModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-share]")) closeShare();
});

/* ---------------- templates ---------------- */
const templatesModal = $("#templates-modal");
const templateGrid = $("#template-grid");

function renderTemplates() {
  templateGrid.innerHTML = "";
  for (const template of PAGE_TEMPLATES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "template-card";
    button.innerHTML = `
      <span class="template-card__icon">${template.icon}</span>
      <span class="template-card__name">${escapeHtml(template.name)}</span>
      <span class="template-card__desc">${escapeHtml(template.description)}</span>`;
    button.addEventListener("click", () => {
      const page = createPageFromTemplate(state, template, { section: "private" });
      closeTemplates();
      persist();
      openPage(page.id);
      toast(`${template.name} created`);
    });
    templateGrid.appendChild(button);
  }
}

function openTemplates() {
  renderTemplates();
  templatesModal.hidden = false;
}

function closeTemplates() {
  templatesModal.hidden = true;
}

$("#templates-close").addEventListener("click", closeTemplates);
templatesModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-templates]")) closeTemplates();
});

/* ---------------- settings ---------------- */
const settingsModal = $("#settings-modal");
const settingsColors = $("#settings-colors");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const AVATAR_COLORS = ["#2383e2", "#d9730d", "#4dab9a", "#8a5a3b", "#7a2f86", "#b07d2b", "#2f6b4f", "#4b5563"];

let settingsColor = session?.color ?? AVATAR_COLORS[0];
let settingsTheme = state.theme;

for (const color of AVATAR_COLORS) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.color = color;
  button.style.background = color;
  button.addEventListener("click", () => {
    settingsColor = color;
    updateSettingsSelection();
  });
  settingsColors.appendChild(button);
}

function updateSettingsSelection() {
  [...settingsColors.children].forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.color === settingsColor);
  });
  $$("#settings-theme button").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.themeChoice === settingsTheme);
  });
}

function openSettings() {
  if (!session) return;
  $("#settings-name").value = session.name;
  $("#settings-email").value = session.email;
  $("#settings-workspace").value = state.workspace.name;
  settingsColor = session.color || AVATAR_COLORS[0];
  settingsTheme = state.theme === "dark" ? "dark" : "light";
  $("#settings-error").hidden = true;
  updateSettingsSelection();
  settingsModal.hidden = false;
  setTimeout(() => $("#settings-name").focus(), 30);
}

function closeSettings() {
  settingsModal.hidden = true;
}

$$("#settings-theme button").forEach((button) => {
  button.addEventListener("click", () => {
    settingsTheme = button.dataset.themeChoice;
    updateSettingsSelection();
  });
});

$("#settings-save").addEventListener("click", () => {
  if (!session) return;
  const name = $("#settings-name").value.trim();
  const email = $("#settings-email").value.trim().toLowerCase();
  const workspace = $("#settings-workspace").value.trim() || "Notion Clone";

  if (name.length < 2 || !EMAIL_PATTERN.test(email)) {
    $("#settings-error").hidden = false;
    return;
  }

  Object.assign(session, saveSession({ name, email, color: settingsColor }));
  state.workspace.name = workspace;
  applyTheme(settingsTheme);
  closeSettings();
  persist();
  renderAll({ scrollTop: false });
  updateUser();
  toast("Settings saved");
});

$("#settings-logout").addEventListener("click", () => {
  clearSession();
  window.location.replace("index.html");
});

$("#settings-cancel").addEventListener("click", closeSettings);
settingsModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-settings]")) closeSettings();
});

/* ---------------- comments ---------------- */
const commentsPanel = $("#comments-panel");
const commentsListEl = $("#comments-list");
const commentsForm = $("#comments-form");
const commentsInput = $("#comments-input");
const commentsBadge = $("#comments-count");
let commentsOpen = false;
let pendingCommentAnchor = null;

function commentsOwner() {
  const view = state.activeView;
  if (view.type === "teamspace") return getTeamspace(state, view.id);
  return getPage(state, view.id);
}

function updateCommentsBadge() {
  const owner = commentsOwner();
  const count = (owner?.comments || []).filter((comment) => !comment.resolved).length;
  commentsBadge.hidden = count === 0;
  commentsBadge.textContent = count > 99 ? "99+" : String(count);
  $("#comments-btn").setAttribute("aria-pressed", String(commentsOpen));
}

function commentTime(timestamp) {
  const diff = Date.now() - (timestamp || 0);
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const COMMENT_REACTIONS = ["👍", "🎉", "👀", "❤️", "🚀", "😕"];

function renderComments() {
  const owner = commentsOwner();
  if (!owner) return;
  const comments = owner.comments || [];
  const view = state.activeView;
  const label = view.type === "teamspace" ? owner.name : owner.title || "Untitled";
  const replyCount = comments.reduce((total, comment) => total + (comment.replies?.length || 0), 0);

  $("#comments-heading-count").textContent =
    comments.length ? `(${comments.length + replyCount})` : "";
  $("#comments-subtitle").textContent =
    view.type === "teamspace" ? `On the ${label} teamspace` : `On "${label}"`;
  commentsListEl.innerHTML = "";

  if (!comments.length) {
    const empty = document.createElement("div");
    empty.className = "comments-empty";
    empty.innerHTML = "<span>💬</span><p>No comments yet. Start the conversation.</p>";
    commentsListEl.appendChild(empty);
    return;
  }

  const sorted = [...comments].sort(
    (a, b) => Number(a.resolved) - Number(b.resolved) || (b.createdAt || 0) - (a.createdAt || 0)
  );

  for (const comment of sorted) {
    const author = comment.author || {};
    const item = document.createElement("article");
    item.className = `comment${comment.resolved ? " is-resolved" : ""}`;
    item.dataset.commentId = comment.id;
    item.innerHTML = `
      <span class="comment__avatar" style="background:${author.color || "#4b5563"}">${escapeHtml(
      author.initials || initials(author.name || "?")
    )}</span>
      <div class="comment__main">
        <div class="comment__head">
          <strong>${escapeHtml(author.name || "Someone")}</strong>
          <span>${commentTime(comment.createdAt)}</span>
        </div>
        <p class="comment__body"></p>
        <div class="comment__reactions"></div>
        <div class="comment__actions"></div>
        <div class="comment__replies"></div>
      </div>`;
    item.querySelector(".comment__body").textContent = comment.text;

    const actions = item.querySelector(".comment__actions");

    if (comment.anchor?.blockId) {
      const anchorButton = document.createElement("button");
      anchorButton.type = "button";
      anchorButton.className = "comment__anchor";
      anchorButton.title = "Jump to block";
      anchorButton.textContent = `❝ ${comment.anchor.quote || "On this block"}`;
      anchorButton.addEventListener("click", () => {
        const exists = currentPage()?.blocks.some((block) => block.id === comment.anchor.blockId);
        if (!exists) {
          toast("The original block was deleted");
          return;
        }
        editor.scrollToBlock(comment.anchor.blockId);
      });
      item.querySelector(".comment__main").insertBefore(anchorButton, actions);
    }

    const reactions = item.querySelector(".comment__reactions");
    const counts = comment.reactions || {};
    for (const emoji of COMMENT_REACTIONS) {
      const count = counts[emoji] || 0;
      if (!count && !emoji.trim()) continue;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `comment__reaction${count ? " has-reactions" : ""}`;
      chip.dataset.commentReaction = emoji;
      chip.title = count ? `${count} reaction${count === 1 ? "" : "s"}` : "Add reaction";
      chip.textContent = count ? `${emoji} ${count}` : `${emoji}`;
      chip.addEventListener("click", () => {
        comment.reactions = comment.reactions || {};
        comment.reactions[emoji] = comment.reactions[emoji]
          ? Math.max(0, comment.reactions[emoji] - 1)
          : 1;
        if (!comment.reactions[emoji]) delete comment.reactions[emoji];
        persist({ sidebar: false, topbar: false });
        renderComments();
      });
      reactions.appendChild(chip);
    }

    const resolve = document.createElement("button");
    resolve.type = "button";
    resolve.className = comment.resolved ? "" : "resolve";
    resolve.textContent = comment.resolved ? "Reopen" : "Resolve";
    resolve.addEventListener("click", () => {
      comment.resolved = !comment.resolved;
      persist({ sidebar: false, topbar: false });
      updateCommentsBadge();
      renderComments();
      refreshCommentHighlights();
      toast(comment.resolved ? "Comment resolved" : "Comment reopened");
    });

    const reply = document.createElement("button");
    reply.type = "button";
    reply.textContent = "Reply";
    reply.addEventListener("click", () => {
      const field = document.createElement("div");
      field.className = "comment__reply-box";
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Write a reply…";
      const send = document.createElement("button");
      send.type = "button";
      send.className = "resolve";
      send.textContent = "Reply";

      const submit = () => {
        const text = input.value.trim();
        if (!text) return;
        comment.replies = comment.replies || [];
        comment.replies.push({
          id: uid(),
          text,
          author: {
            name: session?.name || "You",
            initials: initials(session?.name || "You"),
            color: session?.color || "#4b5563",
          },
          createdAt: Date.now(),
        });
        persist({ sidebar: false, topbar: false });
        updateCommentsBadge();
        renderComments();
      };

      send.addEventListener("click", submit);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submit();
        }
        if (event.key === "Escape") field.remove();
      });

      field.append(input, send);
      item.querySelector(".comment__main").appendChild(field);
      input.focus();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      owner.comments = comments.filter((entry) => entry.id !== comment.id);
      persist({ sidebar: false, topbar: false });
      updateCommentsBadge();
      renderComments();
      refreshCommentHighlights();
      toast("Comment deleted");
    });

    actions.append(reply, resolve, remove);

    const replies = item.querySelector(".comment__replies");
    for (const entry of comment.replies || []) {
      const replyEl = document.createElement("div");
      replyEl.className = "comment__reply";
      const replyAuthor = entry.author || {};
      replyEl.innerHTML = `
        <span class="comment__avatar comment__avatar--sm" style="background:${
          replyAuthor.color || "#4b5563"
        }">${escapeHtml(replyAuthor.initials || initials(replyAuthor.name || "?"))}</span>
        <div>
          <div class="comment__head">
            <strong>${escapeHtml(replyAuthor.name || "Someone")}</strong>
            <span>${commentTime(entry.createdAt)}</span>
          </div>
          <p class="comment__body"></p>
        </div>`;
      replyEl.querySelector(".comment__body").textContent = entry.text;
      replies.appendChild(replyEl);
    }

    commentsListEl.appendChild(item);
  }
}

function openComments(keepAnchor = false) {
  if (!commentsOwner()) return;
  if (!keepAnchor) {
    pendingCommentAnchor = null;
    commentsInput.placeholder = "Add a comment…";
  }
  commentsOpen = true;
  commentsPanel.hidden = false;
  renderComments();
  updateCommentsBadge();
  setTimeout(() => commentsInput.focus(), 40);
}

function startBlockComment(anchor) {
  if (!anchor?.blockId) return;
  const quote = String(anchor.quote || "").trim().slice(0, 240);
  pendingCommentAnchor = {
    blockId: anchor.blockId,
    quote,
    start: Number.isFinite(anchor.start) ? anchor.start : null,
    end: Number.isFinite(anchor.end) ? anchor.end : null,
    orphaned: false,
  };
  commentsInput.placeholder = quote
    ? `Comment on "${quote.slice(0, 38)}${quote.length > 38 ? "…" : ""}"`
    : "Comment on this block…";
  openComments(true);
  setTimeout(() => commentsInput.focus(), 60);
}

function closeComments() {
  commentsOpen = false;
  commentsPanel.hidden = true;
  updateCommentsBadge();
}

$("#comments-btn").addEventListener("click", () => {
  if (commentsOpen) closeComments();
  else openComments();
});

$("#comments-close").addEventListener("click", closeComments);

commentsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const owner = commentsOwner();
  if (!owner) return;
  const text = commentsInput.value.trim();
  if (!text) return;

  owner.comments = owner.comments || [];
  owner.comments.unshift({
    id: uid(),
    text,
    anchor: pendingCommentAnchor ? { ...pendingCommentAnchor } : null,
    author: {
      name: session?.name || "You",
      initials: initials(session?.name || "You"),
      color: session?.color || "#4b5563",
    },
    createdAt: Date.now(),
    resolved: false,
  });

  commentsInput.value = "";
  pendingCommentAnchor = null;
  commentsInput.placeholder = "Add a comment…";
  persist({ sidebar: false, topbar: false });
  updateCommentsBadge();
  renderComments();
  refreshCommentHighlights();
  toast("Comment posted");
});

commentsInput.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    commentsForm.requestSubmit();
  }
});

$("#sidebar-open").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 860px)").matches) {
    app.classList.add("sidebar-open");
    sidebarScrim.hidden = false;
  } else {
    app.classList.remove("sidebar-collapsed");
  }
});

$("#sidebar-collapse").addEventListener("click", () => {
  if (window.matchMedia("(max-width: 860px)").matches) {
    closeSidebarOnMobile();
  } else {
    app.classList.add("sidebar-collapsed");
  }
});

$("#logout-btn").addEventListener("click", () => {
  clearSession();
  if (isServer()) apiAuth.logout().catch(() => {});
  window.location.replace("index.html");
});

/* ---------------- quick actions ---------------- */
$$('[data-action="search"]').forEach((button) => button.addEventListener("click", openSearch));

$$('[data-action="home"]').forEach((button) =>
  button.addEventListener("click", () => {
    const start = getPage(state, "page-getting-started");
    if (start && isLive(start)) {
      openPage(start.id);
      return;
    }
    const firstPage = state.pages.find(isLive);
    if (firstPage) openPage(firstPage.id);
  })
);

$$('[data-action="inbox"]').forEach((button) =>
  button.addEventListener("click", () => toast("Inbox is empty"))
);

$$('[data-action="template"]').forEach((button) => button.addEventListener("click", openTemplates));
$$('[data-action="settings"]').forEach((button) => button.addEventListener("click", openSettings));

$$('[data-action="trash"]').forEach((button) => button.addEventListener("click", openTrash));

$("#theme-toggle").addEventListener("click", () => {
  applyTheme(state.theme === "dark" ? "light" : "dark");
  persist({ sidebar: false });
});

/* ---------------- title ---------------- */
titleEl.addEventListener("input", () => {
  const page = currentPage();
  if (!page) return;
  if (page.locked) {
    titleEl.textContent = page.title;
    return;
  }
  page.title = titleEl.textContent.replace(/\u200b/g, "");
  page.updatedAt = Date.now();
  updatePageMeta(page);
  persist();
});

titleEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    const page = currentPage();
    if (!page) return;
    if (!page.blocks.length) page.blocks.push(createBlock("paragraph"));
    editor.render(page);
    editor.focusBlock(page.blocks[0].id, "start");
  }
  if (event.key === "ArrowDown") {
    const page = currentPage();
    if (!page?.blocks.length) return;
    event.preventDefault();
    editor.focusBlock(page.blocks[0].id, "start");
  }
});

titleEl.addEventListener("blur", () => {
  const page = currentPage();
  if (!page) return;
  if (!page.title.trim()) {
    page.title = "";
    titleEl.textContent = "";
  }
  updatePageSlug(state, page);
  persist();
  syncUrl("replace");
});

/* ---------------- popover positioning ---------------- */
function positionPopover(popover, rect) {
  popover.hidden = false;
  popover.style.left = "0px";
  popover.style.top = "0px";
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  popover.style.left = `${Math.min(Math.max(10, rect.left), window.innerWidth - width - 10)}px`;
  popover.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - height - 10)}px`;
}

/* ---------------- page icon + cover ---------------- */
const iconPicker = $("#icon-picker");
const coverPicker = $("#cover-picker");

const iconGrid = $("#icon-grid");
for (const icon of ICONS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = icon;
  button.addEventListener("click", () => {
    const page = currentPage();
    if (!page || !requireUnlocked(page)) return;
    page.icon = icon;
    page.updatedAt = Date.now();
    iconPicker.hidden = true;
    persist();
    renderAll({ scrollTop: false });
  });
  iconGrid.appendChild(button);
}

$("#icon-clear").addEventListener("click", () => {
  const page = currentPage();
  if (!page || !requireUnlocked(page)) return;
  page.icon = "📄";
  iconPicker.hidden = true;
  persist();
  renderAll({ scrollTop: false });
});

iconEl.addEventListener("click", () => {
  const page = currentPage();
  if (!page || !requireUnlocked(page)) return;
  positionPopover(iconPicker, iconEl.getBoundingClientRect());
});

const coverGrid = $("#cover-grid");
COVERS.forEach((gradient, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.style.background = gradient;
  button.addEventListener("click", () => {
    const page = currentPage();
    if (!page || !requireUnlocked(page)) return;
    page.cover = index;
    page.updatedAt = Date.now();
    coverPicker.hidden = true;
    persist();
    renderAll({ scrollTop: false });
  });
  coverGrid.appendChild(button);
});

$("#add-cover").addEventListener("click", () => {
  const page = currentPage();
  if (!page || !requireUnlocked(page)) return;
  positionPopover(coverPicker, $("#add-cover").getBoundingClientRect());
});
$("#cover-change").addEventListener("click", () => {
  const page = currentPage();
  if (!page || !requireUnlocked(page)) return;
  positionPopover(coverPicker, coverEl.getBoundingClientRect());
});
$("#cover-remove").addEventListener("click", () => {
  const page = currentPage();
  if (!page || !requireUnlocked(page)) return;
  page.cover = null;
  persist();
  renderAll({ scrollTop: false });
});

/* ---------------- page menu ---------------- */
const pageMenu = $("#page-menu");
let menuPageId = null;

function openPageMenuFor(id, rect) {
  const page = getPage(state, id);
  if (!page) return;
  menuPageId = id;
  pageMenu.querySelector('[data-page-action="favorite"]').textContent = page.favorite
    ? "Remove from favorites"
    : "Add to favorites";
  pageMenu.querySelector('[data-page-action="fullwidth"]').textContent = `${
    page.fullWidth ? "✓ " : ""
  }Full width`;
  pageMenu.querySelector('[data-page-action="smalltext"]').textContent = `${
    page.smallText ? "✓ " : ""
  }Small text`;
  const fontLabels = { default: "Default", serif: "Serif", mono: "Mono" };
  pageMenu.querySelector('[data-page-action="font"]').textContent = `Font: ${
    fontLabels[page.font] || "Default"
  }`;
  pageMenu.querySelector('[data-page-action="lock"]').textContent = page.locked
    ? "Unlock page"
    : "Lock page";
  positionPopover(pageMenu, rect);
}

pageMenuBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  openPageMenuFor(state.activeView.id, event.currentTarget.getBoundingClientRect());
});

pageMenu.addEventListener("click", (event) => {
  const action = event.target.closest("[data-page-action]")?.dataset.pageAction;
  if (!action || !menuPageId) return;
  const page = getPage(state, menuPageId);
  if (!page) return;
  pageMenu.hidden = true;

  if (action === "favorite") {
    page.favorite = !page.favorite;
    page.updatedAt = Date.now();
    persist();
    renderAll({ scrollTop: false });
    toast(page.favorite ? "Added to favorites" : "Removed from favorites");
    return;
  }

  if (action === "duplicate") {
    const copy = duplicatePage(state, page.id);
    persist();
    if (copy) openPage(copy.id);
    toast("Page duplicated");
    return;
  }

  if (action === "move") {
    openMoveModal(page);
    return;
  }

  if (action === "rename") {
    if (!requireUnlocked(page)) return;
    const value = window.prompt("Rename page", page.title || "Untitled");
    if (value === null) return;
    page.title = value.trim();
    page.updatedAt = Date.now();
    updatePageSlug(state, page);
    persist();
    renderAll({ scrollTop: false });
    syncUrl("replace");
    return;
  }

  if (action === "export") {
    exportMarkdown(page);
    return;
  }

  if (action === "fullwidth") {
    page.fullWidth = !page.fullWidth;
    page.updatedAt = Date.now();
    persist();
    renderAll({ scrollTop: false });
    toast(page.fullWidth ? "Full width on" : "Full width off");
    return;
  }

  if (action === "smalltext") {
    page.smallText = !page.smallText;
    page.updatedAt = Date.now();
    persist();
    renderAll({ scrollTop: false });
    toast(page.smallText ? "Small text on" : "Small text off");
    return;
  }

  if (action === "font") {
    const order = ["default", "serif", "mono"];
    const next = order[(order.indexOf(page.font) + 1) % order.length];
    page.font = next;
    page.updatedAt = Date.now();
    persist();
    renderAll({ scrollTop: false });
    toast(`Font: ${next === "default" ? "Default" : next === "serif" ? "Serif" : "Mono"}`);
    return;
  }

  if (action === "lock") {
    page.locked = !page.locked;
    page.updatedAt = Date.now();
    persist();
    renderAll({ scrollTop: false });
    toast(page.locked ? "Page locked" : "Page unlocked");
    return;
  }

  if (action === "history") {
    openHistory(page);
    return;
  }

  if (action === "delete") {
    trashPage(state, page.id);
    ensureValidView(state);
    persist();
    renderAll();
    syncUrl("replace");
    toast("Moved to trash");
  }
});

/* ---------------- version history ---------------- */
const historyModal = $("#history-modal");
const historyListEl = $("#history-list");

function openHistory(page) {
  if (!page) return;
  if (state.activeView.type !== "page" || state.activeView.id !== page.id) {
    openPage(page.id);
  }
  $("#history-subtitle").textContent = `Restore an earlier version of "${
    page.title || "Untitled"
  }".`;
  renderHistoryVersions(page);
  historyModal.hidden = false;
}

function closeHistory() {
  historyModal.hidden = true;
}

function renderHistoryVersions(page) {
  historyListEl.innerHTML = "";
  const versions = Array.isArray(page.versions) ? page.versions : [];
  if (!versions.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "No versions yet. Keep editing and versions will appear here.";
    historyListEl.appendChild(empty);
    return;
  }

  for (const version of versions) {
    const item = document.createElement("div");
    item.className = "history-item";
    const words = pageWordCount({ title: version.title, blocks: version.blocks || [] });
    const when = new Date(version.at).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    item.innerHTML = `
      <div class="history-item__main">
        <strong>${escapeHtml(version.title || "Untitled")}</strong>
        <span>${escapeHtml(when)} · ${words} ${words === 1 ? "word" : "words"}</span>
      </div>`;
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "Restore";
    restore.addEventListener("click", () => restoreVersion(page, version));
    item.appendChild(restore);
    historyListEl.appendChild(item);
  }
}

function restoreVersion(page, version) {
  pushVersion(page);
  page.title = version.title || "";
  page.icon = version.icon || "📄";
  page.blocks = structuredClone(version.blocks || []);
  page.updatedAt = Date.now();
  updatePageSlug(state, page);
  persist();
  renderAll({ scrollTop: false });
  syncUrl("replace");
  closeHistory();
  toast("Version restored");
}

$("#history-done").addEventListener("click", closeHistory);
historyModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-history]")) closeHistory();
});

/* ---------------- teamspace menu ---------------- */
const teamspaceMenu = $("#teamspace-menu");
let menuTeamspaceId = null;

function openTeamspaceMenu(id, rect) {
  if (!getTeamspace(state, id)) return;
  menuTeamspaceId = id;
  positionPopover(teamspaceMenu, rect);
}

teamspaceMenu.addEventListener("click", (event) => {
  const action = event.target.closest("[data-ts-action]")?.dataset.tsAction;
  if (!action || !menuTeamspaceId) return;
  const id = menuTeamspaceId;
  teamspaceMenu.hidden = true;

  if (action === "open") {
    openTeamspace(id);
    return;
  }

  if (action === "new-page") {
    createPageInTeamspace(id);
    return;
  }

  if (action === "invite") {
    openInviteModal(id);
    return;
  }

  if (action === "edit") {
    openTeamspaceModal(getTeamspace(state, id));
    return;
  }

  if (action === "delete") {
    deleteTeamspaceFlow(id);
  }
});

function deleteTeamspaceFlow(id) {
  const teamspace = getTeamspace(state, id);
  if (!teamspace) return;
  const count = state.pages.filter((page) => page.teamspaceId === id).length;
  const message = `Delete "${teamspace.name}"?${
    count ? `\n\n${count} ${count === 1 ? "page" : "pages"} will be moved to Private.` : ""
  }`;
  if (!window.confirm(message)) return;

  deleteTeamspace(state, id);
  if (state.activeView.type === "teamspace" && state.activeView.id === id) {
    const first = state.pages.find(isLive);
    state.activeView = first ? { type: "page", id: first.id } : { type: "page", id: null };
  }
  ensureValidView(state);
  persist();
  renderAll();
  syncUrl("replace");
  toast("Teamspace deleted · pages moved to Private");
}

/* ---------------- teamspace modal ---------------- */
const teamspaceModal = $("#teamspace-modal");
const tsNameInput = $("#ts-name");
const tsDescInput = $("#ts-desc");
const tsIconGrid = $("#ts-icon-grid");
const tsColorGrid = $("#ts-color-grid");
const tsError = $("#ts-error");

let editingTeamspaceId = null;
let draftIcon = "🚀";
let draftColor = TEAMSPACE_COLORS[0];

for (const icon of ICONS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = icon;
  button.addEventListener("click", () => {
    draftIcon = icon;
    updateTeamspaceDraftSelection();
  });
  tsIconGrid.appendChild(button);
}

for (const color of TEAMSPACE_COLORS) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.color = color;
  button.style.background = color;
  button.addEventListener("click", () => {
    draftColor = color;
    updateTeamspaceDraftSelection();
  });
  tsColorGrid.appendChild(button);
}

function updateTeamspaceDraftSelection() {
  [...tsIconGrid.children].forEach((button) => {
    button.classList.toggle("is-selected", button.textContent === draftIcon);
  });
  [...tsColorGrid.children].forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.color === draftColor);
  });
}

function openTeamspaceModal(teamspace = null) {
  editingTeamspaceId = teamspace?.id ?? null;
  const editing = Boolean(teamspace);

  $("#ts-modal-eyebrow").textContent = editing ? "EDIT TEAMSPACE" : "NEW TEAMSPACE";
  $("#ts-modal-title").textContent = editing ? "Edit teamspace" : "Create a teamspace";
  $("#ts-save").textContent = editing ? "Save changes" : "Create teamspace";
  $("#ts-delete").hidden = !editing;

  tsNameInput.value = teamspace?.name ?? "";
  tsDescInput.value = teamspace?.description ?? "";
  draftIcon = teamspace?.icon ?? "🚀";
  draftColor = teamspace?.color ?? TEAMSPACE_COLORS[0];
  updateTeamspaceDraftSelection();
  tsError.hidden = true;

  teamspaceModal.hidden = false;
  setTimeout(() => tsNameInput.focus(), 20);
}

function closeTeamspaceModal() {
  teamspaceModal.hidden = true;
  editingTeamspaceId = null;
}

$("#ts-save").addEventListener("click", saveTeamspaceModal);
tsNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveTeamspaceModal();
  }
});

function saveTeamspaceModal() {
  const name = tsNameInput.value.trim();
  if (!name) {
    tsError.hidden = false;
    tsNameInput.focus();
    return;
  }

  const description = tsDescInput.value.trim();

  if (editingTeamspaceId) {
    const teamspace = getTeamspace(state, editingTeamspaceId);
    if (teamspace) {
      teamspace.name = name;
      teamspace.description = description;
      teamspace.icon = draftIcon;
      teamspace.color = draftColor;
      updateTeamspaceSlug(state, teamspace);
    }
    closeTeamspaceModal();
    persist();
    renderAll({ scrollTop: false });
    syncUrl("replace");
    toast("Teamspace updated");
    return;
  }

  const teamspace = createTeamspace(state, {
    name,
    description,
    icon: draftIcon,
    color: draftColor,
    members: session
      ? [makeMember({ name: session.name, email: session.email, role: "Admin", color: session.color })]
      : [],
  });
  closeTeamspaceModal();
  persist();
  openTeamspace(teamspace.id);
  toast("Teamspace created");
}

$("#ts-cancel").addEventListener("click", closeTeamspaceModal);
teamspaceModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-teamspace]")) closeTeamspaceModal();
});

$("#ts-delete").addEventListener("click", () => {
  if (!editingTeamspaceId) return;
  const id = editingTeamspaceId;
  closeTeamspaceModal();
  deleteTeamspaceFlow(id);
});

$("#ts-edit").addEventListener("click", () => {
  const teamspace = currentTeamspace();
  if (teamspace) openTeamspaceModal(teamspace);
});

$("#ts-new-page").addEventListener("click", () => {
  const teamspace = currentTeamspace();
  if (teamspace) createPageInTeamspace(teamspace.id);
});

$("#ts-home-grid").addEventListener("click", (event) => {
  const card = event.target.closest("[data-open-page]");
  if (card) openPage(card.dataset.openPage);
});

/* ---------------- invite members ---------------- */
const inviteModal = $("#invite-modal");
const inviteForm = $("#invite-form");
const inviteNameInput = $("#invite-name");
const inviteEmailInput = $("#invite-email");
const inviteRoleInput = $("#invite-role");
const inviteError = $("#invite-error");
const inviteMemberList = $("#invite-member-list");
const inviteMemberCount = $("#invite-member-count");

let invitingTeamspaceId = null;

function openInviteModal(teamspaceId) {
  const teamspace = getTeamspace(state, teamspaceId);
  if (!teamspace) return;
  invitingTeamspaceId = teamspaceId;
  $("#invite-title").textContent = `Invite to ${teamspace.name}`;
  $("#invite-subtitle").textContent =
    "Add a teammate to this teamspace. They appear in the member list right away.";
  inviteForm.reset();
  inviteError.hidden = true;
  renderInviteMembers();
  inviteModal.hidden = false;
  setTimeout(() => inviteEmailInput.focus(), 20);
}

function closeInviteModal() {
  inviteModal.hidden = true;
  invitingTeamspaceId = null;
}

function renderInviteMembers() {
  const teamspace = getTeamspace(state, invitingTeamspaceId);
  if (!teamspace) return;
  const members = Array.isArray(teamspace.members) ? teamspace.members : [];
  inviteMemberCount.textContent = `${members.length} ${
    members.length === 1 ? "member" : "members"
  }`;
  inviteMemberList.replaceChildren();

  if (!members.length) {
    const empty = document.createElement("div");
    empty.className = "ts-member-empty";
    empty.textContent = "No members yet. Add the first one above.";
    inviteMemberList.appendChild(empty);
    return;
  }

  for (const member of members) {
    inviteMemberList.appendChild(
      memberRow(member, { removable: true, onRemove: removeTeamspaceMember })
    );
  }
}

function refreshTeamspaceMemberViews(teamspace) {
  if (state.activeView.type === "teamspace" && state.activeView.id === teamspace.id) {
    renderTeamspaceHome(teamspace);
  }
}

function removeTeamspaceMember(member) {
  const teamspace = getTeamspace(state, invitingTeamspaceId);
  if (!teamspace || !member) return;
  const label = member.name || "this member";
  if (!window.confirm(`Remove ${label} from ${teamspace.name}?`)) return;

  teamspace.members = (teamspace.members || []).filter((item) => item.id !== member.id);
  persist();
  refreshTeamspaceMemberViews(teamspace);
  renderInviteMembers();
  toast(`${label} removed from ${teamspace.name}`);
}

inviteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const teamspace = getTeamspace(state, invitingTeamspaceId);
  if (!teamspace) return;

  const email = inviteEmailInput.value.trim().toLowerCase();
  const name = inviteNameInput.value.trim();
  const role = inviteRoleInput.value === "Admin" ? "Admin" : "Member";

  if (!EMAIL_PATTERN.test(email)) {
    inviteError.textContent = "Enter a valid email address.";
    inviteError.hidden = false;
    inviteEmailInput.focus();
    return;
  }

  const duplicate = (teamspace.members || []).some(
    (member) => String(member.email || "").toLowerCase() === email
  );
  if (duplicate) {
    inviteError.textContent = "That email is already a member of this teamspace.";
    inviteError.hidden = false;
    inviteEmailInput.focus();
    return;
  }

  const member = makeMember({ name, email, role });
  teamspace.members = [...(teamspace.members || []), member];
  inviteError.hidden = true;
  persist();
  refreshTeamspaceMemberViews(teamspace);
  renderInviteMembers();
  inviteForm.reset();
  setTimeout(() => inviteEmailInput.focus(), 0);
  toast(`${member.name} added to ${teamspace.name}`);
});

$("#invite-close").addEventListener("click", closeInviteModal);
inviteModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-invite]")) closeInviteModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !inviteModal.hidden) closeInviteModal();
});

/* ---------------- move modal ---------------- */
const moveModal = $("#move-modal");
const moveList = $("#move-list");
let movingPageId = null;
let moveTarget = null;

function openMoveModal(page) {
  movingPageId = page.id;
  moveTarget = { section: page.section, teamspaceId: page.teamspaceId ?? null };
  $("#move-subtitle").textContent = `Choose where "${page.title || "Untitled"}" should live.`;

  moveList.innerHTML = "";

  const privateLabel = document.createElement("div");
  privateLabel.className = "move-list__label";
  privateLabel.textContent = "PRIVATE";
  moveList.appendChild(privateLabel);
  moveList.appendChild(moveOption({ section: "private", teamspaceId: null, icon: "🔒", label: "Private pages" }));

  if (state.teamspaces.length) {
    const teamLabel = document.createElement("div");
    teamLabel.className = "move-list__label";
    teamLabel.textContent = "TEAMSPACES";
    moveList.appendChild(teamLabel);
    for (const teamspace of state.teamspaces) {
      moveList.appendChild(
        moveOption({
          section: "teamspace",
          teamspaceId: teamspace.id,
          icon: teamspace.icon,
          label: teamspace.name,
        })
      );
    }
  }

  moveModal.hidden = false;
}

function moveOption({ section, teamspaceId, icon, label }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "move-option";
  button.dataset.moveSection = section;
  if (teamspaceId) button.dataset.moveTeamspace = teamspaceId;
  const selected = moveTarget.section === section && (moveTarget.teamspaceId ?? null) === teamspaceId;
  button.classList.toggle("is-selected", selected);
  button.innerHTML = `<span class="move-option__icon">${icon}</span><span>${escapeHtml(
    label
  )}</span><span class="move-option__meta">${section === "private" ? "Only you" : "Teamspace"}</span>`;
  button.addEventListener("click", () => {
    moveTarget = { section, teamspaceId };
    [...moveList.querySelectorAll(".move-option")].forEach((option) => option.classList.remove("is-selected"));
    button.classList.add("is-selected");
  });
  return button;
}

function closeMoveModal() {
  moveModal.hidden = true;
  movingPageId = null;
  moveTarget = null;
}

$("#move-confirm").addEventListener("click", () => {
  if (!movingPageId || !moveTarget) return;
  const id = movingPageId;
  const target = { ...moveTarget };
  const label = moveTargetLabel(target);
  movePageTo(state, id, target);
  if (target.section === "teamspace") {
    state.collapsedTeamspaces = state.collapsedTeamspaces.filter((item) => item !== target.teamspaceId);
  }
  closeMoveModal();
  persist();
  renderAll({ scrollTop: false });
  toast(`Page moved to ${label || "Private"}`);
  openPage(id, { scrollTop: false });
});

function moveTargetLabel(target) {
  if (!target) return "";
  if (target.section === "private") return "Private";
  return getTeamspace(state, target.teamspaceId)?.name ?? "Teamspace";
}

$("#move-cancel").addEventListener("click", closeMoveModal);
moveModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-move]")) closeMoveModal();
});

/* ---------------- trash ---------------- */
const trashModal = $("#trash-modal");
const trashList = $("#trash-list");

function openTrash() {
  renderTrashList();
  trashModal.hidden = false;
}

function closeTrash() {
  trashModal.hidden = true;
}

function renderTrashList() {
  const pages = trashedPages(state);
  trashList.innerHTML = "";

  if (!pages.length) {
    const empty = document.createElement("div");
    empty.className = "trash-empty";
    empty.textContent = "Trash is empty. Deleted pages will show up here.";
    trashList.appendChild(empty);
    return;
  }

  for (const page of pages) {
    const teamspace = page.teamspaceId ? getTeamspace(state, page.teamspaceId) : null;
    const location = teamspace ? teamspace.name : "Private";
    const deleted = new Date(page.trashedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });

    const item = document.createElement("div");
    item.className = "trash-item";
    item.innerHTML = `
      <span class="trash-item__icon">${page.icon || "📄"}</span>
      <span class="trash-item__main">
        <strong>${escapeHtml(page.title || "Untitled")}</strong>
        <span>${escapeHtml(location)} · deleted ${escapeHtml(deleted)}</span>
      </span>`;
    const actions = document.createElement("span");
    actions.className = "trash-item__actions";

    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "Restore";
    restore.addEventListener("click", () => {
      restorePage(state, page.id);
      persist();
      renderAll({ scrollTop: false });
      syncUrl("replace");
      renderTrashList();
      toast("Page restored");
    });

    const purge = document.createElement("button");
    purge.type = "button";
    purge.className = "danger";
    purge.textContent = "Delete";
    purge.addEventListener("click", () => {
      if (!window.confirm(`Delete "${page.title || "Untitled"}" forever?`)) return;
      purgePage(state, page.id);
      ensureValidView(state);
      persist();
      renderAll({ scrollTop: false });
      syncUrl("replace");
      renderTrashList();
      toast("Page deleted forever");
    });

    actions.append(restore, purge);
    item.appendChild(actions);
    trashList.appendChild(item);
  }
}

$("#empty-trash").addEventListener("click", () => {
  if (!trashedPages(state).length) {
    toast("Trash is already empty");
    return;
  }
  if (!window.confirm("Delete everything in the trash forever?")) return;
  emptyTrash(state);
  ensureValidView(state);
  persist();
  renderAll({ scrollTop: false });
  syncUrl("replace");
  renderTrashList();
  toast("Trash emptied");
});

$("#trash-close").addEventListener("click", closeTrash);
$("#trash-done").addEventListener("click", closeTrash);
trashModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-trash]")) closeTrash();
});

/* ---------------- export ---------------- */
function exportMarkdown(page) {
  const lines = [`# ${page.title || "Untitled"}`, ""];
  for (const block of page.blocks) {
    const text = stripHtml(block.text);
    switch (block.type) {
      case "h1":
        lines.push(`# ${text}`, "");
        break;
      case "h2":
        lines.push(`## ${text}`, "");
        break;
      case "h3":
        lines.push(`### ${text}`, "");
        break;
      case "bulleted":
        lines.push(`${"  ".repeat(block.level || 0)}- ${text}`);
        break;
      case "numbered":
        lines.push(`${"  ".repeat(block.level || 0)}1. ${text}`);
        break;
      case "todo":
        lines.push(`- [${block.checked ? "x" : " "}] ${text}`);
        break;
      case "quote":
        lines.push(`> ${text}`, "");
        break;
      case "callout":
        lines.push(`> ${block.emoji || "💡"} ${text}`, "");
        break;
      case "toggle":
        lines.push(`**${text}**`);
        if (block.body) lines.push(stripHtml(block.body), "");
        break;
      case "toggleh1":
      case "toggleh2":
      case "toggleh3": {
        const hash = "#".repeat(Number(block.type.slice(-1)) || 1);
        lines.push(`${hash} ${text}`, "");
        if (block.body) lines.push(stripHtml(block.body), "");
        break;
      }
      case "table":
        if (Array.isArray(block.rows) && block.rows.length) {
          const [header, ...rows] = block.rows;
          lines.push(`| ${header.join(" | ")} |`);
          lines.push(`| ${header.map(() => "---").join(" | ")} |`);
          for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
          lines.push("");
        }
        break;
      case "database":
        if (Array.isArray(block.properties) && Array.isArray(block.rows)) {
          lines.push(`| ${block.properties.map((property) => property.name).join(" | ")} |`);
          lines.push(`| ${block.properties.map(() => "---").join(" | ")} |`);
          for (const row of block.rows) {
            lines.push(
              `| ${block.properties
                .map((property) => String(row.cells?.[property.id] ?? ""))
                .join(" | ")} |`
            );
          }
          lines.push("");
        }
        break;
      case "synced": {
        const synced = state.syncedBlocks?.[block.syncId];
        lines.push(stripHtml(synced?.text ?? block.text ?? ""), "");
        break;
      }
      case "columns2":
      case "columns3":
      case "columns4":
      case "columns5":
        lines.push((block.columns || []).map((column) => stripHtml(column)).join("\n\n---\n\n"), "");
        break;
      case "math":
        lines.push("$$", text, "$$", "");
        break;
      case "toc":
        break;
      case "pagelink": {
        const target = getPage(state, block.pageId);
        if (target) {
          lines.push(`[${target.title || "Untitled"}](${location.origin}/p/${target.slug})`, "");
        }
        break;
      }
      case "page": {
        const target = getPage(state, block.pageId);
        if (target) {
          lines.push(`[📄 ${target.title || "Untitled"}](${location.origin}/p/${target.slug})`, "");
        }
        break;
      }
      case "breadcrumb": {
        const chain = pageBreadcrumb(state, page);
        lines.push(`Path: ${chain.map((item) => item.title || "Untitled").join(" / ")}`, "");
        break;
      }
      case "button":
        lines.push(`[${block.label || "Button"}](${block.url || "#"})`, "");
        break;
      case "template":
        lines.push(`**${block.label || "Template"}**`, "");
        for (const row of block.template || []) {
          const rowText = stripHtml(row.text || "");
          if (row.type === "bulleted") lines.push(`- ${rowText}`);
          else if (row.type === "todo") lines.push(`- [ ] ${rowText}`);
          else lines.push(rowText);
        }
        lines.push("");
        break;
      case "date":
        lines.push(text, "");
        break;
      case "image":
        if (block.src && !String(block.src).startsWith("data:")) {
          lines.push(`![${stripHtml(block.caption)}](${block.src})`, "");
        }
        break;
      case "video":
      case "audio": {
        const mediaSrc = block.src || block.url;
        if (mediaSrc && !String(mediaSrc).startsWith("data:")) {
          const kind = block.type === "video" ? "🎬" : "🎵";
          lines.push(
            `${kind} [${stripHtml(block.caption) || block.url || "media"}](${mediaSrc})`,
            ""
          );
        }
        break;
      }
      case "file":
        if (block.file?.url) {
          lines.push(`[🗂 ${block.file.name || "File"}](${block.file.url})`, "");
        }
        break;
      case "attachment":
        if (block.attachment?.id) {
          lines.push(
            `[📎 ${block.attachment.name || "Attachment"}](/api/attachments/${block.attachment.id})`,
            ""
          );
        }
        break;
      case "embed":
      case "bookmark":
        if (block.url) lines.push(`[${block.title || block.url}](${block.url})`, "");
        break;
      case "code":
        lines.push("```" + (block.language || ""), stripHtml(block.text), "```", "");
        break;
      case "divider":
        lines.push("---", "");
        break;
      default:
        lines.push(text, "");
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(page.title || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
  link.click();
  URL.revokeObjectURL(url);
  toast("Exported as markdown");
}

/* ---------------- search ---------------- */
const searchModal = $("#search-modal");
const searchInput = $("#search-input");
const searchResultsEl = $("#search-results");
let searchMatches = [];
let searchIndex = 0;

function openSearch() {
  searchModal.hidden = false;
  searchInput.value = "";
  renderSearch("");
  setTimeout(() => searchInput.focus(), 10);
}

function closeSearch() {
  searchModal.hidden = true;
}

function searchSnippet(page, query) {
  if (!query) return "";
  const text = pageRawText(page);
  const index = text.toLowerCase().indexOf(query);
  if (index < 0) return "";
  const start = Math.max(0, index - 34);
  const end = Math.min(text.length, index + query.length + 52);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function highlightFuzzy(label, positions) {
  const source = String(label ?? "");
  if (!positions?.length) return escapeHtml(source);
  const marks = new Set(positions);
  let out = "";
  for (let index = 0; index < source.length; index += 1) {
    const char = escapeHtml(source[index]);
    out += marks.has(index) ? `<mark>${char}</mark>` : char;
  }
  return out;
}

function renderSearch(query) {
  const q = query.trim();
  searchMatches = [];
  searchIndex = 0;
  searchResultsEl.innerHTML = "";

  const teamspaceHits = fuzzyRank(q, state.teamspaces.map((teamspace) => ({
    id: teamspace.id,
    label: teamspace.name || "Untitled teamspace",
    keywords: [teamspace.description || ""],
    item: teamspace,
  })));

  const pageHits = fuzzyRank(q, livePages(state).map((page) => ({
    id: page.id,
    label: page.title || "Untitled",
    keywords: [pageRawText(page).slice(0, 400)],
    weight: 2,
    item: page,
  })));

  const trashHits = fuzzyRank(q, trashedPages(state).map((page) => ({
    id: page.id,
    label: page.title || "Untitled",
    item: page,
    trashed: true,
  })));

  const groups = [
    { kind: "teamspace", label: "TEAMSPACES", hits: teamspaceHits },
    { kind: "page", label: "PAGES", hits: pageHits },
    { kind: "trash", label: "TRASH", hits: trashHits },
  ];

  for (const group of groups) {
    if (!group.hits.length) continue;
    const heading = document.createElement("div");
    heading.className = "search-group";
    heading.textContent = group.label;
    searchResultsEl.appendChild(heading);

    for (const hit of group.hits.slice(0, group.kind === "page" ? 12 : 6)) {
      const item = hit.item;
      const index = searchMatches.length;
      searchMatches.push({ kind: group.kind, item, positions: hit.positions });
      const button = document.createElement("button");
      button.className = `search-result${index === 0 ? " is-active" : ""}`;
      button.dataset.searchIndex = String(index);

      if (group.kind === "teamspace") {
        const snippet = q && item.description ? item.description : "";
        button.innerHTML = `
          <span class="search-result__icon">${item.icon || "🚀"}</span>
          <span class="search-result__text">
            <span class="search-result__label">${highlightFuzzy(item.name, hit.positions)}</span>
            ${snippet ? `<span class="search-result__snippet">${escapeHtml(snippet)}</span>` : ""}
          </span>
          <span class="search-result__path">Teamspace</span>`;
      } else {
        const teamspace = item.teamspaceId ? getTeamspace(state, item.teamspaceId) : null;
        const snippet = searchSnippet(item, q.toLowerCase());
        button.innerHTML = `
          <span class="search-result__icon">${item.icon || "📄"}</span>
          <span class="search-result__text">
            <span class="search-result__label">${highlightFuzzy(item.title || "Untitled", hit.positions)}</span>
            ${snippet ? `<span class="search-result__snippet">${escapeHtml(snippet)}</span>` : ""}
          </span>
          <span class="search-result__path">${
            group.kind === "trash" ? "In trash" : escapeHtml(teamspace?.name || "Private")
          }</span>`;
      }

      button.addEventListener("click", () => {
        closeSearch();
        if (group.kind === "teamspace") openTeamspace(item.id);
        else if (group.kind === "trash") {
          openTrash();
          toast("This page is in the trash — restore it to open");
        } else openPage(item.id);
      });
      searchResultsEl.appendChild(button);
    }
  }

  if (!searchMatches.length) {
    searchResultsEl.innerHTML = '<div class="search__empty">Nothing found. Try a different search.</div>';
  }
}

function updateSearchSelection() {
  const buttons = [...searchResultsEl.querySelectorAll(".search-result")];
  buttons.forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.searchIndex) === searchIndex);
  });
  searchResultsEl
    .querySelector(`[data-search-index="${searchIndex}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

searchInput.addEventListener("input", () => renderSearch(searchInput.value));

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    searchIndex = Math.min(searchMatches.length - 1, searchIndex + 1);
    updateSearchSelection();
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    searchIndex = Math.max(0, searchIndex - 1);
    updateSearchSelection();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const match = searchMatches[searchIndex];
    if (!match) return;
    closeSearch();
    if (match.kind === "teamspace") openTeamspace(match.item.id);
    else openPage(match.item.id);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeSearch();
  }
});

searchModal.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-modal]")) closeSearch();
});

/* ---------------- find in page ---------------- */
const findBar = $("#find-bar");
const findInput = $("#find-input");
const findCount = $("#find-count");
let findHits = 0;
let findPosition = 0;

function openFind() {
  if (state.activeView.type !== "page") {
    toast("Find is available on pages");
    return;
  }
  if (commentsOpen) closeComments();
  findBar.hidden = false;
  findInput.value = "";
  findHits = 0;
  findPosition = 0;
  findCount.textContent = "0/0";
  updateFindCount();
  setTimeout(() => {
    findInput.focus();
    findInput.select();
  }, 20);
}

function closeFind() {
  findBar.hidden = true;
}

function updateFindCount() {
  const query = findInput.value.trim().toLowerCase();
  const page = currentPage();
  if (!query || !page) {
    findHits = 0;
    findPosition = 0;
    findCount.textContent = "0/0";
    return;
  }
  const haystack = pageRawText(page).toLowerCase();
  let count = 0;
  let index = haystack.indexOf(query);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(query, index + query.length);
  }
  findHits = count;
  findPosition = count ? 1 : 0;
  findCount.textContent = `${findPosition}/${count}`;
}

function findStep(backwards = false) {
  const query = findInput.value.trim();
  if (!query) return;
  updateFindCount();
  if (!findHits) {
    toast("No matches on this page");
    return;
  }
  if (typeof window.find === "function") {
    window.find(query, false, backwards, true, false, false, false);
  } else {
    const page = currentPage();
    const block = page?.blocks.find((item) => blockPlainText(item).toLowerCase().includes(query.toLowerCase()));
    if (block) editor.scrollToBlock(block.id);
  }
  findPosition = backwards
    ? ((findPosition - 2 + findHits) % findHits) + 1
    : (findPosition % findHits) + 1;
  findCount.textContent = `${findPosition}/${findHits}`;
}

findInput.addEventListener("input", updateFindCount);
findInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    findStep(event.shiftKey);
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeFind();
  }
});
$("#find-next").addEventListener("click", () => findStep(false));
$("#find-prev").addEventListener("click", () => findStep(true));
$("#find-close").addEventListener("click", closeFind);

/* ---------------- global shortcuts + outside clicks ---------------- */
document.addEventListener("keydown", (event) => {
  const mod = event.metaKey || event.ctrlKey;
  const target = event.target;
  const isElement = target instanceof Element;
  const typingField = isElement && target.matches("input, textarea");
  const typingContent = typingField || (isElement && target.isContentEditable);

  if (!typingContent && !mod && event.key === "?") {
    event.preventDefault();
    shortcuts.open();
    return;
  }

  if (mod && event.shiftKey && !typingField && event.key.toLowerCase() === "p") {
    event.preventDefault();
    if (commandPalette.isOpen()) commandPalette.close();
    else commandPalette.open();
    return;
  }

  if (mod && !typingField && (event.key === "/" || event.key === "?")) {
    event.preventDefault();
    shortcuts.open();
    return;
  }

  if (mod && !typingField && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }

  if (mod && !typingField && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
    return;
  }

  if (mod && event.key.toLowerCase() === "f") {
    event.preventDefault();
    openFind();
    return;
  }

  if (mod && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openSearch();
    return;
  }

  if (mod && event.key.toLowerCase() === "j") {
    event.preventDefault();
    createPrivatePage();
    return;
  }

  if (mod && event.shiftKey && event.key.toLowerCase() === "n") {
    event.preventDefault();
    openTeamspaceModal(null);
    return;
  }

  if (mod && event.shiftKey && event.key.toLowerCase() === "t") {
    event.preventDefault();
    openTemplates();
    return;
  }

  if (mod && event.shiftKey && event.key.toLowerCase() === "d") {
    event.preventDefault();
    toggleTheme();
    return;
  }

  if (mod && event.shiftKey && event.key.toLowerCase() === "l") {
    event.preventDefault();
    toggleSidebar();
    return;
  }

  if (mod && event.shiftKey && event.key.toLowerCase() === "b") {
    event.preventDefault();
    if (commentsOpen) closeComments();
    else openComments();
    return;
  }

  if (event.key === "Escape") {
    closeSearch();
    closeTeamspaceModal();
    closeMoveModal();
    closeTrash();
    closeShare();
    closeTemplates();
    closeSettings();
    closeComments();
    closeHistory();
    closeFind();
    if (commandPalette.isOpen()) commandPalette.close();
    if (shortcuts.isOpen()) shortcuts.close();
    if (onboarding.isOpen()) onboarding.close();
    iconPicker.hidden = true;
    coverPicker.hidden = true;
    pageMenu.hidden = true;
    teamspaceMenu.hidden = true;
    $("#block-menu").hidden = true;
  }
});

document.addEventListener("mousedown", (event) => {
  if (event.target.closest(".popover")) return;
  iconPicker.hidden = true;
  coverPicker.hidden = true;
  pageMenu.hidden = true;
  teamspaceMenu.hidden = true;
});

/* ---------------- theme / sidebar toggles ---------------- */
function toggleTheme() {
  const next = state.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  saveState(state);
  toast(next === "dark" ? "Dark mode on" : "Light mode on");
}

function toggleSidebar() {
  const mobile = window.matchMedia("(max-width: 860px)").matches;
  if (mobile) {
    const open = app.classList.toggle("sidebar-open");
    sidebarScrim.hidden = !open;
    return;
  }
  const collapsed = app.classList.toggle("sidebar-collapsed");
  toast(collapsed ? "Sidebar collapsed" : "Sidebar expanded");
}

import {
  createCommandPalette,
  createOnboarding,
  createShortcutSheet,
} from "./overlays.js";

/* ---------------- command palette / shortcuts / onboarding ---------------- */
const COMMANDS = [
  { id: "search", group: "Navigate", label: "Search pages, teamspaces, and trash", icon: "🔍", shortcut: "Mod+K", keywords: ["find", "goto"], run: () => openSearch() },
  { id: "palette", group: "Navigate", label: "Open the command palette", icon: "⌘", shortcut: "Mod+Shift+P", keywords: ["commands", "actions"], run: () => commandPalette.open() },
  { id: "shortcuts", group: "Help", label: "Show every keyboard shortcut", icon: "⌨️", shortcut: "Mod+/", keywords: ["keys", "help", "reference"], run: () => shortcuts.open() },
  { id: "tour", group: "Help", label: "Restart the welcome tour", icon: "👋", keywords: ["onboarding", "intro", "help"], run: () => onboarding.open(true) },

  { id: "new-page", group: "Create", label: "New private page", icon: "📄", shortcut: "Mod+J", keywords: ["add", "create"], run: () => createPrivatePage() },
  { id: "new-teamspace", group: "Create", label: "New teamspace", icon: "🚀", shortcut: "Mod+Shift+N", keywords: ["create", "team"], run: () => openTeamspaceModal(null) },
  { id: "template", group: "Create", label: "Start from a template", icon: "🧩", shortcut: "Mod+Shift+T", keywords: ["starter", "new"], run: () => openTemplates() },

  { id: "theme", group: "View", label: "Toggle dark mode", icon: "🌙", shortcut: "Mod+Shift+D", keywords: ["theme", "appearance"], run: () => toggleTheme() },
  { id: "sidebar", group: "View", label: "Toggle the sidebar", icon: "📂", shortcut: "Mod+Shift+L", keywords: ["panel", "hide"], run: () => toggleSidebar() },
  { id: "comments", group: "View", label: "Toggle comments", icon: "💬", shortcut: "Mod+Shift+B", keywords: ["discussion", "thread"], run: () => (commentsOpen ? closeComments() : openComments()) },
  { id: "find", group: "View", label: "Find in this page", icon: "🔎", shortcut: "Mod+F", keywords: ["search text"], run: () => openFind() },

  { id: "undo", group: "Edit", label: "Undo", icon: "↩", shortcut: "Mod+Z", keywords: ["revert"], run: () => undo() },
  { id: "redo", group: "Edit", label: "Redo", icon: "↪", shortcut: "Mod+Shift+Z", keywords: ["repeat"], run: () => redo() },
  { id: "copy-link", group: "Edit", label: "Copy a share link to this page", icon: "🔗", keywords: ["share", "url"], run: () => openShare() },
  { id: "share-people", group: "Edit", label: "Share this page with people", icon: "??", keywords: ["invite", "members", "access"], run: () => openSharePeople() },
  { id: "export", group: "Edit", label: "Export this page as Markdown", icon: "⬇", keywords: ["download", "md"], run: () => { const page = currentPage(); if (page) exportMarkdown(page); else toast("Open a page first"); } },
  { id: "version-history", group: "Edit", label: "Open version history", icon: "🕘", keywords: ["restore", "history"], run: () => { const page = currentPage(); if (page) openHistory(page); else toast("Open a page first"); } },

  { id: "trash", group: "Workspace", label: "Open the trash", icon: "🗑", keywords: ["deleted", "bin"], run: () => openTrash() },
  { id: "settings", group: "Workspace", label: "Open workspace settings", icon: "⚙", keywords: ["preferences", "profile"], run: () => openSettings() },
  { id: "full-width", group: "Workspace", label: "Toggle full width", icon: "↔", keywords: ["layout"], run: () => runPageAction("fullwidth") },
  { id: "small-text", group: "Workspace", label: "Toggle small text", icon: "🔡", keywords: ["layout", "compact"], run: () => runPageAction("smalltext") },
  { id: "lock", group: "Workspace", label: "Lock or unlock this page", icon: "🔒", keywords: ["read only", "readonly"], run: () => runPageAction("lock") },
  { id: "duplicate", group: "Workspace", label: "Duplicate this page", icon: "⧉", keywords: ["copy"], run: () => runPageAction("duplicate") },
  { id: "delete", group: "Workspace", label: "Move this page to trash", icon: "🗑", keywords: ["remove", "delete"], run: () => runPageAction("delete") },
  { id: "rename", group: "Workspace", label: "Rename this page", icon: "✎", keywords: ["title"], run: () => runPageAction("rename") },
  { id: "favorite", group: "Workspace", label: "Toggle favorite", icon: "⭐", keywords: ["star", "pin"], run: () => runPageAction("favorite") },
  { id: "logout", group: "Workspace", label: "Log out", icon: "↩", keywords: ["sign out", "exit"], run: () => { clearSession(); window.location.replace("index.html"); } },
];

const commandPalette = createCommandPalette({
  modal: $("#command-modal"),
  input: $("#command-input"),
  results: $("#command-results"),
  commands: COMMANDS,
  onRun: (command) => {
    try {
      command.run();
    } catch (error) {
      toast(error.message || "That command failed");
    }
  },
});

const shortcuts = createShortcutSheet({
  modal: $("#shortcuts-modal"),
  grid: $("#shortcut-grid"),
  closeButton: $("#shortcuts-close"),
});

const onboarding = createOnboarding({
  modal: $("#onboarding-modal"),
  progress: $("#onboarding-progress"),
  art: $("#onboarding-art"),
  title: $("#onboarding-title"),
  text: $("#onboarding-text"),
  points: $("#onboarding-points"),
  keys: $("#onboarding-keys"),
  back: $("#onboarding-back"),
  next: $("#onboarding-next"),
  skip: $("#onboarding-skip"),
});

function runPageAction(action) {
  const page = currentPage();
  if (!page) {
    toast("Open a page first");
    return;
  }
  const button = pageMenu.querySelector(`[data-page-action="${action}"]`);
  if (!button) {
    toast("That action is not available on this page");
    return;
  }
  button.click();
}

function maybeStartOnboarding() {
  if (state.onboarded) return;
  state.onboarded = true;
  saveState(state);
  setTimeout(() => onboarding.open(true), 500);
}

/* ---------------- click below ---------------- */
$("#click-below").addEventListener("click", () => {
  const page = currentPage();
  if (!page) return;
  if (!requireUnlocked(page)) return;
  const block = createBlock("paragraph");
  page.blocks.push(block);
  persist({ sidebar: false, topbar: false });
  editor.render(page);
  editor.focusBlock(block.id, "start");
});

/* ---------------- boot ---------------- */
window.addEventListener("popstate", () => {
  const route = routeFromLocation();
  if (!route) return;
  const applied = applyRoute(route);
  if (applied) {
    persist();
    renderAll();
    return;
  }
  ensureValidView(state);
  persist();
  renderAll();
  syncUrl("replace");
  toast("That link doesn't point to a page or teamspace");
});

async function start() {
  await detectMode();

  if (isServer()) {
    try {
      await hydrateFromServer();

      /* ?realtime=off keeps the stream closed — used by the browser harness so
         Chrome can finish loading instead of holding an open connection. */
      if (new URLSearchParams(window.location.search).get("realtime") !== "off") {
        connectRealtime({
          "page:updated": (payload) => {
            if (!payload?.page) return;
            const page = getPage(state, payload.page.id);
            if (!page) return;
            Object.assign(page, payload.page);
            persist({ sidebar: false, topbar: false });
            renderSidebar();
          },
          "presence:update": (payload) => {
            if (Array.isArray(payload?.presence) && payload.presence.length) {
              const count = payload.presence.length;
              toast(`${count} ${count === 1 ? "person is" : "people are"} here`);
            }
          },
        });
      }
    } catch (error) {
      if (error?.status === 401) {
        window.location.replace("index.html");
        return;
      }
      toast("Working offline — changes stay in this browser");
    }
  }

  applyTheme(state.theme === "dark" ? "dark" : "light");
  const route = routeFromLocation();
  const applied = route ? applyRoute(route) : null;
  ensureValidView(state);
  const active = currentPage();
  if (active) ensurePageBlocks(active);
  updateUser();
  renderAll({ scrollTop: false });
  persist({ sidebar: true, topbar: true });
  syncUrl("replace");
  historyReady = true;
  recordHistoryNow();
  if (route && applied === false) {
    toast("That link doesn't point to a page or teamspace");
  }
  maybeStartOnboarding();
}

if (session) {
  start();
} else {
  window.location.replace("index.html");
}
