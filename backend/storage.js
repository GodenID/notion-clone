/* Storage adapter: local disk driver now, S3-compatible driver later. */

import { createHash, createHmac, randomUUID } from "node:crypto";
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
 * S3-compatible driver using AWS Signature V4, hand-rolled so the project keeps
 * its "no native build, few dependencies" property.
 *
 *   STORAGE_DRIVER=s3
 *   S3_ENDPOINT=https://s3.example.com   (or https://s3.eu-west-1.amazonaws.com)
 *   S3_BUCKET=nookspace
 *   S3_REGION=eu-west-1
 *   S3_ACCESS_KEY=...  S3_SECRET_KEY=...
 *   S3_FORCE_PATH_STYLE=1   (for MinIO, Ceph, R2, ...)
 */
export function createS3Storage(env = process.env) {
  const endpoint = env.S3_ENDPOINT;
  const bucket = env.S3_BUCKET;
  if (!endpoint || !bucket) {
    throw new Error("S3 storage requires S3_ENDPOINT and S3_BUCKET");
  }

  const region = env.S3_REGION || "us-east-1";
  const accessKey = env.S3_ACCESS_KEY || "";
  const secretKey = env.S3_SECRET_KEY || "";
  const pathStyle = env.S3_FORCE_PATH_STYLE === "1" || !env.S3_ENDPOINT.includes("amazonaws.com");
  if (!accessKey || !secretKey) {
    throw new Error("S3 storage requires S3_ACCESS_KEY and S3_SECRET_KEY");
  }

  const base = endpoint.replace(/\/+$/, "");
  const host = new URL(base).host;

  function objectUrl(key) {
    return pathStyle
      ? `${base}/${bucket}/${encodeKey(key)}`
      : `${base.replace("//${host}", `//${bucket}.${host}`)}/${encodeKey(key)}`;
  }

  function signedRequest(method, key, { payload = Buffer.alloc(0), contentType } = {}) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256").update(payload).digest("hex");
    const url = new URL(objectUrl(key));
    const canonicalUri = url.pathname;
    const headers = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (contentType) headers["content-type"] = contentType;

    const signedHeaders = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaders.map((name) => `${name}:${headers[name]}\n`).join("");
    const canonicalRequest = [
      method,
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders.join(";"),
      payloadHash,
    ].join("\n");

    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      createHash("sha256").update(canonicalRequest).digest("hex"),
    ].join("\n");

    let signingKey = createHmac("sha256", `AWS4${secretKey}`).update(dateStamp).digest();
    for (const part of [region, "s3", "aws4_request"]) {
      signingKey = createHmac("sha256", signingKey).update(part).digest();
    }
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    return {
      url: objectUrl(key),
      headers: {
        ...headers,
        authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`,
      },
    };
  }

  return {
    driver: "s3",

    /* Exposed for tests and for anyone debugging a signature problem. */
    signedRequest,

    async put(buffer, name) {
      const id = randomUUID();
      const key = `${id}${extname(name)}`;
      const target = signedRequest("PUT", key, {
        payload: buffer,
        contentType: guessMime(name),
      });
      const response = await fetch(target.url, {
        method: "PUT",
        headers: target.headers,
        body: buffer,
      });
      if (!response.ok) {
        throw new Error(`S3 PUT failed (${response.status}) for ${key}`);
      }
      return {
        key,
        bytes: buffer.length,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      };
    },

    async get(key) {
      const target = signedRequest("GET", key);
      const response = await fetch(target.url, { headers: target.headers });
      if (!response.ok) throw new Error(`S3 GET failed (${response.status}) for ${key}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      return { buffer, size: buffer.length };
    },

    async remove(key) {
      const target = signedRequest("DELETE", key);
      const response = await fetch(target.url, { method: "DELETE", headers: target.headers });
      return response.ok || response.status === 404;
    },

    pathFor(key) {
      return objectUrl(key);
    },
  };
}

function encodeKey(key) {
  return String(key)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function createStorage(rootDir, env = process.env) {
  const driver = env.STORAGE_DRIVER || "local";
  if (driver === "s3") return createS3Storage(env);
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