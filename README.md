# Lost Luggage

A casual, mobile-first co-op looter brawler. The full design lives in
[Co-op Looter Brawler — Game Design Doc.md](Co-op%20Looter%20Brawler%20—%20Game%20Design%20Doc.md).

**Current state: roadmap phase 3, co-op.** The Burning Foundry adventure from phase 2 (hand-made intro room,
two director-built combat rooms, a breather room with a shrine and a suitcase, the Furnace Foreman mini-boss)
can now be played solo or with up to 4 friends:

- **Colyseus rooms** with 4-letter **room codes** for friends, **quick match** for public rooms, and **drop-in**
  for runs that have an open slot.
- **Prediction and interpolation**: your own movement, dash and shots react instantly; everyone else is drawn
  smoothly a few frames in the past.
- **Revives**: stand next to a downed teammate to pick them up. If the whole party goes down, Second Wind goes to
  someone who still has it; after that the run is over. Solo keeps its one Second Wind.
- **Level sync**: in co-op everyone's stats are set to the dungeon tier's level, so a level 3 and a level 30 hero
  are equally strong. Enemy count and health scale with party size.
- **Mobile sessions**: backgrounding the app makes your hero untargetable; a dropped phone keeps its seat for 60
  seconds.

## Run it

```bash
npm install
npm run dev
```

This starts the co-op server (port 2567) and the Vite dev server (port 5173). Open the printed URL; `--host` is
on, so a phone on the same Wi-Fi can open the `Network:` address. Solo works without the server.

| Command | What it does |
| --- | --- |
| `npm run dev` | Co-op server and client together |
| `npm run dev:client` / `npm run dev:server` | Just one of them |
| `npm test` | Sim, server and netcode tests (Vitest) |
| `npm run typecheck` | Type-checks every package |
| `npm run build` | Production build into `packages/client/dist` |
| `npm start` | The server, which also serves the built client: one process for the whole game |
| `npm run balance -- 30` | A bot plays 30 solo runs and reports room times, damage taken and deaths (add `--god` to never die) |
| `npm run bandwidth` | Four bots play a co-op run; reports snapshot sizes and data use per phone |

To feel the netcode on a bad connection, start the server with simulated latency: `LAG=200 npm run dev:server`
(round trip in ms).

## Playing together

1. Everyone opens the game and types a name.
2. One person taps **Create room for friends** and reads out the 4-letter code.
3. Everyone else types the code and taps **Join**. The host taps **Start run**.

Friends can join a run that already started; they appear next to the party with a better second gun. Downed
teammates show a pulsing ring: stand in it to fill their revive bar. In co-op, the exit waits 4 seconds for
stragglers, or opens right away once everyone who can walk is at the door.

## Controls

| Action | Touch | Desktop |
| --- | --- | --- |
| Move | Left joystick (appears where your thumb lands) | WASD / arrows |
| Shoot | Right joystick: tap = auto-aim, drag = aim, release = fire | Mouse + left click (T toggles auto-aim) |
| Dash | DASH button | Space |
| Vanguard dome | DOME button (charged by dealing damage) | E or right click |
| Grenade | NADE button: tap = nearest enemy, drag = aim | Q (throws at the mouse) |
| Swap gun | Tap a weapon slot | 1 / 2 or mouse wheel |
| Pick up / use item | SWAP / PRAY / OPEN button (appears near an item) | F |
| Revive a teammate | Stand next to them | Stand next to them |
| Pause (solo) / menu (co-op) / mute | Background the app | P or Esc / M |
| Leave a co-op room | Menu, then LEAVE ROOM | Esc, then L |

Walk up to a dropped gun and press the pickup button to swap it for the one in your hands (your old gun stays on
the floor). The card at the bottom compares its DPS with yours. The same button prays at shrines and opens
suitcases. Health snacks are still grabbed just by touching them.

In development, `?room=4` jumps straight to a solo room, `?seed=123` replays a solo run, and `?level=25` pretends
your hero is level 25 (real levels arrive with accounts in phase 4).

## Layout

```
packages/
  sim/      Pure TypeScript game rules: fixed 30 Hz tick, seeded RNG, no rendering code.
            Runs in the browser for solo and on the server for co-op.
    src/data/   Guns, enemies and heroes as data (the doc's "data-driven definitions")
    src/director.ts  Encounter director: threat budgets, role templates, pacing curve, party scaling
    src/room.ts      Room layouts, lava vents, waves, exits
    src/loot.ts      Rarity, elements, perks, shrine boosts
    src/net.ts       Co-op wire format: snapshots, events and inputs as small integer arrays
    scripts/balance.ts  Bot-driven balance harness
  server/   Colyseus server. RunRoom is one party: lobby, room code, drop-in, reconnects, and the
            sim at 30 Hz with snapshots at 15 Hz.
  client/   Phaser 3 renderer, input, HUD and the menu.
    src/net.ts  Co-op client: snapshot buffer, clock sync, interpolation, movement and shot prediction
```

All art, the pixel font and the sounds are generated in code as placeholders
(`packages/client/src/render/pixels.ts`, `packages/client/src/sfx.ts`), so there are no asset files yet.

## How co-op works

The server runs the same sim the browser runs in solo. Clients send one input per tick (30 a second); the server
applies them and broadcasts a snapshot every second tick. Snapshots are arrays of small integers (positions in
quarter pixels, timers in centiseconds) packed with msgpack and deflated by the websocket: about 9 KB/s per phone
on average and 15 KB/s in the busiest fights, or roughly 8 MB for a 15-minute dungeon (`npm run bandwidth`).

Each client draws other players and enemies about 130 ms in the past, interpolating between two snapshots. Your
own hero runs ahead: the client applies your inputs to a copy of your hero with the sim's own movement code, and
when a snapshot says which inputs the server has applied, it replays the rest on top of the server's answer.
Leftover differences fade out over a few frames instead of snapping. Your shots are predicted the same way, so the
flash, sound and bullets leave your gun the moment you fire; the server still decides every hit. The netcode test
(`packages/client/test/netcode.test.ts`) drives the real client against the real server: at a 120 ms round trip
the largest correction is under a pixel, and at 300 ms a few pixels.

## Hosting

`npm run build && npm start` serves the game and the co-op server from one port (`PORT`, default 2567), which fits
the Raspberry Pi plan in the design doc. Installable web apps need HTTPS, so put it behind a Cloudflare Tunnel or a
Let's Encrypt proxy; the client connects back to the same origin over `wss://`. To point a client at a different
server, build it with `VITE_SERVER_URL=https://example.com`.

## Notes on numbers

World units are internal-resolution pixels (480×270 screen), so ranges and distances are smaller than the
doc's example values (for example the mortar beetle keeps 120–220 px away instead of 200–350).
