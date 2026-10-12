# Lost Luggage

A casual, mobile-first co-op looter brawler. The full design lives in
[Co-op Looter Brawler — Game Design Doc.md](Co-op%20Looter%20Brawler%20—%20Game%20Design%20Doc.md).

**Current state: roadmap phase 5, content (first pass), plus long runs.** Four adventures, the Burning Foundry, the
Frozen Caverns, the Bilge Sewers and the Orbital Deck, that all end in a fifth biome, the Drowned Crypt, playable solo
or with up to 4 friends, with four heroes to choose from.

**Runs** are long and meant to be lost a few times before they're won:

- **Difficulty**, picked in the lobby (the host picks it in a room): **Normal**, **Hard** or **Nightmare**. Harder
  difficulties bring more enemies (+35% per step), with more health (x1.4 / x1.9) and damage (x1.25 / x1.5), and pay
  +50% XP per step plus better loot (gun, grenade and relic quality, and mythic, signature and cosmetic drop odds).

- **Five acts.** Act 1 is a random adventure, acts 2 to 4 are the other three in an order the run's seed picks,
  and act 5 is always the **Drowned Crypt**, ending with the Night Auditor. Each act is an arrival room, five rooms you
  choose, and a boss. Enemies get tougher, hit harder and attack faster every act; the curve is spread over the five
  acts, so the finale is as hard as it was when runs had three.
- **Grabbers, from act 2 on.** Every biome has one (Claw Machine, Polar Hugger, U-Bend Lurker, Cargo Loader, Mummy
  Chaperone), and from act 2 most fights can bring one along. Get within arm's reach and it grabs you almost instantly
  and holds on: no moving, shooting or throwing, and a squeeze now and then. A teammate standing next to you pulls you
  free in under a second; on your own, mash dash (five presses). A third of its health in damage breaks its grip too,
  and a grabber that loses its grip is dazed. Nobody helps in time and you get thrown. The Claims Agent, found in every
  biome, does it from range: after a line telegraph it throws a hook that catches the first player it touches and reels
  them in for the same hold. Dash through the hook or put cover between you.
- **Branching doors.** A cleared room opens two or three doors along the top wall, labelled with what's behind them:
  Fight, Elite Fight (harder, a rare gun each), Event (a fight with a twist), Shrine (two boosts each), Rest Stop
  (half your health back and a suitcase). Stand in a door to vote. Most votes wins, the host breaks ties, and
  stragglers get a few seconds.
- **Events (twists):** Rush Hour (waves don't wait, double loot), Lights Out (dark except around the heroes; never in
  the Crypt, which is dark already), Hold the Line (survive the timer), Baggage Claim (conveyor belts), Overbooked (every family at once), Elite Convention,
  Falling Luggage (telegraphed suitcases rain down) and Ambush (spawns in a ring around you). From act 2 on, some
  plain fights get a twist too.
- **Run boosts, per player.** After most rooms each player gets their own three offers (gems only they can see) and
  takes one. There are 50+ boosts across shots, crits, elements, kills, dashes, survival, skills, grenades and co-op,
  with rarities, stacking and keystones (Wildfire, Shatter, Overload, Meltdown) that need the matching tag first.
  Offers lean toward your build and away from what teammates took. The pause menu lists your build.
- **Smarter, faster enemies.** Melee enemies wind up and recover much faster, track you during the windup and lunge.
  Shooters lead their shots, packs surround you instead of queueing, enemies spread over the party, supports hide
  behind their friends, ranged enemies sometimes sidestep your shots, and nobody stands in your fire.
- **Bigger bosses.** Faster windups, four phases (an enrage at 15%), chained triple charges, shockwave rings that
  sweep the whole arena (dash through them, or be inside a dome), rings of bolts, and rain that covers the floor.
  Each boss also has one attack nobody else has: the Foreman's **Slag Cross** (lines of slag marching out from him,
  one aimed at you, that burn for a moment; six arms past half health), the Dragon's **frost breath**, the Gator's
  **Submerge** (it dives out of reach, swims after you and bursts up under you), the Autopilot's **Laser Sweep**
  (beams that turn across the room; step over them or dash through, and crates block them) and the Night Auditor's
  **Lights Out Audit** (every candle goes out and the room goes nearly black while glowing pages rain down).
- **Endless.** Beat the final boss and choose: fly home with the win, or keep going. Endless goes round the five biomes
  again in the same order, each act harder, and every boss after that offers the way home again. Going down in endless still counts as a win.
