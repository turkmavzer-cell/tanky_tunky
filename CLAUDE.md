# Tanky Tunky — Claude working notes

Offline, landscape-only Android isometric tank game with fog of war and asymmetric vision
(only the **Trapper** class sees the whole map + minimap with red enemy dots).

- Full brief (source of truth, Turkish): `docs/GAME_BRIEF.md`
- Decision log: `docs/DECISIONS.md` · Progress/measurements: `docs/PROGRESS.md` · Perf: `docs/PERF.md`
- Engine choice + benchmark: `docs/ENGINE_DECISION.md` · Release/signing: `docs/RELEASE.md`
- Device feel checklist: `docs/PLAYTEST_CHECKLIST.md`

User communication: **Turkish**. Code, comments, commits: **English** (Conventional Commits).
In-game text via i18n: TR (default), EN, AR (RTL).

---

## 1. Stack

Vite 8 + TypeScript 5.9 (strict) + React 19 (menus/HUD as DOM overlay only) + **PixiJS 8** (single game canvas)
+ Capacitor 8 (Android, JDK 21). Vitest 5 (unit), Playwright 1.56.1 (E2E, preinstalled Chromium).

## 2. Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Lint / typecheck | `npm run lint` / `npm run typecheck` |
| Unit tests (Node) | `npm test` |
| Build web (→ `dist/`) | `npm run build` |
| E2E (Pixel 7 landscape, touch; needs build) | `npm run e2e` → screenshots in `e2e/out/` |
| All gates | `npm run check` |
| Engine benchmark | `npx vite build -c bench/vite.config.ts && npm run bench:engines` |
| Debug APK | CI only (no Android SDK reachable from the cloud container): push → Actions "Android APK" → artifact |
| Signed release | push tag `v*` (secrets described in `docs/RELEASE.md`) |

Never run `playwright install` locally (Chromium is preinstalled; version pinned to 1.56.1).
Dev URL overrides: `?silent&map=96&seed=5&renderScale=0.25&cls=heavy`.

## 3. Architecture

```
src/sim      Deterministic, DOM-free simulation core (fixed 60 Hz). Runs in Node (headless tests/balance).
             rng.ts (sfc32, serializable) · dmath.ts (polynomial sin/cos/atan2) · input.ts (quantized/packed input)
             sim.ts (movement, charge state machine, shells, splash, respawn, events) · collision.ts · hash.ts
src/world    iso.ts (2:1 projection, joystick screen→world) · terrain.ts · map.ts (SoA tile map, ramps, cliffs)
             noise.ts (seeded simplex) · generator.ts (procedural maps + validateMap) · reach.ts (flood fill, Dijkstra)
src/ai       dummyBot.ts (placeholder bots for phase 3; real AI in phase 7)
src/core     loop.ts (fixed step + interpolation) · keyboard.ts · save.ts/storage.ts (versioned schema)
             platform.ts (Capacitor App/Haptics/Splash) · errorlog.ts · frameStats.ts
src/render   worldRenderer.ts (painter-ordered iso ground, cliffs, ramps, fringes, features) · terrainArt.ts
             tankArt.ts + tankView.ts (sprite-stacked pseudo-3D tanks) · fx.ts/fxTextures.ts (pooled particles) · camera.ts
src/audio    Procedural Web Audio (sfx, engines per class, charge tone, ambience, music, positional + muffled)
src/scenes   GameScene.ts = Pixi app + loop + sim + bots + fx/audio/haptics wiring
src/ui       React screens (menu, class select, settings, game view/HUD) + touchControls.ts (multi-touch DOM)
src/data     tanks.json · combat.json · terrain.json — all gameplay tuning, no constants in code
src/i18n     tr/en/ar JSON + t()
tests/       Vitest     e2e/  Playwright (smoke, controls, perf gate)     bench/  engine spike     tools/  art/audio preview checks
android/     Capacitor project (committed): sensorLandscape, immersive, keep-screen-on, no INTERNET permission
```

## 4. Rules

- `src/sim`, `src/world`, `src/ai` must stay deterministic: no `Math.random/sin/cos/atan2/pow…`, no `Date.now`, no DOM
  (ESLint enforces; `src/world/iso.ts` is exempt because it is render-side). Use `Rng` and `dmath`.
