# Lost Luggage

A casual, mobile-first co-op looter brawler. The full design lives in
[Co-op Looter Brawler — Game Design Doc.md](Co-op%20Looter%20Brawler%20—%20Game%20Design%20Doc.md).

**Current state: roadmap phase 1, the feel prototype.** One hero (Vanguard), all five gun archetypes,
touch and keyboard controls, dash, grenade, action skill and three enemy types in a single arena with endless waves.

## Run it

```bash
npm install
npm run dev
```

Open the printed URL. `--host` is on, so a phone on the same Wi-Fi can open the `Network:` address.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server for the client |
| `npm test` | Simulation tests (Vitest) |
| `npm run typecheck` | Type-checks both packages |
| `npm run build` | Production build into `packages/client/dist` |

## Controls

| Action | Touch | Desktop |
| --- | --- | --- |
| Move | Left joystick (appears where your thumb lands) | WASD / arrows |
| Shoot | Right joystick: tap = auto-aim, drag = aim, release = fire | Mouse + left click (T toggles auto-aim) |
| Dash | DASH button | Space |
| Vanguard dome | DOME button (charged by dealing damage) | E or right click |
| Grenade | NADE button: tap = nearest enemy, drag = aim | Q (throws at the mouse) |
| Swap gun | Tap a weapon slot | 1 / 2 or mouse wheel |
| Pause / mute | Background the app | P or Esc / M |

Stand on a gun pedestal to swap the gun in your hands for the SMG, sniper or launcher.

## Layout

```
packages/
  sim/      Pure TypeScript game rules: fixed 30 Hz tick, seeded RNG, no rendering code.
            Runs in the browser now; the same code will run on the Colyseus server for co-op.
    src/data/   Guns, enemies and heroes as data (the doc's "data-driven definitions")
  client/   Phaser 3 renderer, input and HUD. Reads sim state, interpolates between ticks,
            and turns sim events into juice (shake, hit-stop, flashes, sounds).
```

All art, the pixel font and the sounds are generated in code as placeholders
(`packages/client/src/render/pixels.ts`, `packages/client/src/sfx.ts`), so there are no asset files yet.

## Notes on numbers

World units are internal-resolution pixels (480×270 screen), so ranges and distances are smaller than the
doc's example values (for example the mortar beetle keeps 120–220 px away instead of 200–350).
