/* Fuzzy matching + keyboard shortcut helpers shared by search and the command palette. */

export function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Subsequence fuzzy match.
 * Returns { score, positions } or null when the needle is not found.
 * Consecutive hits, word-boundary hits, and prefix hits score higher.
 */
export function fuzzyMatch(needle, haystack) {
  const query = normalizeText(needle).trim();
  const text = normalizeText(haystack);
  if (!query) return { score: 0, positions: [] };
  if (!text) return null;

  let score = 0;
  let textIndex = 0;
  let previousIndex = -1;
  const positions = [];

  for (const char of query) {
    if (char === " ") continue;
    const found = text.indexOf(char, textIndex);
    if (found === -1) return null;

    let charScore = 1;
    if (found === 0) charScore += 6;
    else if (/[\s\-_/(]/.test(text[found - 1])) charScore += 4;
    if (previousIndex !== -1 && found === previousIndex + 1) charScore += 3;

    score += charScore;
    positions.push(found);
    previousIndex = found;
    textIndex = found + 1;
  }

  score -= Math.min(text.length / 40, 4);
  return { score, positions };
}

/** Rank a list of candidates: [{ id, label, keywords?, weight? }] */
export function fuzzyRank(query, candidates, limit = 50) {
  if (!String(query || "").trim()) {
    return candidates
      .slice(0, limit)
      .map((candidate) => ({ item: candidate.item ?? candidate, score: 0, positions: [] }));
  }

  const scored = [];
  for (const candidate of candidates) {
    const labelHit = fuzzyMatch(query, candidate.label);
    if (!labelHit) continue;
    let score = labelHit.score + (candidate.weight || 0);

    if (candidate.keywords) {
      for (const keyword of candidate.keywords) {
        const hit = fuzzyMatch(query, keyword);
        if (hit) score = Math.max(score, hit.score + 1.5);
      }
    }

    scored.push({ item: candidate.item ?? candidate, score, positions: labelHit.positions });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/* ---------------- shortcuts ---------------- */

export const IS_MAC =
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");

export const MOD = IS_MAC ? "⌘" : "Ctrl";

/**
 * Shortcut spec: "Mod+K", "Mod+Shift+P", "?", "Mod+/" …
 * Mod resolves to ⌘ on macOS and Ctrl elsewhere.
 */
export function parseShortcut(spec) {
  const parts = String(spec || "")
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const out = { key: "", mod: false, shift: false, alt: false };

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "mod" || lower === "cmd" || lower === "ctrl") out.mod = true;
    else if (lower === "shift") out.shift = true;
    else if (lower === "alt" || lower === "option") out.alt = true;
    else out.key = part;
  }
  return out;
}

export function formatShortcut(spec) {
  const parsed = parseShortcut(spec);
  const pieces = [];
  if (parsed.mod) pieces.push(IS_MAC ? "⌘" : "Ctrl");
  if (parsed.alt) pieces.push(IS_MAC ? "⌥" : "Alt");
  if (parsed.shift) pieces.push(IS_MAC ? "⇧" : "Shift");
  pieces.push(displayKey(parsed.key));
  return pieces.join(IS_MAC ? "" : "+");
}

function displayKey(key) {
  const lower = String(key || "").toLowerCase();
  const named = {
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    enter: IS_MAC ? "↩" : "Enter",
    escape: "Esc",
    backspace: IS_MAC ? "⌫" : "Backspace",
    delete: "Del",
    space: "Space",
    slash: "/",
    period: ".",
    comma: ",",
    k: "K",
    j: "J",
    n: "N",
    f: "F",
    z: "Z",
    y: "Y",
    p: "P",
    m: "M",
    h: "H",
    shift: "⇧",
  };
  if (named[lower]) return named[lower];
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/* `/` and `?` are the same physical key on most layouts. */
const KEY_ALIASES = {
  "/": ["/", "?"],
  "?": ["?", "/"],
  ".": [".", ">"],
  ",": [",", "<"],
  ";": [";", ":"],
};

export function matchesShortcut(event, spec) {
  const parsed = parseShortcut(spec);
  const modPressed = IS_MAC ? event.metaKey : event.ctrlKey;
  const otherMod = IS_MAC ? event.ctrlKey : event.metaKey;

  if (parsed.mod !== modPressed) return false;
  if (otherMod) return false;
  if (parsed.alt !== Boolean(event.altKey)) return false;
  if (parsed.shift !== Boolean(event.shiftKey) && !KEY_ALIASES[parsed.key]) return false;

  const key = String(event.key || "");
  if (!parsed.key) return false;

  const candidates = KEY_ALIASES[parsed.key] || [parsed.key];
  return candidates.some((candidate) => candidate.toLowerCase() === key.toLowerCase());
}

/** Groups used by the shortcut reference sheet and the palette. */
export const SHORTCUT_GROUPS = [
  {
    id: "global",
    label: "Global",
    items: [
      { keys: "Mod+K", label: "Search pages, teamspaces, and trash" },
      { keys: "Mod+Shift+P", label: "Open the command palette" },
      { keys: "Mod+/", label: "Show every keyboard shortcut" },
      { keys: "?", label: "Show every keyboard shortcut" },
      { keys: "Mod+J", label: "New private page" },
      { keys: "Mod+Shift+N", label: "New teamspace" },
      { keys: "Mod+Shift+T", label: "Start from a template" },
      { keys: "Mod+Shift+D", label: "Toggle dark mode" },
      { keys: "Mod+Shift+L", label: "Toggle the sidebar" },
      { keys: "Mod+Shift+B", label: "Open comments" },
      { keys: "Esc", label: "Close any dialog or menu" },
    ],
  },
  {
    id: "editor",
    label: "Editor",
    items: [
      { keys: "/", label: "Open the block insert menu" },
      { keys: "@", label: "Mention a page or a date" },
      { keys: "=", label: "Quick math, e.g. = 12*3" },
      { keys: "Mod+F", label: "Find in page" },
      { keys: "Mod+Z", label: "Undo" },
      { keys: "Mod+Shift+Z", label: "Redo" },
      { keys: "Mod+Y", label: "Redo" },
      { keys: "Enter", label: "New block below" },
      { keys: "Shift+Enter", label: "Soft line break" },
      { keys: "Backspace", label: "Merge with the block above" },
      { keys: "Tab", label: "Indent a list item" },
      { keys: "Shift+Tab", label: "Outdent a list item" },
      { keys: "Mod+A", label: "Select the block text" },
      { keys: "Mod+B / Mod+I / Mod+U", label: "Bold, italic, underline" },
      { keys: "$x^2$", label: "Inline equation" },
    ],
  },
  {
    id: "markdown",
    label: "Markdown shortcuts",
    items: [
      { keys: "#", label: "Heading 1" },
      { keys: "##", label: "Heading 2" },
      { keys: "###", label: "Heading 3" },
      { keys: "- or *", label: "Bulleted list" },
      { keys: "1.", label: "Numbered list" },
      { keys: "[ ]", label: "To-do item" },
      { keys: ">", label: "Quote" },
      { keys: "```", label: "Code block" },
      { keys: "---", label: "Divider" },
      { keys: "/today", label: "Insert today's date" },
      { keys: "/tomorrow", label: "Insert tomorrow's date" },
    ],
  },
  {
    id: "database",
    label: "Database",
    items: [
      { keys: "Drag card", label: "Move a row between board columns" },
      { keys: "Drag a day", label: "Move a row to another calendar day" },
      { keys: "Drag handle", label: "Reorder rows in table, list, and gallery" },
      { keys: "Click header", label: "Rename, retype, or delete a property" },
      { keys: "+ Property", label: "Add a property of any type" },
      { keys: "⋯", label: "Rename, add, or delete views" },
      { keys: "Filter", label: "Filter by property, value, or status" },
    ],
  },
  {
    id: "blocks",
    label: "Block types",
    items: [
      { keys: "/table", label: "Simple table with header toggles" },
      { keys: "/database", label: "Table, board, gallery, list, calendar, timeline" },
      { keys: "/link", label: "Linked database view of another database" },
      { keys: "/image /video /audio /file", label: "Media blocks with upload" },
      { keys: "/embed", label: "Figma, CodePen, Maps, Loom, Spotify…" },
      { keys: "/toggle", label: "Collapsible content" },
      { keys: "/page", label: "Create a sub-page inline" },
      { keys: "/template", label: "Reusable block template button" },
    ],
  },
];

/** Flat list of every shortcut, for the "type a command" help. */
export function allShortcuts() {
  return SHORTCUT_GROUPS.flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.label }))
  );
}