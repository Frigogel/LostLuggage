// Co-op server: Colyseus rooms running the shared sim. In production it also serves the built client,
// so one process on the Raspberry Pi is the whole game.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, WebSocketTransport } from "colyseus";
import { RunRoom } from "./RunRoom";

const port = Number(process.env.PORT) || 2567;
const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));

const server = new Server({
  // Snapshots are repetitive arrays of small numbers: compression roughly halves them on mobile data.
  transport: new WebSocketTransport({ perMessageDeflate: { threshold: 256 } }),
  express: (app) => {
    app.get("/health", (_req, res) => {
      res.json({ ok: true });
    });
    if (existsSync(clientDist)) app.use(express.static(clientDist));
  },
});

// Quick match pairs only public rooms; code rooms are created private.
server.define("run", RunRoom);

const latency = Number(process.env.LAG);
if (latency > 0) {
  // `LAG=150 npm run server` simulates a mobile round trip for testing prediction.
  server.simulateLatency(latency);
  console.log(`Simulating ${latency} ms round trip`);
}

await server.listen(port, "0.0.0.0");
console.log(`Lost Luggage server on :${port}${existsSync(clientDist) ? " (serving the built client)" : ""}`);
