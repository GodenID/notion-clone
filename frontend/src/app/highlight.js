/* Tiny dependency-free syntax highlighter for the code block. */

const KEYWORDS = {
  javascript:
    "const let var function return if else for while do switch case break continue new class extends super import export from default async await try catch finally throw typeof instanceof of in delete void yield static get set null undefined true false this",
  typescript:
    "const let var function return if else for while do switch case break continue new class extends implements interface type enum public private protected readonly async await try catch finally throw typeof instanceof of in null undefined true false this as satisfies",
  python:
    "def class return if elif else for while break continue pass import from as try except finally raise with lambda global nonlocal yield assert del not and or in is None True False async await",
  json: "true false null",
  css: "",
  html: "",
  bash: "if then else elif fi for while do done case esac function return export local echo cd ls",
  sql: "select from where group by order having join left right inner outer on insert into values update set delete create table drop alter index view limit offset as distinct and or not null",
  java: "public private protected class interface extends implements new return if else for while do switch case break continue try catch finally throw throws static final void import package this super null true false",
  go: "package import func return if else for range switch case default break continue var const type struct interface map chan go defer nil true false",
  rust: "fn let mut const struct enum impl trait use mod pub crate match if else for while loop return break continue self Self as where ref move dyn unsafe async await true false",
  php: "function return if else elseif foreach for while do switch case break continue class public private protected static new echo require include namespace use try catch finally throw true false null",
  ruby: "def end class module if elsif else unless while until for do return yield begin rescue ensure raise require require_relative attr_accessor true false nil self",
};

const ALIASES = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  htm: "html",
  xml: "html",
  "c++": "cpp",
  golang: "go",
  rs: "rust",
  rb: "ruby",
  md: "markdown",
  plaintext: "plain",
  text: "plain",
  "": "plain",
};

const LANGUAGE_LABELS = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  json: "JSON",
  css: "CSS",
  html: "HTML",
  bash: "Bash",
  sql: "SQL",
  java: "Java",
  go: "Go",
  rust: "Rust",
  php: "PHP",
  ruby: "Ruby",
  markdown: "Markdown",
  plain: "Plain text",
};

export const CODE_LANGUAGES = Object.keys(LANGUAGE_LABELS);

export function normalizeLanguage(language) {
  const raw = String(language || "").trim().toLowerCase();
  return ALIASES[raw] || raw || "plain";
}

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));

/**
 * Highlight one line of source. Returns HTML with `tok-*` spans.
 * Deliberately regex-based and forgiving: it never throws on malformed input.
 */
