# Co-op Looter Brawler — Game Design Doc

Oct 9, 2026 · @Justin

## Vision and pillars

A casual, mobile-first co-op looter: Borderlands-style guns and loot, played with Brawl Stars-style top-down controls, in short sessions alone or with 2–4 friends. Leveling gives you new options, never enough raw power to make mixed-level groups unfun.

1. **Pick up and play.** A run fits in a bus ride: 5–8 minutes solo, 10–15 minutes for a dungeon. Controls are learned in one minute.
2. **Easy to learn, real challenge.** Casual means no punishing grind, not no skill. Enemies are readable, and dodging well matters.
3. **Loot that changes how you play.** Every gun drop could be a new playstyle, not just a bigger number.
4. **Enemy variety is the core.** Each biome, enemy mix and modifier creates a different problem to solve.
5. **Play with anyone.** A level 3 and a level 30 can team up and both have fun.

## Setting and tone

A goofy fantasy kingdom where a galactic tourist cruise ship crash-landed: goblins found laser rifles, wizards bolted jetpacks onto their robes, and nobody read the safety manual. The game never takes itself seriously.

**Tone rules**

- Jokes live in names, flavor text, barks and animations, never in confusing mechanics
- Every item description is a one-line gag, Borderlands style
- Enemies are silly to look at but fair to fight: the telegraphs stay serious

**Flavor for the starting cast**

| Hero | Look |
| --- | --- |
| Vanguard | A knight whose shield is a salvaged spaceship door |
| Gunslinger | An elf cowboy with a laser revolver and too much confidence |
| Tinker | A goblin engineer whose turret is held together with tape |
| Warden | A druid whose healing drone is a very polite robot owl |

**Enemy flavor examples:** slimes wearing traffic cones, mimics disguised as vending machines, skeletons with robot arms, a dragon that wants to file a complaint with the cruise line.

## Art direction

Low-resolution pixel art with cheap lighting tricks: it creates atmosphere, runs on older phones, and is realistic for a small team to produce.

**Base look**

- Render at a low internal resolution (about 480×270) and scale up with crisp pixels
- A limited color palette per biome, so each place has its own mood
- Start from cheap or free asset packs (itch.io) and replace them over time

**Atmosphere for almost no cost**

- **Light sprites:** soft glow images drawn with additive blending for lava, muzzle flashes, spells and magic loot
- **Darkness overlay** with light cut-outs around players for dark biomes
- **Ambient particles:** embers, snow, dust, floating spell sparks
- **Parallax background layers** and a subtle vignette
- **Juice:** screen shake, hit-stop, flashing hits, chunky damage numbers

**Avoid on mobile:** real-time shadows, normal-mapped lighting, and stacks of full-screen shaders.

**Budget:** one texture atlas per biome (2048×2048 maximum) and a total download under about 30 MB, which also keeps offline storage small.

## Inspirations

The game takes its loot and progression from Borderlands and its feel from Brawl Stars, with a few deliberate changes.

| From | We take | We change |
| --- | --- | --- |
| Borderlands | Randomized guns with manufacturers, rarities and elements; hero classes with an action skill and skill trees; drop-in co-op | Gear power stays in a narrow band; rarity adds effects more than stats |
| Brawl Stars | Top-down view, twin-stick touch controls, tap to auto-aim or drag to aim, ammo bars, a super charged by landing hits, short sessions | PvE instead of PvP; persistent loot instead of fixed brawler kits; a dash for dodging |
| Risk of Rain 2 / Vampire Survivors | Short-lived run boosts that stack into flashy combos | Kept small so loot stays the main source of power |
| Left 4 Dead | An AI director that paces fights | Tuned for short mobile runs |
| Helldivers 2 / Deep Rock Galactic | Progression that unlocks options, not raw power | — |

## Controls and combat

Controls are designed for a phone held in landscape first, then mapped to keyboard and mouse. Every action fits under two thumbs.

