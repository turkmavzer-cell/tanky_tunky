# Decision Log

Small, reversible decisions taken autonomously (brief §0). Newest at the bottom.

| ID | Date | Decision | Rationale |
|---|---|---|---|
| D-001 | 2026-10-08 | All work is developed and pushed on the session branch `claude/tanky-tunky-setup-dw06hp` instead of `phase/NN-*` branches. Phases are separated by commit scope + tags in `docs/PROGRESS.md`. | The cloud session is only allowed to push to its designated branch. A `main` branch / PR flow can be switched on as soon as the owner confirms (see PROGRESS.md "Open questions"). |
| D-002 | 2026-10-08 | Engine: **PixiJS 8** as render layer (see ENGINE_DECISION.md). | Measured: lower CPU frame work and ~2x the GPU throughput of Phaser 4 at equal pixel count; 4.5x smaller bundle. Our sim/input/audio are custom anyway, so Phaser's extra subsystems would be unused weight. |
| D-003 | 2026-10-08 | React 19 is used only for menus/settings/HUD buttons (DOM overlay); the game world is a single Pixi canvas. | Brief requires React/Vite/TS/Capacitor stack; DOM gives accessible, crisp, i18n/RTL-friendly UI. React never renders per-frame game state. |
| D-004 | 2026-10-08 | Deterministic math: simulation uses only `+ - * /`, `Math.sqrt`, `Math.floor/round/abs/min/max` and our own `dsin/dcos/datan2` (polynomial) — never `Math.sin/cos/atan2/random`. | IEEE basic ops and sqrt are bit-exact across JS engines; transcendental functions are not. Needed for replay + future multiplayer lockstep. Enforced by an ESLint rule in `src/sim`. |
| D-005 | 2026-10-08 | Simulation positions are in **tile units** (float), world→screen isometric projection happens only in the render layer. | Keeps sim engine-agnostic and makes LOS/pathfinding grid math trivial. |
| D-006 | 2026-10-08 | TypeScript 5.9 (not 7.x native preview). | typescript-eslint and Vite tooling support is mature on 5.9. |
| D-007 | 2026-10-08 | Debug keystore committed at `keystore/debug.keystore` (debug key only); release keystore only via GitHub Secrets. | Brief §13 + avoids "package conflicts with existing package" on APK updates. |
| D-008 | 2026-10-08 | Tanks are rendered with **sprite stacking** (rotated top-down slices lifted per layer) instead of pre-rendered 8-direction sheets; drawn 15 % larger than their collision radius. | Smooth 360° rotation for hull and turret independently, tiny texture memory, easy recolouring per team; reads well next to 1-tile walls. |
| D-009 | 2026-10-08 | Maps are **point-symmetric** (180° rotation) for fairness; objectives are world-space zones (centre = N/2). | Fairness by construction for any seed and both even/odd sizes; validated explicitly by `validateMap` + fuzz test. |
| D-010 | 2026-10-08 | Ramps are **directional** (one lower neighbour) and the connectivity repair never re-points an existing ramp (flattens instead). | Prevents oscillating repairs; guarantees termination (heights only decrease). |
| D-011 | 2026-10-08 | World renderer relays out only when the camera moves > 80 px, with a 160 px margin. | Profiling showed Pixi batching cost dominated by off-screen sprites; margin 600 → 160 px cut p95 frame time at CPU 4x from 33 ms to 16.7 ms. |
| D-012 | 2026-10-08 | Perf gate runs as a separate Playwright project with `--workers=1`, using a 0.25 backbuffer (fill-rate normalised). | Parallel E2E tests steal CPU and made the measurement meaningless; cloud runners have no GPU (see PERF.md). |
| D-013 | 2026-10-08 | A temporary class-select screen precedes Quick Match. | Lets the owner feel-test all five classes in the phase-3 APK before abilities/AI exist. |
| D-014 | 2026-10-08 | Debug URL parameters (`?silent&map&seed&cls&renderScale&view&zoom&bots=idle`) are kept in production builds. | Needed for deterministic E2E/visual tests; harmless for players (never linked in the UI). |