export function highlightLine(line, language) {
  const source = String(line ?? "");
  if (!source.trim()) return "";

  const keywords = new Set((KEYWORDS[normalizeLanguage(language)] || "").split(/\s+/).filter(Boolean));

  if (normalizeLanguage(language) === "html" || normalizeLanguage(language) === "xml") {
    return highlightHtml(source);
  }
  if (normalizeLanguage(language) === "css") {
    return highlightCss(source);
  }
  if (normalizeLanguage(language) === "json") {
    return highlightJson(source);
  }
  if (normalizeLanguage(language) === "bash") {
    return highlightBash(source);
  }

  const parts = [];
  let buffer = "";
  let index = 0;

  const flush = () => {
    if (buffer) {
      parts.push(escapeHtml(buffer));
      buffer = "";
    }
  };

  while (index < source.length) {
    const rest = source.slice(index);

    const lineComment = rest.match(/^(\/\/|#|--)(.*)$/);
    if (lineComment && !/^(#|--)/.test(lineComment[1]) === false ? true : true) {
      // handled below per-language; keep scanning
    }

    const blockComment = rest.match(/^\/\*([\s\S]*?)\*\//);
    if (blockComment) {
      flush();
      parts.push(`<span class="tok-comment">${escapeHtml(blockComment[0])}</span>`);
      index += blockComment[0].length;
      continue;
    }

    const lineComment2 = rest.match(/^(\/\/)[^\n]*/);
    if (lineComment2) {
      flush();
      parts.push(`<span class="tok-comment">${escapeHtml(lineComment2[0])}</span>`);
      index += lineComment2[0].length;
      continue;
    }

    const hashComment = rest.match(/^(#)[^\n]*/);
    if (hashComment && keywords.has("#") === false && normalizeLanguage(language) !== "python" && normalizeLanguage(language) !== "bash") {
      // not a comment language
    } else if (hashComment) {
      flush();
      parts.push(`<span class="tok-comment">${escapeHtml(hashComment[0])}</span>`);
      index += hashComment[0].length;
      continue;
    }

    const string = rest.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/);
    if (string) {
      flush();
      parts.push(`<span class="tok-string">${escapeHtml(string[0])}</span>`);
      index += string[0].length;
      continue;
    }

    const number = rest.match(/^(0x[0-9a-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)/i);
    if (number) {
      flush();
      parts.push(`<span class="tok-number">${escapeHtml(number[0])}</span>`);
      index += number[0].length;
      continue;
    }

    const word = rest.match(/^[A-Za-z_$][\w$]*/);
    if (word) {
      const value = word[0];
      flush();
      if (keywords.has(value)) {
        parts.push(`<span class="tok-keyword">${escapeHtml(value)}</span>`);
      } else if (rest[value.length] === "(") {
        parts.push(`<span class="tok-function">${escapeHtml(value)}</span>`);
      } else {
        parts.push(escapeHtml(value));
      }
      index += value.length;
      continue;
    }

    const punct = rest.match(/^[{}()[\].,;:]/);
    if (punct) {
      flush();
      parts.push(`<span class="tok-punct">${escapeHtml(punct[0])}</span>`);
      index += punct[0].length;
      continue;
    }

    const operator = rest.match(/^(=>|===|!==|==|!=|<=|>=|&&|\|\||=>|[+\-*/%<>=!&|^~?])/);
    if (operator) {
      flush();
      parts.push(`<span class="tok-operator">${escapeHtml(operator[0])}</span>`);
      index += operator[0].length;
      continue;
    }

    buffer += source[index];
    index += 1;
  }

  flush();
  return parts.join("");
}

function highlightHtml(source) {
  return escapeHtml(source)
    .replace(/(&lt;\/?)([a-zA-Z][\w-]*)/g, '$1<span class="tok-tag">$2</span>')
    .replace(/([a-zA-Z-]+)(=)(&quot;[^&]*?&quot;)/g, '<span class="tok-attr">$1</span>$2<span class="tok-string">$3</span>');
}

function highlightCss(source) {
  return escapeHtml(source)
    .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>')
    .replace(/^([^\n{]*?)(\{)/, '<span class="tok-tag">$1</span>$2')
    .replace(/([-a-zA-Z]+)(\s*:\s*)([^;{}\n]+)/g, '<span class="tok-attr">$1</span>$2<span class="tok-string">$3</span>');
}

function highlightJson(source) {
  return escapeHtml(source)
    .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="tok-attr">$1</span>$2')
    .replace(/:\s*(&quot;[^&]*?&quot;)/g, ': <span class="tok-string">$1</span>')
    .replace(/\b(true|false|null)\b/g, '<span class="tok-keyword">$1</span>')
    .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
}

function highlightBash(source) {
  return escapeHtml(source)
    .replace(/(^|\s)(#.*)$/g, '$1<span class="tok-comment">$2</span>')
    .replace(/(&quot;[^&]*?&quot;|'[^']*')/g, '<span class="tok-string">$1</span>')
    .replace(
      /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|export|local|echo|cd|ls)\b/g,
      '<span class="tok-keyword">$1</span>'
    );
}

export function highlightCode(code, language) {
  const lines = String(code ?? "").split("\n");
  return lines.map((line) => highlightLine(line, language)).join("\n");
}

export { LANGUAGE_LABELS };