| Action | Mobile (touch) | Desktop |
| --- | --- | --- |
| Move | Left virtual joystick | WASD |
| Shoot | Right joystick: tap = auto-aim at nearest enemy, drag = aim, release = fire | Mouse aim, left click (auto-aim toggle in settings) |
| Dash | Button above right joystick, 1 charge, \~4 s cooldown | Space |
| Action skill | Big button, charged by dealing damage (Brawl Stars super) | Right click or E |
| Grenade | Small button, tap = throw at nearest, drag = aim | Q |
| Swap gun | Tap weapon icon | 1 / 2 or scroll |

**Ammo bars.** Guns fire from a 3-pip ammo bar that reloads over time, like Brawl Stars. Each gun type changes pips, reload speed and how many shots one pip fires.

**Dodging.** Most dodging is moving out of telegraphed attacks. The dash is the emergency tool: short invincibility frames (\~150 ms) for attacks you misread.

**Readability over bullet hell.** Fewer, bigger, slower projectiles than a bullet-hell game, so the screen stays readable on a 6-inch phone.

**Gun archetypes** define the attack shape, Brawl Stars style:

- **Pistol** – fast single shots, quick reload
- **Shotgun** – short-range spread, high damage up close
- **SMG** – a stream of small bullets per pip
- **Sniper** – long piercing line with a short charge
- **Launcher** – lobbed shot that explodes in an area, goes over walls

## Game modes

Solo adventures feed small, steady progress; co-op dungeons are where the best loot and powers drop.

|  | Solo adventures | Co-op dungeons |
| --- | --- | --- |
| Players | 1 | 2–4 (soloable on a harder tier) |
| Length | 5–8 min | 10–15 min |
| Structure | 3–4 rooms, mini-boss at the end | 5–7 rooms, mechanics, final boss |
| Rewards | Gear, materials, small permanent boosts | Gear with better odds, signature legendaries, cosmetics |
| Scaling | Fixed to your level | Level sync to the dungeon tier; enemy count and HP scale with party size |

**Joining.** Quick match by dungeon, a 4-letter room code for friends, and drop-in for parties that have an open slot.

**Downed, not dead.** A downed player can be revived by a teammate standing near them. In solo, you get one self-revive per run, a nod to Borderlands' Second Wind.

**Mobile-friendly sessions.** A disconnect drops you back into the same run for 60 seconds before your slot opens.

**Guest play.** Guests get a temporary hero with a starter loadout and can play solo or join a friend's room by code. Nothing is saved when they leave.

## Heroes and powers

Each hero is a Borderlands-style class: a passive, an action skill, and three skill branches. Any hero can use any gun, so loot stays exciting for everyone.

| Hero | Role | Action skill | Branch ideas |
| --- | --- | --- | --- |
| Vanguard | Tank | Deploys a dome shield that blocks projectiles for allies | Bigger dome · dome pulses damage · dome reflects shots |
| Gunslinger | Damage | Marks up to 3 enemies, next shots auto-target them for bonus damage | Crit chains · faster reload · marks spread on kill |
| Tinker | Area control | Drops a turret that copies your gun's element | Two turrets · turret taunts · turret explodes when it ends |
| Warden | Support | Summons a drone that heals allies and slows enemies | Revive faster · drone fires shock · overheal becomes shields |

**Horizontal skill points.** Each level grants a skill point. Nodes add new behavior (a shield that reflects, a turret that taunts) rather than +X% damage. Respec is free and instant, so trying builds costs nothing.

**Signature powers.** Rare co-op dungeon drops that replace or modify an action skill (a black-hole dome, a turret that walks). They are sidegrades: different, not stronger.

## Loot system

Loot is the Borderlands heart of the game: every gun is archetype + manufacturer + element + rarity, and the excitement comes from effects, not stat inflation.

**Loadout (kept small for mobile):** 2 guns, 1 grenade mod, 1 shield, 1 relic.

**Manufacturers** give each gun a quirk you can recognize at a glance (working names):

