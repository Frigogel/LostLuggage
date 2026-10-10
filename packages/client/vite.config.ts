import { defineConfig } from "vite";

export default defineConfig({
  // PORT lets a second dev server run alongside the usual 5173.
  server: { port: Number(process.env.PORT) || 5173 },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
});
