import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/auth";
import AuthLayout from "../components/AuthLayout";

// Seeded by `npm run seed` in backend/. Only shown in development builds.
const DEMO_ACCOUNTS = [
  { username: "admin", password: "admin1234", role: "admin", blurb: "Everything, including delete" },
  { username: "editor", password: "editor1234", role: "editor", blurb: "Upload and change status" },
  { username: "viewer", password: "viewer1234", role: "viewer", blurb: "Browse and download" },
];

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login, expired } = useAuth();

  async function signIn(credentials) {
    setError(null);
    setLoading(true);
    try {
      login(await api.login(credentials));
      navigate(location.state?.from ?? "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Sign in">
      {expired && (
        <p className="notice" role="status">
          Your session expired. Sign in again to continue.
        </p>
      )}
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          signIn({ username, password });
        }}
      >
        <div className="field">
          <label htmlFor="login-user">Username</label>
          <input
            id="login-user"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="login-pass">Password</label>
          <input
            id="login-pass"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {import.meta.env.DEV && (
        <div className="demo">
          <h2>Demo accounts</h2>
          <ul className="demo-list">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.username}>
                <button type="button" className="demo-btn" disabled={loading} onClick={() => signIn(a)}>
                  <span className={`role-tag role-${a.role}`}>{a.role}</span>
                  <span className="demo-blurb">{a.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="auth-switch">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
