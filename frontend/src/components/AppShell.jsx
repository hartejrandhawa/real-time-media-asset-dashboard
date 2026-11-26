import { Link, Outlet, useNavigate } from "react-router-dom";
import BrandMark from "./BrandMark";
import { useAuth } from "../context/auth";

const ROLE_HINT = {
  admin: "Admin: full access",
  editor: "Editor: can upload and change status",
  viewer: "Viewer: read and download only",
};

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/dashboard" className="brand">
          <BrandMark />
          <span>Media Assets</span>
        </Link>
        <div className="topbar-user">
          <span className="user-name">{user?.username}</span>
          <span className={`role-tag role-${user?.role}`} title={ROLE_HINT[user?.role]}>
            {user?.role}
          </span>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
