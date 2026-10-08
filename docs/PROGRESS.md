# Progress

## Phase 0 — Engine decision (2026-10-08) ✅
- Benchmark spike for PixiJS 8 vs Phaser 4 (96×96 iso map, 200 objects, fog mask) measured under Playwright with CPU 4x throttle.
- Decision: PixiJS 8 — see `ENGINE_DECISION.md`.

## Phase 1 — Skeleton (2026-10-08)
Works (verified locally):
- `src/sim`: deterministic core — sfc32 `Rng` with serializable state, polynomial `dsin/dcos/datan2`, quantized/packed `PlayerInput`, `step()` with bounded acceleration and hull/turret turning, state hashing. ESLint forbids non-deterministic APIs in `src/sim`.
- Fixed 60 Hz loop with interpolation, catch-up cap, pause and clock reset (unit tested).
- Isometric projection helpers incl. joystick screen→world direction (unit tested).
- React shell: menu, settings (language TR/EN/AR with RTL, quality, FPS cap, handedness, sound, haptics, shake), pause overlay, error boundary + local error log, portrait "rotate device" guard.
- Versioned save schema with migration; Capacitor Preferences with localStorage fallback.
- Pixi game scene: culled iso ground, pseudo-3D sprite-stacked tank, smooth camera with look-ahead and shake, WASD/mouse dev controls.
- Capacitor Android project: `sensorLandscape`, sticky immersive mode, keep-screen-on, display cutout, INTERNET permission removed, persistent debug keystore, release signing from env/secrets.
- CI workflows: lint → typecheck → unit → build → Playwright E2E (+ screenshots artifact); debug APK + 40 MB budget; tag → signed APK/AAB.
- Gates run locally: lint ✅, typecheck ✅, 27 unit tests ✅, build ✅ (≈470 kB main chunk / 144 kB gzip), E2E smoke ✅ (screenshots inspected: menu and in-game render correctly).

Not verified yet / known gaps:
- APK build can only run in GitHub Actions (no Android SDK reachable from the cloud container) — status in the CI section below.
- No INTERNET permission: Capacitor serves assets via request interception, which should not need network permission; must be confirmed on a device.
- In-browser FPS in the cloud container is not representative (no GPU, SwiftShader).

## Phase 2 — Isometric world (2026-10-08) ✅
Works (verified):
- Seeded, point-symmetric generator (40/64/96): river with bridges/fords, lakes, mud/sand, plateaus (3 levels) with directional ramps, forests, rocks, ruins with destructible walls/gates, bases with cover + torches + spawns, 3 objective zones, daily seed.
- Validation + fuzz: 300 seeds × 40/64 and 30 × 96 — all reachable, fair, no isolated regions or boxed-in spawns.
- Renderer: painter-ordered ground with elevation, cliff faces, ramps, terrain fringes, animated water, decals, z-sorted features; procedural painted art (sub-agent, ~0.9 MP of canvases, cold build ≈ 330 ms in the slow container).
- Screenshots inspected: `docs/img/phase2-world.png` (no seams, cliffs aligned, correct occlusion of tanks behind walls).
Known gaps: a few sand specks remain inside lakes; objects behind a raised plateau can draw over its edge (layering); gate damaged art has one orientation.

## Phase 3 — Tank & controls (2026-10-08) ✅ — waiting for device feel test
Works (verified headless):
- Multi-touch: floating joystick + hold-to-charge FIRE (drag to aim) + ABILITY simultaneously — Playwright CDP 3-finger test passes; screenshot `docs/img/phase3-multitouch.png`.
- Charged fire: tap/charge/perfect/overheat, slowdown while charging, 1x→3x scaling; Heavy ricochet, Artillery arc + min range, splash, knockback, destructibles, respawn — 16 sim tests.
- Feel layer: recoil, muzzle flash/smoke, explosions (flash, shockwave, fire, smoke, debris, scorch), sparks, damage numbers (gold on big hits), HP bars, track marks + dust, camera shake + zoom-out while charging, haptics by charge level, procedural audio (35 sfx, 5 engine voices, charge tone, ambience, music) — `docs/img/phase3-combat.png` shows a perfect charged Heavy shot dealing 118 (= 38×3×1.15×0.9).
- Temporary class select (all 5 classes playable), placeholder bots (2 v 3).
- Perf gate: 96×96, CPU 4x → 60 FPS, p95 16.7 ms (after profiling fix, see PERF.md).
- Gates: lint ✅ typecheck ✅ 65 unit ✅ 6 E2E ✅ perf ✅.
Not done / to verify on device: abilities (owner will define them — `docs/TANKS.md`), real AI (phase 7), fog of war (phase 4), real-device FPS, haptics and audio feel, no-INTERNET-permission WebView behaviour.

## Open questions for the owner
- Abilities per class: owner will fill `docs/TANKS.md`.
- Git flow: the session can only push `claude/tanky-tunky-setup-dw06hp`. Should this branch be merged into a new `main` via PR (and later phases go through PRs)? See D-001.
