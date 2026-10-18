/* WebSocket collaboration relay.
   Each room is a Yjs document. Clients send binary updates (Yjs encoded state
   vectors / updates); the server broadcasts them to every other client in the
   same room. The server does not interpret Yjs — it is a dumb relay, which
   keeps it dependency-free on the CRDT side. */

import { WebSocketServer } from "ws";

export function createCollabServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  /** @type {Map<string, Set<WebSocket>>} */
  const rooms = new Map();

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, "http://localhost");
    const match = url.pathname.match(/^\/ws\/collab\/(.+)$/);
    if (!match) {
      socket.destroy();
      return;
    }
    const roomId = decodeURIComponent(match[1]);
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, roomId);
    });
  });

  wss.on("connection", (ws, _request, roomId) => {
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    const room = rooms.get(roomId);
    room.add(ws);

    ws.on("message", (data, isBinary) => {
      const payload = isBinary ? data : Buffer.from(data);
      for (const client of room) {
        if (client !== ws && client.readyState === 1) {
          client.send(payload, { binary: true });
        }
      }
    });

    ws.on("close", () => {
      room.delete(ws);
      if (room.size === 0) rooms.delete(roomId);
    });

    ws.on("error", () => {
      room.delete(ws);
    });
  });

  return {
    wss,
    get roomCount() {
      return rooms.size;
    },
    get clientCount() {
      let total = 0;
      for (const room of rooms.values()) total += room.size;
      return total;
    },
  };
}