| Manufacturer | Quirk | Feel |
| --- | --- | --- |
| Dwarfcorp Heavy Industries | Fewer pips, much bigger shots | Heavy and deliberate |
| Arcane Electric Co. | Always elemental, weaker base damage | Status effects everywhere |
| Goblin Surplus | Extra projectiles in a spread; looks held together with tape | Messy and fun |
| Wizard Labs | Bullets bounce or curve | Trick shots |
| Mega-Mart Blasters | Huge ammo bar, slow reload | Spray and pray |

**Elements** connect loot to enemy variety:

- **Fire** – burn over time, strong against unarmored flesh
- **Shock** – chains between enemies, strips shields
- **Frost** – slows, then freezes at full stacks
- **Acid** – breaks armor

**Rarities:** common (white), uncommon (green), rare (blue), epic (purple), legendary (orange). Rarity adds extra effects; it adds at most about 10% raw stats from common to legendary.

**Legendaries** each have one rule-breaking effect with flavor text, Borderlands style. Examples: a shotgun whose pellets come back like boomerangs; an SMG that fires a homing rocket every 10th bullet; a sniper that leaves a damaging line on the ground.

**Mythics** sit above legendary and are the rarest drops in the game. They're the one place the golden rule bends: a mythic hits 1.5x harder than a legendary, and carries an ability that breaks a rule everyone else plays by. They come as guns or grenades, each with its own hand-drawn icon, a prismatic beam on the floor and a fanfare when one drops.

| Mythic | Kind | The rule it breaks |
| --- | --- | --- |
| Return to Sender | Shotgun | Pellets bat enemy shots back at whoever fired them |
| Customs Officer | Pistol | Hits confiscate an elite's modifier and strip shield bars |
| Snooze Button | Grenade | Enemies in the blast sleep until something hits them; bosses only nod off |
| Black Box | Grenade | 4s later, allies it caught get back the health they had, even if they went down, and the wipe waits for it |

They drop from bosses (and, ten times more rarely, elites) in solo and co-op: about 0.3% per boss on Normal, up to 2.5x on Nightmare, doubled in co-op when someone below the tier's level is along. Luck doesn't touch the roll. Bad-luck protection: every boss beaten since your last mythic adds 1% of the base chance.

**Mobile-friendly management.** Green up-arrows on better gear, one-tap compare, auto-pickup for materials, and one-tap "scrap all commons".

**Run boosts.** Shrines in rooms give temporary boosts for the current run only (+1 bounce, burn spreads on kill). They stack into flashy combos and reset each run.

## Cosmetics

Cosmetics are goofy, earned only by playing, and never sold. They are the main long-term chase once a hero hits the level cap.

| Slot | Examples |
| --- | --- |
| Hat | Traffic cone, propeller wizard hat, a fish, a tiny second head |
| Dash trail | Rainbow, bubbles, a line of rubber ducks |
| Gun skin | Googly eyes, gold plating, "Property of the Cruise Line" sticker |
| Emote | Dramatic bow, air guitar, the floss but worse |
| Downed animation | Turn into a chicken, fall over like a cartoon |
| Victory pose | Shown on the end-of-run screen |

**How you earn them**

- Silly achievements ("get downed by your own grenade 10 times")
- Boss drops and first clears of each dungeon tier
- A small chance from any loot drop, so the rarest drop in the game can be a hat
- A wardrobe screen to equip and show them off in the lobby

## Progression and balance

The golden rule: a new player is at most about 20% weaker in raw numbers than a fully geared veteran. Everything else comes from options and skill.

| Layer | Source | Lasts | Power effect |
| --- | --- | --- | --- |
| Hero level (cap \~30) | XP from any mode | Permanent | Skill points and unlocks; tiny stat growth |
| Gear | Drops in both modes | Permanent | Narrow band; level-synced in co-op |
| Permanent boosts | Solo adventures | Permanent | Small, hard total cap of \~15–20% |
| Signature powers | Co-op dungeons | Permanent | Sidegrades, no raw power |
| Run boosts | Shrines during a run | One run | Flashy, temporary |

