# kiln-yard

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/nabotz/kiln-yard/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/nabotz/kiln-yard/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**Clayfield** is a round-based tactical shooter in three.js: five against five in a brickworks at dusk, single-player against bots, plain static files with no build step and no network requests.

- **Rounds and the objective.** Cinder Cell attacks and must arm a breaching charge in the kiln hall (A) or on the loading dock (B); Halcyon Watch defends, retakes and defuses. First to five rounds, sides swap at half-time.
- **Economy.** Money for wins, losses (with a growing loss bonus), kills and the plant, spent in a buy menu during freeze time: two sidearms, an SMG, a shotgun, a rifle, a scoped bolt rifle, armour, a helmet, a defuse kit, frag, flash and smoke grenades. Survivors keep their kit; the dead drop their long gun.
- **Gunplay.** Hitscan against head, chest, stomach and legs with range falloff and armour penetration; bullets that go through wooden crates at a cost; per-weapon spray patterns, bloom and spread that punish running and jumping and reward crouching and stopping; a hit that slows you for a moment; a crosshair that opens with the real cone.
- **Movement.** Acceleration and friction, walking (silent), crouching, jumping onto crates, sliding along walls.
- **Bots.** Each sees through a view cone (not through walls or smoke, not while flashed) and hears gunfire and running footsteps. Teams buy together, attackers stage and execute with smokes and flashes, plant and hold post-plant spots; defenders spread over the sites and mid, rotate on intel and retake. They call it all on the radio: contacts, executes, rotations, retakes, utility.
- **Look and sound.** An original map drawn in text: yard walls of brick with lit two-storey works buildings behind them, a working kiln with embers, smoking chimneys, roofed passages and concrete sites. Procedural brick, plaster, clay, concrete, timber and steel textures, a low amber sun with shadows, and WebAudio sound placed in 3D.

The simulation (`game/src/sim`, `game/src/ai`, `game/src/map`) runs at a fixed 60 Hz and never touches three.js; the renderer (`game/src/render`) and the HUD (`game/src/ui`) only read its state and events.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. `node main.ts` hands the game in (it copies `game/` and `screenshots/` and writes the dossier); `node tools/shoot.ts` retakes the screenshots from `shots.json`, and `node tools/simtest.mjs` plays bot-only matches headless.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
