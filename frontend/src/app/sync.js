/* Offline-first outbox.
   Every server write goes through here: it is persisted to localStorage first, then
   drained to the API with exponential backoff. Nothing is lost when the network
   drops, and the UI can show "saving / saved / offline" from queue depth. */

const KEY = "nookspace:outbox";

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  localStorage.setItem(KEY, JSON.stringify(queue));
}

export function enqueue(page, blocks) {
  const queue = readQueue();
  const payload = {
    pageId: page.id,
    page: {
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
    },
    blocks: blocks || page.blocks || [],
  };

  const index = queue.findIndex((entry) => entry.pageId === page.id);
  const entry = {
    id: index >= 0 ? queue[index].id : `${page.id}-${Date.now()}`,
    pageId: page.id,
    payload,
    attempts: 0,
    nextAt: Date.now(),
    createdAt: Date.now(),
  };

  if (index >= 0) queue[index] = entry;
  else queue.push(entry);

  writeQueue(queue);
  return entry;
}

export function depth() {
  return readQueue().length;
}

export function pending(pageId) {
  return readQueue().some((entry) => entry.pageId === pageId);
}

export async function drain({ apiPages, onProgress } = {}) {
  const queue = readQueue();
  if (!queue.length) {
    if (onProgress) onProgress({ depth: 0, state: "saved" });
    return { sent: 0, failed: 0 };
  }

  const now = Date.now();
  let sent = 0;
  let failed = 0;

  for (const entry of queue) {
    if (entry.nextAt > now) continue;

    try {
      await apiPages.update(entry.pageId, entry.payload.page);
      await apiPages.saveBlocks(entry.pageId, entry.payload.blocks);
      sent += 1;
    } catch (error) {
      failed += 1;
      entry.attempts += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(entry.attempts, 5));
      entry.nextAt = Date.now() + delay;
      if (error?.status === 404) {
        entry.attempts = 99; // give up: the page is gone
        entry.dead = true;
      }
    }
  }

  const survivors = queue.filter((entry) => !entry.dead && entry.attempts < 6);
  writeQueue(survivors);
  if (onProgress) {
    onProgress({
      depth: survivors.length,
      state: survivors.length ? "saving" : "saved",
      sent,
      failed,
    });
  }
  return { sent, failed, remaining: survivors.length };
}

let timer = null;

export function startScheduler({ apiPages, intervalMs = 5000 } = {}) {
  if (timer) return () => stopScheduler();
  const tick = () => {
    if (navigator.onLine === false) return;
    drain({ apiPages }).catch(() => {});
  };
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  window.addEventListener("online", tick);
  tick();
  return stopScheduler;
}

export function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function clear() {
  writeQueue([]);
}