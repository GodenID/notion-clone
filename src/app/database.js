/* Database property engine: property types, formula parser, rows, relations. */

export const PROPERTY_TYPES = {
  title: { label: "Title", icon: "Aa" },
  text: { label: "Text", icon: "T" },
  number: { label: "Number", icon: "#" },
  date: { label: "Date", icon: "📅" },
  checkbox: { label: "Checkbox", icon: "☑" },
  select: { label: "Select", icon: "◔", options: true },
  multiselect: { label: "Multi-select", icon: "☰", options: true },
  status: { label: "Status", icon: "◍", options: true, colors: true },
  formula: { label: "Formula", icon: "ƒx", formula: true },
  rollup: { label: "Rollup", icon: "∑", rollup: true },
  relation: { label: "Relation", icon: "⇄", relation: true },
  people: { label: "People", icon: "☺" },
  files: { label: "Files", icon: "📎" },
  url: { label: "URL", icon: "🔗" },
  uniqueId: { label: "ID", icon: "#" },
  createdTime: { label: "Created time", icon: "◷" },
  updatedTime: { label: "Updated time", icon: "◴" },
};

export const STATUS_GROUPS = [
  { id: "todo", name: "To-do", color: "#9b9a97" },
  { id: "progress", name: "In progress", color: "#337ea9" },
  { id: "review", name: "Review", color: "#9065b0" },
  { id: "done", name: "Done", color: "#448361" },
  { id: "blocked", name: "Blocked", color: "#d44c47" },
];

const ROLLUP_FUNCTIONS = [
  { id: "count", label: "Count", args: 1 },
  { id: "countValues", label: "Count values", args: 1 },
  { id: "sum", label: "Sum", args: 1 },
  { id: "avg", label: "Average", args: 1 },
  { id: "min", label: "Minimum", args: 1 },
  { id: "max", label: "Maximum", args: 1 },
  { id: "showOriginal", label: "Show original", args: 1 },
  { id: "concat", label: "Concatenate", args: 1 },
];

export const ROLLUP_FUNCTION_IDS = ROLLUP_FUNCTIONS;

export function uid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function makeDefaultProperty(type, overrides = {}) {
  const base = { id: uid(), name: PROPERTY_TYPES[type]?.label || "Property", type };
  if (type === "select" || type === "multiselect") {
    base.options = ["Option 1", "Option 2", "Option 3"];
  }
  if (type === "status") {
    base.options = STATUS_GROUPS.slice(0, 3).map((group) => group.name);
  }
  if (type === "formula") base.formula = 'prop("Name")';
  if (type === "rollup") {
    base.rollup = { relationPropId: "", targetPropId: "", fn: "count" };
  }
  if (type === "relation") base.relation = { dbId: "" };
  return { ...base, ...overrides };
}

export function emptyCell(property) {
  const type = property?.type;
  if (type === "checkbox") return false;
  if (type === "multiselect" || type === "people" || type === "files" || type === "relation") {
    return [];
  }
  if (type === "number") return null;
  return "";
}

