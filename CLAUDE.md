# Tanky Tunky — Claude working notes (START HERE)

Offline, landscape-only Android isometric tank game (React + Vite + TypeScript + PixiJS + Capacitor).
3v3 Quick Match against bots on procedural maps, charged shots, class abilities, crate upgrades.
The owner plays the debug APK on a phone and sends feedback in rounds; Claude implements them.

**A new session (phone, desktop, any device) continues from this file alone.** Read §0 and §1 first, then
`docs/PROGRESS.md` (latest round) and `docs/DECISIONS.md` (last entries).

---

## 0. Owner rules — always follow

1. **Talk to the owner in Turkish.** Code, comments, commits, docs: English (Conventional Commits). README: Turkish.
2. **Plan first, then wait for "uygula".** When the owner lists changes: collect them, show a short plan
   (tables of current → planned values when numbers change), ask the open questions, and **change nothing until the
   owner says "uygula" / "uygulamaya başla" / "yap"**. A message that only asks a question or asks for a table
   is never permission to edit files.
3. **Every change updates the docs in the same commit/PR** (owner request, 2026-10-09):
   - `CLAUDE.md` §1 (current state, PR chain, latest APK, pending decisions) and §7 (next steps),
   - `docs/PROGRESS.md` (round section: what was done + evidence + "to try on the phone"),
   - `docs/DECISIONS.md` (one D-xxx row per decision, with the reason),
   - `docs/TANKS.md` when any tank/ability number changes, `docs/BALANCE_REPORT.md` when balance is measured,
   - `docs/PLAYTEST_CHECKLIST.md` when something new can be felt on the phone, `docs/PERF.md` after perf work,
   - `README.md` when features visible to players change.
4. **Never change balance numbers on your own.** Measure and report; the owner decides.
5. **Never merge PRs or push to someone else's branch without the owner saying so.**
6. Done = lint + typecheck + unit + E2E + screenshots inspected + docs updated + CI green + APK link given.
   Never report something as working without running it.
7. At the end of a round give the owner a short Turkish report: what changed, the APK link (Actions → "Android APK"
   run → Artifacts), what to try on the phone, open questions.

## 1. Where we are now (update every round)

- **Last finished round:** Round 03 (2026-10-09) — see `docs/PROGRESS.md`.
- **Branches / PRs (stacked, not merged yet):**
  `claude/tanky-tunky-setup-dw06hp` (default, phase 0–3) ← PR #1 `fix/round-01-core-loop` ← PR #2
  `fix/round-02-feedback` ← PR #3 `fix/round-03-maps` (newest code). Merge order: #1 → #2 → #3.
  - Until they are merged, **start new work from the newest round branch** (`fix/round-03-maps`):
    `git fetch origin fix/round-03-maps && git checkout -b fix/round-04-<topic> origin/fix/round-03-maps`,
    and open the PR against that branch (base = previous round). After the owner merges, branch from the default.
- **Latest debug APK:** Android APK run #15 (round 03) — Actions → "Android APK" → newest run → Artifacts.
  Signed with the committed debug key (`keystore/debug.sha256`); CI fails if the signature differs (D-035).
  The owner must uninstall **once** after D-035, then every newer APK installs over the old one.
