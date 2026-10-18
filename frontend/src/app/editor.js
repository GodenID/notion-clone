import { createBlock } from "./store.js";
import katex from "../../vendor/katex/katex.mjs";
import {
  buildDatabasePanel,
  buildFiltersPanel,
  buildPropertyMenu,
  buildViewMenu,
  currentView as databaseView,
  ensureDatabase,
  propertyById as databaseProperty,
} from "./database-view.js";
import {
  emptyCell,
  FORMULA_FUNCTION_NAMES,
  makeDefaultProperty,
  makeRow,
  PROPERTY_TYPES,
  STATUS_GROUPS,
  uid as dbUid,
} from "./database.js";
import { CODE_LANGUAGES, LANGUAGE_LABELS, highlightCode, normalizeLanguage } from "./highlight.js";

export const BLOCK_CATEGORIES = [
  { id: "basic", label: "Basic blocks" },
  { id: "media", label: "Media" },
  { id: "database", label: "Database" },
  { id: "advanced", label: "Advanced" },
];

export const BLOCK_DEFS = [
  /* basic */
  { type: "paragraph", category: "basic", label: "Text", desc: "Just start writing with plain text.", icon: "¶", keywords: "text paragraph plain" },
  { type: "h1", category: "basic", label: "Heading 1", desc: "Big section heading.", icon: "H1", keywords: "title heading h1" },
  { type: "h2", category: "basic", label: "Heading 2", desc: "Medium section heading.", icon: "H2", keywords: "heading h2 subtitle" },
  { type: "h3", category: "basic", label: "Heading 3", desc: "Small section heading.", icon: "H3", keywords: "heading h3" },
  { type: "toggleh1", category: "basic", label: "Toggle heading 1", desc: "Big heading that folds away.", icon: "▸H1", keywords: "toggle heading collapse h1" },
  { type: "toggleh2", category: "basic", label: "Toggle heading 2", desc: "Medium heading that folds away.", icon: "▸H2", keywords: "toggle heading collapse h2" },
  { type: "toggleh3", category: "basic", label: "Toggle heading 3", desc: "Small heading that folds away.", icon: "▸H3", keywords: "toggle heading collapse h3" },
  { type: "bulleted", category: "basic", label: "Bulleted list", desc: "Create a simple bulleted list.", icon: "•", keywords: "bullet list unordered" },
  { type: "numbered", category: "basic", label: "Numbered list", desc: "Create a list with numbering.", icon: "1.", keywords: "number list ordered" },
  { type: "todo", category: "basic", label: "To-do list", desc: "Track tasks with a checkbox.", icon: "☑", keywords: "todo task checkbox" },
  { type: "toggle", category: "basic", label: "Toggle list", desc: "Collapse details into a toggle.", icon: "▸", keywords: "toggle collapse details" },
  { type: "quote", category: "basic", label: "Quote", desc: "Capture a quote.", icon: "❝", keywords: "quote blockquote" },
  { type: "callout", category: "basic", label: "Callout", desc: "Make writing stand out.", icon: "✦", keywords: "callout note info" },
  { type: "divider", category: "basic", label: "Divider", desc: "Visually divide blocks.", icon: "—", keywords: "divider line hr separator" },
  { type: "breadcrumb", category: "basic", label: "Breadcrumb", desc: "Show where this page lives.", icon: "»", keywords: "breadcrumb path parent location trail" },

  /* media */
  { type: "image", category: "media", label: "Image", desc: "Upload or embed an image.", icon: "🖼", keywords: "image photo picture upload" },
  { type: "video", category: "media", label: "Video", desc: "Upload a video or embed YouTube, Vimeo, Loom.", icon: "🎬", keywords: "video movie upload youtube vimeo loom embed" },
  { type: "audio", category: "media", label: "Audio", desc: "Upload or embed an audio file.", icon: "🎵", keywords: "audio sound music mp3 voice note" },
  { type: "file", category: "media", label: "File", desc: "Upload any file and share it.", icon: "🗂", keywords: "file upload document attachment zip pdf" },
  { type: "embed", category: "media", label: "Embed", desc: "Figma, CodePen, Maps, Loom, Spotify, and more.", icon: "🧩", keywords: "embed figma codepen maps loom spotify iframe integration" },
  { type: "attachment", category: "media", label: "Attachment", desc: "Upload a PDF, Word, CSV, or Excel file.", icon: "📎", keywords: "attachment file upload document pdf word doc docx csv excel xls xlsx" },
  { type: "bookmark", category: "media", label: "Bookmark", desc: "Save a link as a card.", icon: "🔖", keywords: "bookmark link url card" },
  { type: "code", category: "media", label: "Code", desc: "Capture a code snippet.", icon: "</>", keywords: "code snippet pre" },
  { type: "math", category: "media", label: "Equation", desc: "Write a LaTeX-style equation.", icon: "∑", keywords: "math equation latex formula" },

  /* database */
  { type: "table", category: "database", label: "Table", desc: "A simple editable table.", icon: "▦", keywords: "table grid rows cells" },
  { type: "database-table", category: "database", label: "Table view", desc: "Database with rows and properties.", icon: "▦", keywords: "database table view rows properties" },
  { type: "database-board", category: "database", label: "Board view", desc: "Group rows into columns by status.", icon: "▤", keywords: "database board kanban group view" },
  { type: "database-gallery", category: "database", label: "Gallery view", desc: "Rows as cards in a grid.", icon: "▣", keywords: "database gallery cards grid view" },
  { type: "database-list", category: "database", label: "List view", desc: "Compact one-line row list.", icon: "≣", keywords: "database list compact rows view" },
  { type: "database-calendar", category: "database", label: "Calendar view", desc: "Rows placed on a month grid.", icon: "🗓", keywords: "database calendar month schedule view" },
  { type: "database-timeline", category: "database", label: "Timeline view", desc: "Rows as bars across a schedule.", icon: "⏳", keywords: "database timeline gantt schedule bar view" },
  { type: "database-linked", category: "database", label: "Linked database", desc: "Mirror rows from another database.", icon: "⇄", keywords: "linked database relation mirror sync view" },

  /* advanced */
  { type: "pagelink", category: "advanced", label: "Link to page", desc: "Link another page and create backlinks.", icon: "↗", keywords: "page link mention backlink" },
  { type: "page", category: "advanced", label: "Page", desc: "Create a sub-page inside this page.", icon: "📄", keywords: "page subpage child nested create" },
  { type: "synced", category: "advanced", label: "Synced block", desc: "Edit once; every copy updates.", icon: "⇄", keywords: "synced sync block copy" },
  { type: "button", category: "advanced", label: "Button", desc: "A clickable call-to-action link.", icon: "🔘", keywords: "button cta action link call to action" },
  { type: "template", category: "advanced", label: "Template button", desc: "Insert a reusable block template.", icon: "🧱", keywords: "template button snippet insert repeat" },
  { type: "columns2", category: "advanced", label: "2 columns", desc: "Split content into two columns.", icon: "◫", keywords: "columns layout two side by side" },
  { type: "columns3", category: "advanced", label: "3 columns", desc: "Split content into three columns.", icon: "◨", keywords: "columns layout three side by side" },
  { type: "columns4", category: "advanced", label: "4 columns", desc: "Split content into four columns.", icon: "◩", keywords: "columns layout four side by side" },
  { type: "columns5", category: "advanced", label: "5 columns", desc: "Split content into five columns.", icon: "◪", keywords: "columns layout five side by side" },
  { type: "toc", category: "advanced", label: "Table of contents", desc: "List every heading on this page.", icon: "☰", keywords: "toc contents headings index" },
  { type: "date", category: "advanced", label: "Date", desc: "Insert a date.", icon: "📅", keywords: "date calendar today" },
];

const COLUMN_COUNTS = { columns2: 2, columns3: 3, columns4: 4, columns5: 5 };
const TOGGLE_HEADINGS = { toggleh1: "h1", toggleh2: "h2", toggleh3: "h3" };
const DATABASE_VIEW_DEFS = {
  "database-table": "table",
  "database-board": "board",
  "database-gallery": "gallery",
  "database-list": "list",
  "database-calendar": "calendar",
  "database-timeline": "timeline",
};
const DATABASE_VIEW_TYPES = ["table", "board", "gallery", "list", "calendar", "timeline"];

export const BLOCK_COLORS = [
  { id: "", label: "Default", swatch: "transparent" },
  { id: "gray", label: "Gray", swatch: "#9b9a97" },
  { id: "brown", label: "Brown", swatch: "#9f6b53" },
  { id: "orange", label: "Orange", swatch: "#d9730d" },
  { id: "yellow", label: "Yellow", swatch: "#cb912f" },
  { id: "green", label: "Green", swatch: "#448361" },
  { id: "blue", label: "Blue", swatch: "#337ea9" },
  { id: "purple", label: "Purple", swatch: "#9065b0" },
  { id: "pink", label: "Pink", swatch: "#c14c8a" },
  { id: "red", label: "Red", swatch: "#d44c47" },
];

const LIST_TYPES = new Set(["bulleted", "numbered", "todo"]);
const CONTINUATION = { bulleted: "bulleted", numbered: "numbered", todo: "todo", quote: "quote" };
const PLACEHOLDER = {
  paragraph: "Type '/' for commands",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  toggleh1: "Toggle heading 1",
  toggleh2: "Toggle heading 2",
  toggleh3: "Toggle heading 3",
  bulleted: "List",
  numbered: "List",
  todo: "To-do",
  toggle: "Toggle",
  quote: "Empty quote",
  callout: "Type '/' for commands",
  code: "",
  math: "E = mc^2",
  table: "",
};

const ALLOWED_PASTE_TAGS = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "STRIKE",
  "CODE",
  "BR",
  "SPAN",
  "MARK",
  "A",
]);
const DROPPED_PASTE_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "IMG",
  "SVG",
  "MATH",
  "FORM",
  "INPUT",
  "BUTTON",
  "TEXTAREA",
  "SELECT",
]);

const ATTACHMENT_EXTENSIONS = new Set([".pdf", ".doc", ".docx", ".csv", ".xls", ".xlsx"]);
const ATTACHMENT_LABELS = {
  ".pdf": "PDF",
  ".doc": "Word",
  ".docx": "Word",
  ".csv": "CSV",
  ".xls": "Excel",
  ".xlsx": "Excel",
};
const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

function attachmentExtension(name) {
  const value = String(name || "");
  const dot = value.lastIndexOf(".");
  return dot > 0 ? value.slice(dot).toLowerCase() : "";
}

const MEDIA_KINDS = {
  "image/": "image",
  "video/": "video",
  "audio/": "audio",
};

function mediaKind(mime, name) {
  const mimeValue = String(mime || "").toLowerCase();
  for (const prefix of Object.keys(MEDIA_KINDS)) {
    if (mimeValue.startsWith(prefix)) return MEDIA_KINDS[prefix];
  }
  const ext = attachmentExtension(name);
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"].includes(ext)) return "image";
  if ([".mp4", ".webm", ".ogv", ".mov", ".m4v"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".ogg", ".oga", ".m4a", ".aac", ".flac"].includes(ext)) return "audio";
  return "file";
}

function mediaIcon(kind, name) {
  if (kind === "image") return "🖼";
  if (kind === "video") return "🎬";
  if (kind === "audio") return "🎵";
  return attachmentIcon(attachmentExtension(name)) || "📁";
}