export function makeRow(properties, overrides = {}) {
  const cells = {};
  for (const property of properties || []) cells[property.id] = emptyCell(property);
  return {
    id: uid(),
    shortId: `nc-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    cells,
    ...overrides,
  };
}

/* ---------------- formula ---------------- */

function tokenizeFormula(source) {
  const tokens = [];
  const text = String(source || "");
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(text[index + 1] || ""))) {
      let raw = "";
      while (index < text.length && /[0-9._]/.test(text[index])) {
        raw += text[index];
        index += 1;
      }
      tokens.push({ kind: "number", value: Number(raw.replace(/_/g, "")) });
      continue;
    }

    if (char === '"' || char === "'") {
      let raw = "";
      index += 1;
      while (index < text.length && text[index] !== char) {
        if (text[index] === "\\") index += 1;
        raw += text[index];
        index += 1;
      }
      index += 1;
      tokens.push({ kind: "string", value: raw });
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      let raw = "";
      while (index < text.length && /[A-Za-z0-9_$.\- ]/.test(text[index])) {
        raw += text[index];
        index += 1;
      }
      const trimmed = raw.trim();
      if (!trimmed) continue;
      tokens.push({ kind: "ident", value: trimmed });
      continue;
    }

    if ("+-*/%(),<>=!&|".includes(char)) {
      const two = text.slice(index, index + 2);
      if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) {
        tokens.push({ kind: "op", value: two });
        index += 2;
        continue;
      }
      tokens.push({ kind: "op", value: char });
      index += 1;
      continue;
    }

    index += 1;
  }

  return tokens;
}

const FORMULA_FUNCTIONS = {
  if: (args) => (args[0] ? args[1] : args[2] ?? ""),
  concat: (args) => args.map((value) => coerceText(value)).join(""),
  length: (args) => coerceText(args[0]).length,
  lower: (args) => coerceText(args[0]).toLowerCase(),
  upper: (args) => coerceText(args[0]).toUpperCase(),
  trim: (args) => coerceText(args[0]).trim(),
  round: (args) => {
    const value = Number(args[0]);
    if (!Number.isFinite(value)) return 0;
    const digits = Number.isFinite(Number(args[1])) ? Number(args[1]) : 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  },
  abs: (args) => Math.abs(Number(args[0]) || 0),
  floor: (args) => Math.floor(Number(args[0]) || 0),
  ceil: (args) => Math.ceil(Number(args[0]) || 0),
  sqrt: (args) => Math.sqrt(Number(args[0]) || 0),
  min: (args) => Math.min(...args.map((value) => Number(value) || 0)),
  max: (args) => Math.max(...args.map((value) => Number(value) || 0)),
  sum: (args) => args.reduce((total, value) => total + (Number(value) || 0), 0),
  empty: (args) => (args[0] === "" || args[0] === null || args[0] === undefined),
  notEmpty: (args) => !(args[0] === "" || args[0] === null || args[0] === undefined),
  date: (args) => coerceText(args[0]),
  contains: (args) => coerceText(args[0]).toLowerCase().includes(coerceText(args[1]).toLowerCase()),
  startsWith: (args) => coerceText(args[0]).toLowerCase().startsWith(coerceText(args[1]).toLowerCase()),
  endsWith: (args) => coerceText(args[0]).toLowerCase().endsWith(coerceText(args[1]).toLowerCase()),
  status: (args) => coerceText(args[0]),
  number: (args) => Number(args[0]) || 0,
};

export const FORMULA_FUNCTION_NAMES = Object.keys(FORMULA_FUNCTIONS);

function coerceText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(coerceText).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function coerceNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const parsed = Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function evaluateFormula(expression, lookup, resolve) {
  const tokens = tokenizeFormula(expression);
  let position = 0;

  const peek = () => tokens[position];
  const next = () => tokens[position++];
  const isOp = (value) =>
    peek()?.kind === "op" && (value ? peek().value === value : true);

  function parseExpression() {
    return parseAdditive();
  }

  function parseAdditive() {
    let left = parseMultiplicative();
    while (isOp("+") || isOp("-")) {
      const operator = next().value;
      const right = parseMultiplicative();
      left = operator === "+" ? coerceNumber(left) + coerceNumber(right) : coerceNumber(left) - coerceNumber(right);
    }
    return left;
  }

  function parseMultiplicative() {
    let left = parseUnary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const operator = next().value;
      const right = parseUnary();
      if (operator === "*") left = coerceNumber(left) * coerceNumber(right);
      else if (operator === "/") left = coerceNumber(right) === 0 ? 0 : coerceNumber(left) / coerceNumber(right);
      else left = coerceNumber(right) === 0 ? 0 : coerceNumber(left) % coerceNumber(right);
    }
    return left;
  }

  function parseUnary() {
    if (isOp("-")) {
      next();
      return -coerceNumber(parseUnary());
    }
    if (isOp("+")) {
      next();
      return coerceNumber(parseUnary());
    }
    if (isOp("!") && peek()?.kind === "op") {
      next();
      return parseUnary() ? 0 : 1;
    }
    return parseComparison();
  }

  function parseComparison() {
    let left = parsePrimary();
    while (peek()?.kind === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(peek().value)) {
      const operator = next().value;
      const right = parsePrimary();
      const a = typeof left === "number" ? left : coerceText(left);
      const b = typeof right === "number" ? right : coerceText(right);
      let result;
      if (operator === "<") result = a < b;
      else if (operator === ">") result = a > b;
      else if (operator === "<=") result = a <= b;
      else if (operator === ">=") result = a >= b;
      else if (operator === "==") result = a === b || coerceText(a) === coerceText(b);
      else result = a !== b && coerceText(a) !== coerceText(b);
      left = result ? 1 : 0;
    }
    return left;
  }

  function parsePrimary() {
    const token = peek();
    if (!token) return 0;

    if (token.kind === "number") {
      next();
      return token.value;
    }

    if (token.kind === "string") {
      next();
      return token.value;
    }

    if (token.kind === "op" && token.value === "(") {
      next();
      const value = parseExpression();
      if (isOp(")")) next();
      return value;
    }

    if (token.kind === "ident") {
      next();
      const lower = token.value.toLowerCase();

      if (lower === "true") return 1;
      if (lower === "false") return 0;

      if (peek()?.kind === "op" && peek().value === "(") {
        next();
        const args = [];
        if (!(peek()?.kind === "op" && peek().value === ")")) {
          args.push(parseExpression());
          while (peek()?.kind === "op" && peek().value === ",") {
            next();
            args.push(parseExpression());
          }
        }
        if (peek()?.kind === "op" && peek().value === ")") next();

        if (lower === "prop" || lower === "property") {
          const name = coerceText(args[0]);
          return resolve ? resolve(name) : "";
        }
        const fn = FORMULA_FUNCTIONS[lower];
        if (!fn) return "";
        let output;
        try {
          output = fn(args);
        } catch {
          return "";
        }
        if (typeof output === "boolean") return output ? 1 : 0;
        if (output === null || output === undefined) return "";
        return output;
      }

      return resolve ? resolve(token.value) : "";
    }

    next();
    return 0;
  }

  const result = parseExpression();
  return result;
}

export function formulaValue(property, row, lookupValue) {
  if (!property?.formula) return "";
  try {
    const value = evaluateFormula(property.formula, () => "", (name) => lookupValue(name));
    if (typeof value === "string") return value;
    if (typeof value === "number") return Number.isInteger(value) ? value : Number(value.toFixed(4));
    return value;
  } catch {
    return "";
  }
}

/* ---------------- rows: filtering, sorting, values ---------------- */

export function cellValue(block, row, property, context = {}) {
  if (!property) return "";
  const raw = row?.cells?.[property.id];

  switch (property.type) {
    case "checkbox":
      return Boolean(raw);
    case "number":
      return raw === null || raw === undefined || raw === "" ? null : Number(raw);
    case "multiselect":
    case "people":
    case "files":
    case "relation":
      return Array.isArray(raw) ? raw : [];
    case "status":
      return String(raw ?? "");
    case "uniqueId":
      return row?.shortId || String(raw ?? "");
    case "createdTime":
      return row?.createdAt ?? null;
    case "updatedTime":
      return row?.updatedAt ?? null;
    case "formula":
      return formulaValue(property, row, (name) => {
        const target =
          (block.properties || []).find(
            (item) => item.name.toLowerCase() === String(name).toLowerCase()
          ) || (block.properties || [])[0];
        return target ? displayValue(block, row, target, context) : "";
      });
    case "rollup": {
      const config = property.rollup || {};
      const rows = context.rollupRows?.(config) || [];
      return rollupValue(config, rows, block, context);
    }
    default:
      return raw ?? "";
  }
}

export function rollupValue(config, relatedRows, block, context) {
  const fn = config?.fn || "count";
  const targetProp = context.rollupProperty?.(config);

  if (fn === "count") return relatedRows.length;
  if (fn === "countValues") {
    return relatedRows.filter((row) => {
      const value = targetProp ? displayValue(block, row, targetProp, context) : "";
      return value !== "" && value !== null && value !== undefined;
    }).length;
  }
  if (fn === "showOriginal") {
    return relatedRows
      .map((row) => (targetProp ? displayValue(block, row, targetProp, context) : ""))
      .filter(Boolean)
      .join(", ");
  }

  const numbers = relatedRows
    .map((row) => (targetProp ? displayValue(block, row, targetProp, context) : null))
    .filter((value) => Number.isFinite(Number(value)))
    .map(Number);

  if (fn === "concat") {
    return relatedRows
      .map((row) => (targetProp ? displayValue(block, row, targetProp, context) : ""))
      .filter(Boolean)
      .join(", ");
  }
  if (!numbers.length) return 0;
  if (fn === "sum") return numbers.reduce((total, value) => total + value, 0);
  if (fn === "avg") return Number((numbers.reduce((total, value) => total + value, 0) / numbers.length).toFixed(2));
  if (fn === "min") return Math.min(...numbers);
  if (fn === "max") return Math.max(...numbers);
  return numbers.length;
}

export function displayValue(block, row, property, context = {}) {
  const value = cellValue(block, row, property, context);
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "✓" : "";
  if (Array.isArray(value)) {
    if (property.type === "files") return value.map((file) => file?.name || "").filter(Boolean).join(", ");
    if (property.type === "relation") {
      const names = value.map((id) => context.relationLabel?.(property, id)).filter(Boolean);
      return names.join(", ");
    }
    if (property.type === "people") return value.join(", ");
    return value.join(", ");
  }
  if (property.type === "createdTime" || property.type === "updatedTime") {
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  return String(value);
}

export function sortRows(rows, property, direction) {
  const factor = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = cellValueRaw(property, a);
    const right = cellValueRaw(property, b);
    return factor * compareValues(left, right);
  });
}

function cellValueRaw(property, row) {
  if (!property) return "";
  const value = row?.cells?.[property.id];
  if (property.type === "checkbox") return value ? 1 : 0;
  if (property.type === "number") return value === null || value === "" ? null : Number(value);
  if (property.type === "date" || property.type === "createdTime" || property.type === "updatedTime") {
    return value ? new Date(value).getTime() : null;
  }
  if (Array.isArray(value)) return value.join(", ");
  return value ?? "";
}

function compareValues(left, right) {
  const leftEmpty = left === null || left === undefined || left === "";
  const rightEmpty = right === null || right === undefined || right === "";
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}