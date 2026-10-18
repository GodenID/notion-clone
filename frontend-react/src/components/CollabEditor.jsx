import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from "y-prosemirror";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
// prosemirror-example-setup not installed; using minimal keymap instead
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";

const schema = basicSchema;

export default function CollabEditor({ roomName = "default-room", username = "Anonymous" }) {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const [status, setStatus] = useState("connecting");
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!editorRef.current) return;

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider("ws://localhost:5173", roomName, ydoc, { connect: true });

    provider.on("status", (event) => {
      setStatus(event.status);
    });

    provider.awareness.setLocalStateField("user", {
      name: username,
      color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`,
    });

    provider.awareness.on("change", () => {
      const states = Array.from(provider.awareness.getStates().values());
      setUsers(states.map((s) => s.user).filter(Boolean));
    });

    const yXmlFragment = ydoc.getXmlFragment("prosemirror");

    const state = EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(yXmlFragment),
        yCursorPlugin(provider.awareness),
        yUndoPlugin(),
        keymap(baseKeymap),
      ],
    });

    const view = new EditorView(editorRef.current, { state });
    viewRef.current = view;

    return () => {
      provider.destroy();
      view.destroy();
      ydoc.destroy();
    };
  }, [roomName, username]);

  return (
    <div className="collab-editor">
      <div className="collab-editor__toolbar">
        <span className={`collab-editor__status collab-editor__status--${status}`}>
          {status === "connected" ? "● Connected" : status === "connecting" ? "○ Connecting…" : "✕ Disconnected"}
        </span>
        <span className="collab-editor__users">
          {users.map((u, i) => (
            <span key={i} className="collab-editor__user" style={{ color: u.color }}>
              {u.name}
            </span>
          ))}
        </span>
      </div>
      <div ref={editorRef} className="collab-editor__surface" />
    </div>
  );
}