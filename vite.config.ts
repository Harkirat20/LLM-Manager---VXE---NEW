import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed dev port and doesn't want vite clearing the screen
// (cargo logs live alongside it during `tauri dev`).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0",
    // Arena live-preview proxies through its own host alias.
    allowedHosts: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