- **Rewards** count rooms, kills and bosses, so a lost run still pays. The first boss of the day gives the daily bonus
  and the guaranteed souvenir; first-clear hats need the full win.
- **Practice range**, from the lobby (solo): your hero and loadout against training dummies that never hit back, one
  of each defense (flesh, armor, shield) plus a big one. Killed dummies stand back up and ones left alone heal to full,
  a rack of loaners has every gun archetype and grenade, and the top bar reads your damage per second. Nothing in it is
  saved.
- Dev shortcuts (solo, dev builds): `?practice` (straight into the practice range), `?seed=123`, `?biome=sewers` (or `foundry`, `caverns`, `orbital`), `?room=boss`
  (or `combat`, `elite`, `event`, `shrine`, `rest`), `&act=4` (a later act, in that act's biome; act 4 is the Drowned
  Crypt), `&twist=dark`, `?mythics` (every mythic on the floor of the first room).

Everything else from phase 5:

- **Four heroes**, each with their own level, action skill and three five-node skill branches. Switch with the hero
  button in the lobby; switching is free.
  - **Vanguard** (tank): a dome that blocks shots. Branches: Bulkhead, Static, Return to Sender.
  - **Gunslinger** (damage): marks the 3 nearest enemies; your shots seek them and hit 40% harder. Branches:
    Showboat (trick shots, crits), Fast Hands (reloads), Bounty Hunter (marks spread on kill, stuns, slows).
  - **Tinker** (area control): drops a turret that shoots with your gun's element. Branches: Mass Production (two
    turrets, tiny turrets from kills), Customer Attention (taunts, health, zaps back), Planned Obsolescence (it
    explodes).
  - **Warden** (support): an owl drone that heals allies and slows enemies near it. Branches: First Aid (faster
    revives, the owl picks people up, a second Second Wind), Owl Tactics (zaps, hunting), Extra Padding (overheal
    becomes a shield).
- **Elite modifiers**: the director spends part of each wave's budget on elites instead of more enemies (more in later
  rooms and on harder tiers; the first wave of a run stays plain). Each has a colored ring, a diamond over its head and
  one clear tell, and is explained the first time you meet it:
  - **Shielded** (melee kinds only): a front shield that turns slowly. Flank it, lob over it, hit it while it swings,
    or batter it until it breaks.
  - **Splitting**: two smaller copies on death. **Vengeful**: explodes where it dies after a telegraphed moment.
  - **Teleporting**: shimmers where it's going, then blinks behind you. **Hasted**: faster windups and attacks.
  - **Linked**: two elites on a tether. Kill one and the other brings it back unless it dies within 4 seconds.
- **The Frozen Caverns**: icy floors (you slide, and your dash goes further), spike walls that hurt and bounce you
  off (and hurt enemies you shove into them), slush that slows you, and a new family built to push you around:
  Waiter Penguins, Yeti Bouncers, Curling Golems, Slush Slimes, Ski Instructors, Penguin Igloos, Ice Machine mimics
  and Snowmen. Mostly armored and frost-immune, so bring Acid. The boss is the **Customer Complaints Dragon**: frost
  breath in a wedge that leaves slush, a tail swipe that sends you sliding, icicles, a belly slide and waiter
  penguins.
- **The Bilge Sewers**: deep water channels where wading is slow and the current carries you (a dash skims across),
  and sludge pipes in the walls that drip a warning, then blast their lane and shove you down it. The family swims,
  so it cuts through the water at full speed while you wade: Sewer Roaches, Plunger Ogres, Sewer Eels, Spitting
  Toads, Sludge Slimes, Drain Shamans, Roach Motels, Toilet mimics and Fatbergs. Mostly flesh, so bring Fire. The
  boss is the **Lost & Found Gator**: tail slam, sludge spit, snapping lunges, roaches, a sludge spray, a sludge
  burst and Submerge.
- **The Orbital Deck**: laser fences between two posts that flicker a warning, then switch on (they hurt and bump
  you off; dash through), and teleporter pads in color-matched pairs: step onto one and you come out of the other,
  which the robots can't follow. The family: Roomba Drones, Security Mechs, Rocket Carts, Satellite Crabs, Gray Goo,
  Holo-Concierges, Drone Docks, Cryo Pod mimics and Space Blobs. Lots of shields, so bring Shock. The boss is **The
  Autopilot**: EMP stomp, orbital strikes, thruster charges, roombas, plasma rings, a shockwave and Laser Sweep
  (a third beam past half health).
