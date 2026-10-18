/* Database block rendering: property editors, views, filters, relations, drag & drop. */

import {
  cellValue,
  displayValue,
  emptyCell,
  makeDefaultProperty,
  makeRow,
  PROPERTY_TYPES,
  ROLLUP_FUNCTION_IDS,
  sortRows,
  STATUS_GROUPS,
  uid,
} from "./database.js";

const DAY_WIDTH = 22;

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));

const NUMBER_FORMATS = {
  number: { suffix: "", label: "1,234" },
  percent: { suffix: "%", label: "85%" },
  currency: { suffix: "$", label: "$1,200" },
  compact: { suffix: "", label: "1.2K" },
};

function formatNumber(value, format) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const rule = NUMBER_FORMATS[format] || NUMBER_FORMATS.number;
  if (rule.suffix === "%") return `${Number(number.toFixed(1))}%`;
  if (rule.suffix === "$") {
    return `$${number.toLocaleString(undefined, {
      minimumFractionDigits: number % 1 ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;
  }
  if (rule.label === "1.2K" && Math.abs(number) >= 1000) {
    return `${Number((number / 1000).toFixed(1))}K`;
  }
  return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
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

function formatDateLabel(iso, withYear = true) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

function isoToday() {
  const now = new Date();
  return dayKey(now);
}

/* ---------------- defaults ---------------- */

export function ensureDatabaseDefaults(block) {
  if (!Array.isArray(block.properties) || !block.properties.length) {
    block.properties = [
      { id: "title", name: "Name", type: "title" },
      { id: "status", name: "Status", type: "status", options: STATUS_GROUPS.slice(0, 3).map((g) => g.name) },
      { id: "date", name: "Date", type: "date" },
      { id: "done", name: "Done", type: "checkbox" },
    ];
  }

  const available = ["table", "board", "gallery", "list", "calendar", "timeline"];
  if (!Array.isArray(block.views) || !block.views.length) {
    block.views = available.map((type) => ({
      id: type,
      name: type[0].toUpperCase() + type.slice(1),
      type,
    }));
  }
  if (!block.activeView || !block.views.some((view) => view.id === block.activeView)) {
    block.activeView = block.views[0].id;
  }

  if (!Array.isArray(block.rows)) block.rows = [];
  for (const row of block.rows) {
    if (!row.cells || typeof row.cells !== "object") row.cells = {};
    if (!row.id) row.id = uid();
    if (!row.shortId) row.shortId = `nc-${Math.random().toString(36).slice(2, 8)}`;
    if (!row.createdAt) row.createdAt = Date.now();
    if (!row.updatedAt) row.updatedAt = Date.now();
    for (const property of block.properties) {
      if (!(property.id in row.cells)) row.cells[property.id] = emptyCell(property);
    }
  }
  if (!block.rows.length) block.rows.push(makeRow(block.properties));

  if (typeof block.filterText !== "string") block.filterText = "";
  if (!Array.isArray(block.filters)) block.filters = [];
  if (typeof block.sortProperty !== "string") block.sortProperty = "";
  if (typeof block.sortDirection !== "string") block.sortDirection = "asc";
  if (typeof block.boardGroupBy !== "string") block.boardGroupBy = "";
  if (typeof block.calendarMonth !== "string") block.calendarMonth = monthKey(new Date());
  if (typeof block.timelineStart !== "string") block.timelineStart = "";
  if (typeof block.timelineEnd !== "string") block.timelineEnd = "";
  if (typeof block.hiddenProperties !== "object" || block.hiddenProperties === null) {
    block.hiddenProperties = [];
  }
  if (!("collapsedGroups" in block)) block.collapsedGroups = [];
  return block;
}

/* ---------------- lookups ---------------- */

function titleProperty(block) {
  return (
    (block.properties || []).find((property) => property.type === "title") ||
    (block.properties || [])[0] || { id: "title", name: "Name", type: "title" }
  );
}

function propertyById(block, id) {
  return (block.properties || []).find((property) => property.id === id) || null;
}

function dateProperties(block) {
  return (block.properties || []).filter((property) => property.type === "date");
}

function currentView(block) {
  return (
    (block.views || []).find((view) => view.id === block.activeView) ||
    (block.views || [])[0] || { id: "table", name: "Table", type: "table" }
  );
}

function groupProperty(block) {
  return (
    propertyById(block, block.boardGroupBy) ||
    (block.properties || []).find((property) => property.type === "status" || property.type === "select") ||
    null
  );
}

function rowValue(block, row, property, ctx) {
  return cellValue(block, row, property, ctx.valueContext());
}

function rowText(block, row, property, ctx) {
  return displayValue(block, row, property, ctx.valueContext());
}

/* ---------------- rows pipeline ---------------- */

function rowMatchesFilters(block, row, ctx) {
  const query = String(block.filterText || "").trim().toLowerCase();
  if (query) {
    const haystack = (block.properties || [])
      .map((property) => rowText(block, row, property, ctx))
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  for (const rule of block.filters || []) {
    const property = propertyById(block, rule.propId);
    if (!property) continue;
    const raw = rowValue(block, row, property, ctx);
    const text = rowText(block, row, property, ctx);
    const needle = String(rule.value ?? "");
    switch (rule.op) {
      case "isEmpty":
        if (raw !== "" && raw !== null && !(Array.isArray(raw) && raw.length === 0)) return false;
        break;
      case "isNotEmpty":
        if (raw === "" || raw === null || (Array.isArray(raw) && raw.length === 0)) return false;
        break;
      case "isNot":
        if (text.toLowerCase() === needle.toLowerCase()) return false;
        break;
      case "greater":
        if (!(Number(raw) > Number(needle))) return false;
        break;
      case "less":
        if (!(Number(raw) < Number(needle))) return false;
        break;
      case "checked":
        if (!raw) return false;
        break;
      case "unchecked":
        if (raw) return false;
        break;
      default:
        if (!text.toLowerCase().includes(needle.toLowerCase())) return false;
    }
  }

  return true;
}

function visibleRows(block, ctx) {
  const rows = (block.rows || []).filter((row) => rowMatchesFilters(block, row, ctx));
  if (block.sortProperty && propertyById(block, block.sortProperty)) {
    return sortRows(rows, propertyById(block, block.sortProperty), block.sortDirection);
  }
  return rows;
}

/* ---------------- shared cell controls ---------------- */

function checkboxCell(row, property) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "db-cell-check";
  input.dataset.dbRow = row.id;
  input.dataset.dbProp = property.id;
  input.checked = Boolean(row.cells?.[property.id]);
  return input;
}

function numberCell(row, property, block) {
  const input = document.createElement("input");
  input.type = "number";
  input.className = "db-cell-number";
  input.dataset.dbRow = row.id;
  input.dataset.dbProp = property.id;
  const raw = row.cells?.[property.id];
  input.value = raw === null || raw === undefined ? "" : raw;
  if (block.numberFormat) input.dataset.format = block.numberFormat;
  return input;
}

function dateCell(row, property) {
  const input = document.createElement("input");
  input.type = "date";
  input.className = "db-cell-date";
  input.dataset.dbRow = row.id;
  input.dataset.dbProp = property.id;
  const value = String(row.cells?.[property.id] ?? "");
  input.value = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  return input;
}

function textCell(row, property, placeholder = "Empty") {
  const cell = document.createElement("div");
  cell.className = "db-cell";
  cell.contentEditable = "true";
  cell.spellcheck = false;
  cell.dataset.dbRow = row.id;
  cell.dataset.dbProp = property.id;
  cell.dataset.placeholder = placeholder;
  cell.textContent = row.cells?.[property.id] ?? "";
  return cell;
}

function titleCell(row, property) {
  const cell = document.createElement("div");
  cell.className = "db-card-title";
  cell.contentEditable = "true";
  cell.spellcheck = false;
  cell.dataset.dbRow = row.id;
  cell.dataset.dbProp = property.id;
  cell.dataset.placeholder = "Untitled";
  cell.textContent = row.cells?.[property.id] || "";
  return cell;
}

function selectCell(row, property, className = "db-cell-select") {
  const select = document.createElement("select");
  select.className = className;
  select.dataset.dbRow = row.id;
  select.dataset.dbProp = property.id;
  const value = String(row.cells?.[property.id] ?? "");
  select.innerHTML =
    `<option value="">—</option>` +
    (property.options || [])
      .map(
        (option) =>
          `<option value="${escapeHtml(option)}"${option === value ? " selected" : ""}>${escapeHtml(
            option
          )}</option>`
      )
      .join("");
  return select;
}

function statusCell(row, property) {
  const wrap = document.createElement("div");
  wrap.className = "db-status-wrap";

  const select = selectCell(row, property, "db-cell-select db-status-select");
  wrap.appendChild(select);

  const dot = document.createElement("span");
  dot.className = "db-status-dot";
  const group = (property.options || []).includes(String(row.cells?.[property.id]))
    ? property.options.find((option) => option === String(row.cells?.[property.id]))
    : null;
  const status = STATUS_GROUPS.find((item) => item.name === row.cells?.[property.id]);
  dot.style.background = status?.color || "transparent";
  wrap.appendChild(dot);
  void group;
  return wrap;
}

function multiselectCell(row, property) {
  const wrap = document.createElement("div");
  wrap.className = "db-multi-wrap";
  const values = Array.isArray(row.cells?.[property.id]) ? row.cells[property.id] : [];

  for (const value of values) {
    const chip = document.createElement("span");
    chip.className = "db-chip";
    chip.textContent = value;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "db-chip__remove";
    remove.dataset.dbAction = "multiselect-remove";
    remove.dataset.dbRow = row.id;
    remove.dataset.dbProp = property.id;
    remove.dataset.value = value;
    remove.textContent = "×";
    chip.appendChild(remove);
    wrap.appendChild(chip);
  }

  const select = document.createElement("select");
  select.className = "db-chip-select";
  select.dataset.dbRow = row.id;
  select.dataset.dbProp = property.id;
  select.dataset.dbAction = "multiselect-add";
  select.innerHTML =
    `<option value="">+ Add</option>` +
    (property.options || [])
      .filter((option) => !values.includes(option))
      .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
      .join("");
  wrap.appendChild(select);
  return wrap;
}

function peopleCell(row, property, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "db-people-wrap";
  const values = Array.isArray(row.cells?.[property.id]) ? row.cells[property.id] : [];
  const members = ctx.members();

  for (const value of values) {
    const chip = document.createElement("span");
    chip.className = "db-person";
    const member = members.find((item) => item.name === value || item.email === value);
    const initials = member?.initials || value.slice(0, 2).toUpperCase();
    chip.innerHTML = `<span class="db-person__avatar" style="background:${
      member?.color || "#4b5563"
    }">${escapeHtml(initials)}</span><span>${escapeHtml(value)}</span>`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "db-chip__remove";
    remove.dataset.dbAction = "multiselect-remove";
    remove.dataset.dbRow = row.id;
    remove.dataset.dbProp = property.id;
    remove.dataset.value = value;
    remove.textContent = "×";
    chip.appendChild(remove);
    wrap.appendChild(chip);
  }

  const select = document.createElement("select");
  select.className = "db-chip-select";
  select.dataset.dbRow = row.id;
  select.dataset.dbProp = property.id;
  select.dataset.dbAction = "multiselect-add";
  select.innerHTML =
    `<option value="">+ Person</option>` +
    members
      .filter((member) => !values.includes(member.name))
      .map((member) => `<option value="${escapeHtml(member.name)}">${escapeHtml(member.name)}</option>`)
      .join("");
  wrap.appendChild(select);
  return wrap;
}

