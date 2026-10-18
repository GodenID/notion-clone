/* Durable Object: WebSocket collaboration room for Yjs. */

export class CollabRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request) {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);
    this.sessions.add(server);

    server.addEventListener("message", (event) => {
      for (const session of this.sessions) {
        if (session !== server && session.readyState === 1) {
          session.send(event.data);
        }
      }
    });

    server.addEventListener("close", () => {
      this.sessions.delete(server);
    });

    server.addEventListener("error", () => {
      this.sessions.delete(server);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    for (const session of this.sessions) {
      if (session !== ws && session.readyState === 1) {
        session.send(message.data);
      }
    }
  }

  async webSocketClose(ws) {
    this.sessions.delete(ws);
  }

  async webSocketError(ws) {
    this.sessions.delete(ws);
  }
}