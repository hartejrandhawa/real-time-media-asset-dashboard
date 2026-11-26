import { createContext, useContext } from "react";

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export const canEdit = (user) => user?.role === "admin" || user?.role === "editor";
export const isAdmin = (user) => user?.role === "admin";
