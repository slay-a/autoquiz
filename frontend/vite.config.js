import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/upload": "http://localhost:8000",
      "/retrieve": "http://localhost:8000",
      "/quiz/generate": "http://localhost:8000",
      "/notes/": "http://localhost:8000",
      "/classes": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: "./src/__tests__/setup.js",
  },
});
