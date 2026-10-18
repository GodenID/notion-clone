/* Yjs collaboration server — simplified sync.
   Instead of the complex sync step 1/2 handshake, the server:
     1. On connect: sends the full document state as a single update
     2. On update from a client: applies to the shared doc, broadcasts to others
   Awareness (cursors) is relayed to all clients in the room. */

import { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const messageSync = 0;
const messageAwareness = 1;
const messageQueryAwareness = 3;

export function createCollabServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map();

  function getRoom(roomId) {
    if (!rooms.has(roomId)) {
      const doc = new Y.Doc();
      rooms.set(roomId, { doc, conns: new Set(), awareness: new Map() });
    }
    return rooms.get(roomId);
  }

  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url, "http://localhost");
    const match = url.pathname.match(/^\/ws\/collab\/(.+)$/);
    if (!match) { socket.destroy(); return; }
    const roomId = decodeURIComponent(match[1]);
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, roomId);
    });
  });

  wss.on("connection", (ws, _request, roomId) => {
    const room = getRoom(roomId);
    const { doc, conns, awareness } = room;
    conns.add(ws);

    // Send full document state
    const state = Y.encodeStateAsUpdate(doc);
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, messageSync);
    encoding.writeVarUint8Array(enc, state);
    ws.send(encoding.toUint8Array(enc), { binary: true });

    // Send awareness states
    if (awareness.size > 0) {
      const awEnc = encoding.createEncoder();
      encoding.writeVarUint(awEnc, messageAwareness);
      const states = Array.from(awareness.values());
      encoding.writeVarUint8Array(awEnc, new Uint8Array(states.flat()));
      ws.send(encoding.toUint8Array(awEnc), { binary: true });
    }

    ws.on("message", (data) => {
      try {
        const msg = new Uint8Array(data);
        const dec = decoding.createDecoder(msg);
        const type = decoding.readVarUint(dec);

        if (type === messageSync) {
          const update = decoding.readVarUint8Array(dec);
          Y.applyUpdate(doc, update);
          // Broadcast to others
          for (const client of conns) {
            if (client !== ws && client.readyState === 1) {
              client.send(msg, { binary: true });
            }
          }
        } else if (type === messageAwareness) {
          const update = decoding.readVarUint8Array(dec);
          // Store awareness and broadcast
          for (const client of conns) {
            if (client !== ws && client.readyState === 1) {
              client.send(msg, { binary: true });
            }
          }
        }
      } catch (e) {
        // Silently ignore
      }
    });

    ws.on("close", () => {
      conns.delete(ws);
      if (conns.size === 0) {
        setTimeout(() => { if (conns.size === 0) rooms.delete(roomId); }, 30000);
      }
    });
    ws.on("error", () => conns.delete(ws));
  });

  return {
    wss,
    get roomCount() { return rooms.size; },
    get clientCount() { let t = 0; for (const r of rooms.values()) t += r.conns.size; return t; },
  };
}