function filesCell(row, property, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "db-files-wrap";
  const values = Array.isArray(row.cells?.[property.id]) ? row.cells[property.id] : [];

  for (const file of values) {
    const link = document.createElement("a");
    link.className = "db-file";
    link.href = file.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `📎 ${file.name}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "db-chip__remove";
    remove.dataset.dbAction = "multiselect-remove";
    remove.dataset.dbRow = row.id;
    remove.dataset.dbProp = property.id;
    remove.dataset.value = file.name;
    remove.textContent = "×";
    link.appendChild(remove);
    wrap.appendChild(link);
  }

  const upload = document.createElement("button");
  upload.type = "button";
  upload.className = "db-chip-select";
  upload.dataset.dbAction = "files-add";
  upload.dataset.dbRow = row.id;
  upload.dataset.dbProp = property.id;
  upload.textContent = "+ File";
  wrap.appendChild(upload);
  void ctx;
  return wrap;
}

function relationCell(row, property, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "db-relation-wrap";
  const values = Array.isArray(row.cells?.[property.id]) ? row.cells[property.id] : [];

  for (const value of values) {
    const label = ctx.relationLabel(property, value);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "db-relation-chip";
    chip.dataset.dbAction = "relation-open";
    chip.dataset.dbRow = row.id;
    chip.dataset.dbProp = property.id;
    chip.dataset.value = value;
    chip.textContent = label || "Missing";
    wrap.appendChild(chip);
  }

  const select = document.createElement("select");
  select.className = "db-chip-select";
  select.dataset.dbRow = row.id;
  select.dataset.dbProp = property.id;
  select.dataset.dbAction = "relation-add";
  select.innerHTML =
    `<option value="">+ Link</option>` +
    ctx
      .relationCandidates(property)
      .filter((item) => !values.includes(item.id))
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`)
      .join("");
  wrap.appendChild(select);
  return wrap;
}

