/* Realtime: server-sent events with presence tracking (no extra dependency). */

import { REALTIME_EVENTS } from "../shared/contracts.js";

export function createRealtime() {
  /** @type {Map<string, { id: string, user: object, res: any }>} */
  const clients = new Map();
  let sequence = 0;

  function send(client, event, data) {
    try {
      client.res.write(`id: ${++sequence}\n`);
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch {
      return false;
    }
  }

  function broadcast(event, data, { except } = {}) {
    for (const client of clients.values()) {
      if (except && client.id === except) continue;
      send(client, event, data);
    }
  }

  function presence() {
    const users = new Map();
    for (const client of clients.values()) {
      const key = client.user.id;
      const existing = users.get(key);
      if (existing) existing.connections += 1;
      else users.set(key, { id: key, name: client.user.name, color: client.user.color, connections: 1 });
    }
    return [...users.values()];
  }

  function connect(request, reply, user) {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const id = `${user.id}:${Math.random().toString(36).slice(2, 10)}`;
    const client = { id, user, res: reply.raw };
    clients.set(id, client);

    send(client, "hello", { events: REALTIME_EVENTS, presence: presence() });
    broadcast("presence:update", { presence: presence() }, { except: id });

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(": ping\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    const cleanup = () => {
      clearInterval(heartbeat);
      clients.delete(id);
      broadcast("presence:update", { presence: presence() });
    };

    request.raw.on("close", cleanup);
    request.raw.on("error", cleanup);
    return reply;
  }

  return {
    connect,
    broadcast,
    presence,
    get clientCount() {
      return clients.size;
    },
    knownEvents: REALTIME_EVENTS,
  };
}