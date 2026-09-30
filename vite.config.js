import { defineConfig } from "vite";

export default defineConfig({
  server: {
    allowedHosts: true,
  },
  build: {
    // MediaPipe y las clases modernas (campos privados, ??=) necesitan ES2020.
    target: "es2020",
    assetsInlineLimit: 4096,
  },
});