function urlCell(row, property) {
  const wrap = document.createElement("div");
  wrap.className = "db-url-wrap";
  const input = document.createElement("input");
  input.type = "url";
  input.className = "db-cell-url";
  input.dataset.dbRow = row.id;
  input.dataset.dbProp = property.id;
  input.placeholder = "https://";
  input.value = row.cells?.[property.id] ?? "";
  wrap.appendChild(input);
  const open = document.createElement("a");
  open.className = "db-url-open";
  open.dataset.dbAction = "url-open";
  open.dataset.dbRow = row.id;
  open.dataset.dbProp = property.id;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.textContent = "↗";
  wrap.appendChild(open);
  return wrap;
}

function readOnlyCell(row, property, block, ctx) {
  const span = document.createElement("div");
  span.className = "db-cell db-cell--readonly";
  span.textContent = rowText(block, row, property, ctx);
  return span;
}

/** Build the editable control for a property inside a row. */
function cellControl(block, row, property, ctx, options = {}) {
  switch (property.type) {
    case "title":
      return options.compact ? titleCell(row, property) : titleCell(row, property);
    case "text":
      return textCell(row, property);
    case "number":
      return numberCell(row, property, block);
    case "date":
      return dateCell(row, property);
    case "checkbox":
      return checkboxCell(row, property);
    case "select":
      return selectCell(row, property);
    case "status":
      return statusCell(row, property);
    case "multiselect":
      return multiselectCell(row, property);
    case "people":
      return peopleCell(row, property, ctx);
    case "files":
      return filesCell(row, property, ctx);
    case "relation":
      return relationCell(row, property, ctx);
    case "url":
      return urlCell(row, property);
    case "formula":
    case "rollup":
    case "uniqueId":
    case "createdTime":
    case "updatedTime":
      return readOnlyCell(row, property, block, ctx);
    default:
      return textCell(row, property);
  }
}

/* ---------------- views ---------------- */

function buildToolbar(block, view, ctx) {
  const toolbar = document.createElement("div");
  toolbar.className = "db-toolbar";

  const tabs = (block.views || [])
    .map(
      (item) =>
        `<button type="button" class="db-view-tab${item.id === view.id ? " is-active" : ""}" data-db-action="view" data-view="${escapeHtml(
          item.id
        )}">${escapeHtml(item.name)}</button>`
    )
    .join("");

  const selectProperties = (block.properties || []).filter((property) =>
    ["status", "select", "multiselect"].includes(property.type)
  );
  const activeGroup = groupProperty(block);

  const filterCount = (block.filters || []).length;

  toolbar.innerHTML = `
    <div class="db-view-tabs">${tabs}
      <button type="button" class="db-view-tab db-view-tab--add" data-db-action="add-view" title="Add a view">+</button>
    </div>
    <input class="db-filter" type="text" placeholder="Filter…" value="${escapeHtml(
      block.filterText || ""
    )}" />
    <button type="button" class="db-tool-btn${filterCount ? " is-active" : ""}" data-db-action="filters">Filter${
      filterCount ? ` (${filterCount})` : ""
    }</button>
    <select class="db-sort-prop" aria-label="Sort by">
      <option value="">Sort…</option>
      ${(block.properties || [])
        .map(
          (property) =>
            `<option value="${escapeHtml(property.id)}"${
              block.sortProperty === property.id ? " selected" : ""
            }>${escapeHtml(property.name)}</option>`
        )
        .join("")}
    </select>
    <select class="db-sort-dir" aria-label="Sort direction">
      <option value="asc"${block.sortDirection !== "desc" ? " selected" : ""}>A–Z</option>
      <option value="desc"${block.sortDirection === "desc" ? " selected" : ""}>Z–A</option>
    </select>
    ${
      view.type === "board" && selectProperties.length
        ? `<select class="db-board-group" aria-label="Group by">${selectProperties
            .map(
              (property) =>
                `<option value="${escapeHtml(property.id)}"${
                  property.id === activeGroup?.id ? " selected" : ""
                }>Group: ${escapeHtml(property.name)}</option>`
            )
            .join("")}</select>`
        : ""
    }
    <span class="db-toolbar__spacer"></span>
    <button type="button" class="db-tool-btn" data-db-action="add-row">+ New</button>
    <button type="button" class="db-tool-btn" data-db-action="add-property">+ Property</button>
    <button type="button" class="db-tool-btn" data-db-action="view-menu" title="View options">⋯</button>`;

  return toolbar;
}