**Level sync.** In co-op, every player's stats and gear are scaled to the dungeon tier. Veterans keep their wider toolbox (skills, signature powers, legendary effects), not bigger numbers.

**Reasons to group with newer players.** Bonus XP and an extra loot roll for helping someone below the dungeon tier.

**Difficulty tiers** (Normal, Hard, Nightmare) change enemy mixes, modifiers and attack speed, not just health. Higher tiers raise legendary drop odds.

**Leveling pace: 10–20 hours to cap.** XP needed for the next level grows linearly:

```latex
\text{XP}_{\text{next}}(L) = 100 + 25L
```

That gives 125 XP for level 1→2 (about one run) and 825 XP for level 29→30 (about seven runs), or 13,775 XP in total. With a solo run worth about 100 XP and a dungeon about 160 XP, an average of 120 XP per run means about 115 runs. At 8–9 minutes per run, that is roughly 15–17 hours, in the middle of the target. Tune the per-run XP, not the curve, if playtests run fast or slow.

## Enemy design

Enemy variety is the main thing that keeps the game fun, so enemies are built from roles, modifiers and element defenses that combine into hundreds of distinct fights.

### Roles

Every enemy fills one role, which defines the problem it creates.

| Role | Problem it creates | Example |
| --- | --- | --- |
| Swarmer | Overwhelms with numbers | Packs of 8–12 fast rats |
| Bruiser | Blocks space, punishes close range | Slow golem with a ground slam |
| Artillery | Forces constant movement | Mortar beetle lobbing shots at your position |
| Charger | Tests dodge timing | Boar that winds up, then dashes in a line |
| Zoner | Takes away safe ground | Slime leaving acid puddles |
| Support | Makes other enemies harder | Shaman shielding nearby allies |
| Summoner | Gets worse if ignored | Nest spawning swarmers |
| Ambusher | Punishes careless movement | Spider hiding in walls |
| Splitter | Turns one problem into many | Blob that splits on death |

Combinations are the puzzles: a Bruiser guarding Artillery means you can't just rush the shooter.

### Defenses tie enemies to loot

- **Shields** (blue bar) – weak to Shock
- **Armor** (yellow bar) – weak to Acid
- **Flesh** (red bar) – weak to Fire
- **Frost** works on everything but is weak against bosses

This makes carrying two guns with different elements a real decision, as in Borderlands.

### Telegraphs

Every attack has a readable windup: red flash = melee, ground circle = area, line = dash or beam. Each attack type has its own sound. Bigger hits get longer windups. When players get hit, they should think "I should have dodged that."

### Elite modifiers

Any enemy can roll modifiers that change behavior, not just stats:

- **Shielded** – front-facing shield, must be flanked
- **Splitting** – spawns copies on death
- **Teleporting** – blinks behind a player every few seconds
- **Vengeful** – explodes on death
- **Linked** – two elites tethered, must die within a few seconds of each other
- **Hasted** – faster attacks, shorter windups

### Co-op enemies

- **Grabbers** pin a player until a teammate frees them (in solo: mash to escape)
- **Far-aggro enemies** target whoever is farthest from the group
- **Twin bosses** must be fought in separate spots at once

### Data-driven definitions

Adding an enemy means writing data from \~10–15 reusable behaviors, not new code:

```ts
const mortarBeetle: EnemyDef = {
  id: "mortar_beetle",
  role: "artillery",
  defense: "armor",
  hp: 60,
  speed: 40,
  movement: { type: "keepDistance", min: 200, max: 350 },
  attacks: [{
    type: "lobbedProjectile",
    windupMs: 900,
    telegraph: "groundCircle",
    radius: 48,
    damage: 15,
    cooldownMs: 2500,
  }],
  biomes: ["foundry", "caverns"],
  threatCost: 3,
};
```

**Mobile budget:** at most \~40 enemies and \~60 enemy projectiles on screen at once.

## Biomes

