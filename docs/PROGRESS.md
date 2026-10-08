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

## Open questions for the owner
- Git flow: the session can only push `claude/tanky-tunky-setup-dw06hp`. Should this branch be merged into a new `main` via PR (and later phases go through PRs)? See D-001.