- **The Drowned Crypt** (always the final act, never picked in the lobby): it's dark, and you only see what your glow,
  a Warden's owl or a candle lights. Candles stand around every room, half of them burning when you walk in; shoot one
  (or blast near it) and it burns for 18 seconds. Enemies standing in candlelight take 15% more from everything. The
  family: Souvenir Hunters (skeletons with metal detectors), Zombie Porters, Gargoyle Bellhops (stone in the dark: they
  take a fifth of the damage until you bring the light to them), Banshee Tour Guides (they charge whoever strays
  furthest from the group), Ecto Slimes, Bell Ringer Ghouls (their toll shields friends and blows out nearby candles),
  Crypt Keeper's Urns (ecto wisps), Coffin mimics, Haunted Hatboxes and Mummy Chaperones. Mostly flesh, so bring Fire.
  The boss is **The Night Auditor**: tax forms, rubber stamps, audit charges, souvenir hunters, receipts in every
  direction, a ledger slam and Lights Out Audit.
- **Signature powers**: rare co-op drops (30% of co-op wins on Normal, more on harder tiers) that change a hero's
  action skill. Sidegrades, each with a catch: Black Hole Dome and Revolving Door (Vanguard), Six Shooter and Dead
  or Alive (Gunslinger), Turret With Legs and Patio Heater (Tinker), Owl Parliament and Rescue Owl (Warden). Equip
  them on the Skills screen.

**Lobby and cosmetics:**

- **The game opens in the lobby**, Brawl Stars style: your hero on a spotlit mark at the baggage carousel, with open
  marks for friends. Tap an open mark (or **Invite friends**) to make a room; friends drop in from above and stand
  next to you in their party color, name, level and outfit. **Play solo** starts a run on your own, and becomes
  **Start run** for the host once you're in a room. Around the stage: your name, level and account (top left), invite,
  quick match and join by code (top right), Skills, Armory, Souvenirs and Wardrobe (left), and hero, emote,
  adventure and play (bottom). Buttons have pixel-art icons. Tap your own hero to show off your trail.
- **Cosmetics** (design doc: Cosmetics), earned only by playing: **hats** (traffic cone, a fish, propeller wizard
  hat, tiny second head, crown...), **dash trails** (confetti, bubbles, rubber ducks, afterburner, rainbow...), **gun
  skins** (googly eyes, gold plating, "Property of the Cruise Line"...) and **emotes** (wave, dramatic bow, air guitar,
  the floss but worse...). Hats, trails and skins show in runs too, for everyone in the party, and so do emotes: the
  emote button under your weapon slots (G on a keyboard) puts your emote's line in a bubble over your hero.
  - The first win on each difficulty clears all four adventures and gives their hats.
  - Runs that beat a boss sometimes drop one (12% solo, 20% co-op, more on harder tiers).
  - Milestones: 10 and 25 wins, 50 runs, 2,000 kills, 3 legendaries, a level 30 hero.
  - Pick them in the **Wardrobe**. Guests wear the starter items only.

From phase 4:

- **Accounts**: a name and password keep your hero, guns and souvenirs on every device. Guests can still play
  everything, but nothing is saved.
- **Hero levels** on the design doc's curve (125 XP for level 2, 13,775 to the cap of 30). A solo run through
  the first boss is worth about 150 XP and a full win several times that; co-op 30% more, and **the first boss of
  the day** half again.
- **Skill branches**: the Vanguard has three branches of five nodes (Bulkhead, Static, Return to Sender) that change
  what the dome does rather than adding percentages. One point per level, free respec, and even a maxed hero can't
  take everything.
- **Manufacturers**: every dropped gun comes from Dwarfcorp (fewer pips, huge shots), Arcane Electric (always
  elemental), Goblin Surplus (extra shots in a messy spread), Wizard Labs (bouncing, curving shots) or Mega-Mart
  (huge ammo bar, slow reload). Sustained damage stays within a narrow band; the feel changes.
- **Legendaries**: six named guns, each with one rule-breaking effect (The Ex's pellets come back, Overachiever fires
  a homing rocket every 10th bullet, Hot Take leaves a line of fire, Show-Off ricochets between enemies, Party Favor
  bursts into bomblets, Mood Ring changes element every shot).
- **Grenades**: enemies and suitcases also drop grenades (every boss leaves a rare-or-better one). Seven kinds:
  Carry-On Frag (plain boom), Hot Pocket (burning floor), Snow Globe (big frost blast, lingering frost that freezes),
  Static Cling (shock chains, faster cooldown), Sour Candy (armor-melting acid puddle), Party Popper (4 bomblets) and
  Lint Trap (pulls enemies into the middle). Higher rarity means more damage, a bigger blast and a shorter cooldown.
  The grenade on your belt at the end of a run comes home to the armory's Grenades tab (up to 20; overflow scraps
  the worst spare), where you can equip or scrap them like guns. Everyone starts with a common frag.
