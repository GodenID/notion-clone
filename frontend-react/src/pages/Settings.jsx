import { useAuth } from "../auth.jsx";

export default function Settings() {
  const { user, logout } = useAuth();
  return (
    <div className="settings">
      <h1>Settings</h1>
      <section>
        <h2>Account</h2>
        <p>Signed in as {user?.email}</p>
        <p className="settings__note">
          Two-factor authentication, password change, and audit log viewing are available through the
          vanilla app at <a href="/app.html">/app.html</a> while the React settings screen is finished.
        </p>
      </section>
      <section>
        <h2>Session</h2>
        <button onClick={logout}>Sign out</button>
      </section>
    </div>
  );
}
