import { defineConfig } from "vitest/config";

// Colyseus talks to process managers over process.send(), which collides with vitest's forked workers.
export default defineConfig({ test: { pool: "threads", testTimeout: 15000 } });
