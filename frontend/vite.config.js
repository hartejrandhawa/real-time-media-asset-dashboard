import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin /api in development: no CORS, no hard-coded API host.
    proxy: {
      "/api": process.env.VITE_API_PROXY_TARGET || "http://localhost:3001",
    },
  },
});
