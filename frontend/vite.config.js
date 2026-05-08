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
      "/quiz": "http://localhost:8000",
      "/notes/": "http://localhost:8000",
      "/classes": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Pin third-party deps that rarely change into their own chunks so
          // app-code edits don't bust their CDN cache and re-trip the
          // 500 kB chunk-size warning.
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "supabase":     ["@supabase/supabase-js"],
          "icons":        ["lucide-react"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: "./src/__tests__/setup.js",
  },
});
