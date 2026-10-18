import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";

const root = fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]+$/, "");
const repoRoot = resolve(root, "..");
const portArg = process.argv.indexOf("--port");
const port = Number(portArg > -1 ? process.argv[portArg + 1] : 5173);

const attachmentsDir = join(repoRoot, ".data", "attachments");
await mkdir(attachmentsDir, { recursive: true });

const mediaDir = join(repoRoot, ".data", "media");
await mkdir(mediaDir, { recursive: true });

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_OOXML_UNCOMPRESSED = 120 * 1024 * 1024;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

const MEDIA_TYPES = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
};

const ATTACHMENT_TYPES = {
  ".pdf": { kind: "pdf", mime: "application/pdf" },
  ".doc": { kind: "doc", mime: "application/msword" },
  ".docx": {
    kind: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  ".csv": { kind: "csv", mime: "text/csv; charset=utf-8" },
  ".xls": { kind: "xls", mime: "application/vnd.ms-excel" },
  ".xlsx": {
    kind: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  });
  res.end(body);
}

function sanitizeFileName(raw) {
  const base = String(raw || "")
    .split(/[\\/]/)
    .pop()
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return [...base].slice(0, 160).join("");
}

function fileExtension(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

function startsWithBytes(buffer, bytes) {
  if (buffer.length < bytes.length) return false;
  for (let index = 0; index < bytes.length; index += 1) {
    if (buffer[index] !== bytes[index]) return false;
  }
  return true;
}

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function validatePdf(buffer) {
  if (!startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "The file is not a valid PDF.";
  }
  const tail = buffer.subarray(Math.max(0, buffer.length - 65536)).toString("latin1");
  if (!tail.includes("%%EOF")) return "The PDF is incomplete (missing its EOF marker).";
  return "";
}

function readZipEntries(buffer) {
  if (buffer.length < 22) return null;
  try {
    let eocd = -1;
    const start = Math.max(0, buffer.length - 65557);
    for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) {
        eocd = offset;
        break;
      }
    }
    if (eocd < 0) return null;

    const count = buffer.readUInt16LE(eocd + 10);
    const size = buffer.readUInt32LE(eocd + 12);
    const offset = buffer.readUInt32LE(eocd + 16);
    if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) return null;
    if (offset + size > buffer.length) return null;

    const entries = [];
    let cursor = offset;
    for (let index = 0; index < count; index += 1) {
      if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) return null;
      const flags = buffer.readUInt16LE(cursor + 8);
      const method = buffer.readUInt16LE(cursor + 10);
      const compressedSize = buffer.readUInt32LE(cursor + 20);
      const uncompressedSize = buffer.readUInt32LE(cursor + 24);
      const nameLength = buffer.readUInt16LE(cursor + 28);
      const extraLength = buffer.readUInt16LE(cursor + 30);
      const commentLength = buffer.readUInt16LE(cursor + 32);
      const end = cursor + 46 + nameLength + extraLength + commentLength;
      if (end > buffer.length) return null;
      const name = buffer
        .subarray(cursor + 46, cursor + 46 + nameLength)
        .toString(flags & 0x800 ? "utf8" : "latin1");
      entries.push({ name, flags, method, compressedSize, uncompressedSize });
      cursor = end;
    }
    return entries;
  } catch {
    return null;
  }
}

function validateZipOffice(buffer, kind) {
  if (!startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    return "The file is not a valid Office (ZIP) package.";
  }
  const entries = readZipEntries(buffer);
  if (!entries?.length) return "The Office package is corrupted.";

  const names = new Set();
  let uncompressedTotal = 0;
  for (const entry of entries) {
    if (entry.flags & 0x1) return "Encrypted Office files are not allowed.";
    if (entry.method !== 0 && entry.method !== 8) {
      return "The Office package uses an unsupported compression method.";
    }
    if (/(^|\/)vbaproject\.bin$/i.test(entry.name)) {
      return "Macro-enabled Office files are not allowed.";
    }
    names.add(entry.name.toLowerCase());
    uncompressedTotal += entry.uncompressedSize;
    if (uncompressedTotal > MAX_OOXML_UNCOMPRESSED) {
      return "The Office package expands beyond the allowed size.";
    }
  }

  if (!names.has("[content_types].xml")) {
    return "The Office package is missing its content types.";
  }
  const hasWord = [...names].some((name) => name.startsWith("word/"));
  const hasExcel = [...names].some((name) => name.startsWith("xl/"));
  if (kind === "docx" && !hasWord) return "The file is not a Word document.";
  if (kind === "xlsx" && !hasExcel) return "The file is not an Excel workbook.";
  return "";
}

