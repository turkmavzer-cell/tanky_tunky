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

## Round 01 — core loop fixes (branch `fix/round-01-core-loop`, 2026-10-08)
Screenshots (inspected): `docs/screens/round-01/` — lock-on, heights normal/strong, cliff bump, enemy attack, all 5 abilities, minimap, results.

| Job | Status | Evidence |
|---|---|---|
| 0. VisibilitySystem (prerequisite, D-015) | ✅ | `tests/visibility.test.ts` (LOS, symmetry, elevation, forest, invisibility, 10 tanks/96² < 2 ms); fog overlay in-game |
| 1. Auto turret targeting | ✅ | `tests/targeting.test.ts` (visible-only, Hide excluded, 15 % hysteresis, lock kept until out of sight, settle to hull, out-of-range turn, lead, turret speed per class); reticle `01-target-lock.png`; setting "Otomatik hedefleme" |
| 2. Heights & impassable areas | ✅ | single `isPassable` (`src/world/passability.ts`); property test on 26 maps (>50 000 edges) + `maps/debug_heights.json` cases; elevation tints, lips, base shadows, ramps without rock faces, strong hazard stripes, bump flash + haptic + click; `02/03/04-*.png` |
| 3. Enemy AI | ✅ | `src/systems/ai` (A* + FSM patrol/suspicion/chase/attack/retreat, hearing, pain, fog-fair); `tests/ai.test.ts` (attack, hears shots, forest-hidden player not tracked, invisible only within 2 tiles, retreat, paths legal, 40-match fuzz); `05-enemy-attack.png` |
| 4. 60 s match, respawn, scoreboard | ✅ | `tests/match.test.ts` + `tests/headless-match.test.ts` (countdown freeze, 60 s stop, 10 final ticks, respawn delay/protection/reset, spawn never in enemy sight, K = D, same seed = same scoreboard, ranking); HUD timer/K/D; results `11-results.png`; best K/D saved (save schema v2) |
| 5. Abilities | ✅ | `src/data/abilities.json` + `src/sim/abilities/*`; `tests/abilities.test.ts` (cooldown after effect, dev multiplier, modifiers, Hide rules, Rumble falloff/walls/no water push, Swift 2x without tunnelling, Barrage 5 warned shells + seeded scatter + slow + no normal fire, Mine limit 3 / team rule / credited kill); `06–10-*.png`; AI uses them per class |
| Balance sim | 🟡 reported, not tuned | `docs/BALANCE_REPORT.md` (300 matches; Heavy/Standard ~68 %, Artillery 27 %) — tuning left to the owner by request |

Gates: lint ✅ typecheck ✅ unit 115 ✅ E2E 16 ✅ perf ✅ (see PERF.md).

Assumptions (details in DECISIONS D-015…D-025): forest is see-through but conceals tanks inside; ramps are the only way up (`freeStep 0`); knockback can't push into water/cliffs; artillery auto-aim lands on the lead point; Quick Match is 3v3 on 40×40.

To try on the phone: auto-aim feel + reticle readability; whether cliffs/ramps are now obvious (try Settings → Engel vurgusu → Güçlü); bump flash/haptic; each ability's timing (Settings → Geliştirici → Bekleme çarpanı); 60 s match pacing and the results screen; Trapper minimap.

## Round 02 — owner feedback (branch `fix/round-02-feedback`, 2026-10-09)

| # | Job | Status | Evidence |
|---|---|---|---|
| 1 | 5-minute matches (D-029) | ✅ | `match.json duration 300`; headless match test runs the full default duration |
| 2 | Swipeable tank cards + "Yakında" ability tree (D-032) | ✅ | `src/ui/ClassSelect.tsx`; e2e round02 (swipe selects next card, every class reachable, numbers from data); `04/05/06-*.png` |
| 3 | Ability active / cooldown / ready indicator | ✅ | button ring + seconds, ready flash + click + haptic, HUD chip; e2e round02; `01/02/03-ability-*.png` |
| 4 | Bot difficulty Kolay/Normal/Zor/Ekstrem, allies included (D-030) | ✅ | `ai.json levels`; `tests/ai.test.ts` (first shot after exactly 5/3/1/0 s, delay restarts, retreat only on hard+, extreme focus fire, easy wanders); selector saved (schema v3, `tests/save.test.ts`) |
| 5 | Balance option B (D-034) | 🟡 | 3 rounds within ±20 %: Scout 48 %, Trapper 51 % ✅, Standard 56.5 % ≈, Heavy 63 %, Artillery 31.5 % ❌ — cause analysed in `BALANCE_REPORT.md`, needs an owner decision |
| 6 | Auto-aim "sometimes ignores a nearby enemy" (D-031) | ✅ | root cause: sticky manual aim after a thumb drift on FIRE; `tests/targeting.test.ts` (10 % hysteresis, out-of-range switch) + e2e controls (drift keeps auto-aim, release returns to auto-aim) |
| 7 | App icon (D-033) | ✅ | `npm run icons`; adaptive + monochrome + legacy; `07-icon-shapes.png` |

Gates: lint ✅ typecheck ✅ unit 125 ✅ E2E 19 ✅ perf ✅ (60 FPS, p95 16.7 ms).

To try on the phone: the new launcher icon; swiping the tank cards; each difficulty (Kolay should feel clumsy and slow to shoot, Ekstrem should shoot at once and gang up on a weak tank); the ability button countdown; auto-aim while holding FIRE with a moving thumb; a full 5-minute match.

## Open questions for the owner
- Balance: Heavy (63 %) and Artillery (31.5 %) are outside the band after option B — see BALANCE_REPORT (artillery blast rule / Heavy hp).
- Tank art: owner may supply 3D models (.glb) or images (Nano Banana) — pipeline to be planned.
- Git flow: the session can only push `claude/tanky-tunky-setup-dw06hp`. Should this branch be merged into a new `main` via PR (and later phases go through PRs)? See D-001.