- **Loot comes home**: the two guns in your hands at the end of a run go to your armory and become your
  loadout. Equip, compare (green arrows), scrap for XP, or scrap all commons in one tap. The intro room's
  try-out guns are loaners and stay behind.
- **Souvenirs** (permanent boosts) from solo runs that beat a boss: always from the first of the day, sometimes otherwise. Pick
  one of three; each rank is about 1% of something, with a hard cap of 15 ranks.
- **Helping newer players**: in co-op, being at or above the tier's level with someone below it gives +25% XP and
  an extra gun.
- **Offline solo**: the installed game opens without a connection; solo results are saved on the phone and synced
  when it's back online.

From phase 3:

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
| `npm run balance -- 30` | A bot plays 30 solo runs and reports room times, damage taken and deaths. Options: `--hero tinker`, `--biome caverns`, `--level 20`, `--tier 1`, `--elite shielded` (every elite is that kind), `--god` (never die) |
| `npm run bandwidth` | Four bots play a co-op run; reports snapshot sizes and data use per phone |

To feel the netcode on a bad connection, start the server with simulated latency: `LAG=200 npm run dev:server`
(round trip in ms).

Accounts live in SQLite through Node's built-in `node:sqlite` (Node 22.13 or newer; no native build on the Pi). The
database is `packages/server/data/lostluggage.db` unless `DB_PATH` says otherwise. Set `INVITE_CODE=SOMETHING` to
make new accounts need that code, so only your friends can sign up.

## Accounts and progress

Tap **Sign in** in the lobby to make an account (name, password and, if the server asks, the invite code).
Then:

- **Skills**: tap the next node in a branch to learn it, or a learned node to give it (and everything after it)
  back. Respec is free.
- **Armory**: tap a gun to equip it in either slot or scrap it for XP. Green arrows mark guns with more DPS than your
  weaker equipped one.
- **Souvenirs**: unpack the ones you found; each pick is permanent.

Every change is applied on the device first, with the same reducer the server uses (`packages/sim/src/progress.ts`),
then queued and sent to the server, which applies each action exactly once. Solo runs therefore save offline and
sync when there's a connection; co-op rewards are saved by the server and sent back at the end of the run. Leaving
a run early (quit or leave room) still takes home the guns in your hands.

## Playing together

1. Everyone opens the game and types a name (top left of the lobby).
2. One person taps **Invite friends** (or an open mark on the stage) and reads out the 4-letter code.
3. Everyone else types the code and taps **Join**. The host picks the difficulty and taps **Start run**.

Friends can join a run that already started; they appear next to the party with a better second gun. Downed
teammates show a pulsing ring: stand in it to fill their revive bar. In co-op, the exit waits 4 seconds for
stragglers, or opens right away once everyone who can walk is at the door.

## Controls

| Action | Touch | Desktop |
| --- | --- | --- |
| Move | Left joystick (appears where your thumb lands) | WASD / arrows |
| Shoot | Right joystick: tap = auto-aim, drag = aim, release = fire | Mouse + left click (T toggles auto-aim) |
| Dash | DASH button | Space |
| Action skill | DOME / MARK / BUILD / OWL button (charged by dealing damage) | E or right click |
| Grenade | NADE button: tap = nearest enemy, drag = aim | Q (throws at the mouse) |
| Swap gun | Tap a weapon slot | 1 / 2 or mouse wheel |
| Pick up / use item | SWAP / PRAY / OPEN button (appears near an item) | F |
| Revive a teammate | Stand next to them | Stand next to them |
| Pause (solo) / menu (co-op) / mute | Background the app | P or Esc / M |
| Quit a solo run / leave a co-op room | Pause, then QUIT TO MENU / LEAVE ROOM | Esc, then L |

Walk up to a dropped gun or grenade and press the pickup button to swap it for yours (your old one stays on
the floor). The card at the bottom compares it with yours. The same button prays at shrines and opens
suitcases. Health snacks are still grabbed just by touching them.

In development, `?room=4` jumps straight to a solo room, `?seed=123` replays a solo run, and `?level=25` pretends
a guest's hero is level 25.

## Layout