- Sim positions are tile units; iso projection only in the render layer.
- Input reaches the sim only as quantized `PlayerInput` (ints) → replay = seed + packed input stream.
- Visibility (`VisibilitySystem`, phase 4) will be the single source of truth for render, AI, targeting and audio.
- Pool objects in hot paths; no per-frame allocations in sim/render loops.
- Gameplay numbers live in `src/data/*.json`.
- "Done" requires evidence: lint + typecheck + unit + E2E + screenshots inspected + `docs/PROGRESS.md` updated.
  Never report something as working without running it.

## 5. Git workflow

- The cloud session can only push to **`claude/tanky-tunky-setup-dw06hp`** (D-001), so phases are separated by
  commits instead of `phase/NN-*` branches. Moving to a `main` + PR-per-phase flow needs the owner's confirmation.
- CI (`.github/workflows/ci.yml`) runs on every push; debug APK on `main` and `claude/**`; signed release on tags.

---

## 6. Status — what has been done

### Phase 0 — Engine decision ✅
- Benchmarked PixiJS 8 vs Phaser 4 on the same scene (96×96 iso map, 200 objects, fog mask) under Playwright with 4x CPU throttling.
- At equal pixel count: **Pixi 60 FPS (p95 23.9 ms) vs Phaser 4 30 FPS (p95 53.3 ms)**; Pixi bundle 2.4–4.5x smaller.
- Caveat: the cloud container has no GPU (SwiftShader), so full-resolution FPS (~7 for both) does not predict phones.

### Phase 1 — Skeleton ✅ (commit `eae030a`, CI green, debug APK ≈ 4 MB)
- Deterministic sim core, fixed 60 Hz loop with interpolation, iso math, save schema + migration, i18n TR/EN/AR.
- React shell: menu, settings, pause, error boundary, "rotate device" guard.
- Capacitor Android: landscape lock, immersive, keep-screen-on, cutout support, no INTERNET permission,
  committed debug keystore (updates install over each other), release signing from secrets.
- GitHub Actions: lint → typecheck → unit → build → E2E; debug APK with 40 MB budget check; tagged signed APK/AAB.

### Phase 2 — Isometric world 🟡 (logic done and tested; rendering being finished)
- Done and tested:
  - Terrain model: grass/dirt/sand/mud/shallow/deep water; forest/rock/wall/crate/ruins/gate/bridge; 3 elevation levels; directional ramps.
  - Generator: seeded, point-symmetric (fair by construction), river with bridges/fords, lakes, plateaus with ramps, ruins, bases with cover/torches/spawns, 3 objectives, connectivity repair, daily seed.
  - `validateMap`: reachability of spawns/bases/objectives, no isolated regions, objective distance and cover fairness.
  - Fuzz test: 300 seeds × 40/64 plus 30 seeds × 96 all pass.
  - Tank vs terrain collision with sliding; cliffs block, ramps only along their direction; terrain speed multipliers.
- In progress:
  - `worldRenderer.ts` (painter order, cliffs, ramps, transition fringes, animated water, decals, z-sorted features) is written.
  - The procedural terrain art (`terrainArt.ts`) is being built and visually verified by a sub-agent.

### Phase 3 — Tank & controls 🟡 (sim done and tested; integration pending)
- Done and tested (combat unit tests):
  - Charged fire state machine: tap shot, hold to charge (0–100 %), "perfect" window bonus, overheat lock, slowdown while charging.
  - Scaling curves in `combat.json` (damage 1x→3x, speed, range, radius, knockback).
  - Shells: Heavy ricochets once; Artillery arcs over obstacles with min range and charge-controlled distance.
  - Splash damage, armor, knockback, uphill miss chance, destructible crates/walls/gates, tank–tank pushing, kills/deaths, respawn.
- Written, not yet run end-to-end:
  - `touchControls.ts`: floating joystick (dead zone, smoothing, sensitivity), FIRE hold-to-charge ring with drag-to-aim, ABILITY button, left-handed mode, independent pointer IDs for multi-touch.
  - GameScene wiring: aim assist, muzzle/explosion/spark/smoke/debris/track/dust particles, damage numbers, HP bars, recoil and hit flash, camera shake and zoom-out while charging, haptics by charge level.
  - HUD (HP, score, respawn) and class select screen.
  - Placeholder bots: 2 vs 3 match.
