[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/5WanWan/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/5WanWan/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# CINDERLINE — Smelter Yard

A round-based tactical first-person shooter in the style Counter-Strike made
famous, built on three.js 0.187.0 as static files with no build step and no
network requests. Single-player against nine waypoint-driven bots.

## The game

Two teams of five fight over a smelter yard at dusk: **Cinder** attacks,
**Slag** defends. Each round opens with a 15-second buy phase, then 100
seconds of play. Cinder wins a round by planting the Core Charge at Kiln (A)
or Gantry (B) and defending it until detonation, or by eliminating the Slag
team; Slag wins by wiping Cinder or defusing the charge. First to five
rounds takes the match.

- **Economy:** start at $800; kills and round wins pay out. Spend it in the
  buy menu (B to deploy) on rifles, the sniper, the SMG, Kevlar armor and
  three grenades. Weapons you survive with are kept.
- **Gunplay:** hitscan with body/head spheres (headshots deal double),
  recoil and spread that punish firing on the move, ADS that tightens FOV and
  spread, reloads, finite reserve ammo, armor that soaks damage first.
- **Grenades:** frag (ballistic, bounce, area damage), smoke (blocks bot
  line of sight), flash (whites out the view of anyone facing it).
- **Bots:** waypoint graph + Dijkstra pathfinding; they buy, push sites,
  hold angles, throw frags at distant enemies, smoke site pushes, plant and
  defuse, and react to gunfire they hear.
- **HUD:** health, armor, ammo, money, round timer, score, killfeed,
  minimap (walls, slag channel, sites, teammates, last-seen enemies),
  crosshair with dynamic spread, hitmarker, damage direction, plant/defuse
  progress bar, and a scope overlay for the SR-90.
- **Map:** a 64×48 m foundry yard — Kiln and Gantry sites, lanes, crates,
  a molten slag channel with emissive flow, dusk sky with stars and a low
  moon, synthesized WebAudio gunfire and ambience.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim (pointer lock) |
| Click | Fire · Right-click: aim down sights |
| R | Reload |
| 1–4 | Select weapon · G throw grenade · Q cycle grenade |
| E | Plant / defuse (hold near the charge / site) |
| B | Buy menu / deploy (locks the pointer) |
| Ctrl | Crouch · Space: jump |

## Play it

```sh
node serve.ts            # serves game/ at http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome and click **CLICK TO PLAY**.

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory and
writes `dossier.json` with the kit's `buildDossier`.

## Layout

```
game/
  index.html            page, HUD DOM, import map
  src/
    main.js             bootstrap, fixed-step loop, fighter meshes, camera
    state.js            one shared state object, fighters, economy constants
    world.js            map geometry, colliders, waypoint graph, raycasts
    palette.js          dusk palette, canvas textures, sky and lighting
    weapons.js          weapon/grenade tables, buy catalogue, buy logic
    combat.js           hitscan shooting, grenades, damage, killfeed
    player.js           first-person movement, ADS, recoil, plant/defuse
    bots.js             bot AI: Dijkstra routes, roles, hearing, grenades
    objective.js        round flow, plant/defuse/detonation, rewards
    effects.js          tracers, sparks, smoke, muzzle flash, screen shake
    hud.js              HUD, minimap, buy menu, banners, scope overlay
    input.js            keyboard, mouse, pointer lock
    audio.js            synthesized WebAudio: shots, steps, plants, rounds
    rng.js              seeded RNG, clamp/lerp helpers
    tmp.js              reusable scratch vectors (no per-frame allocation)
  vendor/three/         three.js 0.187.0, vendored byte for byte
screenshots/            four renders of this game's own code
```

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=sdnvmg7s&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