```
packages/
  sim/      Pure TypeScript game rules: fixed 30 Hz tick, seeded RNG, no rendering code.
            Runs in the browser for solo and on the server for co-op.
    src/data/   Guns, grenades, enemies and biomes, heroes, manufacturers, legendaries, skill trees, signatures, souvenirs,
                cosmetics
    src/director.ts  Encounter director: threat budgets, role templates, pacing curve, party scaling
    src/room.ts      Room layouts, lava vents, waves, exits
    src/loot.ts      Rarity, manufacturers, legendaries, elements, perks, grenades
    src/domes.ts     The Vanguard's dome skills: zaps, shoves, healing, reflections
    src/marks.ts     The Gunslinger's marks: seeking shots, crits, marks that spread
    src/gadgets.ts   The Tinker's turrets and the Warden's owl drone
    src/elites.ts    Elite modifiers: shields, splits, blinks, death blasts, links, haste
    src/grabs.ts     Grabbers: catching, holding, squeezing, getting freed or thrown
    src/crypt.ts     The Drowned Crypt's candles, light and the Night Auditor's blackout
    src/progress.ts  Profiles, XP and levels, stash and loadout, souvenirs: one reducer for client and server
    src/net.ts       Co-op wire format: snapshots, events and inputs as small integer arrays
    scripts/balance.ts  Bot-driven balance harness
  server/   Colyseus server. RunRoom is one party: lobby, room code, drop-in, reconnects, and the
            sim at 30 Hz with snapshots at 15 Hz. Loads each account's hero and saves its rewards.
    src/db.ts   Accounts, sessions and profiles in SQLite
    src/api.ts  Sign up, sign in and profile sync
  client/   Phaser 3 renderer, input, HUD, the lobby stage and the menu (account, skills, armory, souvenirs,
            wardrobe).
    src/net.ts      Co-op client: snapshot buffer, clock sync, interpolation, movement and shot prediction
    src/account.ts  Guest or saved profile, the offline action queue and syncing
    public/sw.js    Service worker that caches the game for offline solo runs (production builds only)
```

All art, the pixel font and the sounds are generated in code as placeholders
(`packages/client/src/render/pixels.ts`, `packages/client/src/sfx.ts`), so there are no asset files yet.

## How co-op works

The server runs the same sim the browser runs in solo. Clients send one input per tick (30 a second); the server
applies them and broadcasts a snapshot every second tick. Snapshots are arrays of small integers (positions in
quarter pixels, timers in centiseconds) packed with msgpack and deflated by the websocket: about 11 KB/s per phone
on average and 22 KB/s in the busiest fights, or roughly 10 MB for a 15-minute dungeon (`npm run bandwidth`). Plain
enemies send a single 0 where elites, marks and slows would go.

Each client draws other players and enemies about 130 ms in the past, interpolating between two snapshots. Your
own hero runs ahead: the client applies your inputs to a copy of your hero with the sim's own movement code, and
when a snapshot says which inputs the server has applied, it replays the rest on top of the server's answer.
Leftover differences fade out over a few frames instead of snapping. Your shots are predicted the same way, so the
flash, sound and bullets leave your gun the moment you fire; the server still decides every hit. The netcode test
(`packages/client/test/netcode.test.ts`) drives the real client against the real server: at a 120 ms round trip
the largest correction is under a pixel, and at 300 ms a few pixels. Shots that curve, return or ricochet (Wizard
Labs guns, some legendaries, reflected bolts) can't be guessed, so those are drawn from the server's snapshots.

## Hosting

`npm run build && npm start` serves the game and the co-op server from one port (`PORT`, default 2567), which fits
the Raspberry Pi plan in the design doc. Installable web apps need HTTPS, so put it behind a Cloudflare Tunnel or a
Let's Encrypt proxy; the client connects back to the same origin over `wss://`. To point a client at a different
server, build it with `VITE_SERVER_URL=https://example.com`.

## Notes on numbers

World units are internal-resolution pixels (480×270 screen), so ranges and distances are smaller than the
doc's example values (for example the mortar beetle keeps 120–220 px away instead of 200–350).

## Balance

`npm run balance` drives a simple bot (no real dodging, so treat its deaths as an upper bound on difficulty). With 40
runs per hero at level 1 on Normal, after the phase 5 tuning:

| Hero | Burning Foundry wins | Frozen Caverns wins |
| --- | --- | --- |
| Vanguard | 39/40 | 31/40 |
| Gunslinger | 38/40 | 35/40 |
| Tinker | 38/40 | 29/40 |
| Warden | 40/40 | 35/40 |

The Foundry plays as it did before phase 5 (59/60 wins, about 8 elites a run). The Caverns are the harder adventure,
mostly because of the bot's trouble on ice; the dragon accounts for most Caverns losses.
