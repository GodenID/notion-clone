import { createBlock } from "./store.js";
import katex from "../../vendor/katex/katex.mjs";

export const BLOCK_DEFS = [
  { type: "paragraph", label: "Text", desc: "Just start writing with plain text.", icon: "¶", keywords: "text paragraph plain" },
  { type: "h1", label: "Heading 1", desc: "Big section heading.", icon: "H1", keywords: "title heading h1" },
  { type: "h2", label: "Heading 2", desc: "Medium section heading.", icon: "H2", keywords: "heading h2 subtitle" },
  { type: "h3", label: "Heading 3", desc: "Small section heading.", icon: "H3", keywords: "heading h3" },
  { type: "bulleted", label: "Bulleted list", desc: "Create a simple bulleted list.", icon: "•", keywords: "bullet list unordered" },
  { type: "numbered", label: "Numbered list", desc: "Create a list with numbering.", icon: "1.", keywords: "number list ordered" },
  { type: "todo", label: "To-do list", desc: "Track tasks with a checkbox.", icon: "☑", keywords: "todo task checkbox" },
  { type: "toggle", label: "Toggle list", desc: "Collapse details into a toggle.", icon: "▸", keywords: "toggle collapse details" },
  { type: "quote", label: "Quote", desc: "Capture a quote.", icon: "❝", keywords: "quote blockquote" },
  { type: "callout", label: "Callout", desc: "Make writing stand out.", icon: "✦", keywords: "callout note info" },
  { type: "code", label: "Code", desc: "Capture a code snippet.", icon: "</>", keywords: "code snippet pre" },
  { type: "table", label: "Table", desc: "A simple editable table.", icon: "▦", keywords: "table grid rows cells" },
  { type: "database", label: "Database", desc: "Properties, filters, and board view.", icon: "▤", keywords: "database board filter sort properties" },
  { type: "synced", label: "Synced block", desc: "Edit once; every copy updates.", icon: "⇄", keywords: "synced sync block copy" },
  { type: "columns2", label: "2 columns", desc: "Split content into two columns.", icon: "◫", keywords: "columns layout two side by side" },
  { type: "image", label: "Image", desc: "Upload or embed an image.", icon: "🖼", keywords: "image photo picture upload" },
  { type: "attachment", label: "Attachment", desc: "Upload a PDF, Word, CSV, or Excel file.", icon: "📎", keywords: "attachment file upload document pdf word doc docx csv excel xls xlsx" },
  { type: "embed", label: "Video embed", desc: "Embed a YouTube or Vimeo video.", icon: "▶", keywords: "video youtube vimeo embed" },
  { type: "bookmark", label: "Bookmark", desc: "Save a link as a card.", icon: "🔖", keywords: "bookmark link url card" },
  { type: "math", label: "Equation", desc: "Write a LaTeX-style equation.", icon: "∑", keywords: "math equation latex formula" },
  { type: "toc", label: "Table of contents", desc: "List every heading on this page.", icon: "☰", keywords: "toc contents headings index" },
  { type: "pagelink", label: "Link to page", desc: "Link another page and create backlinks.", icon: "↗", keywords: "page link mention backlink" },
  { type: "date", label: "Date", desc: "Insert a date.", icon: "📅", keywords: "date calendar today" },
  { type: "divider", label: "Divider", desc: "Visually divide blocks.", icon: "—", keywords: "divider line hr separator" },
];