function utf16Includes(buffer, value) {
  return buffer.indexOf(Buffer.from(value, "utf16le")) !== -1;
}

function validateOleOffice(buffer, kind) {
  if (!startsWithBytes(buffer, OLE_SIGNATURE)) {
    return "The file is not a valid legacy Office document.";
  }
  if (kind === "doc" && !utf16Includes(buffer, "WordDocument")) {
    return "The file is not a Word document.";
  }
  if (kind === "xls" && !utf16Includes(buffer, "Workbook") && !utf16Includes(buffer, "Book")) {
    return "The file is not an Excel workbook.";
  }
  return "";
}

function validateCsv(buffer) {
  if (!buffer.length) return "The CSV file is empty.";
  const binarySignatures = [
    [0x4d, 0x5a],
    [0x7f, 0x45, 0x4c, 0x46],
    [0x50, 0x4b, 0x03, 0x04],
    [0x25, 0x50, 0x44, 0x46, 0x2d],
    OLE_SIGNATURE,
    [0x89, 0x50, 0x4e, 0x47],
    [0x47, 0x49, 0x46, 0x38],
    [0xff, 0xd8, 0xff],
  ];
  for (const signature of binarySignatures) {
    if (startsWithBytes(buffer, signature)) {
      return "The file contains binary data, not CSV text.";
    }
  }
  if (buffer.indexOf(0) !== -1) return "The file contains binary data, not CSV text.";

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return "CSV files must be valid UTF-8 text.";
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!text.trim()) return "The CSV file is empty.";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
    return "The CSV file contains invalid control characters.";
  }
  return "";
}

function validateAttachment(name, buffer) {
  const ext = fileExtension(name);
  const type = ATTACHMENT_TYPES[ext];
  if (!type) {
    return { error: "Only PDF, Word (.doc/.docx), CSV, and Excel (.xls/.xlsx) files are allowed." };
  }
  if (!buffer.length) return { error: "The uploaded file is empty." };
  if (buffer.length > MAX_ATTACHMENT_BYTES) return { error: "The file is larger than 20 MB." };

  let error = "";
  if (type.kind === "pdf") error = validatePdf(buffer);
  else if (type.kind === "docx" || type.kind === "xlsx") error = validateZipOffice(buffer, type.kind);
  else if (type.kind === "doc" || type.kind === "xls") error = validateOleOffice(buffer, type.kind);
  else if (type.kind === "csv") error = validateCsv(buffer);

  return error ? { error } : { ext, mime: type.mime };
}

async function readBody(req, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total <= limit) chunks.push(chunk);
  }
  if (total > limit) return null;
  return Buffer.concat(chunks);
}

async function handleAttachmentUpload(req, res, url) {
  const name = sanitizeFileName(url.searchParams.get("name"));
  if (!name) return sendJson(res, 400, { error: "A file name is required." });

  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_ATTACHMENT_BYTES) {
    req.resume();
    return sendJson(res, 413, { error: "The file is larger than 20 MB." });
  }

  const buffer = await readBody(req, MAX_ATTACHMENT_BYTES);
  if (!buffer) return sendJson(res, 413, { error: "The file is larger than 20 MB." });

  const validation = validateAttachment(name, buffer);
  if (validation.error) return sendJson(res, 422, { error: validation.error });

  const id = randomUUID();
  const meta = {
    id,
    name,
    ext: validation.ext,
    mime: validation.mime,
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    verified: true,
    uploadedAt: Date.now(),
  };

  await writeFile(join(attachmentsDir, `${id}${validation.ext}`), buffer, { flag: "wx" });
  await writeFile(join(attachmentsDir, `${id}.json`), JSON.stringify(meta), { flag: "wx" });
  sendJson(res, 201, meta);
}

