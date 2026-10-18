import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";

const API = "/api";

export default function PageView() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/pages/${slug}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancelled) return;
        setPage(data.page);
        setBlocks(data.blocks || []);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) return <div className="page-view__error">Could not load page: {error}</div>;
  if (!page) return <div className="page-view__loading">Loading…</div>;

  return (
    <div className="page-view">
      <header className="page-view__header">
        <span className="page-view__icon">{page.icon}</span>
        <h1>{page.title || "Untitled"}</h1>
        {page.role && page.role !== "owner" && <span className="role-badge">{page.role}</span>}
      </header>
      <div className="page-view__blocks">
        {blocks.map((block) => (
          <div key={block.id} className={`block block--${block.type}`}>
            {block.text || (block.type === "divider" ? "—" : "")}
          </div>
        ))}
      </div>
      <footer className="page-view__footer">
        <Link to="/">← Back to workspace</Link>
        <span className="page-view__note">
          Read-only view in the React shell. Editing lives in <a href="/app.html">the vanilla editor</a> for now.
        </span>
      </footer>
    </div>
  );
}