function buildTableView(block, rows, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "db-table-wrap";

  const table = document.createElement("table");
  table.className = "db-table";

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const property of block.properties || []) {
    const th = document.createElement("th");
    th.className = "db-head-cell";
    const name = document.createElement("button");
    name.type = "button";
    name.className = "db-prop-name";
    name.dataset.dbAction = "property-menu";
    name.dataset.dbProp = property.id;
    name.innerHTML = `${escapeHtml(property.name)}<span class="db-prop-type">${escapeHtml(
      PROPERTY_TYPES[property.type]?.icon || ""
    )}</span>`;
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

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.dataset.dbRow = row.id;
    tr.dataset.dbIndex = String(index);

    const handle = document.createElement("td");
    handle.className = "db-row-handle";
    handle.title = "Drag to reorder";
    handle.dataset.dbAction = "row-drag";
    handle.draggable = true;
    handle.textContent = "⠿";
    tr.appendChild(handle);

    for (const property of block.properties || []) {
      const td = document.createElement("td");
      td.className = "db-cell-wrap";
      td.dataset.dbRow = row.id;
      td.dataset.dbDrop = "row";
      td.appendChild(cellControl(block, row, property, ctx));
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
  });

  table.appendChild(body);
  wrap.appendChild(table);
  return wrap;
}

