# Tanky Tunky — Claude working notes

Offline, landscape-only Android isometric tank game with fog of war and asymmetric vision.
Full brief: `docs/GAME_BRIEF.md` (source of truth). Decisions: `docs/DECISIONS.md`. Status: `docs/PROGRESS.md`.
User communication: **Turkish**. Code, comments, commits: **English** (Conventional Commits).

## Stack
Vite 8 + TypeScript 5.9 (strict) + React 19 (menus/HUD DOM only) + **PixiJS 8** (game canvas) + Capacitor 8 (Android, JDK 21).
Engine choice is evidence-based: `docs/ENGINE_DECISION.md`, spike in `bench/`.

## Commands
| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Lint / typecheck | `npm run lint` / `npm run typecheck` |
| Unit tests (Vitest, Node) | `npm test` |
| Build web | `npm run build` (→ `dist/`) |
| E2E (Playwright, Pixel 7 landscape, touch) | `npm run e2e` (needs `npm run build` first; screenshots → `e2e/out/`) |
| Everything | `npm run check` |
| Engine benchmark | `npx vite build -c bench/vite.config.ts && npm run bench:engines` |
| Debug APK | CI only (no Android SDK in the cloud container): push → Actions "Android APK" artifact |
| Signed release | push tag `v*` (see `docs/RELEASE.md`) |

Playwright: use the preinstalled Chromium (`@playwright/test` pinned to 1.56.1 = chromium-1194). Never run `playwright install` locally.

## Architecture
```
src/sim      deterministic, DOM-free simulation core (fixed 60 Hz). Runs in Node for headless tests/balance sims.
src/core     loop (fixed step + interpolation), input, storage/save schema, platform (Capacitor) wrappers, error log
src/world    isometric math, tile map, procedural generator
src/render   Pixi views: camera, ground layer (culled pool), sprite-stacked tanks, fog overlay, fx
src/scenes   GameScene = Pixi app + loop + sim wiring
src/ui       React screens/HUD (DOM overlay over the canvas)
src/data     JSON tuning (tanks.json, traps.json …) — no gameplay constants in code
src/i18n     tr (default) / en / ar (RTL)
tests/       Vitest unit/property tests     e2e/  Playwright     bench/  engine spike
```

## Rules
- `src/sim` must stay deterministic: no `Math.random/sin/cos/atan2/pow…`, no `Date.now`, no DOM (ESLint enforces). Use `Rng` and `dmath`.
- Sim positions are tile units; iso projection only in render (`src/world/iso.ts`).
- Inputs reach the sim only as quantized `PlayerInput` (ints) → replays = seed + packed input stream.
- Visibility (`VisibilitySystem`, phase 4) is the single source of truth for render, AI, targeting, audio.
- Pool objects in hot paths; no per-frame allocations in render/sim loops.
- Every phase: lint + typecheck + unit + e2e + screenshots inspected + docs/PROGRESS.md updated before "done".
- Git: develop on the session branch `claude/tanky-tunky-setup-dw06hp` (D-001).

## Phase status
- [x] 0. Brief, engine benchmark, decision (PixiJS 8)
- [x] 1. Skeleton (sim core, fixed-step loop, React shell, Capacitor Android landscape/immersive, CI + APK workflows)
- [ ] 2. Isometric world  - [ ] 3. Tank & controls (→ stop for device feel test)  - [ ] 4. Vision
- [ ] 5. Classes & Trapper map - [ ] 6. Traps - [ ] 7. AI - [ ] 8. Headless balance - [ ] 9. Modes - [ ] 10. Polish - [ ] 11. Release
