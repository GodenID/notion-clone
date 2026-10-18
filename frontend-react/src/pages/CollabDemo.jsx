import { useState } from "react";
import CollabEditor from "../components/CollabEditor.jsx";

export default function CollabDemo() {
  const [room, setRoom] = useState("nookspace-demo");
  const [name, setName] = useState("User " + Math.floor(Math.random() * 100));
  const [joined, setJoined] = useState(false);

  if (!joined) {
    return (
      <div className="collab-demo">
        <h2>Collaborative editor (Yjs + ProseMirror)</h2>
        <p className="collab-demo__note">
          Open this page in two browser tabs to see real-time collaboration.
          Changes sync instantly via WebSocket + CRDT.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setJoined(true);
          }}
        >
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Room name
            <input value={room} onChange={(e) => setRoom(e.target.value)} />
          </label>
          <button type="submit">Join room</button>
        </form>
      </div>
    );
  }

  return (
    <div className="collab-demo">
      <h2>Room: {room}</h2>
      <p className="collab-demo__note">
        Editing as <strong>{name}</strong>. Open another tab with the same room name to collaborate.
      </p>
      <CollabEditor roomName={room} username={name} />
    </div>
  );
}