function isLocalMediaUrl(value) {
  return /^\/api\/media\/[0-9a-f-]{36}/i.test(String(value || ""));
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentIcon(ext) {
  if (ext === ".pdf") return "📕";
  if (ext === ".csv") return "📄";
  if (ext === ".xls" || ext === ".xlsx") return "📊";
  return "📘";
}

function startsWithBytes(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

async function preflightAttachment(file) {
  const ext = attachmentExtension(file.name);
  if (!ATTACHMENT_EXTENSIONS.has(ext)) {
    return "Only PDF, Word (.doc/.docx), CSV, and Excel (.xls/.xlsx) files are allowed.";
  }
  if (!file.size) return "The file is empty.";
  if (file.size > ATTACHMENT_MAX_BYTES) return "File is too large — use one under 20 MB.";

  let head;
  try {
    head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  } catch {
    return "The file could not be read.";
  }

  if (ext === ".pdf" && !startsWithBytes(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "This is not a valid PDF file.";
  }
  if (
    (ext === ".docx" || ext === ".xlsx") &&
    !startsWithBytes(head, [0x50, 0x4b, 0x03, 0x04])
  ) {
    return "This is not a valid Word/Excel (DOCX/XLSX) file.";
  }
  if (
    (ext === ".doc" || ext === ".xls") &&
    !startsWithBytes(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  ) {
    return "This is not a valid legacy Word/Excel file.";
  }
  if (ext === ".csv") {
    if (head.includes(0)) return "CSV files must be text, not binary.";
    for (const signature of [
      [0x4d, 0x5a],
      [0x7f, 0x45, 0x4c, 0x46],
      [0x50, 0x4b, 0x03, 0x04],
      [0x25, 0x50, 0x44, 0x46, 0x2d],
      [0xd0, 0xcf, 0x11, 0xe0],
    ]) {
      if (startsWithBytes(head, signature)) return "This is not a text CSV file.";
    }
  }
  return "";
}

function safeUrl(value, { image = false } = {}) {
  const url = String(value || "").trim();
  if (image && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url)) return url;
  if (isLocalMediaUrl(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:/i.test(url)) return url;
  return "";
}

function plainText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isoToday() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function formatDateLabel(iso, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    weekday: options.weekday ? "short" : undefined,
    month: options.month ?? "short",
    day: "numeric",
    year: options.year ?? "numeric",
  });
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ""));
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const clean = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== 1) continue;
      if (DROPPED_PASTE_TAGS.has(child.tagName)) {
        child.remove();
        continue;
      }
      if (!ALLOWED_PASTE_TAGS.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attribute of [...child.attributes]) {
        const name = attribute.name.toLowerCase();
        if (child.tagName === "A" && name === "href") {
          const url = safeUrl(attribute.value);
          if (url) child.setAttribute("href", url);
          else child.removeAttribute("href");
          continue;
        }
        if (
          child.tagName === "SPAN" &&
          name === "class" &&
          attribute.value === "mention" &&
          child.dataset.mention
        ) {
          continue;
        }
        if (
          child.tagName === "SPAN" &&
          child.dataset.mention &&
          ["data-mention", "data-page-id", "data-date", "data-atomic"].includes(name)
        ) {
          continue;
        }
        child.removeAttribute(attribute.name);
      }
      if (child.tagName === "A") {
        child.setAttribute("rel", "noopener noreferrer");
        child.setAttribute("target", "_blank");
      }
      clean(child);
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export function createEditor({
  container,
  onSave,
  onToast,
  getPages,
  onOpenPage,
  onComment,
  onCommentAnchorClick,
  getSynced,
  onSyncedUpdate,
  onCreatePage,
  getMembers,
}) {
  let page = null;
  let activeBlockId = null;
  let dragId = null;
  let pendingImageBlockId = null;
  let pendingAttachmentBlockId = null;
  let pendingMediaBlockId = null;
  let pendingMediaKind = "file";
  let commentAnchors = [];

  const slashMenu = document.getElementById("slash-menu");
  const slashList = document.getElementById("slash-list");
  const slashEmpty = document.getElementById("slash-empty");
  const slashLabel = document.getElementById("slash-label");
  const blockMenu = document.getElementById("block-menu");
  const mentionMenu = document.getElementById("mention-menu");
  const mentionList = document.getElementById("mention-list");
  const mentionEmpty = document.getElementById("mention-empty");
  const inlineToolbar = document.getElementById("inline-toolbar");

  const imageFileInput = document.createElement("input");
  imageFileInput.type = "file";
  imageFileInput.accept = "image/*";
  imageFileInput.hidden = true;
  document.body.appendChild(imageFileInput);

  const attachmentFileInput = document.createElement("input");
  attachmentFileInput.type = "file";
  attachmentFileInput.accept = ".pdf,.doc,.docx,.csv,.xls,.xlsx";
  attachmentFileInput.hidden = true;
  document.body.appendChild(attachmentFileInput);

  const mediaFileInput = document.createElement("input");
  mediaFileInput.type = "file";
  mediaFileInput.hidden = true;
  document.body.appendChild(mediaFileInput);

  let slash = null; // { blockId, mode, query, index }
  let toolbarBlockId = null;
  let savedRange = null;

  /* ---------------- helpers ---------------- */
  const blockById = (id) => page?.blocks.find((block) => block.id === id) ?? null;
  const elById = (id) => container.querySelector(`[data-id="${CSS.escape(id)}"]`);
  const inputOf = (el) => el?.querySelector(".block__input") ?? null;

  function save() {
    if (page) page.updatedAt = Date.now();
    onSave?.();
  }

  function ensureDefaults(block, type) {
    if (!COLUMN_COUNTS[type]) block.level = 0;

    if (type === "callout") block.emoji = block.emoji || "💡";
    if (type === "code" && !block.language) block.language = "javascript";
    if (type === "code" && typeof block.wrap !== "boolean") block.wrap = false;
    if (type === "toggle" || TOGGLE_HEADINGS[type]) {
      block.open = block.open !== false;
      if (typeof block.body !== "string") block.body = "";
    }
    if (type === "table") {
      if (!Array.isArray(block.rows)) {
        block.rows = [
          ["Column 1", "Column 2"],
          ["", ""],
        ];
      }
      if (typeof block.headerRow !== "boolean") block.headerRow = true;
      if (typeof block.headerColumn !== "boolean") block.headerColumn = true;
      if (!block.cellColors || typeof block.cellColors !== "object") block.cellColors = {};
    }
    const columnCount = COLUMN_COUNTS[type];
    if (columnCount) {
      const current = Array.isArray(block.columns) ? block.columns : [];
      block.columns = Array.from({ length: columnCount }, (unused, index) =>
        typeof current[index] === "string" ? current[index] : ""
      );
    }
    if (type === "math" && typeof block.text !== "string") block.text = "";
    if (type === "image" && typeof block.src !== "string") block.src = "";
    if (type === "video") {
      if (typeof block.src !== "string") block.src = "";
      if (typeof block.url !== "string") block.url = "";
      if (typeof block.caption !== "string") block.caption = "";
    }
    if (type === "audio") {
      if (typeof block.src !== "string") block.src = "";
      if (typeof block.caption !== "string") block.caption = "";
    }
    if (type === "file" && block.file && typeof block.file !== "object") block.file = null;
    if (type === "attachment" && block.attachment && typeof block.attachment !== "object") {
      block.attachment = null;
    }
    if (type === "embed" && typeof block.url !== "string") block.url = "";
    if (type === "bookmark" && typeof block.url !== "string") block.url = "";
    if (type === "pagelink" && typeof block.pageId !== "string") block.pageId = "";
    if (type === "page" && typeof block.pageId !== "string") block.pageId = "";
    if (type === "button") {
      if (typeof block.label !== "string" || !block.label) block.label = "Button";
      if (typeof block.url !== "string") block.url = "";
    }
    if (type === "template") {
      if (typeof block.label !== "string" || !block.label) block.label = "Template";
      if (!Array.isArray(block.template)) block.template = defaultTemplateRows();
    }
    if (type === "breadcrumb" && typeof block.mode !== "string") block.mode = "full";
    if (type === "date" && !block.text) block.text = isoToday();
    if (type === "synced") {
      if (!block.syncId) block.syncId = createBlock().id;
      if (typeof block.text !== "string") block.text = "";
    }
    if (type === "database") {
      if (!Array.isArray(block.properties) || !block.properties.length) {
        block.properties = [
          { id: "title", name: "Name", type: "title" },
          {
            id: "status",
            name: "Status",
            type: "select",
            options: ["Not started", "In progress", "Done"],
          },
          { id: "date", name: "Date", type: "date" },
          { id: "done", name: "Done", type: "checkbox" },
        ];
      }
      if (!Array.isArray(block.views) || !block.views.length) {
        block.views = DEFAULT_DATABASE_VIEWS.map((view) => ({ ...view }));
      }
      if (!block.activeView || !block.views.some((view) => view.id === block.activeView)) {
        block.activeView = block.views[0].id;
      }
      if (!Array.isArray(block.rows)) block.rows = [];
      for (const row of block.rows) {
        if (!row.cells || typeof row.cells !== "object") row.cells = {};
        if (!row.id) row.id = createBlock().id;
      }
      if (!block.rows.length) block.rows.push(newDatabaseRow(block));
      if (typeof block.filterText !== "string") block.filterText = "";
      if (typeof block.sortProperty !== "string") block.sortProperty = "";
      if (typeof block.sortDirection !== "string") block.sortDirection = "asc";
      if (typeof block.boardGroupBy !== "string") block.boardGroupBy = "";
      if (typeof block.calendarMonth !== "string") block.calendarMonth = monthKey(new Date());
      if (typeof block.timelineStart !== "string") block.timelineStart = "";
      if (typeof block.timelineEnd !== "string") block.timelineEnd = "";
    }
  }

  function defaultTemplateRows() {
    return [
      { type: "h3", text: "New section" },
      { type: "bulleted", text: "First point" },
      { type: "bulleted", text: "Second point" },
      { type: "todo", text: "Follow-up task" },
    ];
  }

  function newDatabaseRow(block, overrides = {}) {
    const row = makeRow(block.properties || []);
    for (const property of block.properties || []) {
      if (Object.prototype.hasOwnProperty.call(overrides, property.id)) {
        row.cells[property.id] = overrides[property.id];
      }
    }
    return row;
  }

  /* ---------------- database context ---------------- */
  function allDatabases() {
    const found = [];
    for (const item of getPages?.() ?? []) {
      for (const block of item.blocks || []) {
        if (block.type !== "database" || block.linked?.dbId) continue;
        const title = (block.properties || []).find((property) => property.type === "title");
        found.push({
          id: block.id,
          label: `${item.title || "Untitled"} · ${title?.name || "Database"}`,
          block,
          page: item,
        });
      }
    }
    return found;
  }

  function findDatabaseBlock(dbId) {
    if (!dbId) return null;
    for (const item of allDatabases()) {
      if (item.id === dbId) return item.block;
    }
    return null;
  }

  function relationTargetBlock(property) {
    return findDatabaseBlock(property?.relation?.dbId);
  }

  function relationTitleProperty(block) {
    return (
      (block?.properties || []).find((property) => property.type === "title") ||
      (block?.properties || [])[0] ||
      null
    );
  }

  function databaseValueContext(block) {
    return {
      relationLabel: (property, rowId) => {
        const target = relationTargetBlock(property);
        const title = relationTitleProperty(target);
        if (!target || !title) return "";
        const row = (target.rows || []).find((item) => item.id === rowId);
        return row ? String(row.cells?.[title.id] ?? "") : "";
      },
      rollupRows: (config) => {
        const relation = (block.properties || []).find(
          (property) => property.id === config?.relationPropId && property.type === "relation"
        );
        const target = relationTargetBlock(relation);
        if (!target) return [];
        const ids = new Set();
        for (const row of block.rows || []) {
          const value = row.cells?.[relation.id];
          if (Array.isArray(value)) for (const id of value) ids.add(id);
        }
        return (target.rows || []).filter((row) => ids.has(row.id));
      },
      rollupProperty: (config) => {
        const relation = (block.properties || []).find(
          (property) => property.id === config?.relationPropId && property.type === "relation"
        );
        const target = relationTargetBlock(relation);
        return (target?.properties || []).find((property) => property.id === config?.targetPropId) || null;
      },
    };
  }

  function databaseContext(block) {
    return {
      valueContext: () => databaseValueContext(block),
      members: () => getMembers?.() ?? [],
      formulaNames: () => FORMULA_FUNCTION_NAMES,
      databases: () => allDatabases(),
      relationProperties: (property) => {
        const target = relationTargetBlock(property);
        return (target?.properties || []).filter((item) => item.type !== "rollup");
      },
      relationLabel: (property, rowId) => databaseValueContext(block).relationLabel(property, rowId),
      relationCandidates: (property) => {
        const target = relationTargetBlock(property);
        const title = relationTitleProperty(target);
        if (!target || !title) return [];
        return (target.rows || []).map((row) => ({
          id: row.id,
          label: String(row.cells?.[title.id] ?? "Untitled"),
        }));
      },
      linkedRows: (linkedBlock) => findDatabaseBlock(linkedBlock?.linked?.dbId),
    };
  }

  function buildDatabase(currentBlock) {
    return buildDatabasePanel(currentBlock, databaseContext(currentBlock));
  }

  /* ---------------- database interactions ---------------- */
  function rowById(block, rowId) {
    return (block.rows || []).find((row) => row.id === rowId) || null;
  }

  function touchRow(block, row) {
    if (!row) return;
    row.updatedAt = Date.now();
    void block;
  }

  function closeCodeLanguages() {
    container.querySelectorAll(".code-lang-picker").forEach((node) => node.remove());
  }

  function closeDatabasePanels() {
    container.querySelectorAll(".db-filters-panel, .db-prop-menu, .db-view-menu").forEach((node) => {
      node.remove();
    });
  }

  function mountDatabasePanel(block, panel, anchor) {
    closeDatabasePanels();
    const panelBlock = elById(block.id);
    panelBlock?.appendChild(panel);
    void anchor;
  }

  function handleDatabaseFieldChange(block, event) {
    const control = event.target.closest("[data-db-action]");
    if (!control) return false;
    const action = control.dataset.dbAction;
    const property = databaseProperty(block, control.dataset.dbProp);
    const commit = () => {
      save();
      render();
    };

    switch (action) {
      case "property-rename":
        if (property && control.value.trim()) property.name = control.value.trim();
        commit();
        return true;

      case "property-type": {
        if (!property) return true;
        const nextType = control.value;
        property.type = nextType;
        property.id = property.id;
        if (PROPERTY_TYPES[nextType]?.options && !property.options) {
          property.options =
            nextType === "status"
              ? STATUS_GROUPS.slice(0, 3).map((group) => group.name)
              : ["Option 1", "Option 2", "Option 3"];
        }
        if (nextType === "formula" && !property.formula) property.formula = 'prop("Name")';
        if (nextType === "rollup" && !property.rollup) {
          property.rollup = { relationPropId: "", targetPropId: "", fn: "count" };
        }
        if (nextType === "relation" && !property.relation) property.relation = { dbId: "" };
        for (const row of block.rows) row.cells[property.id] = emptyCell(property);
        commit();
        return true;
      }

      case "property-options":
        if (property) {
          property.options = control.value
            .split(",")
            .map((option) => option.trim())
            .filter(Boolean);
          if (!property.options.length) property.options = ["Option 1"];
        }
        commit();
        return true;

      case "property-formula":
        if (property) property.formula = control.value;
        commit();
        return true;

      case "property-format":
        if (property) property.format = control.value;
        commit();
        return true;

      case "property-rollup-relation":
        if (property) {
          property.rollup = {
            ...(property.rollup || {}),
            relationPropId: control.value,
            targetPropId: "",
          };
        }
        commit();
        return true;

      case "property-rollup-target":
        if (property) {
          property.rollup = { ...(property.rollup || {}), targetPropId: control.value };
        }
        commit();
        return true;

      case "property-rollup-fn":
        if (property) {
          property.rollup = { ...(property.rollup || {}), fn: control.value };
        }
        commit();
        return true;

      case "property-relation-db":
        if (property) property.relation = { dbId: control.value };
        commit();
        return true;

      case "filter-prop": {
        const rule = (block.filters || []).find((item) => item.id === control.dataset.dbRule);
        if (rule) rule.propId = control.value;
        commit();
        return true;
      }

      case "filter-op": {
        const rule = (block.filters || []).find((item) => item.id === control.dataset.dbRule);
        if (rule) rule.op = control.value;
        commit();
        return true;
      }

      case "filter-value": {
        const rule = (block.filters || []).find((item) => item.id === control.dataset.dbRule);
        if (rule) rule.value = control.value;
        save();
        return true;
      }

      default:
        return false;
    }
  }

  function handleDatabaseAction(block, event) {
    const target = event.target.closest("[data-db-action]");
    const blockEl = elById(block.id);

    if (!target) {
      if (!event.target.closest(".db-filters-panel, .db-prop-menu, .db-view-menu, .db-toolbar")) {
        closeDatabasePanels();
      }
      return false;
    }

    const action = target.dataset.dbAction;
    const dataset = target.dataset;
    const commit = () => {
      save();
      render();
    };

    switch (action) {
      case "view":
        block.activeView = dataset.view;
        commit();
        return true;

      case "add-view": {
        const type = dataset.viewType || "table";
        const existing = (block.views || []).filter((view) => view.type === type).length;
        const id = `${type}-${Math.random().toString(36).slice(2, 7)}`;
        block.views.push({
          id,
          name: existing ? `${type[0].toUpperCase()}${type.slice(1)} ${existing + 1}` : type[0].toUpperCase() + type.slice(1),
          type,
        });
        block.activeView = id;
        commit();
        return true;
      }

      case "view-menu":
        mountDatabasePanel(block, buildViewMenu(block, databaseContext(block)), target);
        return true;

      case "view-menu-close":
        closeDatabasePanels();
        return true;

      case "view-rename": {
        event.stopPropagation();
        const view = (block.views || []).find((item) => item.id === dataset.view);
        if (!view) return true;
        const name = window.prompt("View name", view.name);
        if (name === null) return true;
        view.name = name.trim() || view.name;
        commit();
        return true;
      }

      case "view-delete": {
        if ((block.views || []).length <= 1) {
          onToast?.("A database needs at least one view");
          return true;
        }
        block.views = block.views.filter((view) => view.id !== dataset.view);
        if (block.activeView === dataset.view) block.activeView = block.views[0].id;
        commit();
        return true;
      }

      case "add-row":
        block.rows.push(newDatabaseRow(block));
        commit();
        return true;

      case "add-property": {
        const picker = document.createElement("div");
        picker.className = "db-prop-menu db-type-picker";
        const grid = document.createElement("div");
        grid.className = "db-type-grid";
        for (const [type, meta] of Object.entries(PROPERTY_TYPES)) {
          if (type === "title") continue;
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.dbAction = "property-create";
          button.dataset.dbType = type;
          button.innerHTML = `<span class="db-type-icon">${escapeHtml(
            meta.icon
          )}</span><span>${escapeHtml(meta.label)}</span>`;
          grid.appendChild(button);
        }
        picker.appendChild(grid);
        mountDatabasePanel(block, picker, target);
        return true;
      }

      case "property-create": {
        const type = dataset.dbType || "text";
        const property = makeDefaultProperty(type, { name: PROPERTY_TYPES[type]?.label || "Property" });
        block.properties.push(property);
        for (const row of block.rows) row.cells[property.id] = emptyCell(property);
        commit();
        return true;
      }

      case "property-menu": {
        const property = databaseProperty(block, dataset.dbProp);
        if (!property) return true;
        mountDatabasePanel(block, buildPropertyMenu(block, property, databaseContext(block)), target);
        return true;
      }

      case "property-close":
        closeDatabasePanels();
        return true;

      case "property-delete": {
        const index = (block.properties || []).findIndex((item) => item.id === dataset.dbProp);
        if (index < 0) return true;
        if (block.properties[index].type === "title") {
          onToast?.("The title property cannot be removed");
          return true;
        }
        block.properties.splice(index, 1);
        for (const row of block.rows) delete row.cells[dataset.dbProp];
        commit();
        return true;
      }

      case "filters":
        if (blockEl?.querySelector(".db-filters-panel")) {
          closeDatabasePanels();
          return true;
        }
        mountDatabasePanel(block, buildFiltersPanel(block, databaseContext(block)), target);
        return true;

      case "filter-add": {
        const first = (block.properties || [])[0];
        if (!first) return true;
        block.filters = block.filters || [];
        block.filters.push({ id: dbUid(), propId: first.id, op: "contains", value: "" });
        commit();
        mountDatabasePanel(block, buildFiltersPanel(block, databaseContext(block)), target);
        return true;
      }

      case "filter-delete":
        block.filters = (block.filters || []).filter((rule) => rule.id !== dataset.dbRule);
        commit();
        mountDatabasePanel(block, buildFiltersPanel(block, databaseContext(block)), target);
        return true;

      case "filter-clear":
        block.filters = [];
        commit();
        mountDatabasePanel(block, buildFiltersPanel(block, databaseContext(block)), target);
        return true;

      case "delete-row": {
        block.rows = block.rows.filter((row) => row.id !== dataset.dbRow);
        if (!block.rows.length) block.rows.push(newDatabaseRow(block));
        commit();
        return true;
      }

      case "add-group": {
        const group =
          databaseProperty(block, block.boardGroupBy) ||
          (block.properties || []).find(
            (property) => property.type === "status" || property.type === "select"
          );
        const row = newDatabaseRow(block);
        if (group) row.cells[group.id] = dataset.group ?? "";
        block.rows.push(row);
        commit();
        return true;
      }

      case "cal-prev":
      case "cal-next": {
        const cursor = parseMonthKey(block.calendarMonth);
        cursor.setMonth(cursor.getMonth() + (action === "cal-next" ? 1 : -1), 1);
        block.calendarMonth = monthKey(cursor);
        commit();
        return true;
      }

      case "cal-today":
        block.calendarMonth = monthKey(new Date());
        commit();
        return true;

      case "cal-add": {
        const property = (block.properties || []).find((item) => item.type === "date");
        if (!property) return true;
        block.rows.push(newDatabaseRow(block, { [property.id]: dataset.date || isoToday() }));
        commit();
        return true;
      }

      case "multiselect-add": {
        const row = rowById(block, dataset.dbRow);
        const property = databaseProperty(block, dataset.dbProp);
        if (!row || !property || !target.value) return true;
        const values = Array.isArray(row.cells[property.id]) ? [...row.cells[property.id]] : [];
        if (!values.includes(target.value)) values.push(target.value);
        row.cells[property.id] = values;
        touchRow(block, row);
        commit();
        return true;
      }

      case "multiselect-remove": {
        const row = rowById(block, dataset.dbRow);
        const property = databaseProperty(block, dataset.dbProp);
        if (!row || !property) return true;
        const values = Array.isArray(row.cells[property.id]) ? [...row.cells[property.id]] : [];
        row.cells[property.id] = values.filter((value) =>
          property.type === "files"
            ? value?.name !== dataset.value
            : value !== dataset.value
        );
        touchRow(block, row);
        commit();
        return true;
      }

      case "files-add":
        requestRowFileUpload(block, dataset.dbRow, dataset.dbProp);
        return true;

      case "relation-add": {
        const row = rowById(block, dataset.dbRow);
        const property = databaseProperty(block, dataset.dbProp);
        if (!row || !property || !target.value) return true;
        const values = Array.isArray(row.cells[property.id]) ? [...row.cells[property.id]] : [];
        values.push(target.value);
        row.cells[property.id] = values;
        touchRow(block, row);
        commit();
        return true;
      }

      case "relation-open":
      case "relation-open-row": {
        const property = databaseProperty(block, dataset.dbProp);
        const targetDb = property ? findDatabaseBlock(property.relation?.dbId) : findDatabaseBlock(block.linked?.dbId);
        if (!targetDb) return true;
        const entry = allDatabases().find((item) => item.id === targetDb.id);
        if (!entry) return true;
        openPageBlock(block, entry);
        return true;
      }

      case "url-open": {
        const row = rowById(block, dataset.dbRow);
        const url = safeUrl(row?.cells?.[dataset.dbProp]);
        if (!url) {
          onToast?.("Add a URL to this cell first");
          return true;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        return true;
      }

      default:
        return false;
    }
  }

  /* ---------------- mentions ---------------- */
  let mention = null; // { blockId, query, index }

  function mentionItems() {
    const query = (mention?.query ?? "").trim().toLowerCase();
    const items = [];

    const pages = (getPages?.() ?? [])
      .filter((item) => item.id !== page?.id)
      .filter((item) => !query || `${item.title || "Untitled"}`.toLowerCase().includes(query))
      .slice(0, 8)
      .map((item) => ({
        kind: "page",
        id: item.id,
        icon: item.icon || "📄",
        label: item.title || "Untitled",
        hint: "Page",
      }));

    const dates = [
      { kind: "date", id: "today", icon: "📅", label: "Today", hint: "Insert today's date", value: isoToday() },
      {
        kind: "date",
        id: "tomorrow",
        icon: "📅",
        label: "Tomorrow",
        hint: "Insert tomorrow's date",
        value: (() => {
          const date = new Date();
          date.setDate(date.getDate() + 1);
          return isoTodayFrom(date);
        })(),
      },
    ].filter((item) => !query || item.label.toLowerCase().includes(query));

    items.push(...dates);
    items.push(...pages);
    return items;
  }

  function openMention(blockEl) {
    mention = { blockId: blockEl.dataset.id, query: "", index: 0 };
    renderMention();
    mentionMenu.hidden = false;
    const rect = caretRect() ?? blockEl.getBoundingClientRect();
    mentionMenu.style.left = "0px";
    mentionMenu.style.top = "0px";
    const width = mentionMenu.offsetWidth;
    const height = mentionMenu.offsetHeight;
    const left = Math.min(Math.max(10, rect.left), window.innerWidth - width - 10);
    const below = window.innerHeight - rect.bottom;
    mentionMenu.style.left = `${left}px`;
    mentionMenu.style.top = `${
      below < height + 14 ? Math.max(10, rect.top - height - 6) : rect.bottom + 6
    }px`;
  }

  function closeMention() {
    mention = null;
    mentionMenu.hidden = true;
  }

  function renderMention() {
    const items = mentionItems();
    mention.index = Math.min(mention.index, Math.max(0, items.length - 1));
    mentionList.innerHTML = "";
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.className = `mention-item${index === mention.index ? " is-active" : ""}`;
      button.setAttribute("role", "option");
      button.innerHTML = `
        <span class="mention-item__icon">${escapeHtml(item.icon)}</span>
        <span class="mention-item__label">${escapeHtml(item.label)}</span>
        <span class="mention-item__hint">${escapeHtml(item.hint)}</span>`;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        applyMention(item);
      });
      mentionList.appendChild(button);
    });
    mentionEmpty.hidden = items.length > 0;
    mentionList.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  }

  function applyMention(item) {
    if (!mention) return;
    const block = blockById(mention.blockId);
    const blockEl = elById(mention.blockId);
    closeMention();
    if (!block || !blockEl) return;

    const input = inputOf(blockEl);
    if (!input) return;

    const label =
      item.kind === "date"
        ? formatDateLabel(item.value, { month: "short" })
        : item.label;
    const attributes =
      item.kind === "date"
        ? `data-mention="date" data-date="${escapeHtml(item.value)}"`
        : `data-mention="page" data-page-id="${escapeHtml(item.id)}"`;
    const html = `<span class="mention" contenteditable="false" data-atomic="true" ${attributes}>${escapeHtml(
      item.icon
    )} ${escapeHtml(label)}</span>&nbsp;`;

    document.execCommand("insertHTML", false, html);
    if (!mentionReplaced(input)) replaceMentionQuery(input, html, block);
    block.text = input.innerHTML;
    save();
  }

  function mentionReplaced(input) {
    return Boolean(input.querySelector(".mention"));
  }

  function replaceMentionQuery(input, html, block) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const text = input.textContent || "";
    const at = text.lastIndexOf("@");
    if (at < 0) return;
    const probe = document.createRange();
    probe.selectNodeContents(input);
    try {
      probe.setEnd(range.endContainer, range.endOffset);
    } catch {
      return;
    }
    const caret = probe.toString().length;
    const startRange = textRangeAt(input, at);
    if (!startRange) return;
    const replace = document.createRange();
    replace.setStart(startRange.startContainer, startRange.startOffset);
    replace.setEnd(range.endContainer, range.endOffset);
    replace.deleteContents();
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const node = holder.firstChild;
    replace.insertNode(node);
    const after = document.createRange();
    after.setStartAfter(node.lastChild || node);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    void caret;
    void block;
  }

  function textRangeAt(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let position = 0;
    let node = walker.nextNode();
    while (node) {
      const length = node.nodeValue.length;
      if (offset >= position && offset <= position + length) {
        const range = document.createRange();
        range.setStart(node, offset - position);
        return range;
      }
      position += length;
      node = walker.nextNode();
    }
    return null;
  }

  function mentionQueryFor(text) {
    const at = text.lastIndexOf("@");
    if (at < 0) return null;
    const query = text.slice(at + 1);
    if (/\s/.test(query)) return null;
    if (query.length > 40) return null;
    return query;
  }

  function openPageBlock(block, entry) {
    const page = entry.page;
    if (!page) return;
    const blockIndex = page.blocks.findIndex((item) => item.id === entry.block.id);
    onOpenPage?.(page.id, { blockId: entry.block.id, blockIndex });
    void block;
  }

  function requestRowFileUpload(block, rowId, propertyId) {
    const input = document.createElement("input");
    input.type = "file";
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      input.remove();
      const row = rowById(block, rowId);
      if (!file || !row) return;
      try {
        const response = await fetch(`/api/media?name=${encodeURIComponent(file.name)}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.url) throw new Error(payload?.error || "Upload failed");
        const values = Array.isArray(row.cells[propertyId]) ? [...row.cells[propertyId]] : [];
        values.push({ name: payload.name, url: payload.url, mime: payload.mime, size: payload.size });
        row.cells[propertyId] = values;
        touchRow(block, row);
        save();
        render();
      } catch (error) {
        onToast?.(error.message || "Upload failed");
      }
    });
    input.click();
  }

  function blockPlainText(block) {
    if (!block) return "";
    if (block.type === "attachment") return block.attachment?.name || "";
    if (block.type === "file") return block.file?.name || "";
    if (block.type === "table") return (block.rows || []).flat().join(" ");
    if (block.type === "database") {
      return (block.rows || [])
        .map((row) => Object.values(row.cells || {}).join(" "))
        .join(" ");
    }
    if (COLUMN_COUNTS[block.type]) return (block.columns || []).map(plainText).join(" ");
    if (block.type === "toggle" || TOGGLE_HEADINGS[block.type]) {
      return `${plainText(block.text)} ${plainText(block.body)}`;
    }
    if (block.type === "video" || block.type === "audio") {
      return plainText(block.caption) || block.url || block.file?.name || "";
    }
    if (block.type === "template") {
      return `${block.label || ""} ${(block.template || []).map((row) => row.text || "").join(" ")}`;
    }
    if (block.type === "button") {
      return `${block.label || ""} ${block.url || ""}`.trim();
    }
    if (block.type === "page") {
      const target = (getPages?.() ?? []).find((item) => item.id === block.pageId);
      return target ? target.title || "Untitled" : "";
    }
    if (block.type === "breadcrumb") return "";
    return plainText(block.text);
  }

  function buildCaption(block, placeholder = "Add a caption") {
    const caption = document.createElement("div");
    caption.className = "image-caption";
    caption.contentEditable = "true";
    caption.spellcheck = false;
    caption.dataset.placeholder = placeholder;
    caption.innerHTML = block.caption || "";
    return caption;
  }

  function buildMediaActions(items) {
    const actions = document.createElement("div");
    actions.className = "image-actions";
    actions.innerHTML = items
      .map(
        (item) =>
          `<button type="button" data-media-action="${escapeHtml(item.action)}" data-block-kind="${escapeHtml(
            item.kind
          )}">${escapeHtml(item.label)}</button>`
      )
      .join("");
    return actions;
  }

  function requestMediaUpload(blockId, kind) {
    pendingMediaBlockId = blockId;
    pendingMediaKind = kind;
    mediaFileInput.accept =
      kind === "audio" ? "audio/*" : kind === "video" ? "video/*" : "";
    mediaFileInput.value = "";
    mediaFileInput.click();
  }

  async function uploadMedia(file, blockId, kind) {
    const block = blockById(blockId);
    if (!block) return;

    block.file = { status: "uploading", name: file.name, size: file.size };
    render();

    try {
      const response = await fetch(`/api/media?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "The upload failed.");
      }

      const current = blockById(blockId);
      if (!current) return;
      current.file = payload;
      if (kind === "audio" || kind === "video") {
        current.src = payload.url;
        current.url = "";
      }
      save();
      render();
      onToast?.(`${payload.name} uploaded`);
    } catch (uploadError) {
      const current = blockById(blockId);
      if (current) {
        current.file = null;
        if (kind === "audio" || kind === "video") current.src = "";
        save();
        render();
      }
      onToast?.(uploadError.message || "The upload failed.");
    }
  }

  mediaFileInput.addEventListener("change", () => {
    const file = mediaFileInput.files?.[0];
    const blockId = pendingMediaBlockId;
    const kind = pendingMediaKind;
    mediaFileInput.value = "";
    pendingMediaBlockId = null;
    if (!file || !blockId) return;
    if (file.size > 25 * 1024 * 1024) {
      onToast?.("File is too large — use one under 25 MB");
      return;
    }
    uploadMedia(file, blockId, kind);
  });

  function renderMathInto(latex, element) {
    if (!element) return;
    const source = String(latex || "").trim();
    element.classList.remove("is-invalid");
    if (!source) {
      element.replaceChildren();
      element.hidden = true;
      return;
    }
    element.hidden = false;
    try {
      katex.render(source, element, {
        displayMode: true,
        throwOnError: false,
        strict: "ignore",
        trust: false,
      });
    } catch {
      element.textContent = source;
      element.classList.add("is-invalid");
    }
  }

  function pageOptions(selectedId) {
    const items = getPages?.() ?? [];
    const options = ['<option value="">Choose a page…</option>'];
    for (const item of items) {
      if (item.id === page?.id) continue;
      const selected = item.id === selectedId ? " selected" : "";
      options.push(
        `<option value="${item.id}"${selected}>${escapeHtml(`${item.icon || "📄"} ${item.title || "Untitled"}`)}</option>`
      );
    }
    return options.join("");
  }

  const EMBED_PROVIDERS = [
    {
      name: "Figma",
      test: /figma\.com\/(file|design|proto|board)\/([\w-]+)(\/[\w-]+)?/i,
      build: (match) => `https://www.figma.com/embed?embed_host=notion&url=${encodeURIComponent(
        `https://www.figma.com/${match[1]}/${match[2]}${match[3] || ""}`
      )}`,
    },
    {
      name: "Loom",
      test: /loom\.com\/(share|embed)\/([\w-]+)/i,
      build: (match) => `https://www.loom.com/embed/${match[2]}`,
    },
    {
      name: "CodePen",
      test: /codepen\.io\/([\w-]+)\/pen\/([\w-]+)/i,
      build: (match) =>
        `https://codepen.io/${match[1]}/embed/${match[2]}?default-tab=result`,
    },
    {
      name: "Google Maps",
      test: /google\.[a-z.]+\/maps\/(@[^?]+|search\/[^?]+|maps\/[^?]+)/i,
      build: (match) => `https://maps.google.com/maps?q=${encodeURIComponent(match[1])}&output=embed`,
    },
    {
      name: "Spotify",
      test: /open\.spotify\.com\/(track|album|playlist|episode|show)\/([\w]+)/i,
      build: (match) => `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
    },
    {
      name: "SoundCloud",
      test: /soundcloud\.com\/([\w-]+)\/([\w-]+)/i,
      build: (match) => `https://w.soundcloud.com/player/?url=${encodeURIComponent(match[0])}`,
    },
    {
      name: "Miro",
      test: /miro\.com\/app\/(board|live-embed)\/([\w=]+)\/?/i,
      build: (match) => `https://miro.com/app/live-embed/${match[2]}/`,
    },
    {
      name: "Airtable",
      test: /airtable\.com\/([\w]+)\/(app[\w]+|shr[\w]+|tbl[\w]+)(.*)/i,
      build: (match) => match[0],
    },
    {
      name: "Gist",
      test: /gist\.github\.com\/([\w-]+)\/([0-9a-f]+)/i,
      build: (match) => `https://gist.github.com/${match[1]}/${match[2]}.pib`,
    },
    {
      name: "Replit",
      test: /replit\.com\/@([\w-]+)\/([\w-]+)/i,
      build: (match) => `https://replit.com/@${match[1]}/${match[2]}?embed=true`,
    },
  ];

  const VIDEO_PROVIDERS = [
    {
      name: "YouTube",
      test: /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/i,
      build: (match) => `https://www.youtube.com/embed/${match[1]}`,
      ratio: "16 / 9",
    },
    {
      name: "Vimeo",
      test: /vimeo\.com\/(?:video\/)?(\d+)/i,
      build: (match) => `https://player.vimeo.com/video/${match[1]}`,
      ratio: "16 / 9",
    },
    {
      name: "Loom",
      test: /loom\.com\/(?:share|embed)\/([\w-]+)/i,
      build: (match) => `https://www.loom.com/embed/${match[1]}`,
      ratio: "16 / 9",
    },
  ];

  function providerSource(list, url) {
    const value = safeUrl(url);
    if (!value) return null;
    for (const provider of list) {
      const match = provider.test.exec(value);
      if (!match) continue;
      return { provider: provider.name, src: provider.build(match), ratio: provider.ratio };
    }
    return null;
  }

  function embedSource(url) {
    return providerSource(VIDEO_PROVIDERS, url);
  }

  function mediaUrl(value) {
    const direct = safeUrl(value);
    if (!direct) return "";
    if (isLocalMediaUrl(direct)) return direct;
    return "";
  }

  const INLINE_MATH_TYPES = new Set([
  "paragraph",
  "h1",
  "h2",
  "h3",
  "bulleted",
  "numbered",
  "todo",
  "quote",
  "callout",
  "toggle",
  "toggleh1",
  "toggleh2",
  "toggleh3",
]);

  const INLINE_MATH_PATTERN = /\$([^$\n]{1,120})\$(?!\d)/g;

  function hasInlineMath(text) {
    return new RegExp(INLINE_MATH_PATTERN.source).test(text);
  }

  function applyInlineMath(input, block) {
    const text = input.textContent || "";
    if (!text.endsWith("$") || !hasInlineMath(text)) return false;

    input.innerHTML = renderInlineMathHtml(text);
    const spans = input.querySelectorAll(".math-inline");
    if (!spans.length) return false;

    const last = spans[spans.length - 1];
    const range = document.createRange();
    range.setStartAfter(last);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    block.text = input.innerHTML;
    save();
    return true;
  }

  function renderInlineMathHtml(text) {
    const holder = document.createElement("div");
    holder.textContent = text;

    const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
    const targets = [];
    let node = walker.nextNode();
    while (node) {
      if (node.nodeValue.includes("$")) targets.push(node);
      node = walker.nextNode();
    }

    for (const target of targets) {
      const value = target.nodeValue;
      const pattern = new RegExp(INLINE_MATH_PATTERN.source, "g");
      const matches = [...value.matchAll(pattern)];
      if (!matches.length) continue;

      const fragment = document.createDocumentFragment();
      let cursor = 0;
      for (const match of matches) {
        if (match.index > cursor) {
          fragment.appendChild(document.createTextNode(value.slice(cursor, match.index)));
        }
        const span = document.createElement("span");
        span.className = "math-inline";
        span.contentEditable = "false";
        span.dataset.atomic = "true";
        span.dataset.tex = match[1];
        try {
          katex.render(match[1], span, {
            displayMode: false,
            throwOnError: false,
            strict: "ignore",
            trust: false,
          });
        } catch {
          span.textContent = `$${match[1]}$`;
        }
        fragment.appendChild(span);
        cursor = match.index + match[0].length;
      }
      if (cursor < value.length) {
        fragment.appendChild(document.createTextNode(value.slice(cursor)));
      }
      target.replaceWith(fragment);
    }

    return holder.innerHTML;
  }

  function caretAtStart(input) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed || !input.contains(range.startContainer)) return false;
    const probe = range.cloneRange();
    probe.selectNodeContents(input);
    probe.setEnd(range.startContainer, range.startOffset);
    return probe.toString().length === 0;
  }

  function caretAtEnd(input) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed || !input.contains(range.startContainer)) return false;
    const probe = range.cloneRange();
    probe.selectNodeContents(input);
    probe.setStart(range.endContainer, range.endOffset);
    return probe.toString().length === 0;
  }

  function caretOffsetIn(input) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    if (!input.contains(range.startContainer)) return 0;
    const probe = document.createRange();
    probe.selectNodeContents(input);
    probe.setEnd(range.endContainer, range.endOffset);
    return probe.toString().length;
  }

  function focusBlock(id, where = "start") {
    const el = elById(id);
    if (!el) return;
    const input = inputOf(el);
    if (!input) return;
    input.focus({ preventScroll: false });
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(where !== "end");
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    el.classList.add("is-focused");
    activeBlockId = id;
  }

  function scrollToBlock(id) {
    const el = elById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("is-flash");
    window.setTimeout(() => el.classList.remove("is-flash"), 1500);
  }

  function textOffsetWithin(root, node, offset) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return range.toString().length;
  }

  function rangeForOffsets(root, start, end) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let position = 0;
    let startNode = null;
    let startOffset = 0;
    let endNode = null;
    let endOffset = 0;
    let node = walker.nextNode();
    while (node) {
      const length = node.nodeValue.length;
      if (startNode === null && start >= position && start <= position + length) {
        startNode = node;
        startOffset = start - position;
      }
      if (endNode === null && end >= position && end <= position + length) {
        endNode = node;
        endOffset = end - position;
      }
      position += length;
      node = walker.nextNode();
    }
    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function applyCommentHighlights(anchors) {
    commentAnchors = Array.isArray(anchors) ? anchors : [];
    if (typeof CSS === "undefined" || !CSS.highlights || typeof Highlight === "undefined") return;

    for (const name of [...CSS.highlights.keys()]) {
      if (name.startsWith("comment-")) CSS.highlights.delete(name);
    }

    const unresolved = new Highlight();
    const resolved = new Highlight();

    for (const anchor of commentAnchors) {
      if (!anchor?.blockId || anchor.start == null || anchor.end == null || anchor.orphaned) continue;
      const input = inputOf(elById(anchor.blockId));
      if (!input) continue;
      const range = rangeForOffsets(input, anchor.start, anchor.end);
      if (!range) continue;
      (anchor.resolved ? resolved : unresolved).add(range);
    }

    if (unresolved.size) CSS.highlights.set("comment-unresolved", unresolved);
    if (resolved.size) CSS.highlights.set("comment-resolved", resolved);
  }

  imageFileInput.addEventListener("change", () => {
    const file = imageFileInput.files?.[0];
    if (!file) return;
    if (file.size > 800 * 1024) {
      onToast?.("Image is too large — use one under 800 KB");
      pendingImageBlockId = null;
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const block = blockById(pendingImageBlockId);
      if (!block || typeof reader.result !== "string") return;
      block.src = reader.result;
      pendingImageBlockId = null;
      save();
      render();
      onToast?.("Image added");
    };
    reader.readAsDataURL(file);
  });

  function requestAttachmentUpload(blockId) {
    pendingAttachmentBlockId = blockId;
    attachmentFileInput.value = "";
    attachmentFileInput.click();
  }

  const MEDIA_COPY = {
    video: {
      empty: `<span>🎬</span><p>Upload a video, or embed YouTube, Vimeo, or Loom.</p><div><button type="button" class="media-btn" data-media-action="upload" data-block-kind="video">Upload</button><button type="button" class="media-btn" data-media-action="url" data-block-kind="video">Add link</button></div>`,
      prompt: "YouTube, Vimeo, or Loom URL",
    },
    audio: {
      empty: `<span>🎵</span><p>Upload an audio file or paste a direct audio URL.</p><div><button type="button" class="media-btn" data-media-action="upload" data-block-kind="audio">Upload</button><button type="button" class="media-btn" data-media-action="url" data-block-kind="audio">Add link</button></div>`,
      prompt: "Audio URL",
    },
    file: {
      empty: `<span>🗂</span><p>Upload any file — up to 25 MB.</p><div><button type="button" class="media-btn" data-media-action="upload" data-block-kind="file">Upload file</button></div>`,
      prompt: "",
    },
  };

  async function uploadAttachment(file, blockId) {
    const block = blockById(blockId);
    if (!block) return;

    const error = await preflightAttachment(file);
    if (error) {
      onToast?.(error);
      return;
    }

    block.attachment = {
      status: "uploading",
      name: file.name,
      size: file.size,
      ext: attachmentExtension(file.name),
    };
    render();

    try {
      const response = await fetch(`/api/attachments?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: file,
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.id) {
        throw new Error(payload?.error || "The upload could not be verified.");
      }

      const current = blockById(blockId);
      if (!current) return;
      current.attachment = payload;
      save();
      render();
      onToast?.(`${payload.name} uploaded and verified`);
    } catch (uploadError) {
      const current = blockById(blockId);
      if (current) {
        current.attachment = null;
        save();
        render();
      }
      onToast?.(uploadError.message || "The upload could not be verified.");
    }
  }

  attachmentFileInput.addEventListener("change", () => {
    const file = attachmentFileInput.files?.[0];
    const blockId = pendingAttachmentBlockId;
    attachmentFileInput.value = "";
    pendingAttachmentBlockId = null;
    if (!file || !blockId) return;
    uploadAttachment(file, blockId);
  });

  async function refreshAttachmentMeta(block, card) {
    const attachment = block.attachment;
    if (!attachment?.id || !card?.isConnected) return;
    const status = card.querySelector(".attachment-status");

    try {
      const response = await fetch(
        `/api/attachments/${encodeURIComponent(attachment.id)}/meta`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Attachment metadata is unavailable.");
      const meta = await response.json();
      if (!card.isConnected) return;

      const metadataChanged = Boolean(attachment.sha256) && attachment.sha256 !== meta.sha256;
      block.attachment = meta;

      const name = card.querySelector(".attachment-name");
      if (name) name.textContent = meta.name;
      const info = card.querySelector(".attachment-meta");
      if (info) {
        info.textContent = `${ATTACHMENT_LABELS[meta.ext] || meta.ext} · ${formatFileSize(
          meta.size
        )} · SHA-256 ${String(meta.sha256 || "").slice(0, 12)}…`;
      }
      const link = card.querySelector(".attachment-download");
      if (link) {
        link.href = `/api/attachments/${encodeURIComponent(meta.id)}`;
        link.setAttribute("download", meta.name);
      }
      if (status) {
        status.textContent = metadataChanged ? "Metadata changed" : "Verified";
        status.classList.toggle("is-verified", !metadataChanged);
        status.classList.toggle("is-invalid", metadataChanged);
      }
      if (metadataChanged) {
        onToast?.("Attachment metadata changed — the server values were restored");
      }
    } catch {
      if (!card.isConnected) return;
      if (status) {
        status.textContent = "Unverified";
        status.classList.remove("is-verified");
        status.classList.add("is-invalid");
      }
    }
  }

  async function verifyAttachment(block, card) {
    const attachment = block.attachment;
    if (!attachment?.id) return;
    const status = card?.querySelector(".attachment-status");
    if (status) {
      status.textContent = "Verifying…";
      status.classList.remove("is-verified", "is-invalid");
    }

    try {
      const response = await fetch(
        `/api/attachments/${encodeURIComponent(attachment.id)}/verify`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.verified) {
        throw new Error(payload?.error || "Verification failed.");
      }
      if (status) {
        status.textContent = "Verified";
        status.classList.add("is-verified");
        status.classList.remove("is-invalid");
      }
      onToast?.("Attachment verified — checksum matches");
    } catch (verifyError) {
      if (status) {
        status.textContent = "Not verified";
        status.classList.add("is-invalid");
        status.classList.remove("is-verified");
      }
      onToast?.(verifyError.message || "Attachment verification failed.");
    }
  }

  function caretRect() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(false);
    const rects = range.getClientRects();
    if (rects.length) return rects[rects.length - 1];
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height) return rect;
    const node = range.startContainer;
    const el = node.nodeType === 3 ? node.parentElement : node;
    return el?.getBoundingClientRect() ?? null;
  }

  /* ---------------- rendering ---------------- */
  function markerFor(block, number) {
    if (block.type === "bulleted") return "•";
    if (block.type === "numbered") return `${number}.`;
    if (block.type === "todo") return "check";
    return "";
  }

  function buildBlock(block, number) {
    ensureDefaults(block, block.type);
    const el = document.createElement("div");
    el.className = `block block--${block.type}`;
    el.dataset.id = block.id;
    el.dataset.type = block.type;
    el.style.setProperty("--level", String(block.level || 0));
    if (block.type === "todo" && block.checked) el.classList.add("is-checked");
    renderBlockColor(block, el);

    const controls = document.createElement("div");
    controls.className = "block__controls";
    controls.innerHTML = `
      <button class="block__control" data-control="add" aria-label="Insert block below" title="Click to add a block">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10" stroke-linecap="round"/></svg>
      </button>
      <button class="block__control" data-control="menu" aria-label="Block actions" title="Drag to move, click for actions" draggable="true">
        <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="6" cy="4" r="1.2"/><circle cx="10" cy="4" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="10" cy="8" r="1.2"/><circle cx="6" cy="12" r="1.2"/><circle cx="10" cy="12" r="1.2"/></svg>
      </button>`;
    el.appendChild(controls);

    const row = document.createElement("div");
    row.className = "block__row";

    if (block.type === "divider") {
      const hr = document.createElement("hr");
      hr.className = "block__divider";
      row.appendChild(hr);
      el.appendChild(row);
      return el;
    }

    if (block.type === "synced") {
      const wrap = document.createElement("div");
      wrap.className = "synced-block";
      const label = document.createElement("div");
      label.className = "synced-label";
      label.innerHTML = "<span>⇄</span> Synced block";
      const input = document.createElement("div");
      input.className = "block__input synced-input";
      input.contentEditable = "true";
      input.spellcheck = false;
      input.dataset.syncId = block.syncId;
      input.dataset.placeholder = "Type here — every synced copy updates";
      const registry = getSynced?.() ?? {};
      const synced = registry[block.syncId];
      input.innerHTML = synced && typeof synced.text === "string" ? synced.text : block.text || "";
      const hint = document.createElement("div");
      hint.className = "synced-hint";
      hint.textContent = "Edits update every copy of this block";
      wrap.append(label, input, hint);
      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "database") {
      row.appendChild(buildDatabase(block));
      el.appendChild(row);
      return el;
    }

    if (block.type === "table") {
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      const scroll = document.createElement("div");
      scroll.className = "block__table-wrap";
      const table = document.createElement("table");
      table.className = "block__table";
      const widths = Array.isArray(block.colWidths) ? block.colWidths : [];

      block.rows.forEach((cells, rowIndex) => {
        const tr = document.createElement("tr");
        cells.forEach((cell, columnIndex) => {
          const isHeader =
            (rowIndex === 0 && block.headerRow !== false) ||
            (columnIndex === 0 && block.headerColumn !== false);
          const td = document.createElement(isHeader ? "th" : "td");
          td.contentEditable = "true";
          td.spellcheck = false;
          td.className = "table-cell";
          td.dataset.row = String(rowIndex);
          td.dataset.col = String(columnIndex);
          if (widths[columnIndex]) td.style.width = `${widths[columnIndex]}px`;
          const color = block.cellColors?.[`${rowIndex}:${columnIndex}`];
          if (color) td.dataset.color = color;
          td.textContent = cell || "";
          tr.appendChild(td);

          const resizer = document.createElement("div");
          resizer.className = "table-resizer";
          resizer.dataset.tableAction = "resize";
          resizer.dataset.col = String(columnIndex);
          resizer.title = "Drag to resize";
          td.appendChild(resizer);
        });
        table.appendChild(tr);
      });

      const actions = document.createElement("div");
      actions.className = "table-actions";
      actions.innerHTML = `
        <button type="button" data-table-action="row">+ Row</button>
        <button type="button" data-table-action="col">+ Column</button>
        <button type="button" data-table-action="delete-row">− Row</button>
        <button type="button" data-table-action="delete-col">− Column</button>
        <button type="button" data-table-action="header-row" aria-pressed="${block.headerRow !== false}">Header row</button>
        <button type="button" data-table-action="header-column" aria-pressed="${block.headerColumn !== false}">Header column</button>
        <span class="table-align" role="group" aria-label="Cell alignment">
          <button type="button" data-table-action="align-left" aria-pressed="${(block.align || "left") === "left"}">≡</button>
          <button type="button" data-table-action="align-center" aria-pressed="${block.align === "center"}">≡</button>
          <button type="button" data-table-action="align-right" aria-pressed="${block.align === "right"}">≡</button>
        </span>
        <span class="table-actions__label">Cell</span>
        <span class="table-swatches">${BLOCK_COLORS.slice(1)
          .map(
            (color) =>
              `<button type="button" class="table-swatch" data-table-action="cell-color" data-color="${color.id}" title="${color.label}" style="--swatch:${color.swatch}"></button>`
          )
          .join("")}</span>
        <span class="table-actions__spacer"></span>
        <button type="button" data-table-action="clear-color">Clear color</button>`;

      scroll.appendChild(table);
      wrap.append(scroll, actions);
      if (block.align && block.align !== "left") table.dataset.align = block.align;
      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (COLUMN_COUNTS[block.type]) {
      const wrap = document.createElement("div");
      wrap.className = "columns-block";
      wrap.style.setProperty("--cols", String(COLUMN_COUNTS[block.type]));
      block.columns.forEach((column, index) => {
        const cell = document.createElement("div");
        cell.className = "block-column";
        cell.contentEditable = "true";
        cell.spellcheck = false;
        cell.dataset.col = String(index);
        cell.dataset.placeholder = `Column ${index + 1}`;
        cell.innerHTML = column || "";
        wrap.appendChild(cell);
      });
      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "image") {
      const wrap = document.createElement("div");
      wrap.className = "image-block";
      const src = safeUrl(block.src, { image: true });
      if (src) {
        const figure = document.createElement("figure");
        const img = document.createElement("img");
        img.src = src;
        img.alt = plainText(block.caption) || "Page image";
        img.loading = "lazy";
        figure.appendChild(img);
        figure.appendChild(buildCaption(block));
        figure.appendChild(
          buildMediaActions([
            { action: "upload", kind: "image", label: "Replace" },
            { action: "url", kind: "image", label: "URL" },
            { action: "remove", kind: "image", label: "Remove" },
          ])
        );
        wrap.appendChild(figure);
      } else {
        const empty = document.createElement("div");
        empty.className = "media-empty";
        empty.innerHTML = `
          <span>🖼</span>
          <p>Add an image to this page.</p>
          <div>
            <button type="button" class="media-btn" data-media-action="upload" data-block-kind="image">Upload</button>
            <button type="button" class="media-btn" data-media-action="url" data-block-kind="image">Use a URL</button>
          </div>`;
        wrap.appendChild(empty);
      }
      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "attachment") {
      const wrap = document.createElement("div");
      wrap.className = "attachment-block";
      const attachment = block.attachment;

      if (!attachment) {
        const empty = document.createElement("div");
        empty.className = "media-empty";
        empty.innerHTML = `
          <span>📎</span>
          <p>Attach a PDF, Word, CSV, or Excel file. The server verifies the real file signature.</p>
          <div>
            <button type="button" class="media-btn" data-attachment-action="upload">Upload file</button>
          </div>`;
        wrap.appendChild(empty);
      } else if (attachment.status === "uploading") {
        const card = document.createElement("div");
        card.className = "attachment-card is-uploading";
        card.innerHTML = `
          <span class="attachment-icon">${attachmentIcon(
            attachment.ext || attachmentExtension(attachment.name)
          )}</span>
          <div class="attachment-info">
            <span class="attachment-name">${escapeHtml(String(attachment.name || "Attachment"))}</span>
            <span class="attachment-meta">Uploading and verifying…</span>
          </div>
          <span class="attachment-status">Uploading…</span>`;
        wrap.appendChild(card);
      } else if (!attachment.id) {
        const empty = document.createElement("div");
        empty.className = "media-empty";
        empty.innerHTML = `
          <span>⚠️</span>
          <p>This attachment metadata is invalid.</p>
          <div>
            <button type="button" class="media-btn" data-attachment-action="remove">Remove</button>
          </div>`;
        wrap.appendChild(empty);
      } else {
        const ext = attachment.ext || attachmentExtension(attachment.name);
        const card = document.createElement("div");
        card.className = "attachment-card";
        card.innerHTML = `
          <span class="attachment-icon">${attachmentIcon(ext)}</span>
          <div class="attachment-info">
            <span class="attachment-name">${escapeHtml(String(attachment.name || "Attachment"))}</span>
            <span class="attachment-meta">${escapeHtml(ATTACHMENT_LABELS[ext] || ext)} · ${formatFileSize(
          attachment.size
        )} · SHA-256 ${escapeHtml(String(attachment.sha256 || "").slice(0, 12))}…</span>
          </div>
          <span class="attachment-status${attachment.sha256 ? " is-verified" : ""}">${
          attachment.sha256 ? "Verified" : "Unverified"
        }</span>
          <div class="attachment-actions">
            <a class="attachment-download" href="/api/attachments/${encodeURIComponent(
              attachment.id
            )}" download="${escapeHtml(String(attachment.name || "attachment"))}">Download</a>
            <button type="button" data-attachment-action="verify">Verify</button>
            <button type="button" data-attachment-action="remove">Remove</button>
          </div>`;
        wrap.appendChild(card);
        refreshAttachmentMeta(block, card);
      }

      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "embed") {
      const wrap = document.createElement("div");
      wrap.className = "embed-block";
      const source = providerSource(EMBED_PROVIDERS, block.url) || embedSource(block.url);
      const link = safeUrl(block.url);
      if (source) {
        const frame = document.createElement("iframe");
        frame.src = source.src;
        frame.loading = "lazy";
        frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.title = `${source.provider} embed`;
        if (source.ratio) frame.style.aspectRatio = source.ratio;
        wrap.appendChild(frame);
        const tag = document.createElement("div");
        tag.className = "embed-provider";
        tag.textContent = `${source.provider} embed`;
        wrap.appendChild(tag);
      } else if (link) {
        const card = document.createElement("a");
        card.className = "bookmark-card";
        card.href = link;
        card.target = "_blank";
        card.rel = "noopener noreferrer";
        card.innerHTML = `<span class="bookmark-card__host">${escapeHtml(
          new URL(link).hostname
        )}</span><span class="bookmark-card__title">${escapeHtml(link)}</span>`;
        wrap.appendChild(card);
      } else {
        const empty = document.createElement("div");
        empty.className = "media-empty";
        empty.innerHTML = `<span>▶</span><p>Embed a YouTube or Vimeo video.</p><div><button type="button" class="media-btn" data-embed-action="add">Add video</button></div>`;
        wrap.appendChild(empty);
      }
      if (source || link) {
        const actions = document.createElement("div");
        actions.className = "image-actions";
        actions.innerHTML = `<button type="button" data-embed-action="change">Change</button><button type="button" data-embed-action="remove">Remove</button>`;
        wrap.appendChild(actions);
      }
      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "video" || block.type === "audio") {
      const isVideo = block.type === "video";
      const wrap = document.createElement("div");
      wrap.className = isVideo ? "video-block" : "audio-block";
      const local = mediaUrl(block.src);
      const remote = embedSource(block.url);

      if (local) {
        const player = document.createElement(isVideo ? "video" : "audio");
        player.src = local;
        player.controls = true;
        player.preload = "metadata";
        if (isVideo) player.playsInline = true;
        wrap.appendChild(player);
      } else if (remote && !isVideo) {
        const frame = document.createElement("iframe");
        frame.src = remote.src;
        frame.loading = "lazy";
        frame.title = `${remote.provider} media`;
        frame.style.height = "132px";
        frame.style.width = "100%";
        wrap.appendChild(frame);
      } else if (remote) {
        const frame = document.createElement("iframe");
        frame.src = remote.src;
        frame.loading = "lazy";
        frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.title = `${remote.provider} video`;
        frame.style.aspectRatio = remote.ratio;
        wrap.appendChild(frame);
      } else if (block.url) {
        const link = safeUrl(block.url);
        if (link) {
          const card = document.createElement("a");
          card.className = "bookmark-card";
          card.href = link;
          card.target = "_blank";
          card.rel = "noopener noreferrer";
          card.innerHTML = `<span class="bookmark-card__host">${escapeHtml(
            new URL(link).hostname
          )}</span><span class="bookmark-card__title">${escapeHtml(link)}</span>`;
          wrap.appendChild(card);
        }
      } else {
        const empty = document.createElement("div");
        empty.className = "media-empty";
        empty.innerHTML = MEDIA_COPY[block.type].empty;
        wrap.appendChild(empty);
      }

      if (block.caption || local || remote || block.url) {
        wrap.appendChild(buildCaption(block));
        wrap.appendChild(
          buildMediaActions([
            { action: "upload", kind: block.type, label: "Upload" },
            { action: "url", kind: block.type, label: "Add link" },
            { action: "remove", kind: block.type, label: "Remove" },
          ])
        );
      }

      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "file") {
      const wrap = document.createElement("div");
      wrap.className = "file-block";
      const file = block.file;

      if (!file) {
        const empty = document.createElement("div");
        empty.className = "media-empty";
        empty.innerHTML = MEDIA_COPY.file.empty;
        wrap.appendChild(empty);
      } else if (file.status === "uploading") {
        const card = document.createElement("div");
        card.className = "attachment-card is-uploading";
        card.innerHTML = `
          <span class="attachment-icon">${mediaIcon("file", file.name)}</span>
          <div class="attachment-info">
            <span class="attachment-name">${escapeHtml(String(file.name || "File"))}</span>
            <span class="attachment-meta">Uploading…</span>
          </div>`;
        wrap.appendChild(card);
      } else if (!file.url) {
        const broken = document.createElement("div");
        broken.className = "media-empty";
        broken.innerHTML = `<span>⚠️</span><p>This file link is no longer available.</p><div><button type="button" class="media-btn" data-media-action="remove" data-block-kind="file">Remove</button></div>`;
        wrap.appendChild(broken);
      } else {
        const kind = mediaKind(file.mime, file.name);
        const card = document.createElement("div");
        card.className = "attachment-card";
        card.innerHTML = `
          <span class="attachment-icon">${mediaIcon(kind, file.name)}</span>
          <div class="attachment-info">
            <span class="attachment-name">${escapeHtml(String(file.name || "File"))}</span>
            <span class="attachment-meta">${escapeHtml(String(file.mime || "File"))} · ${formatFileSize(
          file.size
        )}</span>
          </div>
          <div class="attachment-actions">
            <a class="attachment-download" href="${escapeHtml(String(file.url))}" target="_blank" rel="noopener noreferrer">Open</a>
            <button type="button" data-media-action="remove" data-block-kind="file">Remove</button>
          </div>`;
        wrap.appendChild(card);
      }

      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "button") {
      const wrap = document.createElement("div");
      wrap.className = "button-block";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "block-button";
      button.dataset.buttonAction = "click";
      button.textContent = block.label || "Button";
      if (block.url) button.dataset.url = block.url;
      wrap.appendChild(button);
      const actions = document.createElement("div");
      actions.className = "image-actions";
      actions.innerHTML = `<button type="button" data-button-action="label">Label</button><button type="button" data-button-action="url">Link</button><button type="button" data-button-action="remove">Remove</button>`;
      wrap.appendChild(actions);
      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "template") {
      const wrap = document.createElement("div");
      wrap.className = "template-block";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "template-button";
      button.dataset.templateAction = "insert";
      button.textContent = block.label || "Template";
      wrap.appendChild(button);
      const preview = document.createElement("div");
      preview.className = "template-preview";
      const rows = Array.isArray(block.template) ? block.template : [];
      preview.innerHTML = rows
        .map((row) => `<span class="template-chip">${escapeHtml(row.text || "…")}</span>`)
        .join("");
      wrap.appendChild(preview);
      const actions = document.createElement("div");
      actions.className = "image-actions";
      actions.innerHTML = `<button type="button" data-template-action="label">Label</button><button type="button" data-template-action="edit">Edit blocks</button><button type="button" data-template-action="reset">Reset</button>`;
      wrap.appendChild(actions);
      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "breadcrumb") {
      const items = getPages?.() ?? [];
      const chain = [];
      let cursor = page;
      let guard = 0;
      while (cursor && guard < 12) {
        const match = items.find((item) => item.id === cursor.id);
        if (match) chain.unshift(match);
        cursor = cursor.parentId ? items.find((item) => item.id === cursor.parentId) : null;
        guard += 1;
      }

      const wrap = document.createElement("div");
      wrap.className = "breadcrumb-block";

      if (!chain.length) {
        const empty = document.createElement("div");
        empty.className = "breadcrumb-empty";
        empty.textContent = "This page has no path yet.";
        wrap.appendChild(empty);
      } else {
        chain.forEach((item, index) => {
          if (index > 0) {
            const sep = document.createElement("span");
            sep.className = "breadcrumb-sep";
            sep.textContent = "/";
            wrap.appendChild(sep);
          }
          const button = document.createElement("button");
          button.type = "button";
          button.className = `breadcrumb-item${index === chain.length - 1 ? " is-current" : ""}`;
          button.dataset.breadcrumbId = item.id;
          button.innerHTML = `<span>${escapeHtml(item.icon || "📄")}</span><span>${escapeHtml(
            item.title || "Untitled"
          )}</span>`;
          wrap.appendChild(button);
        });
      }

      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "page") {
      const items = getPages?.() ?? [];
      const target = items.find((item) => item.id === block.pageId);
      const wrap = document.createElement("div");
      wrap.className = "page-block";

      if (target) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "page-card";
        card.dataset.pageBlockAction = "open";
        card.innerHTML = `
          <span class="page-card__icon">${escapeHtml(target.icon || "📄")}</span>
          <span class="page-card__text">
            <span class="page-card__title">${escapeHtml(target.title || "Untitled")}</span>
            <span class="page-card__hint">Open sub-page</span>
          </span>
          <span class="page-card__go">→</span>`;
        wrap.appendChild(card);
        const actions = document.createElement("div");
        actions.className = "image-actions";
        actions.innerHTML = `<button type="button" data-page-block-action="detach">Detach</button>`;
        wrap.appendChild(actions);
      } else {
        const empty = document.createElement("div");
        empty.className = "media-empty";
        empty.innerHTML = `<span>📄</span><p>Create a sub-page that lives inside this page.</p><div><button type="button" class="media-btn" data-page-block-action="create">Create sub-page</button></div>`;
        wrap.appendChild(empty);
      }

      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "bookmark") {
      const wrap = document.createElement("div");
      wrap.className = "bookmark-block";
      const link = safeUrl(block.url);
      if (link) {
        const card = document.createElement("a");
        card.className = "bookmark-card";
        card.href = link;
        card.target = "_blank";
        card.rel = "noopener noreferrer";
        card.innerHTML = `
          <span class="bookmark-card__host">${escapeHtml(new URL(link).hostname)}</span>
          <span class="bookmark-card__title">${escapeHtml(block.title || link)}</span>
          <span class="bookmark-card__url">${escapeHtml(link)}</span>`;
        const actions = document.createElement("div");
        actions.className = "image-actions";
        actions.innerHTML = `<button type="button" data-bookmark-action="change">Change</button><button type="button" data-bookmark-action="remove">Remove</button>`;
        wrap.append(card, actions);
      } else {
        const empty = document.createElement("div");
        empty.className = "media-empty";
        empty.innerHTML = `<span>🔖</span><p>Save a link to this page.</p><div><button type="button" class="media-btn" data-bookmark-action="add">Add bookmark</button></div>`;
        wrap.appendChild(empty);
      }
      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "toc") {
      const wrap = document.createElement("div");
      wrap.className = "toc-block";
      const headings = (page?.blocks || []).filter(
        (item) => ["h1", "h2", "h3"].includes(item.type) && blockPlainText(item).trim()
      );
      const title = document.createElement("div");
      title.className = "toc-title";
      title.textContent = "Contents";
      wrap.appendChild(title);
      if (!headings.length) {
        const empty = document.createElement("div");
        empty.className = "toc-empty";
        empty.textContent = "Add a heading to build the table of contents.";
        wrap.appendChild(empty);
      } else {
        for (const heading of headings) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `toc-link toc-link--${heading.type}`;
          button.dataset.tocId = heading.id;
          button.textContent = blockPlainText(heading).trim();
          wrap.appendChild(button);
        }
      }
      row.appendChild(wrap);
      el.appendChild(row);
      if (headings.length) observeToc(headings.map((heading) => heading.id));
      return el;
    }

    if (block.type === "pagelink") {
      const items = getPages?.() ?? [];
      const target = items.find((item) => item.id === block.pageId);
      const wrap = document.createElement("div");
      wrap.className = "pagelink-block";
      const select = document.createElement("select");
      select.className = "pagelink-select";
      select.innerHTML = pageOptions(block.pageId);
      select.addEventListener("change", () => {
        block.pageId = select.value;
        save();
        render();
      });
      const open = document.createElement("button");
      open.type = "button";
      open.className = "pagelink-open";
      open.disabled = !target;
      open.innerHTML = target
        ? `<span>${target.icon || "📄"}</span><span>${escapeHtml(target.title || "Untitled")}</span>`
        : `<span>↗</span><span>Choose a page</span>`;
      open.addEventListener("click", () => {
        if (block.pageId) onOpenPage?.(block.pageId);
      });
      wrap.append(select, open);
      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "date") {
      const input = document.createElement("input");
      input.type = "date";
      input.className = "block__date";
      input.value = /^\d{4}-\d{2}-\d{2}$/.test(block.text) ? block.text : new Date().toISOString().slice(0, 10);
      input.addEventListener("change", () => {
        block.text = input.value;
        save();
      });
      row.appendChild(input);
      el.appendChild(row);
      return el;
    }

    if (block.type === "toggle" || TOGGLE_HEADINGS[block.type]) {
      const heading = TOGGLE_HEADINGS[block.type];
      const marker = document.createElement("div");
      marker.className = "block__marker";
      const chevron = document.createElement("button");
      chevron.type = "button";
      chevron.className = `toggle-chevron${block.open ? " is-open" : ""}`;
      chevron.dataset.toggle = block.id;
      chevron.setAttribute("aria-expanded", String(block.open));
      chevron.textContent = "›";
      marker.appendChild(chevron);

      const main = document.createElement("div");
      main.className = "toggle-main";
      const input = document.createElement("div");
      input.className = "block__input";
      input.contentEditable = "true";
      input.spellcheck = false;
      input.dataset.placeholder = heading ? PLACEHOLDER[block.type] : "Toggle";
      input.innerHTML = block.text || "";
      const body = document.createElement("div");
      body.className = "toggle-body";
      body.contentEditable = "true";
      body.spellcheck = false;
      body.dataset.placeholder = "Empty toggle. Add details here.";
      body.innerHTML = block.body || "";
      body.hidden = !block.open;
      main.append(input, body);
      row.append(marker, main);
      if (heading) main.classList.add("toggle-main--heading");
      el.appendChild(row);
      return el;
    }

    if (block.type === "math") {
      const wrap = document.createElement("div");
      wrap.className = "math-block";
      const input = document.createElement("div");
      input.className = "block__input math-input";
      input.contentEditable = "true";
      input.spellcheck = false;
      input.dataset.placeholder = "E = mc^2";
      input.textContent = String(block.text || "").replace(/<[^>]+>/g, "");
      const preview = document.createElement("div");
      preview.className = "math-preview";
      renderMathInto(block.text, preview);
      wrap.append(input, preview);
      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "callout") {
      const emoji = document.createElement("button");
      emoji.className = "callout-emoji";
      emoji.type = "button";
      emoji.textContent = block.emoji || "💡";
      emoji.title = "Change icon";
      row.appendChild(emoji);
    } else if (block.type !== "quote" && block.type !== "code" && block.type !== "math") {
      const marker = document.createElement("div");
      marker.className = "block__marker";
      if (block.type === "todo") {
        const check = document.createElement("button");
        check.className = "todo-check";
        check.type = "button";
        check.setAttribute("aria-label", block.checked ? "Mark incomplete" : "Mark complete");
        check.textContent = "✓";
        marker.appendChild(check);
      } else {
        marker.textContent = markerFor(block, number);
      }
      row.appendChild(marker);
    }

    const input = document.createElement("div");
    input.className = "block__input";
    input.contentEditable = "true";
    input.spellcheck = false;
    input.dataset.placeholder = PLACEHOLDER[block.type] ?? "";
    input.innerHTML = block.text || "";
    if (block.type === "math") input.classList.add("math-input");

    if (block.type === "code") {
      const wrap = document.createElement("div");
      wrap.className = "code-wrap";

      const surface = document.createElement("div");
      surface.className = "code-surface";

      const preview = document.createElement("pre");
      preview.className = "code-render";
      preview.setAttribute("aria-hidden", "true");
      preview.innerHTML = highlightCode(plainText(block.text), block.language);

      const codeInput = document.createElement("div");
      codeInput.className = "block__input code-input";
      codeInput.contentEditable = "true";
      codeInput.spellcheck = false;
      codeInput.dataset.placeholder = "// code";
      codeInput.textContent = plainText(block.text);

      surface.append(preview, codeInput);
      wrap.appendChild(surface);

      const lang = document.createElement("button");
      lang.className = "code-lang";
      lang.type = "button";
      lang.dataset.codeAction = "language";
      lang.textContent = LANGUAGE_LABELS[normalizeLanguage(block.language)] || block.language;
      lang.title = "Change language";

      const copy = document.createElement("button");
      copy.className = "code-copy";
      copy.type = "button";
      copy.dataset.codeAction = "copy";
      copy.textContent = "Copy";

      const wrapToggle = document.createElement("button");
      wrapToggle.className = "code-wrap-toggle";
      wrapToggle.type = "button";
      wrapToggle.dataset.codeAction = "wrap";
      wrapToggle.textContent = "Wrap";
      wrapToggle.setAttribute("aria-pressed", String(Boolean(block.wrap)));

      if (block.wrap) wrap.classList.add("is-wrapped");

      const actions = document.createElement("div");
      actions.className = "code-actions";
      actions.append(lang, copy, wrapToggle);
      wrap.appendChild(actions);

      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    row.appendChild(input);
    el.appendChild(row);
    return el;
  }

  function render(nextPage) {
    if (nextPage) page = nextPage;
    if (!page) return;
    activeBlockId = null;
    const fragment = document.createDocumentFragment();
    let counters = {};
    for (const block of page.blocks) {
      let number = 0;
      if (block.type === "numbered") {
        counters[block.level] = (counters[block.level] || 0) + 1;
        number = counters[block.level];
      } else {
        counters = {};
      }
      const element = buildBlock(block, number);
      if (INLINE_MATH_TYPES.has(block.type) && hasInlineMath(blockPlainText(block))) {
        renderInlineMathInto(element, block);
      }
      fragment.appendChild(element);
    }
    container.replaceChildren(fragment);
  }

  function renderInlineMathInto(blockEl, block) {
    const input = inputOf(blockEl);
    if (!input || input.querySelector(".math-inline")) return;
    const text = input.textContent || "";
    if (!hasInlineMath(text)) return;
    input.innerHTML = renderInlineMathHtml(text);
    block.text = input.innerHTML;
  }

  /* ---------------- toc scroll spy ---------------- */
  let tocObserver = null;

  function observeToc(headingIds) {
    tocObserver?.disconnect();
    if (typeof IntersectionObserver !== "function") return;
    const seen = new Map();

    tocObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          seen.set(entry.target.dataset.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        const current = [...seen.entries()]
          .filter(([, ratio]) => ratio > 0)
          .sort((a, b) => b[1] - a[1])[0];
        const activeId = current?.[0] || headingIds[0];
        container.querySelectorAll(".toc-link").forEach((link) => {
          link.classList.toggle("is-current", link.dataset.tocId === activeId);
        });
      },
      { root: container.closest(".page-scroll") || null, threshold: [0.15, 0.5, 1] }
    );

    for (const id of headingIds) {
      const heading = elById(id);
      if (heading) tocObserver.observe(heading);
    }
  }

  /* ---------------- structure edits ---------------- */
  function splitBlock(el) {
    const block = blockById(el.dataset.id);
    const input = inputOf(el);
    if (!block || !input) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const after = range.cloneRange();
    after.selectNodeContents(input);
    after.setStart(range.endContainer, range.endOffset);
    const fragment = after.extractContents();
    const holder = document.createElement("div");
    holder.appendChild(fragment);

    block.text = input.innerHTML;
    const nextType = CONTINUATION[block.type] ?? "paragraph";
    const next = createBlock(nextType, holder.innerHTML, { level: block.level });
    const index = page.blocks.indexOf(block);
    page.blocks.splice(index + 1, 0, next);
    save();
    render();
    focusBlock(next.id, "start");
  }

  function insertAfter(block, type) {
    if (type === "page") {
      const created = onCreatePage?.({ parentId: page?.id ?? null });
      const anchor = created
        ? createBlock("page", "", { pageId: created.id })
        : createBlock("paragraph");
      if (created) ensureDefaults(anchor, "page");
      const index = page.blocks.indexOf(block);
      page.blocks.splice(index + 1, 0, anchor);
      save();
      render();
      return;
    }

    const next = createBlock(type, "");
    ensureDefaults(next, type);
    const index = page.blocks.indexOf(block);
    page.blocks.splice(index + 1, 0, next);
    save();
    render();

    if (type === "attachment") {
      requestAttachmentUpload(next.id);
      return;
    }
    if (type === "video" || type === "audio" || type === "file") {
      requestMediaUpload(next.id, type);
      return;
    }
    if (!next.text && !next.level) return;
    focusBlock(next.id, "start");
  }

  function turnInto(block, type) {
    if (DATABASE_VIEW_DEFS[type]) {
      block.type = "database";
      ensureDefaults(block, "database");
      block.activeView = DATABASE_VIEW_DEFS[type];
      save();
      render();
      return;
    }
    if (type === "database-linked") {
      const sources = allDatabases().filter((item) => item.id !== block.id);
      block.type = "database";
      block.linked = { dbId: sources[0]?.id ?? "" };
      ensureDefaults(block, "database");
      save();
      render();
      return;
    }
    block.type = type;
    ensureDefaults(block, type);
    save();
    render();
    if (type === "attachment") {
      requestAttachmentUpload(block.id);
      return;
    }
    if (type === "video" || type === "audio" || type === "file") {
      requestMediaUpload(block.id, type);
      return;
    }
    focusBlock(block.id, "end");
  }

  function insertTemplate(block) {
    const index = page.blocks.indexOf(block);
    const rows = Array.isArray(block.template) ? block.template : [];
    const additions = rows.map((row) =>
      createBlock(row.type || "paragraph", escapeHtml(row.text || ""), {
        level: row.level || 0,
        ...(row.checked ? { checked: true } : {}),
      })
    );
    if (!additions.length) {
      onToast?.("This template has no blocks yet");
      return;
    }
    page.blocks.splice(index + 1, 0, ...additions);
    save();
    render();
    focusBlock(additions[additions.length - 1].id, "end");
    onToast?.(`${block.label || "Template"} inserted`);
  }

  function editTemplate(block) {
    const rows = Array.isArray(block.template) ? block.template : [];
    const text = rows.map((row) => row.text || "").join("\\n");
    const value = window.prompt(
      "One block per line. Prefix with # / ## / ### for headings, - for bullets, [ ] for to-do.",
      text
    );
    if (value === null) return;

    const parsed = value
      .split(/\\r?\\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.length)
      .map((line) => {
        if (/^###\\s+/.test(line)) return { type: "h3", text: line.replace(/^###\\s+/, "") };
        if (/^##\\s+/.test(line)) return { type: "h2", text: line.replace(/^##\\s+/, "") };
        if (/^#\\s+/.test(line)) return { type: "h1", text: line.replace(/^#\\s+/, "") };
        if (/^[-*]\\s+/.test(line)) return { type: "bulleted", text: line.replace(/^[-*]\\s+/, "") };
        if (/^\\d+[.)]\\s+/.test(line)) return { type: "numbered", text: line.replace(/^\\d+[.)]\\s+/, "") };
        if (/^>\\s+/.test(line)) return { type: "quote", text: line.replace(/^>\\s+/, "") };
        if (/^\\[[ x]\\]\\s+/i.test(line)) {
          return {
            type: "todo",
            text: line.replace(/^\\[[ x]\\]\\s+/i, ""),
            checked: /^\\[[x]\\]/i.test(line),
          };
        }
        return { type: "paragraph", text: line };
      });

    block.template = parsed;
    save();
    render();
  }

  /* ---------------- slash menu ---------------- */
  function openSlash(blockEl, mode, query = "", anchor = null, targetInput = null) {
    const rect = anchor ?? caretRect() ?? blockEl.getBoundingClientRect();
    slash = {
      blockId: blockEl.dataset.id,
      mode,
      query,
      index: 0,
      target: targetInput || inputOf(blockEl) || blockEl.querySelector(".toggle-body"),
    };
    renderSlash();
    slashMenu.hidden = false;
    slashMenu.style.left = "0px";
    slashMenu.style.top = "0px";
    const width = slashMenu.offsetWidth;
    const height = slashMenu.offsetHeight;
    const left = Math.min(Math.max(10, rect.left), window.innerWidth - width - 10);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < height + 14 ? Math.max(10, rect.top - height - 6) : rect.bottom + 6;
    slashMenu.style.left = `${left}px`;
    slashMenu.style.top = `${top}px`;
  }

  function closeSlash() {
    slash = null;
    slashMenu.hidden = true;
  }

  function filteredItems() {
    const query = (slash?.query ?? "").trim().toLowerCase();
    if (!query) return BLOCK_DEFS;
    return BLOCK_DEFS.filter((item) =>
      `${item.label} ${item.keywords} ${item.desc}`.toLowerCase().includes(query)
    );
  }

  function buildSlashItem(item, index, activeIndex) {
      const button = document.createElement("button");
      button.className = `slash-item${index === activeIndex ? " is-active" : ""}`;
      button.dataset.type = item.type;
      button.id = `slash-item-${index}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === activeIndex));
      button.innerHTML = `
        <span class="slash-item__icon">${escapeHtml(item.icon)}</span>
        <span class="slash-item__text">
          <span class="slash-item__name">${escapeHtml(item.label)}</span>
          <span class="slash-item__desc">${escapeHtml(item.desc)}</span>
        </span>`;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        applySlash(item.type);
      });
      return button;
    }

    function renderSlash() {
    const items = filteredItems();
    slash.index = Math.min(slash.index, Math.max(0, items.length - 1));
    slashLabel.textContent = slash.mode === "insert-after" ? "Insert block" : "Blocks";
    slashList.innerHTML = "";
    const grouping = !(slash.query ?? "").trim();

    if (!grouping) {
      items.forEach((item, index) => {
        slashList.appendChild(buildSlashItem(item, index, slash.index));
      });
    } else {
      let cursor = 0;
      for (const category of BLOCK_CATEGORIES) {
        const group = items.filter((item) => item.category === category.id);
        if (!group.length) continue;
        const heading = document.createElement("div");
        heading.className = "slash-group";
        heading.textContent = category.label;
        slashList.appendChild(heading);
        for (const item of group) {
          slashList.appendChild(buildSlashItem(item, cursor, slash.index));
          cursor += 1;
        }
      }
      const extra = items.filter(
        (item) => !BLOCK_CATEGORIES.some((category) => category.id === item.category)
      );
      for (const item of extra) {
        slashList.appendChild(buildSlashItem(item, cursor, slash.index));
        cursor += 1;
      }
    }

    slashEmpty.hidden = items.length > 0;
    const active = slashList.querySelector(".is-active");
    if (active) {
      slashMenu.setAttribute("aria-activedescendant", active.id);
      active.scrollIntoView({ block: "nearest" });
    } else {
      slashMenu.removeAttribute("aria-activedescendant");
    }
  }

  function modeForSlash() {
    return slash?.mode ?? "transform";
  }

  function applySlash(type) {
    if (!slash) return;
    const block = blockById(slash.blockId);
    const mode = slash.mode;
    if (!block) return closeSlash();
    closeSlash();
    if (mode === "insert-after") {
      insertAfter(block, type);
      return;
    }
    if (block.text && block.text.replace(/<[^>]+>/g, "").startsWith("/")) block.text = "";
    if (type === "divider") {
      block.type = "divider";
      block.text = "";
      save();
      render();
      const index = page.blocks.indexOf(block);
      if (index === page.blocks.length - 1) {
        const next = createBlock("paragraph");
        page.blocks.push(next);
        save();
        render();
        focusBlock(next.id, "start");
      } else {
        focusBlock(page.blocks[index + 1].id, "start");
      }
      return;
    }
    if (DATABASE_VIEW_DEFS[type]) {
      block.type = "database";
      ensureDefaults(block, "database");
      block.activeView = DATABASE_VIEW_DEFS[type];
      save();
      render();
      return;
    }
    if (type === "database-linked") {
      const sources = allDatabases().filter((item) => item.id !== block.id);
      block.type = "database";
      block.linked = { dbId: sources[0]?.id ?? "" };
      ensureDefaults(block, "database");
      save();
      render();
      if (!sources.length) onToast?.("Add another database first, then create a linked view");
      return;
    }
    if (type === "page") {
      turnInto(block, type);
      return;
    }
    if (type === "template" && blockPlainText(block).trim()) {
      insertTemplate(block);
      return;
    }
    turnInto(block, type);
  }

  function renderBlockColor(block, el) {
    if (block.color) el.classList.add(`is-color-${block.color}`);
    if (block.background) el.classList.add(`is-bg-${block.background}`);
  }

  /* ---------------- events: editing ---------------- */
  container.addEventListener("input", (event) => {
    const el = event.target.closest(".block");
    if (!el) return;
    const block = blockById(el.dataset.id);
    if (!block) return;

    const dbPropName = event.target.closest(".db-prop-name");
    if (dbPropName && block.type === "database") {
      const property = databaseProperty(block, dbPropName.dataset.dbProp);
      if (property) {
        const name = dbPropName.textContent.trim();
        if (name) property.name = name;
        save();
      }
      return;
    }

    const dbCell = event.target.closest(".db-cell, .db-card-title");
    if (dbCell) {
      const row = rowById(block, dbCell.dataset.dbRow);
      const property = databaseProperty(block, dbCell.dataset.dbProp);
      if (row && property) {
        if (property.type === "number") {
          const raw = dbCell.textContent.trim();
          row.cells[property.id] = raw === "" ? null : Number(raw);
        } else {
          row.cells[property.id] = dbCell.textContent;
        }
        touchRow(block, row);
        save();
      }
      return;
    }

    const tableCell = event.target.closest(".table-cell");
    if (tableCell) {
      const rowIndex = Number(tableCell.dataset.row);
      const columnIndex = Number(tableCell.dataset.col);
      if (block.rows?.[rowIndex]) block.rows[rowIndex][columnIndex] = tableCell.textContent;
      save();
      return;
    }

    const toggleBody = event.target.closest(".toggle-body");
    if (toggleBody) {
      block.body = toggleBody.innerHTML;
      save();
      return;
    }

    const column = event.target.closest(".block-column");
    if (column) {
      block.columns[Number(column.dataset.col)] = column.innerHTML;
      save();
      return;
    }

    const caption = event.target.closest(".image-caption");
    if (caption) {
      block.caption = caption.innerHTML;
      save();
      return;
    }

    const codeInput = event.target.closest(".code-input");
    if (codeInput && block.type === "code") {
      const source = codeInput.textContent.replace(/\n$/, "");
      block.text = escapeHtml(source);
      const preview = el.querySelector(".code-render");
      if (preview) preview.innerHTML = highlightCode(source, block.language);
      save();
      return;
    }

    const mathInline = event.target.closest(".math-inline");
    if (mathInline) return;

    const input = event.target.closest(".block__input");
    if (!input) return;

    if (input.classList.contains("synced-input")) {
      const syncId = input.dataset.syncId;
      if (!syncId) return;
      block.text = input.innerHTML;
      onSyncedUpdate?.(syncId, input.innerHTML);
      container.querySelectorAll(".synced-input").forEach((other) => {
        if (other !== input && other.dataset.syncId === syncId) other.innerHTML = input.innerHTML;
      });
      save();
      return;
    }

    if (block.type === "math") {
      block.text = input.textContent;
      save();
      renderMathInto(block.text, el.querySelector(".math-preview"));
      return;
    }

    block.text = input.innerHTML;
    save();

    if (mention && mention.blockId === block.id) {
      const query = mentionQueryFor(input.textContent || "");
      if (query === null) closeMention();
      else {
        mention.query = query;
        renderMention();
      }
      return;
    }

    if (slash && slash.blockId === block.id) {
      const source = slash.target || input;
      const text = source?.textContent ?? input.textContent;
      const index = text.indexOf("/");
      if (index >= 0 && (modeForSlash() === "transform")) {
        slash.query = text.slice(index + 1);
        renderSlash();
      } else if (text.startsWith("/")) {
        slash.query = text.slice(1);
        renderSlash();
      } else {
        closeSlash();
      }
      return;
    }

    if (INLINE_MATH_TYPES.has(block.type) && applyInlineMath(input, block)) return;

    if (runQuickCommand(input.textContent, block, input)) return;

    if (block.type === "paragraph") {
      const text = input.textContent;
      const shortcuts = [
        [/^# $/, "h1"],
        [/^## $/, "h2"],
        [/^### $/, "h3"],
        [/^[-*] $/, "bulleted"],
        [/^1[.)] $/, "numbered"],
        [/^\[ ?\] $/, "todo"],
        [/^> $/, "quote"],
        [/^```$/, "code"],
        [/^---$/, "divider"],
      ];
      for (const [pattern, type] of shortcuts) {
        if (!pattern.test(text)) continue;
        block.text = "";
        if (type === "divider") {
          block.type = "divider";
          save();
          render();
          const index = page.blocks.indexOf(block);
          const next = page.blocks[index + 1] ?? createBlock("paragraph");
          if (!page.blocks[index + 1]) page.blocks.push(next);
          save();
          render();
          focusBlock(next.id, "start");
        } else {
          block.type = type;
          if (type === "callout") block.emoji = "💡";
          if (type === "code") block.language = "javascript";
          save();
          render();
          focusBlock(block.id, "start");
        }
        return;
      }
    }
  });

  /* ---------------- quick commands ---------------- */
  const QUICK_COMMANDS = [
    { match: /^\/today$/i, run: (block) => void (block.type = "date") },
    {
      match: /^\/tomorrow$/i,
      run: (block) => {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        block.type = "date";
        block.text = isoTodayFrom(date);
      },
    },
    {
      match: /^\/yesterday$/i,
      run: (block) => {
        const date = new Date();
        date.setDate(date.getDate() - 1);
        block.type = "date";
        block.text = isoTodayFrom(date);
      },
    },
    { match: /^\/date$/i, run: (block) => void (block.type = "date") },
    { match: /^\/todo$/i, run: (block) => void (block.type = "todo") },
    { match: /^\/check$/i, run: (block) => void (block.type = "todo") },
    { match: /^\/bulleted?$/i, run: (block) => void (block.type = "bulleted") },
    { match: /^\/numbered?$/i, run: (block) => void (block.type = "numbered") },
    { match: /^\/heading$/i, run: (block) => void (block.type = "h2") },
    { match: /^\/quote$/i, run: (block) => void (block.type = "quote") },
    { match: /^\/code$/i, run: (block) => void (block.type = "code") },
    { match: /^\/callout$/i, run: (block) => void (block.type = "callout") },
    { match: /^\/divider$/i, run: (block) => void (block.type = "divider") },
    { match: /^\/page$/i, run: (block) => void (block.type = "page") },
    {
      match: /^\/button$/i,
      run: (block) => {
        block.type = "button";
        block.label = "Button";
        block.url = "";
      },
    },
  ];

  function isoTodayFrom(date) {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function evaluateMathExpression(expression) {
    const text = String(expression || "").replace(/[^*/+\-()\d.\s]/g, "");
    if (!text || !/[+\-*/]/.test(text)) return null;
    if (!/^[\d\s+\-*/().]+$/.test(text)) return null;
    try {
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${text});`)();
      if (!Number.isFinite(value)) return null;
      return Number(value.toFixed(6));
    } catch {
      return null;
    }
  }

  function runQuickCommand(text, block, input) {
    const raw = String(text || "").trim();

    if (/^=/.test(raw)) {
      const result = evaluateMathExpression(raw.slice(1));
      if (result === null) return false;
      const next = createBlock("paragraph", escapeHtml(`= ${raw.slice(1)} = ${result}`));
      const index = page.blocks.indexOf(block);
      block.text = "";
      page.blocks.splice(index + 1, 0, next);
      save();
      render();
      focusBlock(next.id, "end");
      onToast?.(`= ${raw.slice(1)} → ${result}`);
      return true;
    }

    const command = QUICK_COMMANDS.find((item) => item.match.test(raw));
    if (!command) return false;
    block.text = "";
    command.run(block);
    if (block.type === "date") block.text = block.text || isoToday();
    save();
    render();
    if (!block.text) focusBlock(block.id, "start");
    void input;
    return true;
  }

  function writeTarget(target, block) {
    if (target.classList.contains("block__input")) block.text = target.innerHTML;
    else if (target.classList.contains("toggle-body")) block.body = target.innerHTML;
    else if (target.classList.contains("block-column")) {
      block.columns[Number(target.dataset.col)] = target.innerHTML;
    } else if (target.classList.contains("table-cell")) {
      const row = Number(target.dataset.row);
      const col = Number(target.dataset.col);
      if (block.rows?.[row]) block.rows[row][col] = target.textContent;
    } else if (target.classList.contains("image-caption")) {
      block.caption = target.innerHTML;
    }
  }

  container.addEventListener("paste", (event) => {
    const target = event.target.closest(
      ".block__input, .toggle-body, .block-column, .table-cell, .image-caption"
    );
    if (!target) return;
    const el = target.closest(".block");
    const block = blockById(el?.dataset.id);
    if (!block) return;

    const html = event.clipboardData?.getData("text/html") ?? "";
    const text = event.clipboardData?.getData("text/plain") ?? "";

    if (html) {
      event.preventDefault();
      document.execCommand("insertHTML", false, sanitizeHtml(html));
      writeTarget(target, block);
      save();
      return;
    }

    if (target.classList.contains("block__input") && /[\r\n]/.test(text)) {
      event.preventDefault();
      const lines = text.replace(/\r/g, "").split("\n");
      const index = page.blocks.indexOf(block);
      block.text = escapeHtml(lines[0]);

      const additions = [];
      for (const line of lines.slice(1)) {
        let type = "paragraph";
        let value = line;
        let checked = false;
        if (/^###\s+/.test(line)) {
          type = "h3";
          value = line.replace(/^###\s+/, "");
        } else if (/^##\s+/.test(line)) {
          type = "h2";
          value = line.replace(/^##\s+/, "");
        } else if (/^#\s+/.test(line)) {
          type = "h1";
          value = line.replace(/^#\s+/, "");
        } else if (/^[-*]\s+/.test(line)) {
          type = "bulleted";
          value = line.replace(/^[-*]\s+/, "");
        } else if (/^\d+[.)]\s+/.test(line)) {
          type = "numbered";
          value = line.replace(/^\d+[.)]\s+/, "");
        } else if (/^\[[ x]\]\s+/i.test(line)) {
          type = "todo";
          checked = /^\[x\]/i.test(line);
          value = line.replace(/^\[[ x]\]\s+/i, "");
        } else if (/^>\s+/.test(line)) {
          type = "quote";
          value = line.replace(/^>\s+/, "");
        }
        additions.push(createBlock(type, escapeHtml(value), checked ? { checked: true } : {}));
      }

      page.blocks.splice(index + 1, 0, ...additions);
      save();
      render();
      if (additions.length) focusBlock(additions[additions.length - 1].id, "end");
    }
  });

  container.addEventListener("change", (event) => {
    const el = event.target.closest(".block");
    if (!el) return;
    const block = blockById(el.dataset.id);
    if (!block) return;

    if (block.type === "database" && handleDatabaseFieldChange(block, event)) return;

    const selectCell = event.target.closest(".db-cell-select");
    if (selectCell) {
      const row = (block.rows || []).find((item) => item.id === selectCell.dataset.dbRow);
      if (row) {
        row.cells[selectCell.dataset.dbProp] = selectCell.value;
        save();
        render();
      }
      return;
    }

    const dateCell = event.target.closest(".db-cell-date");
    if (dateCell) {
      const row = (block.rows || []).find((item) => item.id === dateCell.dataset.dbRow);
      if (row) {
        row.cells[dateCell.dataset.dbProp] = dateCell.value;
        save();
      }
      return;
    }

    const numberCell = event.target.closest(".db-cell-number");
    if (numberCell) {
      const row = (block.rows || []).find((item) => item.id === numberCell.dataset.dbRow);
      if (row) {
        row.cells[numberCell.dataset.dbProp] = numberCell.value;
        save();
      }
      return;
    }

    const checkCell = event.target.closest(".db-cell-check");
    if (checkCell) {
      const row = (block.rows || []).find((item) => item.id === checkCell.dataset.dbRow);
      if (row) {
        row.cells[checkCell.dataset.dbProp] = checkCell.checked;
        save();
      }
      return;
    }

    const filter = event.target.closest(".db-filter");
    if (filter) {
      block.filterText = filter.value;
      save();
      render();
      return;
    }

    const sortProperty = event.target.closest(".db-sort-prop");
    if (sortProperty) {
      block.sortProperty = sortProperty.value;
      save();
      render();
      return;
    }

    const sortDirection = event.target.closest(".db-sort-dir");
    if (sortDirection) {
      block.sortDirection = sortDirection.value;
      save();
      render();
      return;
    }

    const boardGroup = event.target.closest(".db-board-group");
    if (boardGroup) {
      block.boardGroupBy = boardGroup.value;
      save();
      render();
    }
  });

  container.addEventListener("keydown", (event) => {
    if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const owner = event.target.closest(".toggle-body, .block-column");
      if (owner && owner.textContent.trim() === "") {
        const host = event.target.closest(".block");
        const hostBlock = blockById(host?.dataset.id);
        if (hostBlock) {
          event.preventDefault();
          closeSlash();
          setTimeout(() => openSlash(host, "insert-after", "", null, owner), 0);
          return;
        }
      }
    }

    const input = event.target.closest(".block__input");
    if (!input) return;
    const el = input.closest(".block");
    const block = blockById(el.dataset.id);
    if (!block) return;

    if (event.key === "@" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const input = event.target;
      if (input.classList.contains("block__input") || input.classList.contains("toggle-body")) {
        const caretOffset = caretOffsetIn(input);
        const before = caretOffset > 0 ? input.textContent.slice(0, caretOffset) : "";
        if (before === "" || /\s$/.test(before)) {
          setTimeout(() => openMention(el), 0);
        }
      }
      return;
    }

    if (mention) {
      const items = mentionItems();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        mention.index = (mention.index + 1) % Math.max(1, items.length);
        renderMention();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        mention.index = (mention.index - 1 + items.length) % Math.max(1, items.length);
        renderMention();
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        if (items[mention.index]) applyMention(items[mention.index]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeMention();
        return;
      }
    }

    if (slash) {
      const items = filteredItems();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        slash.index = (slash.index + 1) % Math.max(1, items.length);
        renderSlash();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        slash.index = (slash.index - 1 + items.length) % Math.max(1, items.length);
        renderSlash();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (items[slash.index]) applySlash(items[slash.index].type);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeSlash();
        return;
      }
    }

    if (event.key === "/" && !event.metaKey && !event.ctrlKey) {
      if (input.textContent === "") {
        closeSlash();
        setTimeout(() => openSlash(el, "transform", "", null, input), 0);
      }
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && block.type !== "code") {
      event.preventDefault();
      splitBlock(el);
      return;
    }

    if (event.key === "Enter" && event.shiftKey && block.type !== "code") {
      event.preventDefault();
      document.execCommand("insertLineBreak");
      return;
    }

    if (event.key === "Backspace" && !event.shiftKey) {
      if (!caretAtStart(input)) return;
      if (block.level > 0) {
        event.preventDefault();
        block.level -= 1;
        save();
        render();
        focusBlock(block.id, "start");
        return;
      }
      const index = page.blocks.indexOf(block);
      if (input.textContent === "" && page.blocks.length > 1) {
        event.preventDefault();
        page.blocks.splice(index, 1);
        save();
        render();
        const target = page.blocks[Math.max(0, index - 1)];
        focusBlock(target.id, "end");
        return;
      }
      if (index === 0) return;
      const previous = page.blocks[index - 1];
      if (previous.type === "divider" || previous.type === "code") return;
      event.preventDefault();
      previous.text = (previous.text || "") + input.innerHTML;
      page.blocks.splice(index, 1);
      save();
      render();
      focusBlock(previous.id, "end");
      return;
    }

    if (event.key === "Tab" && LIST_TYPES.has(block.type)) {
      event.preventDefault();
      const next = event.shiftKey ? Math.max(0, block.level - 1) : Math.min(4, block.level + 1);
      if (next === block.level) return;
      block.level = next;
      save();
      render();
      focusBlock(block.id, "start");
      return;
    }

    if (event.key === "ArrowUp" && caretAtStart(input) && !event.shiftKey) {
      const index = page.blocks.indexOf(block);
      if (index > 0) {
        event.preventDefault();
        focusBlock(page.blocks[index - 1].id, "end");
      }
      return;
    }

    if (event.key === "ArrowDown" && caretAtEnd(input) && !event.shiftKey) {
      const index = page.blocks.indexOf(block);
      if (index < page.blocks.length - 1) {
        event.preventDefault();
        focusBlock(page.blocks[index + 1].id, "start");
      }
      return;
    }

    if (event.key === "Escape") closeSlash();
  });

  container.addEventListener("focusin", (event) => {
    const el = event.target.closest(".block");
    if (!el) return;
    if (activeBlockId && activeBlockId !== el.dataset.id) {
      elById(activeBlockId)?.classList.remove("is-focused");
    }
    activeBlockId = el.dataset.id;
    el.classList.add("is-focused");
  });

  container.addEventListener("focusout", (event) => {
    const el = event.target.closest?.(".block");
    if (!el) return;
    if (!el.contains(event.relatedTarget)) el.classList.remove("is-focused");
  });

  container.addEventListener("click", (event) => {
    const el = event.target.closest(".block");
    if (!el) return;
    const block = blockById(el.dataset.id);

    const editable = event.target.closest(".block__input");
    if (
      editable &&
      commentAnchors.length &&
      typeof document.caretRangeFromPoint === "function"
    ) {
      const caret = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (caret && editable.contains(caret.startContainer)) {
        const offset = textOffsetWithin(editable, caret.startContainer, caret.startOffset);
        const hit = commentAnchors.find(
          (anchor) =>
            anchor.blockId === block?.id &&
            anchor.start != null &&
            !anchor.orphaned &&
            offset >= anchor.start &&
            offset <= anchor.end
        );
        if (hit) {
          onCommentAnchorClick?.(hit);
          return;
        }
      }
    }


    if (block?.type === "database" && handleDatabaseAction(block, event)) return;

    const toggle = event.target.closest("[data-toggle]");
    if (toggle && block) {
      block.open = !block.open;
      save();
      render();
      return;
    }

    const tableAction = event.target.closest("[data-table-action]");
    if (tableAction && block) {
      const action = tableAction.dataset.tableAction;
      if (action === "row") {
        const width = block.rows?.[0]?.length || 2;
        block.rows.push(new Array(width).fill(""));
      } else if (action === "col") {
        for (const row of block.rows) row.push("");
      } else if (action === "delete-row") {
        if ((block.rows || []).length <= 1) {
          onToast?.("A table needs at least one row");
          return;
        }
        const lastRow = block.rows.length - 1;
        block.rows.splice(lastRow, 1);
      } else if (action === "delete-col") {
        const width = block.rows?.[0]?.length || 0;
        if (width <= 1) {
          onToast?.("A table needs at least one column");
          return;
        }
        for (const row of block.rows) row.splice(width - 1, 1);
      } else if (action === "align-left" || action === "align-center" || action === "align-right") {
        block.align = action.replace("align-", "");
      } else if (action === "header-row") {
        block.headerRow = block.headerRow === false;
      } else if (action === "header-column") {
        block.headerColumn = block.headerColumn === false;
      } else if (action === "cell-color" || action === "clear-color") {
        const focused = container.querySelector(".table-cell:focus");
        if (!focused) {
          onToast?.("Click a table cell first, then pick a color");
          return;
        }
        const key = `${focused.dataset.row}:${focused.dataset.col}`;
        if (!block.cellColors || typeof block.cellColors !== "object") block.cellColors = {};
        if (action === "clear-color") delete block.cellColors[key];
        else block.cellColors[key] = tableAction.dataset.color || "";
      }
      save();
      render();
      return;
    }

    const mediaAction = event.target.closest("[data-media-action]");
    if (mediaAction && block) {
      const action = mediaAction.dataset.mediaAction;
      const kind = mediaAction.dataset.blockKind || block.type;

      if (action === "upload") {
        if (kind === "image") {
          pendingImageBlockId = block.id;
          imageFileInput.value = "";
          imageFileInput.click();
        } else {
          requestMediaUpload(block.id, kind);
        }
        return;
      }

      if (action === "url") {
        if (kind === "image") {
          const current =
            block.src && !block.src.startsWith("data:") ? block.src : "https://";
          const value = window.prompt("Image URL", current);
          if (value === null) return;
          const clean = safeUrl(value, { image: true });
          if (!clean) {
            onToast?.("Use an http(s) or image URL");
            return;
          }
          block.src = clean;
          block.file = null;
          save();
          render();
          return;
        }

        const promptText = MEDIA_COPY[kind]?.prompt || "URL";
        const value = window.prompt(promptText, block.url || "https://");
        if (value === null) return;
        const clean = safeUrl(value);
        if (!clean) {
          onToast?.("Use a valid http(s) URL");
          return;
        }
        block.url = clean;
        block.src = "";
        block.file = null;
        save();
        render();
        return;
      }

      if (action === "remove") {
        if (kind === "image") {
          block.src = "";
        } else if (kind === "file") {
          block.file = null;
        } else {
          block.url = "";
          block.src = "";
          block.file = null;
          block.caption = "";
        }
        save();
        render();
        return;
      }
    }

    const buttonAction = event.target.closest("[data-button-action]");
    if (buttonAction && block) {
      const action = buttonAction.dataset.buttonAction;
      if (action === "click") {
        const url = safeUrl(buttonAction.dataset.url);
        if (!url) {
          onToast?.("Add a link to this button first");
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      if (action === "label") {
        const value = window.prompt("Button label", block.label || "Button");
        if (value === null) return;
        block.label = value.trim() || "Button";
        save();
        render();
        return;
      }
      if (action === "url") {
        const value = window.prompt("Button link", block.url || "https://");
        if (value === null) return;
        const clean = safeUrl(value);
        if (!clean) {
          onToast?.("Use a valid http(s) URL");
          return;
        }
        block.url = clean;
        save();
        render();
        return;
      }
      if (action === "remove") {
        block.url = "";
        save();
        render();
        return;
      }
    }

    const templateAction = event.target.closest("[data-template-action]");
    if (templateAction && block) {
      const action = templateAction.dataset.templateAction;
      if (action === "insert") {
        insertTemplate(block);
        return;
      }
      if (action === "label") {
        const value = window.prompt("Template label", block.label || "Template");
        if (value === null) return;
        block.label = value.trim() || "Template";
        save();
        render();
        return;
      }
      if (action === "edit") {
        editTemplate(block);
        return;
      }
      if (action === "reset") {
        block.template = defaultTemplateRows();
        save();
        render();
        return;
      }
    }

    const pageBlockAction = event.target.closest("[data-page-block-action]");
    if (pageBlockAction && block) {
      const action = pageBlockAction.dataset.pageBlockAction;
      if (action === "open") {
        const target = (getPages?.() ?? []).find((item) => item.id === block.pageId);
        if (target) onOpenPage?.(target.id);
        return;
      }
      if (action === "create") {
        const created = onCreatePage?.({ parentId: page?.id ?? null });
        if (created?.id) {
          block.pageId = created.id;
          save();
          render();
        }
        return;
      }
      if (action === "detach") {
        block.pageId = "";
        save();
        render();
        return;
      }
    }

    const mentionHit = event.target.closest(".mention");
    if (mentionHit) {
      const pageId = mentionHit.dataset.pageId;
      if (pageId) onOpenPage?.(pageId);
      return;
    }

    const breadcrumbItem = event.target.closest("[data-breadcrumb-id]");
    if (breadcrumbItem) {
      onOpenPage?.(breadcrumbItem.dataset.breadcrumbId);
      return;
    }

    const attachmentAction = event.target.closest("[data-attachment-action]");
    if (attachmentAction && block) {
      const action = attachmentAction.dataset.attachmentAction;
      if (action === "upload") {
        requestAttachmentUpload(block.id);
        return;
      }
      if (action === "remove") {
        block.attachment = null;
        save();
        render();
        return;
      }
      if (action === "verify") {
        verifyAttachment(block, attachmentAction.closest(".attachment-card"));
        return;
      }
    }

    const embedAction = event.target.closest("[data-embed-action]");
    if (embedAction && block) {
      const action = embedAction.dataset.embedAction;
      if (action === "remove") {
        block.url = "";
        save();
        render();
        return;
      }
      const value = window.prompt("YouTube or Vimeo URL", block.url || "https://");
      if (value === null) return;
      const clean = safeUrl(value);
      if (!clean) {
        onToast?.("Use a valid http(s) video URL");
        return;
      }
      block.url = clean;
      save();
      render();
      return;
    }

    const bookmarkAction = event.target.closest("[data-bookmark-action]");
    if (bookmarkAction && block) {
      const action = bookmarkAction.dataset.bookmarkAction;
      if (action === "remove") {
        block.url = "";
        block.title = "";
        save();
        render();
        return;
      }
      const value = window.prompt("Bookmark URL", block.url || "https://");
      if (value === null) return;
      const clean = safeUrl(value);
      if (!clean) {
        onToast?.("Use a valid http(s) URL");
        return;
      }
      block.url = clean;
      const title = window.prompt("Bookmark title", block.title || clean);
      block.title = (title || clean).trim();
      save();
      render();
      return;
    }

    const tocLink = event.target.closest("[data-toc-id]");
    if (tocLink) {
      scrollToBlock(tocLink.dataset.tocId);
      return;
    }

    const control = event.target.closest("[data-control]");
    if (control) {
      event.preventDefault();
      if (control.dataset.control === "add") {
        openSlash(el, "insert-after", "", control.getBoundingClientRect());
      } else {
        openBlockMenu(block, control.getBoundingClientRect());
      }
      return;
    }

    if (event.target.closest(".todo-check") && block) {
      block.checked = !block.checked;
      el.classList.toggle("is-checked", block.checked);
      save();
      return;
    }

    if (event.target.closest(".callout-emoji") && block) {
      const options = ["💡", "✦", "⚡", "📌", "🎯", "✅"];
      const index = options.indexOf(block.emoji);
      block.emoji = options[(index + 1) % options.length];
      event.target.textContent = block.emoji;
      save();
      return;
    }

    const codeAction = event.target.closest("[data-code-action]");
    if (codeAction && block?.type === "code") {
      const action = codeAction.dataset.codeAction;

      if (action === "language") {
        closeCodeLanguages();
        const picker = document.createElement("div");
        picker.className = "popover code-lang-picker";
        for (const key of CODE_LANGUAGES) {
          const option = document.createElement("button");
          option.type = "button";
          option.className = "code-lang-option";
          option.dataset.codeAction = "language-pick";
          option.dataset.language = key;
          option.textContent = LANGUAGE_LABELS[key] || key;
          option.addEventListener("mousedown", (event) => event.preventDefault());
          option.addEventListener("click", () => {
            block.language = key;
            closeCodeLanguages();
            save();
            render();
          });
          picker.appendChild(option);
        }
        codeAction.parentElement.appendChild(picker);
        return;
      }

      if (action === "language-pick") {
        block.language = codeAction.dataset.language || "plain";
        closeCodeLanguages();
        save();
        render();
        return;
      }

      if (action === "copy") {
        const source = plainText(block.text);
        navigator.clipboard?.writeText(source).then(
          () => onToast?.("Code copied"),
          () => onToast?.("Could not copy to the clipboard")
        );
        return;
      }

      if (action === "wrap") {
        block.wrap = !block.wrap;
        save();
        render();
        return;
      }
    }

    if (event.target.closest(".todo-check") && block) {
      const input = inputOf(el);
      if (input) focusBlock(block.id, "end");
    }
  });

  /* ---------------- block menu ---------------- */
  let menuBlockId = null;

  const colorControl = (() => {
    const wrap = document.createElement("div");
    wrap.className = "popover__colors";
    wrap.hidden = true;

    const textRow = document.createElement("div");
    textRow.className = "popover__swatches";
    for (const color of BLOCK_COLORS) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "popover__swatch";
      swatch.dataset.blockAction = "color";
      swatch.dataset.color = color.id;
      swatch.title = `${color.label} text`;
      swatch.style.setProperty("--swatch", color.swatch);
      if (!color.id) swatch.classList.add("is-default");
      textRow.appendChild(swatch);
    }
    wrap.appendChild(textRow);

    const backgroundRow = document.createElement("div");
    backgroundRow.className = "popover__swatches";
    for (const color of BLOCK_COLORS) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "popover__swatch";
      swatch.dataset.blockAction = "background";
      swatch.dataset.color = color.id;
      swatch.title = `${color.label} background`;
      swatch.style.setProperty("--swatch", color.swatch);
      if (!color.id) swatch.classList.add("is-default");
      backgroundRow.appendChild(swatch);
    }
    wrap.appendChild(backgroundRow);

    blockMenu.appendChild(wrap);
    return wrap;
  })();

  function hideColorControl() {
    colorControl.hidden = true;
    colorControl.remove();
    blockMenu.appendChild(colorControl);
  }

  function showColorControl(block) {
    colorControl.hidden = false;
    colorControl.querySelectorAll(".popover__swatch").forEach((swatch) => {
      const active =
        block[swatch.dataset.blockAction] === (swatch.dataset.color || "");
      swatch.classList.toggle("is-active", active);
    });
    const rect = blockMenu.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 12) {
      blockMenu.style.top = `${Math.max(12, window.innerHeight - rect.height - 12)}px`;
    }
  }

  function openBlockMenu(block, rect) {
    menuBlockId = block.id;
    hideColorControl();
    blockMenu.hidden = false;
    blockMenu.style.left = "0px";
    blockMenu.style.top = "0px";
    const width = blockMenu.offsetWidth;
    const height = blockMenu.offsetHeight;
    blockMenu.style.left = `${Math.min(rect.left, window.innerWidth - width - 12)}px`;
    blockMenu.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - height - 12)}px`;
  }

  blockMenu.addEventListener("click", (event) => {
    const menuControl = event.target.closest("[data-block-action]");
    const action = menuControl?.dataset.blockAction;
    if (!action || !menuBlockId) return;
    const colorValue = menuControl.dataset.color ?? "";
    const block = blockById(menuBlockId);
    if (!block) return;
    const index = page.blocks.indexOf(block);

    if (action === "color" || action === "background") {
      block[action] = block[action] === colorValue ? "" : colorValue;
      save();
      render();
      showColorControl(block);
      return;
    }

    blockMenu.hidden = true;
    hideColorControl();

    if (action === "comment") {
      onComment?.({ blockId: block.id, quote: blockPlainText(block).trim().slice(0, 240) });
      return;
    }

    if (action === "delete") {
      page.blocks.splice(index, 1);
      if (page.blocks.length === 0) page.blocks.push(createBlock("paragraph"));
      save();
      render();
      focusBlock(page.blocks[Math.max(0, index - 1)].id, "end");
      return;
    }

    if (action === "duplicate") {
      const copy = structuredClone(block);
      copy.id = createBlock().id;
      page.blocks.splice(index + 1, 0, copy);
      save();
      render();
      focusBlock(copy.id, "end");
      return;
    }

    if (action === "up" || action === "down") {
      const target = index + (action === "up" ? -1 : 1);
      if (target < 0 || target >= page.blocks.length) return;
      page.blocks.splice(index, 1);
      page.blocks.splice(target, 0, block);
      save();
      render();
      focusBlock(block.id, "end");
      return;
    }

    if (action === "color") {
      block.color = block.color === colorValue ? "" : colorValue;
      save();
      render();
      return;
    }

    if (action === "background") {
      block.background = block.background === colorValue ? "" : colorValue;
      save();
      render();
      return;
    }

    if (action.startsWith("turn-")) {
      turnInto(block, action.replace("turn-", ""));
    }
  });

  /* ---------------- table column resize ---------------- */
  let resizeState = null;

  container.addEventListener("mousedown", (event) => {
    const resizer = event.target.closest('[data-table-action="resize"]');
    if (!resizer) return;
    event.preventDefault();
    event.stopPropagation();
    const el = resizer.closest(".block");
    const block = blockById(el?.dataset.id);
    const cell = resizer.closest("td, th");
    if (!block || !cell) return;
    resizeState = {
      block,
      column: Number(resizer.dataset.col),
      startX: event.clientX,
      startWidth: cell.getBoundingClientRect().width,
    };
  });

  document.addEventListener("mousemove", (event) => {
    if (!resizeState) return;
    const width = Math.max(60, resizeState.startWidth + (event.clientX - resizeState.startX));
    const widths = Array.isArray(resizeState.block.colWidths) ? [...resizeState.block.colWidths] : [];
    widths[resizeState.column] = Math.round(width);
    resizeState.block.colWidths = widths;
    const cell = container.querySelector(
      `.block[data-id="${CSS.escape(resizeState.block.id)}"] .table-cell[data-col="${resizeState.column}"]`
    );
    if (cell) cell.style.width = `${Math.round(width)}px`;
  });

  document.addEventListener("mouseup", () => {
    if (!resizeState) return;
    resizeState = null;
    save();
  });

  /* ---------------- drag & drop ---------------- */
  let dbDrag = null;

  container.addEventListener("dragstart", (event) => {
    const rowNode = event.target.closest(".db-row-handle, .db-board-card, .db-gallery-card, .db-list-row, .db-cal-item, .db-timeline-bar");
    if (rowNode) {
      const el = rowNode.closest(".block");
      const block = blockById(el?.dataset.id);
      if (!block || block.type !== "database") return;
      dbDrag = { block, rowId: rowNode.dataset.dbRow };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", rowNode.dataset.dbRow || "");
      rowNode.classList.add("is-dragging");
      return;
    }

    const control = event.target.closest('[data-control="menu"]');
    if (!control) return;
    const el = control.closest(".block");
    dragId = el.dataset.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragId);
    el.classList.add("is-dragging");
  });

  container.addEventListener("dragover", (event) => {
    if (dbDrag) {
      const dropZone = event.target.closest("[data-db-drop]");
      if (!dropZone) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      container.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
      dropZone.classList.add("is-drop-target");
      return;
    }

    if (!dragId) return;
    const el = event.target.closest(".block");
    if (!el || el.dataset.id === dragId) return;
    event.preventDefault();
    container.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
    el.classList.add("is-drop-target");
  });

  container.addEventListener("drop", (event) => {
    if (dbDrag) {
      const dropZone = event.target.closest("[data-db-drop]");
      if (!dropZone) return;
      event.preventDefault();
      const { block, rowId } = dbDrag;
      const row = rowById(block, rowId);
      if (!row) return;
      const mode = dropZone.dataset.dbDrop;

      if (mode === "group") {
        if (block.views?.length) {
          const view = databaseView(block);
          if (view.type === "calendar") {
            const dateProperty = (block.properties || []).find((item) => item.type === "date");
            if (dateProperty && /^\d{4}-\d{2}-\d{2}$/.test(dropZone.dataset.dbGroupValue || "")) {
              row.cells[dateProperty.id] = dropZone.dataset.dbGroupValue;
            }
          } else {
            const group =
              databaseProperty(block, block.boardGroupBy) ||
              (block.properties || []).find(
                (property) => property.type === "status" || property.type === "select"
              );
            if (group) row.cells[group.id] = dropZone.dataset.dbGroupValue ?? "";
          }
        }
      } else if (mode === "row" || mode === "timeline") {
        const targetRow = rowById(block, dropZone.dataset.dbRow);
        if (targetRow && targetRow.id !== row.id) {
          const order = (block.rows || []).filter((item) => item.id !== row.id);
          const at = order.findIndex((item) => item.id === targetRow.id);
          order.splice(Math.max(0, at), 0, row);
          block.rows = order;
        } else {
          const index = Number(dropZone.dataset.dbIndex);
          const order = (block.rows || []).filter((item) => item.id !== row.id);
          if (Number.isFinite(index)) order.splice(Math.min(index, order.length), 0, row);
          block.rows = order;
        }
      } else {
        return;
      }

      dbDrag = null;
      container.querySelectorAll(".is-drop-target, .is-dragging").forEach((node) =>
        node.classList.remove("is-drop-target", "is-dragging")
      );
      touchRow(block, row);
      save();
      render();
      return;
    }

    if (!dragId) return;
    const targetEl = event.target.closest(".block");
    if (!targetEl) return;
    event.preventDefault();
    const targetId = targetEl.dataset.id;
    if (targetId === dragId) return;
    const from = page.blocks.findIndex((block) => block.id === dragId);
    const to = page.blocks.findIndex((block) => block.id === targetId);
    if (from < 0 || to < 0) return;
    const rect = targetEl.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    const [moved] = page.blocks.splice(from, 1);
    let insertAt = page.blocks.findIndex((block) => block.id === targetId);
    if (after) insertAt += 1;
    page.blocks.splice(insertAt, 0, moved);
    save();
    render();
  });

  container.addEventListener("dragend", () => {
    dragId = null;
    dbDrag = null;
    container.querySelectorAll(".is-dragging, .is-drop-target").forEach((node) =>
      node.classList.remove("is-dragging", "is-drop-target")
    );
  });

  /* ---------------- inline toolbar ---------------- */
  function selectionInsideEditor() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return null;
    return range;
  }

  function updateToolbar() {
    const range = selectionInsideEditor();
    if (!range) {
      inlineToolbar.hidden = true;
      return;
    }
    savedRange = range.cloneRange();
    const blockId = range.startContainer.parentElement?.closest(".block")?.dataset.id;
    toolbarBlockId = blockId ?? null;
    const rect = range.getBoundingClientRect();
    inlineToolbar.hidden = false;
    inlineToolbar.style.left = "0px";
    inlineToolbar.style.top = "0px";
    const width = inlineToolbar.offsetWidth;
    inlineToolbar.style.left = `${Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)}px`;
    inlineToolbar.style.top = `${Math.max(8, rect.top - 42)}px`;
  }

  document.addEventListener("selectionchange", () => {
    if (slash) return;
    const active = document.activeElement;
    if (active?.closest?.(".math-inline")) {
      inlineToolbar.hidden = true;
      return;
    }
    updateToolbar();
  });

  inlineToolbar.addEventListener("mousedown", (event) => event.preventDefault());

  const INLINE_HIGHLIGHTS = ["yellow", "green", "blue", "pink", "orange", "red"];
  let inlineHighlight = "yellow";
  let inlineTextColor = "";

  function renderInlineColorPanel(mode) {
    const panel = document.getElementById("inline-color-panel");
    if (!panel) return;
    panel.hidden = false;
    panel.dataset.mode = mode;
    panel.innerHTML = INLINE_HIGHLIGHTS.map(
      (color) =>
        `<button type="button" class="popover__swatch" data-inline-color="${color}" title="${color}" style="--swatch:${
          BLOCK_COLORS.find((entry) => entry.id === color)?.swatch || "#ccc"
        }"></button>`
    ).join("");
  }

  function closeInlineColorPanel() {
    const panel = document.getElementById("inline-color-panel");
    if (panel) panel.hidden = true;
  }

  inlineToolbar.addEventListener("click", (event) => {
    const colorButton = event.target.closest("[data-inline-color]");
    if (colorButton) {
      event.preventDefault();
      const mode = document.getElementById("inline-color-panel")?.dataset.mode;
      const value = colorButton.dataset.inlineColor;
      const sel = window.getSelection();
      if (savedRange && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      const text = sel?.toString() || "";
      if (!text) {
        closeInlineColorPanel();
        inlineToolbar.hidden = true;
        return;
      }
      if (mode === "highlight") {
        inlineHighlight = value;
        document.execCommand(
          "insertHTML",
          false,
          `<mark class="hl-${value}" data-highlight="${value}">${escapeHtml(text)}</mark>&nbsp;`
        );
      } else {
        inlineTextColor = value;
        const swatch = BLOCK_COLORS.find((entry) => entry.id === value)?.swatch || "";
        document.execCommand(
          "insertHTML",
          false,
          `<span class="text-color" data-text-color="${value}" style="color:${escapeHtml(
            swatch
          )}">${escapeHtml(text)}</span>&nbsp;`
        );
      }
      const block = blockById(toolbarBlockId);
      const input = block ? inputOf(elById(toolbarBlockId)) : null;
      if (block && input) {
        block.text = input.innerHTML;
        save();
      }
      closeInlineColorPanel();
      inlineToolbar.hidden = true;
      return;
    }

    const format = event.target.closest("[data-format]")?.dataset.format;
    if (!format) return;

    if (format === "highlight" || format === "color") {
      event.preventDefault();
      renderInlineColorPanel(format === "highlight" ? "highlight" : "color");
      return;
    }

    if (format === "mention") {
      event.preventDefault();
      const block = blockById(toolbarBlockId);
      const blockEl = elById(toolbarBlockId);
      if (!block || !blockEl) return;
      document.execCommand("insertText", false, "@");
      block.text = inputOf(blockEl)?.innerHTML ?? block.text;
      save();
      closeSlash();
      closeMention();
      openMention(blockEl);
      return;
    }
    const sel = window.getSelection();
    if (savedRange && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }

    if (format === "comment") {
      const block = blockById(toolbarBlockId);
      const input = inputOf(elById(toolbarBlockId));
      const rawQuote = sel?.toString() ?? "";
      const trimmed = rawQuote.trim();
      const leading = trimmed ? rawQuote.indexOf(trimmed) : 0;
      const quote = (trimmed || blockPlainText(block).trim()).slice(0, 240);
      let start = null;
      let end = null;
      if (
        input &&
        savedRange &&
        input.contains(savedRange.startContainer) &&
        input.contains(savedRange.endContainer)
      ) {
        start = textOffsetWithin(input, savedRange.startContainer, savedRange.startOffset);
        end = textOffsetWithin(input, savedRange.endContainer, savedRange.endOffset);
        if (trimmed) start += leading;
        end = Math.max(start, Math.min(end, start + quote.length));
      }
      onComment?.({ blockId: toolbarBlockId, quote, start, end });
      inlineToolbar.hidden = true;
      return;
    }

    if (format === "link") {
      const url = window.prompt("Link URL", "https://");
      if (url) document.execCommand("createLink", false, url);
    } else if (format === "code") {
      const text = sel?.toString() ?? "";
      if (text) {
        document.execCommand("insertHTML", false, `<code>${escapeHtml(text)}</code>&nbsp;`);
      }
    } else {
      document.execCommand(format);
    }

    const blockEl = toolbarBlockId ? elById(toolbarBlockId) : null;
    const block = blockEl ? blockById(toolbarBlockId) : null;
    const input = blockEl ? inputOf(blockEl) : null;
    if (block && input) {
      block.text = input.innerHTML;
      save();
    }
    inlineToolbar.hidden = true;
  });

  /* ---------------- public api ---------------- */
  document.addEventListener("mousedown", (event) => {
    if (!event.target.closest(".inline-toolbar")) closeInlineColorPanel();
  });

  document.addEventListener("mousedown", (event) => {
    if (slashMenu.hidden) return;
    if (slashMenu.contains(event.target)) return;
    if (event.target.closest(".block__control")) return;
    if (event.target.closest(".block__input")) {
      // keep the menu when the caret is still in the same block
      const blockId = event.target.closest(".block")?.dataset.id;
      if (slash && blockId === slash.blockId) return;
    }
    closeSlash();
  });

  document.addEventListener("mousedown", (event) => {
    if (mentionMenu.hidden) return;
    if (mentionMenu.contains(event.target)) return;
    const input = event.target.closest(".block__input, .toggle-body");
    if (input && mention && input.closest(".block")?.dataset.id === mention.blockId) return;
    closeMention();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSlash();
      closeMention();
      closeInlineColorPanel();
      closeCodeLanguages();
      closeDatabasePanels();
      blockMenu.hidden = true;
      inlineToolbar.hidden = true;
    }
  });

  window.addEventListener("resize", () => {
    closeSlash();
    closeMention();
  });

  return {
    render,
    focusBlock,
    scrollToBlock,
    applyCommentHighlights,
    closeMention,
    get activeId() {
      return activeBlockId;
    },
    closeSlash,
  };
}