function buildBoardView(block, rows, ctx) {
  const property = groupProperty(block);
  if (!property) {
    const empty = document.createElement("div");
    empty.className = "db-empty";
    empty.textContent = "Add a status or select property to group this board.";
    return empty;
  }

  const options = Array.isArray(property.options) ? [...property.options] : [];
  const extra = [...new Set(rows.map((row) => String(row.cells?.[property.id] ?? "")))].filter(
    (value) => value && !options.includes(value)
  );
  options.push(...extra, "");

  const board = document.createElement("div");
  board.className = "db-board";

  for (const option of options) {
    const groupRows = rows.filter((row) => String(row.cells?.[property.id] ?? "") === option);
    const column = document.createElement("div");
    column.className = "db-board-col";
    column.dataset.dbGroup = option;

    const status = STATUS_GROUPS.find((item) => item.name === option);
    column.innerHTML = `
      <div class="db-board-head">
        <span class="db-board-title">${escapeHtml(option || "No value")}</span>
        <span class="db-board-count">${groupRows.length}</span>
      </div>`;
    if (status) {
      column.querySelector(".db-board-head").style.setProperty("--group-color", status.color);
    }

    for (const row of groupRows) {
      const card = document.createElement("div");
      card.className = "db-board-card";
      card.dataset.dbRow = row.id;
      card.dataset.dbDrop = "group";
      card.dataset.dbGroupValue = option;
      card.draggable = true;

      card.appendChild(titleCell(row, titleProperty(block)));

      const meta = document.createElement("div");
      meta.className = "db-board-meta";
      for (const other of block.properties || []) {
        if (other.id === propertyById(block, block.boardGroupBy)?.id) continue;
        if (other.type === "title" || other.type === "formula" || other.type === "rollup") continue;
        const value = rowText(block, row, other, ctx);
        if (!value) continue;
        const chip = document.createElement("span");
        chip.className = "db-chip db-chip--soft";
        if (other.type === "date") chip.classList.add("db-chip--date");
        chip.textContent = `${other.name}: ${value}`;
        meta.appendChild(chip);
      }
      card.appendChild(meta);

      const footer = document.createElement("div");
      footer.className = "db-board-foot";
      const dateProp = dateProperties(block)[0];
      if (dateProp) footer.appendChild(dateCell(row, dateProp));
      const peopleProp = (block.properties || []).find((property) => property.type === "people");
      if (peopleProp) {
        const values = Array.isArray(row.cells?.[peopleProp.id]) ? row.cells[peopleProp.id] : [];
        for (const name of values) {
          const member = ctx.members().find((item) => item.name === name);
          const avatar = document.createElement("span");
          avatar.className = "db-person__avatar";
          avatar.style.background = member?.color || "#4b5563";
          avatar.textContent = member?.initials || name.slice(0, 2).toUpperCase();
          footer.appendChild(avatar);
        }
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "db-row-delete";
      remove.dataset.dbAction = "delete-row";
      remove.dataset.dbRow = row.id;
      remove.textContent = "✕";
      footer.appendChild(remove);
      card.appendChild(footer);

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

  return board;
}

function buildGalleryView(block, rows, ctx) {
  const gallery = document.createElement("div");
  gallery.className = "db-gallery";
  const hidden = new Set(block.hiddenProperties || []);

  for (const row of rows) {
    const card = document.createElement("div");
    card.className = "db-gallery-card";
    card.dataset.dbRow = row.id;
    card.dataset.dbDrop = "row";
    card.draggable = true;

    const cover = (block.properties || []).find(
      (property) => property.id === block.coverProperty
    );
    if (cover) {
      const value = row.cells?.[cover.id];
      const preview = document.createElement("div");
      preview.className = "db-gallery-preview";
      if (typeof value === "string" && value) {
        const isImage = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(value) || value.startsWith("data:image");
        if (isImage) {
          const img = document.createElement("img");
          img.src = value;
          img.loading = "lazy";
          img.alt = "";
          preview.appendChild(img);
        } else {
          preview.textContent = value;
        }
      } else {
        preview.dataset.placeholder = "No preview";
      }
      card.appendChild(preview);
    }

    const body = document.createElement("div");
    body.className = "db-gallery-body";
    body.appendChild(titleCell(row, titleProperty(block)));

    const meta = document.createElement("div");
    meta.className = "db-gallery-meta";
    for (const property of block.properties || []) {
      if (property.type === "title" || hidden.has(property.id)) continue;
      const control = cellControl(block, row, property, ctx);
      if (property.type === "date" || property.type === "checkbox") {
        meta.appendChild(control);
        continue;
      }
      const wrap = document.createElement("div");
      wrap.className = "db-gallery-field";
      wrap.appendChild(control);
      meta.appendChild(wrap);
    }
    body.appendChild(meta);
    card.appendChild(body);
    gallery.appendChild(card);
  }

  return gallery;
}

function buildListView(block, rows, ctx) {
  const list = document.createElement("div");
  list.className = "db-list";
  const checkProp = (block.properties || []).find((property) => property.type === "checkbox");
  const chips = (block.properties || []).filter((property) =>
    ["status", "select", "date"].includes(property.type)
  );

  rows.forEach((row, index) => {
    const item = document.createElement("div");
    item.className = "db-list-row";
    item.dataset.dbRow = row.id;
    item.dataset.dbDrop = "row";
    item.dataset.dbIndex = String(index);
    item.draggable = true;

    const handle = document.createElement("span");
    handle.className = "db-list-handle";
    handle.textContent = "⠿";
    item.appendChild(handle);

    if (checkProp) item.appendChild(checkboxCell(row, checkProp));
    const title = titleCell(row, titleProperty(block));
    title.classList.add("db-list-title");
    item.appendChild(title);

    const trailing = document.createElement("div");
    trailing.className = "db-list-meta";
    for (const property of chips) {
      if (property.type === "date") {
        trailing.appendChild(dateCell(row, property));
        continue;
      }
      trailing.appendChild(selectCell(row, property, "db-chip-select"));
    }
    item.appendChild(trailing);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "db-row-delete";
    remove.dataset.dbAction = "delete-row";
    remove.dataset.dbRow = row.id;
    remove.textContent = "✕";
    item.appendChild(remove);

    list.appendChild(item);
  });

  return list;
}

function buildCalendarView(block, rows, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "db-calendar";

  const property = dateProperties(block)[0];
  if (!property) {
    const empty = document.createElement("div");
    empty.className = "db-empty";
    empty.textContent = "Add a date property to use the calendar view.";
    return empty;
  }

  const cursor = parseMonthKey(block.calendarMonth);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const head = document.createElement("div");
  head.className = "db-calendar-head";
  head.innerHTML = `
    <button type="button" class="db-cal-nav" data-db-action="cal-prev">‹</button>
    <span class="db-cal-title">${escapeHtml(
      cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    )}</span>
    <button type="button" class="db-cal-nav" data-db-action="cal-next">›</button>
    <button type="button" class="db-cal-nav" data-db-action="cal-today">Today</button>`;
  wrap.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "db-cal-grid";
  for (const label of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    const weekday = document.createElement("div");
    weekday.className = "db-cal-weekday";
    weekday.textContent = label;
    grid.appendChild(weekday);
  }

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = dayKey(new Date());
  const title = titleProperty(block);
  const byDay = new Map();
  for (const row of rows) {
    const value = String(row.cells?.[property.id] ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    if (!byDay.has(value)) byDay.set(value, []);
    byDay.get(value).push(row);
  }

  for (let index = 0; index < offset; index += 1) {
    const blank = document.createElement("div");
    blank.className = "db-cal-cell is-empty";
    grid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const key = dayKey(date);
    const cell = document.createElement("div");
    cell.className = `db-cal-cell${key === today ? " is-today" : ""}`;
    cell.dataset.dbDrop = "group";
    cell.dataset.dbGroupValue = key;

    const label = document.createElement("div");
    label.className = "db-cal-day";
    label.textContent = String(day);
    cell.appendChild(label);

    for (const row of byDay.get(key) || []) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "db-cal-item";
      chip.dataset.dbRow = row.id;
      chip.dataset.dbProp = property.id;
      chip.draggable = true;
      chip.title = "Drag to another day";
      chip.textContent = String(row.cells?.[title.id] || "Untitled");
      cell.appendChild(chip);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "db-cal-add";
    add.dataset.dbAction = "cal-add";
    add.dataset.date = key;
    add.title = "Add a row on this day";
    add.textContent = "+";
    cell.appendChild(add);

    grid.appendChild(cell);
  }

  wrap.appendChild(grid);
  void ctx;
  return wrap;
}

function buildTimelineView(block, rows) {
  const wrap = document.createElement("div");
  wrap.className = "db-timeline";

  const startProperty = dateProperties(block)[0];
  const endProperty = dateProperties(block)[1];
  if (!startProperty) {
    const empty = document.createElement("div");
    empty.className = "db-empty";
    empty.textContent = "Add a date property to use the timeline view.";
    return empty;
  }

  const dated = rows
    .map((row) => {
      const start = String(row.cells?.[startProperty.id] ?? "");
      const end = String(row.cells?.[endProperty?.id] ?? "") || start;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
      return { row, start, end: end < start ? start : end };
    })
    .filter(Boolean);

  if (!dated.length) {
    const empty = document.createElement("div");
    empty.className = "db-empty";
    empty.textContent = "No dated rows in this view yet.";
    return empty;
  }

  let min = dated.reduce((acc, item) => (item.start < acc ? item.start : acc), dated[0].start);
  let max = dated.reduce((acc, item) => (item.end > acc ? item.end : acc), dated[0].end);
  if (/^\d{4}-\d{2}-\d{2}$/.test(block.timelineStart)) {
    min = block.timelineStart < min ? block.timelineStart : min;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(block.timelineEnd)) {
    max = block.timelineEnd > max ? block.timelineEnd : max;
  }

  const startDate = new Date(`${min}T00:00:00`);
  const endDate = new Date(`${max}T00:00:00`);
  const totalDays = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1);

  const head = document.createElement("div");
  head.className = "db-timeline-head";
  head.innerHTML = `<span class="db-timeline-label"></span><span class="db-timeline-scale"></span>`;
  const scale = head.querySelector(".db-timeline-scale");
  scale.style.setProperty("--day-width", `${DAY_WIDTH}px`);

  const cursor = new Date(startDate);
  for (let guard = 0; guard < 36; guard += 1) {
    const offset = Math.round((cursor - startDate) / 86400000);
    if (offset > totalDays) break;
    const tick = document.createElement("span");
    tick.className = "db-timeline-tick";
    tick.style.left = `${offset * DAY_WIDTH}px`;
    tick.textContent = cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    scale.appendChild(tick);
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }
  wrap.appendChild(head);

  const body = document.createElement("div");
  body.className = "db-timeline-body";
  body.style.setProperty("--day-width", `${DAY_WIDTH}px`);

  for (const item of dated) {
    const rowEl = document.createElement("div");
    rowEl.className = "db-timeline-row";

    const title = titleCell(item.row, titleProperty(block));
    title.classList.add("db-timeline-title");
    rowEl.appendChild(title);

    const track = document.createElement("div");
    track.className = "db-timeline-track";
    track.style.setProperty("--days", String(totalDays));
    track.dataset.dbDrop = "timeline";

    const bar = document.createElement("div");
    bar.className = "db-timeline-bar";
    bar.dataset.dbRow = item.row.id;
    bar.draggable = true;
    const startOffset = Math.round((new Date(`${item.start}T00:00:00`) - startDate) / 86400000);
    const endOffset = Math.round((new Date(`${item.end}T00:00:00`) - startDate) / 86400000);
    bar.style.setProperty("--start", String(Math.max(0, startOffset)));
    bar.style.setProperty("--span", String(Math.max(1, endOffset - startOffset + 1)));
    const statusProp = (block.properties || []).find((property) => property.type === "status");
    const status = statusProp && STATUS_GROUPS.find((group) => group.name === item.row.cells?.[statusProp.id]);
    if (status) bar.style.background = status.color;

    const label = document.createElement("span");
    label.className = "db-timeline-bar-label";
    label.textContent =
      startOffset === endOffset
        ? formatDateLabel(item.start, false)
        : `${formatDateLabel(item.start, false)} → ${formatDateLabel(item.end, false)}`;
    bar.appendChild(label);
    track.appendChild(bar);
    rowEl.appendChild(track);

    const controls = document.createElement("div");
    controls.className = "db-timeline-controls";
    controls.appendChild(dateCell(item.row, startProperty));
    if (endProperty) controls.appendChild(dateCell(item.row, endProperty));
    rowEl.appendChild(controls);

    body.appendChild(rowEl);
  }

  wrap.appendChild(body);
  return wrap;
}

/* ---------------- property manager ---------------- */

function buildPropertyMenu(block, property, ctx) {
  const menu = document.createElement("div");
  menu.className = "db-prop-menu";

  const nameRow = document.createElement("label");
  nameRow.className = "db-prop-field";
  nameRow.innerHTML = `<span>Name</span>`;
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = property.name;
  nameInput.dataset.dbAction = "property-rename";
  nameInput.dataset.dbProp = property.id;
  nameRow.appendChild(nameInput);
  menu.appendChild(nameRow);

  const typeRow = document.createElement("label");
  typeRow.className = "db-prop-field";
  typeRow.innerHTML = `<span>Type</span>`;
  const typeSelect = document.createElement("select");
  typeSelect.dataset.dbAction = "property-type";
  typeSelect.dataset.dbProp = property.id;
  typeSelect.innerHTML = Object.entries(PROPERTY_TYPES)
    .map(
      ([key, meta]) =>
        `<option value="${key}"${key === property.type ? " selected" : ""}>${escapeHtml(
          meta.label
        )}</option>`
    )
    .join("");
  typeRow.appendChild(typeSelect);
  menu.appendChild(typeRow);

  if (PROPERTY_TYPES[property.type]?.options) {
    const optionsRow = document.createElement("label");
    optionsRow.className = "db-prop-field";
    optionsRow.innerHTML = `<span>Options</span>`;
    const optionsInput = document.createElement("input");
    optionsInput.type = "text";
    optionsInput.value = (property.options || []).join(", ");
    optionsInput.dataset.dbAction = "property-options";
    optionsInput.dataset.dbProp = property.id;
    optionsRow.appendChild(optionsInput);
    menu.appendChild(optionsRow);
  }

  if (property.type === "formula") {
    const formulaRow = document.createElement("label");
    formulaRow.className = "db-prop-field";
    formulaRow.innerHTML = `<span>Formula</span>`;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "mono";
    input.value = property.formula || "";
    input.placeholder = 'prop("Price") * prop("Qty")';
    input.dataset.dbAction = "property-formula";
    input.dataset.dbProp = property.id;
    formulaRow.appendChild(input);
    const hint = document.createElement("small");
    hint.className = "db-prop-hint";
    hint.textContent = `Functions: ${ctx.formulaNames().slice(0, 8).join(", ")}…`;
    formulaRow.appendChild(hint);
    menu.appendChild(formulaRow);
  }

  if (property.type === "rollup") {
    const relationProp = (block.properties || []).find((item) => item.type === "relation");
    const config = property.rollup || {};

    const relationRow = document.createElement("label");
    relationRow.className = "db-prop-field";
    relationRow.innerHTML = `<span>Relation</span>`;
    const relationSelect = document.createElement("select");
    relationSelect.dataset.dbAction = "property-rollup-relation";
    relationSelect.dataset.dbProp = property.id;
    relationSelect.innerHTML =
      `<option value="">Choose…</option>` +
      (relationProp
        ? `<option value="${escapeHtml(relationProp.id)}"${
            config.relationPropId === relationProp.id ? " selected" : ""
          }>${escapeHtml(relationProp.name)}</option>`
        : "");
    relationRow.appendChild(relationSelect);
    menu.appendChild(relationRow);

    const targetRow = document.createElement("label");
    targetRow.className = "db-prop-field";
    targetRow.innerHTML = `<span>Property</span>`;
    const targetSelect = document.createElement("select");
    targetSelect.dataset.dbAction = "property-rollup-target";
    targetSelect.dataset.dbProp = property.id;
    const targets = relationProp ? ctx.relationProperties(relationProp) : [];
    targetSelect.innerHTML =
      `<option value="">Choose…</option>` +
      targets
        .map(
          (item) =>
            `<option value="${escapeHtml(item.id)}"${
              config.targetPropId === item.id ? " selected" : ""
            }>${escapeHtml(item.name)}</option>`
        )
        .join("");
    targetRow.appendChild(targetSelect);
    menu.appendChild(targetRow);

    const fnRow = document.createElement("label");
    fnRow.className = "db-prop-field";
    fnRow.innerHTML = `<span>Function</span>`;
    const fnSelect = document.createElement("select");
    fnSelect.dataset.dbAction = "property-rollup-fn";
    fnSelect.dataset.dbProp = property.id;
    fnSelect.innerHTML = ROLLUP_FUNCTION_IDS.map(
      (item) =>
        `<option value="${item.id}"${item.id === (config.fn || "count") ? " selected" : ""}>${escapeHtml(
          item.label
        )}</option>`
    ).join("");
    fnRow.appendChild(fnSelect);
    menu.appendChild(fnRow);
  }

  if (property.type === "relation") {
    const relationRow = document.createElement("label");
    relationRow.className = "db-prop-field";
    relationRow.innerHTML = `<span>Link to</span>`;
    const select = document.createElement("select");
    select.dataset.dbAction = "property-relation-db";
    select.dataset.dbProp = property.id;
    const current = property.relation?.dbId || "";
    select.innerHTML =
      `<option value="">None</option>` +
      ctx
        .databases()
        .filter((item) => item.id !== block.id)
        .map(
          (item) =>
            `<option value="${escapeHtml(item.id)}"${item.id === current ? " selected" : ""}>${escapeHtml(
              item.label
            )}</option>`
        )
        .join("");
    relationRow.appendChild(select);
    menu.appendChild(relationRow);
  }

  if (property.type === "text" || property.type === "url") {
    const formatRow = document.createElement("label");
    formatRow.className = "db-prop-field";
    formatRow.innerHTML = `<span>Format</span>`;
    const select = document.createElement("select");
    select.dataset.dbAction = "property-format";
    select.dataset.dbProp = property.id;
    const current = property.format || "number";
    select.innerHTML = Object.entries(NUMBER_FORMATS)
      .map(([key, rule]) => `<option value="${key}"${key === current ? " selected" : ""}>${escapeHtml(rule.label)}</option>`)
      .join("");
    formatRow.appendChild(select);
    menu.appendChild(formatRow);
  }

  if (property.type === "galleryCover") void 0;

  const actions = document.createElement("div");
  actions.className = "db-prop-actions";
  if (property.type !== "title") {
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.dataset.dbAction = "property-delete";
    del.dataset.dbProp = property.id;
    del.textContent = "Delete property";
    actions.appendChild(del);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.dataset.dbAction = "property-close";
  close.textContent = "Done";
  actions.appendChild(close);
  menu.appendChild(actions);

  return menu;
}

function buildFiltersPanel(block, ctx) {
  const panel = document.createElement("div");
  panel.className = "db-filters-panel";

  if (!(block.filters || []).length) {
    const empty = document.createElement("p");
    empty.className = "db-empty-text";
    empty.textContent = "No property filters yet.";
    panel.appendChild(empty);
  }

  (block.filters || []).forEach((rule, index) => {
    const row = document.createElement("div");
    row.className = "db-filter-row";
    const property = propertyById(block, rule.propId);

    const propSelect = document.createElement("select");
    propSelect.dataset.dbAction = "filter-prop";
    propSelect.dataset.dbRule = rule.id;
    propSelect.innerHTML = (block.properties || [])
      .map(
        (item) =>
          `<option value="${escapeHtml(item.id)}"${item.id === rule.propId ? " selected" : ""}>${escapeHtml(
            item.name
          )}</option>`
      )
      .join("");

    const opSelect = document.createElement("select");
    opSelect.dataset.dbAction = "filter-op";
    opSelect.dataset.dbRule = rule.id;
    const ops = [
      ["contains", "contains"],
      ["is", "is"],
      ["isNot", "is not"],
      ["isEmpty", "is empty"],
      ["isNotEmpty", "is not empty"],
      ["greater", ">"],
      ["less", "<"],
      ["checked", "checked"],
      ["unchecked", "unchecked"],
    ];
    opSelect.innerHTML = ops
      .map(([key, label]) => `<option value="${key}"${key === rule.op ? " selected" : ""}>${escapeHtml(label)}</option>`)
      .join("");

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.value = rule.value ?? "";
    valueInput.placeholder = "Value";
    valueInput.dataset.dbAction = "filter-value";
    valueInput.dataset.dbRule = rule.id;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "db-row-delete";
    remove.dataset.dbAction = "filter-delete";
    remove.dataset.dbRule = rule.id;
    remove.textContent = "✕";

    row.append(propSelect, opSelect, valueInput, remove);
    if (!property) row.classList.add("is-broken");
    panel.appendChild(row);
  });

  const add = document.createElement("button");
  add.type = "button";
  add.className = "db-tool-btn";
  add.dataset.dbAction = "filter-add";
  add.textContent = "+ Add filter";
  panel.appendChild(add);

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "db-tool-btn";
  clear.dataset.dbAction = "filter-clear";
  clear.textContent = "Clear all";
  panel.appendChild(clear);

  void ctx;
  return panel;
}

function buildViewMenu(block, ctx) {
  const view = currentView(block);
  const menu = document.createElement("div");
  menu.className = "db-view-menu";

  const list = document.createElement("div");
  list.className = "db-view-list";
  for (const item of block.views || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `db-view-item${item.id === view.id ? " is-active" : ""}`;
    button.dataset.dbAction = "view";
    button.dataset.view = item.id;
    button.textContent = item.name;
    const rename = document.createElement("span");
    rename.className = "db-view-rename";
    rename.dataset.dbAction = "view-rename";
    rename.dataset.view = item.id;
    rename.textContent = "✎";
    rename.title = "Rename view";
    button.appendChild(rename);
    list.appendChild(button);
  }
  menu.appendChild(list);

  const types = ["table", "board", "gallery", "list", "calendar", "timeline"];
  const addRow = document.createElement("div");
  addRow.className = "db-view-add";
  for (const type of types) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.dbAction = "add-view";
    button.dataset.viewType = type;
    button.textContent = PROPERTY_TYPES.title ? type[0].toUpperCase() + type.slice(1) : type;
    addRow.appendChild(button);
  }
  menu.appendChild(addRow);

  const footer = document.createElement("div");
  footer.className = "db-prop-actions";
  if ((block.views || []).length > 1) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.dataset.dbAction = "view-delete";
    remove.dataset.view = view.id;
    remove.textContent = "Delete view";
    footer.appendChild(remove);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.dataset.dbAction = "view-menu-close";
  close.textContent = "Close";
  footer.appendChild(close);
  menu.appendChild(footer);

  void ctx;
  return menu;
}

/* ---------------- linked view ---------------- */

function buildLinkedView(block, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "db-linked";

  const source = ctx.linkedRows(block);
  if (!block.linked?.dbId) {
    const empty = document.createElement("div");
    empty.className = "db-empty";
    empty.textContent = "Pick a database to link from the view menu.";
    wrap.appendChild(empty);
    return wrap;
  }
  if (!source) {
    const empty = document.createElement("div");
    empty.className = "db-empty";
    empty.textContent = "The linked database is gone.";
    wrap.appendChild(empty);
    return wrap;
  }

  const filter = String(block.linkedFilter || "").trim().toLowerCase();
  const title = titleProperty(source);
  const rows = (source.rows || []).filter((row) => {
    if (!filter) return true;
    return (source.properties || [])
      .map((property) => displayValue(source, row, property, ctx.valueContext()))
      .join(" ")
      .toLowerCase()
      .includes(filter);
  });

  const head = document.createElement("div");
  head.className = "db-linked-head";
  head.innerHTML = `<span>Linked from ${escapeHtml(source.title || "another database")}</span>
    <input class="db-filter" type="text" placeholder="Filter linked…" value="${escapeHtml(
      block.linkedFilter || ""
    )}" />`;
  wrap.appendChild(head);

  const list = document.createElement("div");
  list.className = "db-linked-list";

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "db-empty-text";
    empty.textContent = "No linked rows match.";
    list.appendChild(empty);
  }

  for (const row of rows) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "db-linked-row";
    item.dataset.dbAction = "relation-open-row";
    item.dataset.dbRow = row.id;
    const label = String(row.cells?.[title.id] || "Untitled");
    const chips = (source.properties || [])
      .filter((property) => property.type === "status" || property.type === "date")
      .map((property) => {
        const value = displayValue(source, row, property, ctx.valueContext());
        return value ? `<span class="db-chip db-chip--soft">${escapeHtml(value)}</span>` : "";
      })
      .join("");
    item.innerHTML = `<span class="db-linked-title">${escapeHtml(label)}</span>${chips}`;
    list.appendChild(item);
  }

  wrap.appendChild(list);
  return wrap;
}

/* ---------------- public ---------------- */

export function buildDatabasePanel(block, ctx) {
  ensureDatabaseDefaults(block);

  const wrap = document.createElement("div");
  wrap.className = "database-block";

  const view = currentView(block);
  wrap.dataset.dbView = view.type;

  if (block.linked?.dbId) {
    wrap.classList.add("is-linked");
    wrap.appendChild(buildToolbar(block, view, ctx));
    wrap.appendChild(buildLinkedView(block, ctx));
    return wrap;
  }

  const rows = visibleRows(block, ctx);
  wrap.appendChild(buildToolbar(block, view, ctx));

  let body;
  switch (view.type) {
    case "board":
      body = buildBoardView(block, rows, ctx);
      break;
    case "gallery":
      body = buildGalleryView(block, rows, ctx);
      break;
    case "list":
      body = buildListView(block, rows, ctx);
      break;
    case "calendar":
      body = buildCalendarView(block, rows, ctx);
      break;
    case "timeline":
      body = buildTimelineView(block, rows);
      break;
    default:
      body = buildTableView(block, rows, ctx);
  }
  wrap.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "db-footer";
  footer.innerHTML = `<span>${rows.length} of ${(block.rows || []).length} rows</span>`;
  wrap.appendChild(footer);

  return wrap;
}

export { currentView, ensureDatabaseDefaults as ensureDatabase, visibleRows, propertyById };
export { buildPropertyMenu, buildFiltersPanel, buildViewMenu, formatNumber, formatDateLabel };