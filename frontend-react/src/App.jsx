import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth.jsx";
import Login from "./pages/Login.jsx";
import Workspace from "./pages/Workspace.jsx";
import PageView from "./pages/PageView.jsx";
import Settings from "./pages/Settings.jsx";
import RichTextDemo from "./pages/RichTextDemo.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Protected><Workspace /></Protected>} />
        <Route path="/p/:slug" element={<Protected><PageView /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="/richtext" element={<Protected><RichTextDemo /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="shell-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