Each biome brings an enemy family and a terrain rule, and its enemies are designed to use that rule. The same Charger plays differently on ice than in a dark crypt.

| Biome | Terrain rule | Enemy family uses it by… | Element focus |
| --- | --- | --- | --- |
| Frozen Caverns | Icy floors make you slide; dash goes farther | Pushing you into spike walls | Armor, Frost-immune |
| Burning Foundry | Lava vents erupt on a timer | Fire-immune enemies luring you near vents | Shields, Fire-immune |
| Drowned Crypt | Vision limited to a radius around each player | Ambushers striking from the dark | Flesh |
| Storm Peaks | Wind gusts push players and projectiles | Artillery firing with the wind | Shields |
| Bilge Sewers | Deep water slows you and its current carries you; sludge pipes blast a lane on a timer | Swimming through the channels at full speed while you wade | Flesh |
| Orbital Deck | Laser fences switch on and off; teleporter pads link two spots | Cornering you against fences (the robots can't use the pads, so you can) | Shields |

Each biome's boss has one signature attack built around that biome: the Foreman's Slag Cross (lines of burning
slag), the Dragon's frost breath, the Gator's Submerge (dives under and surfaces beneath you) and the Autopilot's
Laser Sweep (turning beams that crates block).

The MVP needs only one biome; the Burning Foundry is the simplest to build (timed hazards, no new physics).

## Encounter director

Rooms are filled by a director, not by hand, so the same dungeon plays differently every run.

1. Each room gets a **threat budget** from the dungeon tier, difficulty and party size.
2. The director picks a **role combination** that creates a problem (for example Bruiser + Artillery + Swarmers), with rules against dull mixes like three Artillery alone.
3. It spends the budget on enemies from the biome's family, using each enemy's `threatCost`.
4. Higher difficulty spends part of the budget on **elite modifiers** instead of more enemies.
5. Enemies arrive in **waves** shaped by a pacing curve: tense fight, breather, spike. A breather room may hold a shrine or a loot chest.

Hand-made set pieces (boss arenas, the first room of each biome) sit on top of the director so key moments stay designed.

## Platform and tech

A TypeScript web game built as a mobile-first PWA, with one shared simulation that runs in the browser for solo and on the server for co-op.

&#91;embedded content: architecture · browser, server, database\]

In solo, the browser's copy of the sim runs the whole game. In co-op, it only predicts your own movement while the server's copy decides what really happens.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript everywhere | Client and server share game code |
| Rendering | Phaser 3 (WebGL) | Input, cameras, particles and tweens built in; PixiJS if you want more control |
| Game logic | Shared `sim` package, fixed 30 Hz tick, no rendering code | Same rules in solo, co-op and tests |
| Multiplayer | Colyseus on Node.js, one room per run | Rooms, matchmaking and state sync out of the box |
| Storage | PostgreSQL (SQLite to start) | Accounts, heroes, inventory |
| Distribution | Progressive web app | Home-screen install, fullscreen, no app store |

### Mobile requirements

- 60 fps target on mid-range phones, with a 30 fps battery-saver option
- Texture atlases and object pooling for bullets, enemies and particles
- Landscape layout that respects notches and safe areas; a "rotate your phone" prompt in portrait
- Touch targets at least 48 px; joysticks appear where the thumb lands
- Pause and disconnect gracefully when the app goes to the background
- Haptics through the Vibration API where supported (not on iOS Safari)

### Networking

- Server ticks at 20–30 Hz and sends state snapshots; clients interpolate other players and enemies
- Your own movement and dash use **client-side prediction** with server reconciliation, so controls feel instant
- Because the game is PvE, hit detection can be trusted to the client with server sanity checks, which is simpler and feels better on mobile networks than full lag compensation
- Start with one server region close to most players

### Why a web app is the easiest way to reach Android and iPhone

For a game shared only with friends, a web app beats a native build because iPhone sideloading is the hard part. Engines like Godot or Unity make native builds easy to produce; distributing them to friends' iPhones is what costs time or money.

| Option | Android | iPhone | Verdict |
| --- | --- | --- | --- |
| Web app (PWA) | Open the link, tap Install | Open in Safari, Add to Home Screen | Easiest: one codebase, no store, instant updates |
| Native build, sideloaded | Share an APK file | Needs a Mac and Xcode; with a free Apple ID the app stops working after 7 days and can't go to other people's phones; the paid program (US$99/year) gives 1-year installs | Fine on Android, painful on iPhone |
| App stores | Google Play review and fee | App Store review and US$99/year | Overkill for a friends-only game |

**iPhone caveats to design around:** all iPhone browsers use Safari's engine, the game can't lock orientation (hence the rotate prompt), the Fullscreen API only works reliably once installed to the Home Screen, and vibration isn't available. Onboarding should tell iPhone players to install it to the Home Screen first.

### Offline solo play

The shared-sim architecture already makes this possible:

1. A **service worker** caches every game file on first visit, so the game opens with no connection.
2. Solo adventures run entirely on the **local sim** in the browser.
3. Progress and loot are saved to **IndexedDB** on the device and queued.
4. When the device is back online, the queue **syncs** to the server account. Since this is a friends-only game, offline results can simply be trusted.
5. Co-op dungeons stay online-only.

On iPhone, offline data is much safer when the game is installed to the Home Screen; also call `navigator.storage.persist()` and keep the download small.

### Hosting

A friend group fits comfortably on your Raspberry Pi homelab: Colyseus and PostgreSQL on the Pi, and the static game files there or on free static hosting. Service workers and installable web apps require HTTPS, so expose it through a Let's Encrypt certificate or a Cloudflare Tunnel.

## Roadmap

Build the fun on a phone first, then add co-op, then depth. Each phase ends with a test you can actually play.

1. **Feel prototype** – One hero, one gun of each archetype, touch and keyboard controls, dash, 3 enemy types in an empty arena. Done when moving and shooting feel good on your own phone.
2. **MVP (solo)** – Burning Foundry biome, 9 enemy roles, the encounter director, loot drops with rarities and elements, one mini-boss. Done when a 5–8 minute run is fun to replay.
3. **Co-op** – Colyseus rooms, prediction and interpolation, room codes, revives, level sync. Done when 4 phones on mobile data can clear a dungeon without feeling laggy.
4. **Progression** – Accounts, hero levels, skill branches, manufacturers, legendaries, permanent boosts. Done when a player has a reason to come back tomorrow.
5. **Content** – More heroes, biomes, elite modifiers, signature powers and bosses.

## Decisions and open questions

| Topic | Decision |
| --- | --- |
| Setting | Goofy fantasy + sci-fi mix; the game doesn't take itself seriously |
| Art | Low-res pixel art with cheap lighting tricks, light enough for mobile |
| Dash | Kept |
| Leveling pace | 10–20 hours to reach the level cap |
| Accounts | Guest play with nothing saved; accounts for friends |
| Monetization | None; goofy cosmetics earned in play |
| Offline | Solo adventures playable offline, synced when back online |
| Platform | Web app (PWA) for Android and iPhone |

**Still open**

- [ ] Game name: *Dropships & Dragons*, *Loot Goblins* and *Wands & Lasers* are starting ideas
- [x] How friends create accounts: username and password, with an optional server invite code (`INVITE_CODE`)
- [ ] Phaser 3 or PixiJS for rendering

## Sources

- [PWA games on iOS: limits and workarounds](https://abratabia.com/pwa-games/pwa-on-ios.php)
- [Progressive web apps on iOS (Monterail)](https://monterail.com/blog/pwa-for-apple-ios)
- [Free vs paid provisioning profiles (Apple Developer Forums)](https://developer.apple.com/forums/thread/712540)
- [Distributing iOS apps without the App Store (DEV Community)](https://dev.to/vimaltwit/distribute-ios-mobile-applicationswithout-app-store-1260)
