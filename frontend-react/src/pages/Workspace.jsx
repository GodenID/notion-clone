import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

const API = "/api";

export default function Workspace() {
  const { user, logout } = useAuth();
  const [pages, setPages] = useState([]);
  const [teamspaces, setTeamspaces] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API}/workspace`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        setPages(data.pages || []);
        setTeamspaces(data.teamspaces || []);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="shell">
      <aside className="shell__sidebar">
        <div className="shell__brand">NookSpace <span className="shell__badge">React</span></div>
        <nav>
          <h4>Pages</h4>
          <ul>
            {pages.map((p) => (
              <li key={p.id}>
                <Link to={`/p/${p.slug || p.id}`}>
                  <span>{p.icon}</span> {p.title || "Untitled"}
                </Link>
              </li>
            ))}
          </ul>
          {teamspaces.length > 0 && (
            <>
              <h4>Teamspaces</h4>
              <ul>
                {teamspaces.map((t) => (
                  <li key={t.id}><span>{t.icon}</span> {t.name}</li>
                ))}
              </ul>
            </>
          )}
        </nav>
        <div className="shell__footer">
          <span>{user?.name}</span>
          <button onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="shell__main">
        <div className="shell__welcome">
          <h2>Welcome, {user?.name}</h2>
          <p>Pick a page from the sidebar, or open the vanilla editor at <a href="/app.html">/app.html</a>.</p>
          <p><Link to="/richtext">Try the ProseMirror rich-text editor →</Link></p>
          <p className="shell__note">
            This React shell is Phase 3 in progress. ProseMirror rich text is live;
            Yjs collaboration, offline sync, and the full editor migration follow.
          </p>
        </div>
      </main>
    </div>
  );
}