- **Pending owner decisions:**
  1. Artillery is weak (≈22 % win rate): it deals ~131 damage per shot vs 780 listed (shells land at the blast
     edge). Proposal: full damage in the inner half of the blast radius, or landing correction. Not applied.
  2. Heavy is strong (≈63–67 %): remaining lever is its hp (5500, owner's anchor) or Rumble.
  3. Ability trees: cards show "Yakında"; owner will design them.
  4. Tank art: owner may supply Nano Banana images or 3D models (.glb from Meshy/Tripo/TRELLIS) → render
     16–32 angles into sprite sheets (hull and turret separate). Not started.
  5. Trapper class is disabled (`enabled: false`), may come back later.

### Current game (round 03)
| Topic | State | Data / code |
|---|---|---|
| Classes | Scout (Çevik), Heavy (Ağır), Standard (Dengeli), Artillery (Topçu); Trapper disabled | `src/data/tanks.json`, `docs/TANKS.md` |
| Scale | hp/damage ×25 of the original (Heavy hp 5500) | D-027 |
| Abilities | Hide, Rumble, Swift, Barrage (6 shells in 1 s), Mine (Trapper only) | `src/data/abilities.json`, `src/sim/abilities/` |
| Match | 3v3 Quick Match, 5 minutes, 3-2-1 countdown, respawn 2 s + 2 s protection, K/D scoreboard | `src/data/match.json` |
| Maps | Desert ruins (default), Modern city, Forest/river (original) — chosen on the tank-select screen | `src/world/themes.ts`, `generator.ts` |
| Visibility | No darkening, everything visible; enemy in forest only within 3 tiles (40 % opacity); Hide = invisible | `src/data/vision.json`, D-037 |
| Crate upgrades | +5 % hp and damage per pickup, max +60 %, lost on death, crates rebuild after 45 s | `combat.json → upgrades`, `src/sim/upgrades.ts` |
| Regeneration | 5 s out of combat → +5 % max hp every 5 s | `combat.json → regen` |
| Bots | Kolay/Normal/Zor/Ekstrem (first shot 5/3/1/0 s after an enemy is in range), allies use the same level | `src/data/ai.json`, `src/systems/ai/bot.ts` |
| Auto-aim | nearest visible enemy, 10 % hysteresis; touch manual aim needs a 60 px drag and ends on release | `targeting.ts`, `touchControls.ts` |
| UI | swipeable tank cards (numbers from data), map + difficulty selectors, ability countdown ring, upgrade chip | `src/ui/` |
| Save | schema v4 (settings incl. difficulty + mapTheme, records) | `src/core/save.ts` |

## 2. Stack

Vite 8 + TypeScript 5.9 (strict) + React 19 (menus/HUD as DOM overlay only) + **PixiJS 8** (single game canvas)
+ Capacitor 8 (Android, JDK 21). Vitest 5 (unit), Playwright 1.56.1 (E2E, preinstalled Chromium).

## 3. Commands

| Task | Command |
|---|---|
| Install | `npm ci` |
| Dev server | `npm run dev` |
| Lint / typecheck | `npm run lint` / `npm run typecheck` |
| Unit tests (Node) | `npm test` |
| Build web (→ `dist/`) | `npm run build` |
| E2E (Pixel 7 landscape, touch; needs build) | `npm run e2e` → screenshots in `e2e/out/` |
| Perf gate (96×96, CPU 4x) | `npm run e2e:perf` |
| All gates | `npm run check` |
| Balance sim (headless bots) | `npx tsx tools/balance.ts 300 40 hard desert` (args: matches, size, level, theme) |
| Round screenshots | `npx playwright test e2e/round03.spec.ts --project=mobile-landscape` → `docs/screens/round-03/` |
| App icon (SVG → all Android sizes) | `npm run icons` |
| Debug APK | CI only (no Android SDK in the cloud container): push → Actions "Android APK" → artifact |
| Signed release | push tag `v*` (secrets described in `docs/RELEASE.md`) |

Never run `playwright install` (Chromium is preinstalled; version pinned to 1.56.1).
Dev URL overrides: `?silent&theme=desert|city|forest&map=40|64|96|debug_heights&seed=5&cls=heavy&diff=hard&bots=idle|enemies&endless&dur=20&renderScale=0.25&view=20,20&zoom=0.4`.

## 4. Architecture

```
src/sim      Deterministic, DOM-free simulation core (fixed 60 Hz). Runs in Node (headless tests/balance).
             rng.ts (sfc32) · dmath.ts (polynomial sin/cos/atan2) · input.ts (quantized input) · sim.ts (step)
             tank.ts (move/fire/charge) · combat.ts (shells, explosions, kill log) · targeting.ts (auto-aim)
             visibility.ts (full visibility + forest/Hide rules; LOS kept in vision.los for spawn safety)
             match.ts (timer, respawn) · upgrades.ts (crate pickups, regen) · abilities/ (data + modules) · collision.ts
src/world    terrain.ts · map.ts (SoA tile map, theme) · passability.ts (THE movement rule) · generator.ts (forest map +
             validateMap) · themes.ts (desert/city generators) · mapLoader.ts · reach.ts · noise.ts · iso.ts
src/systems/ai  AiBot: A* nav (throttled) + FSM, difficulty levels, ability habits, pickup seeking (data/ai.json)
src/game     matchSetup.ts: match setup, headless runner, scoreboard (scene, tests, tools/balance.ts)
src/core     loop.ts · keyboard.ts · save.ts/storage.ts (versioned) · platform.ts (Capacitor) · frameStats.ts
src/render   worldRenderer.ts (baked ground + culled features) · terrainArt.ts (all procedural tile/feature art)
             tankArt.ts + tankView.ts (sprite-stacked tanks) · overlays.ts · fx.ts · fogLayer.ts (LOS mode only) · camera.ts
src/audio    Procedural Web Audio
src/scenes   GameScene.ts = Pixi app + loop + match + fx/audio/haptics wiring
src/ui       React screens (menu, ClassSelect cards, settings, GameView HUD, results) + touchControls.ts
src/data     tanks · combat · abilities · ai · match · vision · terrain · traps (.json) — ALL gameplay numbers
src/i18n     tr/en/ar JSON + t()
tests/       Vitest suites     e2e/  Playwright (smoke, controls, visual, round01-03, perf)     tools/  balance, icons, profiling
android/     Capacitor project (committed), keystore/ debug key (committed) + debug.sha256
```

## 5. Technical rules

- `src/sim`, `src/world`, `src/systems` stay deterministic: no `Math.random/sin/cos/atan2/pow…`, no `Date.now`, no DOM
  (ESLint enforces; `src/world/iso.ts` is render-side). Use `Rng` and `dmath`; roll random values **once per mirrored
  tile pair** in map generators (symmetry test catches it).
- Sim positions are tile units; iso projection only in the render layer. Input reaches the sim only as `PlayerInput`.
- Gameplay numbers live in `src/data/*.json`; UI cards read them, so docs/TANKS.md must be updated by hand.
- Pool objects in hot paths; no per-frame allocations in sim/render loops. Perf gate: p95 frame < 22 ms at CPU 4x.
- Tests: unit arenas default to line-of-sight vision (`rules.fullVisibility=false`); the game default is full visibility.

## 6. Git / CI

- Branch per round: `fix/round-NN-<topic>`, PR into the previous round's branch until merged (see §1).
- `.github/workflows/ci.yml`: lint → typecheck → unit → build → E2E → perf gate, on every push and PR.
- `.github/workflows/android-apk.yml`: debug APK on pushes to `main`, `claude/**`, `fix/**`, `phase/**`;
  versionCode = run number; verifies the signer SHA-256; 40 MB size budget. `release.yml`: signed APK/AAB on tags.
- Commit trailer and session link are added by the harness; never put model names in commits/PRs.

## 7. Next steps (update every round)

1. Owner tests APK #15 on the phone (`docs/PLAYTEST_CHECKLIST.md`) and sends round-04 feedback.
2. Owner decides on Artillery (blast rule) and Heavy (hp / Rumble) — see §1 pending decisions.
3. Owner merges PRs #1 → #2 → #3 (then new rounds branch from the default branch).
4. Ability trees (cards already have the slot; upgrades are modifier lists, D-023).
5. Tank art pipeline from owner images / 3D models (procedural art stays as fallback).
6. Later (brief §14): modes & progression (campaign, survival, daily challenge, credits/upgrades), polish
   (tutorial, accessibility, weather/day-night), release (signed AAB, README screenshots, v1.0.0).

## 8. History (one line per step; details in docs/PROGRESS.md)

| Step | Date | Result |
|---|---|---|
| Phase 0 | 2026-10-08 | Engine benchmark → PixiJS 8 (`docs/ENGINE_DECISION.md`) |
| Phase 1 | 2026-10-08 | Skeleton: sim core, loop, save, i18n, Capacitor, CI, debug APK |
| Phase 2 | 2026-10-08 | Procedural iso world (forest/river), cliffs, ramps, painted art |
| Phase 3 | 2026-10-08 | Tanks, charged combat, multi-touch controls, fx/audio |
| Round 01 | 2026-10-08 | Visibility system, auto-aim, readable heights, fog-fair AI, 60 s matches, 5 abilities (PR #1) |
| Round 02 | 2026-10-09 | ×25 scale, 5-min matches, tank cards, ability indicator, bot difficulty, aim fix, icon, balance B (PR #2) |
| Round 03 | 2026-10-09 | Signing fix, Trapper off, full visibility, crate upgrades, regen, desert + city maps (PR #3) |

## 9. Doc map

| File | Purpose |
|---|---|
| `README.md` | Turkish overview for people opening the repo |
| `docs/GAME_BRIEF.md` | Original brief from the owner (source of intent; later owner decisions override it) |
| `docs/PROGRESS.md` | Per-phase/round log with evidence and phone-test notes |
| `docs/DECISIONS.md` | Every decision D-001… with reasons |
| `docs/TANKS.md` | Tank, damage, charge and ability tables (Turkish) |
| `docs/BALANCE_REPORT.md` | Bot-vs-bot simulation results per round |
| `docs/PLAYTEST_CHECKLIST.md` | What to check by hand on the phone |
| `docs/PERF.md` | Performance gate method and measurements |
| `docs/RELEASE.md` | Signing, releases, update errors on the phone |
| `docs/ENGINE_DECISION.md` | Engine comparison |
| `docs/screens/round-NN/` | Inspected screenshots per round |

## 10. Known risks

- **No INTERNET permission** — must be confirmed on a real device (blank screen = add it back).
- **No GPU in cloud CI** — perf gate uses a fill-rate-normalised backbuffer; real-device FPS must be noted by hand.
- **Object occlusion** — tall buildings / plateau edges can hide tanks behind them (no see-through yet).
- **Busier fights since round 03** — JS work per frame ~+2 ms vs round 02 (CPU 4x, 96×96); keep an eye on the perf gate.