const LIST_TYPES = new Set(["bulleted", "numbered", "todo"]);
const CONTINUATION = { bulleted: "bulleted", numbered: "numbered", todo: "todo", quote: "quote" };
const PLACEHOLDER = {
  paragraph: "Type '/' for commands",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
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

const ALLOWED_PASTE_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "S", "STRIKE", "CODE", "BR", "SPAN", "MARK", "A"]);
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
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:/i.test(url)) return url;
  return "";
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
}) {
  let page = null;
  let activeBlockId = null;
  let dragId = null;
  let pendingImageBlockId = null;
  let pendingAttachmentBlockId = null;
  let commentAnchors = [];

  const slashMenu = document.getElementById("slash-menu");
  const slashList = document.getElementById("slash-list");
  const slashEmpty = document.getElementById("slash-empty");
  const slashLabel = document.getElementById("slash-label");
  const blockMenu = document.getElementById("block-menu");
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
    if (type === "callout") block.emoji = block.emoji || "💡";
    if (type === "code" && !block.language) block.language = "javascript";
    if (type === "toggle") {
      block.open = block.open !== false;
      if (typeof block.body !== "string") block.body = "";
    }
    if (type === "table" && !Array.isArray(block.rows)) {
      block.rows = [
        ["Column 1", "Column 2"],
        ["", ""],
      ];
    }
    if (type === "columns2" && !Array.isArray(block.columns)) block.columns = ["", ""];
    if (type === "math" && typeof block.text !== "string") block.text = "";
    if (type === "image" && typeof block.src !== "string") block.src = "";
    if (type === "attachment" && block.attachment && typeof block.attachment !== "object") {
      block.attachment = null;
    }
    if (type === "embed" && typeof block.url !== "string") block.url = "";
    if (type === "bookmark" && typeof block.url !== "string") block.url = "";
    if (type === "pagelink" && typeof block.pageId !== "string") block.pageId = "";
    if (type === "date" && !block.text) block.text = new Date().toISOString().slice(0, 10);
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
        ];
      }
      if (!Array.isArray(block.views) || !block.views.length) {
        block.views = [
          { id: "table", name: "Table", type: "table" },
          { id: "board", name: "Board", type: "board" },
        ];
      }
      if (!block.activeView) block.activeView = block.views[0].id;
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
    }
  }

  function newDatabaseRow(block, overrides = {}) {
    const cells = {};
    for (const property of block.properties || []) {
      cells[property.id] = Object.prototype.hasOwnProperty.call(overrides, property.id)
        ? overrides[property.id]
        : "";
    }
    return { id: createBlock().id, cells };
  }

  function databaseView(block) {
    return (
      (block.views || []).find((view) => view.id === block.activeView) ||
      (block.views || [])[0] || { id: "table", name: "Table", type: "table" }
    );
  }

  function databaseTitleProperty(block) {
    return (
      (block.properties || []).find((property) => property.type === "title") ||
      (block.properties || [])[0] || { id: "title", name: "Name", type: "title" }
    );
  }

  function databaseRows(block) {
    const query = String(block.filterText || "").trim().toLowerCase();
    let rows = [...(block.rows || [])];
    if (query) {
      rows = rows.filter((row) =>
        (block.properties || []).some((property) =>
          String(row.cells?.[property.id] ?? "")
            .toLowerCase()
            .includes(query)
        )
      );
    }
    if (block.sortProperty) {
      const property = (block.properties || []).find((item) => item.id === block.sortProperty);
      if (property) {
        rows.sort((a, b) => {
          const left = String(a.cells?.[property.id] ?? "");
          const right = String(b.cells?.[property.id] ?? "");
          if (!left && right) return 1;
          if (left && !right) return -1;
          let result;
          if (property.type === "number") {
            const leftNumber = Number(left);
            const rightNumber = Number(right);
            result =
              Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
                ? leftNumber - rightNumber
                : left.localeCompare(right, undefined, { numeric: true });
          } else if (property.type === "checkbox") {
            result = Number(Boolean(left)) - Number(Boolean(right));
          } else {
            result = left.localeCompare(right, undefined, { numeric: true });
          }
          return block.sortDirection === "desc" ? -result : result;
        });
      }
    }
    return rows;
  }

  function databaseGroupProperty(block) {
    return (
      (block.properties || []).find((property) => property.id === block.boardGroupBy) ||
      (block.properties || []).find((property) => property.type === "select") ||
      null
    );
  }

  function databaseGroupValue(row, property) {
    return property ? String(row.cells?.[property.id] ?? "") : "";
  }

  function buildDatabase(block) {
    const wrap = document.createElement("div");
    wrap.className = "database-block";
    const view = databaseView(block);
    const titleProperty = databaseTitleProperty(block);
    const rows = databaseRows(block);

    const toolbar = document.createElement("div");
    toolbar.className = "db-toolbar";

    const viewTabs = (block.views || [])
      .map(
        (item) =>
          `<button type="button" class="db-view-tab${item.id === view.id ? " is-active" : ""}" data-db-action="view" data-view="${escapeHtml(
            item.id
          )}">${escapeHtml(item.name)}</button>`
      )
      .join("");

    const sortOptions = (block.properties || [])
      .map(
        (property) =>
          `<option value="${escapeHtml(property.id)}"${
            block.sortProperty === property.id ? " selected" : ""
          }>${escapeHtml(property.name)}</option>`
      )
      .join("");

    const selectProperties = (block.properties || []).filter(
      (property) => property.type === "select"
    );
    const activeGroup = databaseGroupProperty(block);
    const boardGroupControl =
      view.type === "board" && selectProperties.length
        ? `<select class="db-board-group" aria-label="Group by">${selectProperties
            .map(
              (property) =>
                `<option value="${escapeHtml(property.id)}"${
                  property.id === activeGroup?.id ? " selected" : ""
                }>Group: ${escapeHtml(property.name)}</option>`
            )
            .join("")}</select>`
        : "";

    toolbar.innerHTML = `
      <div class="db-view-tabs">${viewTabs}</div>
      <input class="db-filter" type="text" placeholder="Filter…" value="${escapeHtml(
        block.filterText || ""
      )}" />
      <select class="db-sort-prop" aria-label="Sort by">
        <option value="">Sort…</option>${sortOptions}
      </select>
      <select class="db-sort-dir" aria-label="Sort direction">
        <option value="asc"${block.sortDirection !== "desc" ? " selected" : ""}>A–Z</option>
        <option value="desc"${block.sortDirection === "desc" ? " selected" : ""}>Z–A</option>
      </select>
      ${boardGroupControl}
      <span class="db-toolbar__spacer"></span>
      <button type="button" class="db-tool-btn" data-db-action="add-row">+ New</button>
      <button type="button" class="db-tool-btn" data-db-action="add-property">+ Property</button>`;
    wrap.appendChild(toolbar);

    if (view.type === "board") {
      const groupProperty = databaseGroupProperty(block);
      if (!groupProperty) {
        const empty = document.createElement("div");
        empty.className = "db-empty";
        empty.textContent = "Add a select property to group this board.";
        wrap.appendChild(empty);
        return wrap;
      }

      const options = Array.isArray(groupProperty.options) ? [...groupProperty.options] : [];
      const extraValues = [...new Set(rows.map((row) => databaseGroupValue(row, groupProperty)))].filter(
        (value) => value && !options.includes(value)
      );
      options.push(...extraValues, "");

      const board = document.createElement("div");
      board.className = "db-board";

      for (const option of options) {
        const groupRows = rows.filter((row) => databaseGroupValue(row, groupProperty) === option);
        const column = document.createElement("div");
        column.className = "db-board-col";
        column.innerHTML = `
          <div class="db-board-head">
            <span>${escapeHtml(option || "No value")}</span>
            <span>${groupRows.length}</span>
          </div>`;

        for (const row of groupRows) {
          const card = document.createElement("div");
          card.className = "db-board-card";
          card.dataset.dbRow = row.id;

          const title = document.createElement("div");
          title.className = "db-card-title";
          title.contentEditable = "true";
          title.spellcheck = false;
          title.dataset.dbRow = row.id;
          title.dataset.dbProp = titleProperty.id;
          title.dataset.placeholder = "Untitled";
          title.textContent = row.cells?.[titleProperty.id] || "";
          card.appendChild(title);

          const select = document.createElement("select");
          select.className = "db-cell-select db-board-select";
          select.dataset.dbRow = row.id;
          select.dataset.dbProp = groupProperty.id;
          select.innerHTML =
            `<option value="">No value</option>` +
            (groupProperty.options || [])
              .map(
                (value) =>
                  `<option value="${escapeHtml(value)}"${
                    value === option ? " selected" : ""
                  }>${escapeHtml(value)}</option>`
              )
              .join("");
          card.appendChild(select);

          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "db-row-delete";
          remove.dataset.dbAction = "delete-row";
          remove.dataset.dbRow = row.id;
          remove.textContent = "Delete";
          card.appendChild(remove);

          column.appendChild(card);
        }

        const add = document.createElement("button");
        add.type = "button";
        add.className = "db-board-add";
        add.dataset.dbAction = "add-group";
        add.dataset.group = option;
        add.textContent = "+ New";
        column.appendChild(add);
        board.appendChild(column);
      }

      wrap.appendChild(board);
      return wrap;
    }

    const tableWrap = document.createElement("div");
    tableWrap.className = "db-table-wrap";
    const table = document.createElement("table");
    table.className = "db-table";

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const property of block.properties || []) {
      const th = document.createElement("th");
      const name = document.createElement("span");
      name.className = "db-prop-name";
      name.contentEditable = "true";
      name.spellcheck = false;
      name.dataset.dbPropName = property.id;
      name.textContent = property.name;
      th.appendChild(name);
      headRow.appendChild(th);
    }
    const actionHead = document.createElement("th");
    actionHead.className = "db-actions-head";
    headRow.appendChild(actionHead);
    head.appendChild(headRow);
    table.appendChild(head);

    const body = document.createElement("tbody");
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.className = "db-empty";
      td.colSpan = (block.properties?.length || 0) + 1;
      td.textContent = "No rows match this view.";
      tr.appendChild(td);
      body.appendChild(tr);
    }

    for (const row of rows) {
      const tr = document.createElement("tr");
      for (const property of block.properties || []) {
        const td = document.createElement("td");
        const value = row.cells?.[property.id] ?? "";

        if (property.type === "select") {
          const select = document.createElement("select");
          select.className = "db-cell-select";
          select.dataset.dbRow = row.id;
          select.dataset.dbProp = property.id;
          select.innerHTML =
            `<option value="">—</option>` +
            (property.options || [])
              .map(
                (option) =>
                  `<option value="${escapeHtml(option)}"${
                    option === value ? " selected" : ""
                  }>${escapeHtml(option)}</option>`
              )
              .join("");
          td.appendChild(select);
        } else if (property.type === "date") {
          const input = document.createElement("input");
          input.type = "date";
          input.className = "db-cell-date";
          input.dataset.dbRow = row.id;
          input.dataset.dbProp = property.id;
          input.value = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? value : "";
          td.appendChild(input);
        } else if (property.type === "number") {
          const input = document.createElement("input");
          input.type = "number";
          input.className = "db-cell-number";
          input.dataset.dbRow = row.id;
          input.dataset.dbProp = property.id;
          input.value = value;
          td.appendChild(input);
        } else if (property.type === "checkbox") {
          const input = document.createElement("input");
          input.type = "checkbox";
          input.className = "db-cell-check";
          input.dataset.dbRow = row.id;
          input.dataset.dbProp = property.id;
          input.checked = Boolean(value);
          td.appendChild(input);
        } else {
          const cell = document.createElement("div");
          cell.className = "db-cell";
          cell.contentEditable = "true";
          cell.spellcheck = false;
          cell.dataset.dbRow = row.id;
          cell.dataset.dbProp = property.id;
          cell.textContent = value;
          td.appendChild(cell);
        }
        tr.appendChild(td);
      }

      const actionCell = document.createElement("td");
      actionCell.className = "db-actions-cell";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "db-row-delete";
      remove.dataset.dbAction = "delete-row";
      remove.dataset.dbRow = row.id;
      remove.textContent = "✕";
      remove.title = "Delete row";
      actionCell.appendChild(remove);
      tr.appendChild(actionCell);
      body.appendChild(tr);
    }
    table.appendChild(body);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);
    return wrap;
  }

  function blockPlainText(block) {
    if (!block) return "";
    if (block.type === "attachment") return block.attachment?.name || "";
    if (block.type === "table") return (block.rows || []).flat().join(" ");
    if (block.type === "database") {
      return (block.rows || [])
        .map((row) => Object.values(row.cells || {}).join(" "))
        .join(" ");
    }
    if (block.type === "columns2") return (block.columns || []).join(" ");
    if (block.type === "toggle") return `${block.text || ""} ${block.body || ""}`;
    return String(block.text || "").replace(/<[^>]+>/g, " ");
  }

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

  function embedSource(url) {
    const value = safeUrl(url);
    if (!value) return "";
    const youtube = value.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
    if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;
    const vimeo = value.match(/vimeo\.com\/(\d+)/i);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return "";
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
      const table = document.createElement("table");
      table.className = "block__table";
      block.rows.forEach((cells, rowIndex) => {
        const tr = document.createElement("tr");
        cells.forEach((cell, columnIndex) => {
          const td = document.createElement(rowIndex === 0 ? "th" : "td");
          td.contentEditable = "true";
          td.spellcheck = false;
          td.className = "table-cell";
          td.dataset.row = String(rowIndex);
          td.dataset.col = String(columnIndex);
          td.textContent = cell || "";
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      const actions = document.createElement("div");
      actions.className = "table-actions";
      actions.innerHTML = `
        <button type="button" data-table-action="row">+ Row</button>
        <button type="button" data-table-action="col">+ Column</button>`;
      wrap.append(table, actions);
      row.appendChild(wrap);
      el.appendChild(row);
      return el;
    }

    if (block.type === "columns2") {
      const wrap = document.createElement("div");
      wrap.className = "columns-block";
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
        img.alt = block.caption || "Page image";
        img.loading = "lazy";
        const caption = document.createElement("div");
        caption.className = "image-caption";
        caption.contentEditable = "true";
        caption.spellcheck = false;
        caption.dataset.placeholder = "Add a caption";
        caption.innerHTML = block.caption || "";
        const actions = document.createElement("div");
        actions.className = "image-actions";
        actions.innerHTML = `
          <button type="button" data-image-action="upload">Replace</button>
          <button type="button" data-image-action="url">URL</button>
          <button type="button" data-image-action="remove">Remove</button>`;
        figure.append(img, caption, actions);
        wrap.appendChild(figure);
      } else {
        const empty = document.createElement("div");
        empty.className = "media-empty";
        empty.innerHTML = `
          <span>🖼</span>
          <p>Add an image to this page.</p>
          <div>
            <button type="button" class="media-btn" data-image-action="upload">Upload</button>
            <button type="button" class="media-btn" data-image-action="url">Use a URL</button>
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
      const source = embedSource(block.url);
      const link = safeUrl(block.url);
      if (source) {
        const frame = document.createElement("iframe");
        frame.src = source;
        frame.loading = "lazy";
        frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
        frame.allowFullscreen = true;
        frame.title = "Embedded video";
        wrap.appendChild(frame);
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

    if (block.type === "toggle") {
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
      input.dataset.placeholder = "Toggle";
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
      const lang = document.createElement("button");
      lang.className = "code-lang";
      lang.type = "button";
      lang.textContent = block.language || "javascript";
      lang.title = "Change language";
      wrap.append(lang, input);
      row.appendChild(wrap);
    } else {
      row.appendChild(input);
    }

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
      fragment.appendChild(buildBlock(block, number));
    }
    container.replaceChildren(fragment);
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
    const next = createBlock(type, "", {
      level: type === "callout" ? 0 : block.level,
    });
    ensureDefaults(next, type);
    const index = page.blocks.indexOf(block);
    page.blocks.splice(index + 1, 0, next);
    save();
    render();
    if (type === "attachment") {
      requestAttachmentUpload(next.id);
      return;
    }
    focusBlock(next.id, "start");
  }

  function turnInto(block, type) {
    block.type = type;
    ensureDefaults(block, type);
    if (!LIST_TYPES.has(type)) block.level = 0;
    save();
    render();
    if (type === "attachment") {
      requestAttachmentUpload(block.id);
      return;
    }
    focusBlock(block.id, "end");
  }

  /* ---------------- slash menu ---------------- */
  function openSlash(blockEl, mode, query = "", anchor = null) {
    const rect = anchor ?? caretRect() ?? blockEl.getBoundingClientRect();
    slash = { blockId: blockEl.dataset.id, mode, query, index: 0 };
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

  function renderSlash() {
    const items = filteredItems();
    slash.index = Math.min(slash.index, Math.max(0, items.length - 1));
    slashLabel.textContent = slash.mode === "insert-after" ? "Insert block" : "Blocks";
    slashList.innerHTML = "";
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.className = `slash-item${index === slash.index ? " is-active" : ""}`;
      button.dataset.type = item.type;
      button.setAttribute("role", "option");
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
      slashList.appendChild(button);
    });
    slashEmpty.hidden = items.length > 0;
    slashList.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
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
    turnInto(block, type);
  }

  /* ---------------- events: editing ---------------- */
  container.addEventListener("input", (event) => {
    const el = event.target.closest(".block");
    if (!el) return;
    const block = blockById(el.dataset.id);
    if (!block) return;

    const dbPropName = event.target.closest(".db-prop-name");
    if (dbPropName) {
      const property = (block.properties || []).find(
        (item) => item.id === dbPropName.dataset.dbPropName
      );
      if (property) {
        property.name = dbPropName.textContent.trim() || "Untitled";
        save();
      }
      return;
    }

    const dbCell = event.target.closest(".db-cell, .db-card-title");
    if (dbCell) {
      const row = (block.rows || []).find((item) => item.id === dbCell.dataset.dbRow);
      if (row) {
        row.cells[dbCell.dataset.dbProp] = dbCell.textContent;
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

    if (slash && slash.blockId === block.id) {
      const text = input.textContent;
      if (text.startsWith("/")) {
        slash.query = text.slice(1);
        renderSlash();
      } else {
        closeSlash();
      }
      return;
    }

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
    const input = event.target.closest(".block__input");
    if (!input) return;
    const el = input.closest(".block");
    const block = blockById(el.dataset.id);
    if (!block) return;

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
        setTimeout(() => openSlash(el, "transform"), 0);
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

    const dbAction = event.target.closest("[data-db-action]");
    if (dbAction && block?.type === "database") {
      const action = dbAction.dataset.dbAction;
      if (action === "view") {
        block.activeView = dbAction.dataset.view;
        save();
        render();
        return;
      }
      if (action === "add-row") {
        block.rows.push(newDatabaseRow(block));
        save();
        render();
        return;
      }
      if (action === "add-property") {
        const name = window.prompt("Property name");
        if (!name) return;
        const rawType = (
          window.prompt("Type: text, number, date, checkbox, select", "text") || "text"
        )
          .trim()
          .toLowerCase();
        const type = ["text", "number", "date", "checkbox", "select"].includes(rawType)
          ? rawType
          : "text";
        const property = { id: createBlock().id, name: name.trim(), type };
        if (type === "select") {
          const rawOptions = window.prompt("Options (comma separated)", "Option 1, Option 2");
          property.options = (rawOptions || "")
            .split(",")
            .map((option) => option.trim())
            .filter(Boolean);
          if (!property.options.length) property.options = ["Option 1"];
        }
        block.properties.push(property);
        for (const row of block.rows) {
          row.cells[property.id] = type === "checkbox" ? false : "";
        }
        save();
        render();
        return;
      }
      if (action === "delete-row") {
        block.rows = block.rows.filter((row) => row.id !== dbAction.dataset.dbRow);
        if (!block.rows.length) block.rows.push(newDatabaseRow(block));
        save();
        render();
        return;
      }
      if (action === "add-group") {
        const groupProperty = databaseGroupProperty(block);
        const value = dbAction.dataset.group ?? "";
        block.rows.push(
          newDatabaseRow(block, groupProperty ? { [groupProperty.id]: value } : {})
        );
        save();
        render();
        return;
      }
    }

    const toggle = event.target.closest("[data-toggle]");
    if (toggle && block) {
      block.open = !block.open;
      save();
      render();
      return;
    }

    const tableAction = event.target.closest("[data-table-action]");
    if (tableAction && block) {
      if (tableAction.dataset.tableAction === "row") {
        const width = block.rows?.[0]?.length || 2;
        block.rows.push(new Array(width).fill(""));
      } else {
        for (const row of block.rows) row.push("");
      }
      save();
      render();
      return;
    }

    const imageAction = event.target.closest("[data-image-action]");
    if (imageAction && block) {
      const action = imageAction.dataset.imageAction;
      if (action === "upload") {
        pendingImageBlockId = block.id;
        imageFileInput.value = "";
        imageFileInput.click();
        return;
      }
      if (action === "url") {
        const current = block.src && !block.src.startsWith("data:") ? block.src : "https://";
        const value = window.prompt("Image URL", current);
        if (value === null) return;
        const clean = safeUrl(value, { image: true });
        if (!clean) {
          onToast?.("Use an http(s) or image URL");
          return;
        }
        block.src = clean;
        save();
        render();
        return;
      }
      if (action === "remove") {
        block.src = "";
        save();
        render();
        return;
      }
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

    if (event.target.closest(".code-lang") && block) {
      const value = window.prompt("Language", block.language || "javascript");
      if (value) {
        block.language = value.trim();
        event.target.textContent = block.language;
        save();
      }
      return;
    }

    if (event.target === el && block) {
      const input = inputOf(el);
      if (input) focusBlock(block.id, "end");
    }
  });

  /* ---------------- block menu ---------------- */
  let menuBlockId = null;

  function openBlockMenu(block, rect) {
    menuBlockId = block.id;
    blockMenu.hidden = false;
    blockMenu.style.left = "0px";
    blockMenu.style.top = "0px";
    const width = blockMenu.offsetWidth;
    const height = blockMenu.offsetHeight;
    blockMenu.style.left = `${Math.min(rect.left, window.innerWidth - width - 12)}px`;
    blockMenu.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - height - 12)}px`;
  }

  blockMenu.addEventListener("click", (event) => {
    const action = event.target.closest("[data-block-action]")?.dataset.blockAction;
    if (!action || !menuBlockId) return;
    const block = blockById(menuBlockId);
    if (!block) return;
    const index = page.blocks.indexOf(block);
    blockMenu.hidden = true;

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

    if (action.startsWith("turn-")) {
      turnInto(block, action.replace("turn-", ""));
    }
  });

  /* ---------------- drag & drop ---------------- */
  container.addEventListener("dragstart", (event) => {
    const control = event.target.closest('[data-control="menu"]');
    if (!control) return;
    const el = control.closest(".block");
    dragId = el.dataset.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", dragId);
    el.classList.add("is-dragging");
  });

  container.addEventListener("dragover", (event) => {
    if (!dragId) return;
    const el = event.target.closest(".block");
    if (!el || el.dataset.id === dragId) return;
    event.preventDefault();
    container.querySelectorAll(".is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
    el.classList.add("is-drop-target");
  });

  container.addEventListener("drop", (event) => {
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
    updateToolbar();
  });

  inlineToolbar.addEventListener("mousedown", (event) => event.preventDefault());

  inlineToolbar.addEventListener("click", (event) => {
    const format = event.target.closest("[data-format]")?.dataset.format;
    if (!format) return;
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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSlash();
      blockMenu.hidden = true;
      inlineToolbar.hidden = true;
    }
  });

  window.addEventListener("resize", closeSlash);

  return {
    render,
    focusBlock,
    scrollToBlock,
    applyCommentHighlights,
    get activeId() {
      return activeBlockId;
    },
    closeSlash,
  };
}
