import { useState } from "react";
import { useAuth } from "../auth.jsx";

export default function Login() {
  const { login, register } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") await register(email, name || email.split("@")[0], password);
      else await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login__card">
        <h1>{mode === "register" ? "Create your account" : "Sign in"}</h1>
        <form onSubmit={submit}>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          {mode === "register" && (
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          )}
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></label>
          {error && <p className="login__error">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "…" : mode === "register" ? "Create account" : "Sign in"}</button>
        </form>
        <button className="login__switch" onClick={() => setMode(mode === "register" ? "login" : "register")}>
          {mode === "register" ? "Already have an account? Sign in" : "No account yet? Create one"}
        </button>
      </div>
    </div>
  );
}