async function loadManifest(id) {
  try {
    const raw = await readFile(join(attachmentsDir, `${id}.json`), "utf8");
    const meta = JSON.parse(raw);
    if (!meta || meta.id !== id || !ATTACHMENT_TYPES[meta.ext]) return null;
    if (typeof meta.name !== "string" || typeof meta.sha256 !== "string") return null;
    return meta;
  } catch {
    return null;
  }
}

function contentDisposition(name) {
  const ascii = name
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .replace(/[\r\n]/g, "");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii || "attachment"}"; filename*=UTF-8''${encoded}`;
}

async function handleAttachmentGet(res, id, action) {
  const meta = await loadManifest(id);
  if (!meta) return sendJson(res, 404, { error: "Attachment not found." });
  if (action === "/meta") return sendJson(res, 200, meta);

  let body;
  try {
    body = await readFile(join(attachmentsDir, `${id}${meta.ext}`));
  } catch {
    return sendJson(res, 404, { error: "Attachment file not found." });
  }

  const digest = createHash("sha256").update(body).digest("hex");
  const revalidation = validateAttachment(meta.name, body);
  const verified =
    body.length === meta.size &&
    digest === meta.sha256 &&
    !revalidation.error &&
    revalidation.ext === meta.ext &&
    revalidation.mime === meta.mime;
  if (action === "/verify") {
    if (!verified) {
      return sendJson(res, 409, {
        id,
        verified: false,
        error: "The stored file failed its integrity check.",
      });
    }
    return sendJson(res, 200, { id, verified: true, sha256: digest, size: body.length });
  }
  if (!verified) {
    return sendJson(res, 409, { error: "The stored file failed its integrity check." });
  }

  res.writeHead(200, {
    "Content-Type": meta.mime,
    "Content-Length": body.length,
    "Content-Disposition": contentDisposition(meta.name),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  });
  res.end(body);
}

function attachmentRoute(pathname) {
  const match =
    /^\/api\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/meta|\/verify)?$/.exec(
      pathname
    );
  return match ? { id: match[1], action: match[2] || "" } : null;
}

/* ---------------- media (audio / video / any file) ---------------- */

function mediaManifestPath(id) {
  return join(mediaDir, `${id}.json`);
}

function mediaBlobPath(meta) {
  return join(mediaDir, `${meta.id}${meta.ext}`);
}

async function handleMediaUpload(req, res, url) {
  const name = sanitizeFileName(url.searchParams.get("name"));
  if (!name) return sendJson(res, 400, { error: "A file name is required." });

  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > MAX_MEDIA_BYTES) {
    req.resume();
    return sendJson(res, 413, { error: "The file is larger than 25 MB." });
  }

  const buffer = await readBody(req, MAX_MEDIA_BYTES);
  if (!buffer) return sendJson(res, 413, { error: "The file is larger than 25 MB." });
  if (!buffer.length) return sendJson(res, 422, { error: "The uploaded file is empty." });

  const ext = fileExtension(name);
  const mime = MEDIA_TYPES[ext] ?? "application/octet-stream";
  const id = randomUUID();
  const meta = {
    id,
    name,
    ext,
    mime,
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    uploadedAt: Date.now(),
  };

  await writeFile(mediaBlobPath(meta), buffer, { flag: "wx" });
  await writeFile(mediaManifestPath(id), JSON.stringify(meta), { flag: "wx" });
  sendJson(res, 201, { ...meta, url: `/api/media/${id}` });
}

async function loadMediaManifest(id) {
  try {
    const raw = await readFile(mediaManifestPath(id), "utf8");
    const meta = JSON.parse(raw);
    if (!meta || meta.id !== id) return null;
    if (typeof meta.name !== "string" || typeof meta.mime !== "string") return null;
    if (!Number.isFinite(meta.size)) return null;
    return meta;
  } catch {
    return null;
  }
}

