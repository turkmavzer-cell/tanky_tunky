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
