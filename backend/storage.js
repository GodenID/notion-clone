/* Storage adapter: local disk driver now, S3-compatible driver later. */

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, createReadStream, statSync } from "node:fs";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json",
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function guessMime(name) {
  return MIME_BY_EXT[extname(String(name)).toLowerCase()] ?? "application/octet-stream";
}

export function sanitizeName(raw) {
  const base = String(raw || "")
    .split(/[\\/]/)
    .pop()
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return [...base].slice(0, 160).join("") || "file";
}

export function createLocalStorage(rootDir) {
  mkdirSync(rootDir, { recursive: true });

  const safeKey = (key) => {
    const target = resolve(join(rootDir, normalize(key)));
    if (target !== resolve(rootDir) && !target.startsWith(resolve(rootDir) + sep)) {
      throw new Error("invalid storage key");
    }
    return target;
  };

  return {
    driver: "local",

    async put(buffer, name) {
      const id = randomUUID();
      const key = `${id}${extname(name)}`;
      await writeFile(safeKey(key), buffer);
      return { key, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex") };
    },

    async get(key) {
      const buffer = await readFile(safeKey(key));
      return { buffer, size: buffer.length };
    },

    async remove(key) {
      try {
        await unlink(safeKey(key));
        return true;
      } catch {
        return false;
      }
    },

    pathFor(key) {
      return safeKey(key);
    },
  };
}

/**
 * S3-compatible driver contract. Kept explicit so the swap is a config change:
 *   STORAGE_DRIVER=s3 S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY=... S3_SECRET_KEY=...
 */
export function createS3Storage() {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !bucket) {
    throw new Error("S3 storage requires S3_ENDPOINT and S3_BUCKET");
  }
  throw new Error(
    `S3 driver is configured but not compiled in (endpoint=${endpoint}, bucket=${bucket}). Use the local driver for now.`
  );
}

export function createStorage(rootDir) {
  const driver = process.env.STORAGE_DRIVER || "local";
  if (driver === "s3") return createS3Storage();
  return createLocalStorage(rootDir);
}

export function statOrNull(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

export { createReadStream, dirname, join };