function inlineDisposition(name) {
  const ascii = name
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .replace(/[\r\n]/g, "");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `inline; filename="${ascii || "media"}"; filename*=UTF-8''${encoded}`;
}

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start;
  let end;
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function handleMediaGet(req, res, id, action) {
  const meta = await loadMediaManifest(id);
  if (!meta) return sendJson(res, 404, { error: "Media not found." });
  if (action === "/meta") return sendJson(res, 200, { ...meta, url: `/api/media/${id}` });

  let body;
  try {
    body = await readFile(mediaBlobPath(meta));
  } catch {
    return sendJson(res, 404, { error: "Media file not found." });
  }

  const inline = /^(audio|video|image)\//.test(meta.mime) || meta.mime === "application/pdf";
  const headers = {
    "Content-Type": meta.mime,
    "Accept-Ranges": "bytes",
    "Content-Disposition": inline ? inlineDisposition(meta.name) : contentDisposition(meta.name),
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };

  const range = parseRange(req.headers.range, body.length);
  if (range) {
    const slice = body.subarray(range.start, range.end + 1);
    res.writeHead(206, {
      ...headers,
      "Content-Length": slice.length,
      "Content-Range": `bytes ${range.start}-${range.end}/${body.length}`,
    });
    res.end(req.method === "HEAD" ? undefined : slice);
    return;
  }

  res.writeHead(200, { ...headers, "Content-Length": body.length });
  if (req.method === "HEAD") res.end();
  else res.end(body);
}

function mediaRoute(pathname) {
  const match =
    /^\/api\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/meta)?$/.exec(
      pathname
    );
  return match ? { id: match[1], action: match[2] || "" } : null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/api/attachments") {
      if (req.method !== "POST") {
        return sendJson(res, 405, { error: "Method not allowed." });
      }
      await handleAttachmentUpload(req, res, url);
      return;
    }

    if (pathname.startsWith("/api/attachments/")) {
      if (req.method !== "GET") {
        return sendJson(res, 405, { error: "Method not allowed." });
      }
      const route = attachmentRoute(pathname);
      if (!route) return sendJson(res, 404, { error: "Not found." });
      await handleAttachmentGet(res, route.id, route.action);
      return;
    }

    if (pathname === "/api/media") {
      if (req.method !== "POST") {
        return sendJson(res, 405, { error: "Method not allowed." });
      }
      await handleMediaUpload(req, res, url);
      return;
    }

    if (pathname.startsWith("/api/media/")) {
      if (req.method !== "GET" && req.method !== "HEAD") {
        return sendJson(res, 405, { error: "Method not allowed." });
      }
      const route = mediaRoute(pathname);
      if (!route) return sendJson(res, 404, { error: "Not found." });
      await handleMediaGet(req, res, route.id, route.action);
      return;
    }

    /* Shared contracts live outside the static root so the frontend and the
       backend read the same file. */
    if (pathname.startsWith("/shared/") && pathname.endsWith(".js")) {
      const name = pathname.slice("/shared/".length);
      if (!/^[A-Za-z0-9._-]+\.js$/.test(name)) {
        res.writeHead(404).end("Not found");
        return;
      }
      const body = await readFile(join(repoRoot, "shared", name));
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Content-Length": body.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : body);
      return;
    }

    if (pathname.startsWith("/api/")) {
      return sendJson(res, 404, { error: "Not found." });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }

    if (pathname === "/.data" || pathname.startsWith("/.data/")) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }

    const isDetailRoute = /^\/(?:p|t)\/[^/]+\/?$/.test(pathname) || pathname === "/app";

    let filePath = isDetailRoute
      ? join(root, "app.html")
      : resolve(join(root, normalize(pathname)));

    if (filePath !== root && !filePath.startsWith(root + (process.platform === "win32" ? "\\" : "/"))) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    const info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) filePath = join(filePath, "index.html");

    const body = await readFile(filePath);
    const headers = {
      "Content-Type": types[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    };
    res.writeHead(200, headers);
    if (req.method === "HEAD") res.end();
    else res.end(body);
  } catch {
    if (!res.headersSent) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
    } else {
      res.end();
    }
  }
});

server.listen(port, () => {
  console.log(`NookSpace running at http://localhost:${port}`);
  console.log(`Login:     http://localhost:${port}/`);
  console.log(`Workspace: http://localhost:${port}/app.html`);
  console.log(`Pages:     http://localhost:${port}/p/getting-started`);
  console.log(`Uploads:   ${attachmentsDir}`);
  console.log(`Media:     ${mediaDir}`);
});