- In progress: the procedural audio engine (`src/audio/`) is being built and verified by a sub-agent.
- The current HEAD (`9bf3767`, WIP) does **not** typecheck in CI yet, because `GameScene` already imports the audio module, which is not committed. This is the next thing to fix.

## 7. Next steps (immediate)

1. Integrate the finished terrain art + audio modules, then make typecheck, lint and all unit tests pass.
2. Run E2E specs:
   - `smoke` (menu → match → move → pause)
   - `controls` (3-finger joystick + charge + ability via CDP touch)
   - `perf` (96×96 map at CPU 4x, gate p95 < 22 ms with a 0.25 backbuffer)
3. Inspect the screenshots for sorting, cliffs, fog, UI overflow and charge ring, and fix what looks wrong.
4. Commit, get CI green, and produce the debug APK.
5. Update `docs/PROGRESS.md` and `docs/PERF.md`.
6. **STOP after phase 3:** hand the APK to the owner for the on-device feel test (`docs/PLAYTEST_CHECKLIST.md`) and wait for feedback.

## 8. Roadmap (remaining phases, brief §14)

| Phase | Content | Key deliverables / gates |
|---|---|---|
| 4 Vision | Fog of war, tile shadowcasting LOS at 15–20 Hz, forest concealment, elevation +1 vision, explored "memory", `VisibilitySystem` API, quality levels | LOS unit tests (known patterns, symmetry, budget); invisible enemies not rendered/targetable; low-res fog texture upscaled through the iso transform (prototyped in bench) |
| 5 Classes & Trapper map | 5 classes fully distinct; abilities: Scout dash, Heavy siege (+40 % armor, ricochet), Standard shield, Artillery over-obstacle fire, Trapper full map; top-left minimap with red enemy dots + heading notch; full-map mode | E2E screenshot proving red dots on minimap; jitter for enemies in forest/high ground |
| 6 Traps | Mine, mud net, spiked barrier, alarm beacon, hologram decoy, smoke bomb; `traps.json`; max 6, per-type cooldown, 0.8 s placement, invisible to enemies (faint glow ≤1.5 tiles), notifications + minimap ping | Trap rule unit tests |
| 7 AI | FSM/behaviour tree (patrol → suspicion → chase → attack → retreat → cover), same fog rules (no cheating), A* with terrain cost, path smoothing, avoidance, class roles, difficulty levels | Replaces `dummyBot.ts` |
| 8 Headless sim & balance | Node match runner, thousands of bot-vs-bot games over all class combos, `docs/BALANCE_REPORT.md`, auto-tune `tanks.json` until every class is within 45–55 % win rate | Deterministic replay check (same seed + input = same match) |
| 9 Modes & progression | Campaign (12 levels, boss every 4, Tiled JSON maps), Survival waves + roguelite cards, Team Battle 3v3/5v5, Quick Match, Daily Challenge (date seed, local leaderboard), upgrades (armor/engine/gun) with credits, save, replays | |
| 10 Polish | Weather + day/night affecting vision, torches, menus, settings, 3-minute tutorial, accessibility (colour-blind markers, high-contrast fog edge, shake reduction), performance work | Perf gate in CI |
| 11 Release | Signed release APK/AAB, README with screenshots, docs (balance guide, how to add tanks/maps/traps), tag v1.0.0 | Definition of Done (brief §15) |

## 9. Known risks / open questions

- **No INTERNET permission.** Capacitor serves local assets via request interception, which should not need it. This must be confirmed on a real device (blank screen = add the permission back).
- **No GPU in cloud CI.** The perf gate uses a fill-rate-normalised backbuffer. Real-device FPS must be recorded by hand in `docs/PERF.md`.
- **Object occlusion by plateaus.** Objects standing behind a raised plateau can draw over its edge (ground and objects are separate layers). Revisit in phase 10 if it is noticeable.
- **Git flow.** Moving to `main` + PRs is pending the owner's decision (D-001).
