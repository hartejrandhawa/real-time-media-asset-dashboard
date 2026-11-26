import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./auth";
import { session, SESSION_EXPIRED_EVENT } from "../api/client";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const s = session.read();
    return s?.token ? { username: s.username, role: s.role } : null;
  });
  const [expired, setExpired] = useState(false);

  const login = useCallback(({ token, username, role }) => {
    session.write({ token, username, role });
    setExpired(false);
    setUser({ username, role });
  }, []);

  const logout = useCallback(() => {
    session.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    function onExpired() {
      session.clear();
      setExpired(true);
      setUser(null);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const value = useMemo(() => ({ user, login, logout, expired }), [user, login, logout, expired]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
