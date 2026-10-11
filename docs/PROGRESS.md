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

## Round 03 — maps, upgrades, regen, visibility (branch `fix/round-03-maps`, 2026-10-09)

| Job | Status | Evidence |
|---|---|---|
| Signing fix (D-035) | ✅ | explicit debug signing + CI signer check (run #14 verified `05278fc8…`) |
| Trapper removed, Scout hp 2200 (D-036) | ✅ | 4 cards on the select screen (e2e round03/06) |
| Full visibility + forest translucency (D-037) | ✅ | `tests/visibility.test.ts` full-visibility suite; `03-forest-concealment.png` |
| Crate upgrades (D-038) | ✅ | `tests/upgrades.test.ts`; `04a/04b-*.png` |
| Regeneration (D-039) | ✅ | `tests/upgrades.test.ts`; `05-regen.png` |
| Desert + city maps, selector (D-040) | ✅ | `tests/themes.test.ts` (30 seeds each); `01/02-*.png`, `06-select-map.png` |
| Balance | 🟡 reported | BALANCE_REPORT round 03 (Artillery 22 %, Heavy 63–67 %) |

Gates: lint ✅ typecheck ✅ unit 140 ✅ E2E 25 ✅ perf ✅ (p95 16.8 ms; JS work ~9 ms locally, ~+2 ms vs round 02 from busier fights).

To try on the phone: uninstall once (signature fix), then install; both new maps; picking up upgrades from crates; regen after leaving a fight; enemies in trees.

## 2026-10-11 — cloud hand-off note reconciled (docs only, no game code)

The owner ran a second (cloud) session that only saw the default branch (`5b8654e`, phase 3) and wrote a hand-off note.
Checked against the round branches:
- Already done in PR #1–#3 (the note could not see them): Trapper disabled, Hide and Rumble abilities, auto-aim,
  readable heights, fog-fair AI ("wandering enemy"), 60 s → 5 min matches, respawn elsewhere, scoreboard, signing fix.
- Not done: ability trees; the owner's 4 tank images are not in the repo.
- Real gap found: since full visibility (D-037) auto-aim can lock an enemy outside the screen (work stream A).
- New owner requests from the cloud chat (menu, campaign, progression, multiplayer, two abilities per tank, Scout spray fire,
  art pipeline) recorded as pending decisions in `CLAUDE.md` §1 and as proposals in `docs/TANKS.md`.
- `docs/changelog` merged: `docs/CHANGELOG.md` + `npm run log` + changelog-check workflow (D-043).
- Verification: docs only; `npm run lint` / `npm run typecheck` run after the merge.

## Round 04 (2026-10-11) — Artillery +25 %, aim fix, two abilities per tank, Scout spray, new menu

Branch `fix/round-04-balance-aim-skills` (from the merged default branch). Owner "uygula": B1, A, C, B; D–G not started (see below).

| Item | State | Evidence |
|---|---|---|
| B1 Artillery +25 % blast damage | ✅ | `combat.json shell.artilleryDamageMul`; test in `tests/combat.test.ts` |
| A auto-aim only on screen | ✅ | `SimState.view` + `targeting.onScreen`; 2 unit tests + e2e 03 (enemy 22 tiles away is ignored, enemy 3 tiles away locked) |
| C skill + ultimate per tank, Scout spray, Scout speed 5.0 | ✅ | `BTN_ULT`, `Tank.ult`, `Tank.stun`, abilities overdrive/repair/emp/readyshot; 6 unit tests, e2e 01–04, screenshots `docs/screens/round-04/` |
| B menu: Tek Oyunculu (Hızlı Maç, Kampanya/Garaj "Yakında") / Çok Oyunculu ("Yakında") / Ayarlar | ✅ skeleton | e2e 05, `08-menu-solo.png` |
| D campaign, E progression, F multiplayer, G art pipeline | ⏸ not started | need owner decisions K1, K2, K4 (+ images for G) |

Gates: lint ✅ typecheck ✅ unit 149 ✅ E2E 29 ✅ (all but the perf spec). **Perf gate ❌ in this cloud container: p95 66.7 ms, 26 fps — but the
unchanged default branch measures the same here (p95 66.7 ms, JS work mean 12.8 ms vs 12.5 ms with round 04)**, so it is this
machine being slower than in round 03 (16.8 ms), not round 04. CI result decides; not verified on GitHub yet.

Balance (120 matches, 3v3, 40×40, hard bots, desert; not tuned): Scout 62.0 %, Heavy 67.8 %, Standard 49.0 %, Artillery 21.9 %
(B1 barely moved Artillery: round 03 ≈ 22 %). Open: landing correction for Artillery (shells hit the blast edge), Heavy B2.

To try on the phone: second (ULT) button above-left of YETENEK; Scout hold-fire spray feel + Aşırı Yük; Ağır Gümbürtü radius 4 and Onarım;
Dengeli EMP stun; Topçu Hazır Atış then Yaylım Ateşi (45 s); turret ignores enemies off screen; new menu.

## Round 05 (2026-10-11) — campaign (D) + progression (E)

Branch `fix/round-05-campaign-progression` (from round 04, PR #4 not merged yet → this PR targets the round-04 branch).
Owner: "Oyun ile ilgili tüm planları yapmaya başla" → D + E built with the K2/K4 proposals (96×96 maps, first 3 levels,
hybrid outposts). F (multiplayer) and G (art) still wait: F needs K1 (INTERNET permission + relay or Wi-Fi), G needs the images.

| Item | State | Evidence |
|---|---|---|
| PvE structures: gun tower + HQ (`tanks.json` `pve:true`, immovable, no respawn/regen/pickups) | ✅ | `tests/campaign.test.ts` "structures never move…", tower shoots test; art in `tankArt.ts` |
| Tower controller (`TowerBot`, difficulty fire delay) + outpost guard mode for enemy tanks (`AiBot.guard`) | ✅ | unit tests; `tools/campaign-sim.ts` |
| `levels.json` (3 levels: Kum Kalesi/çöl, Beton Orman/şehir, Yeşil Cephe/orman) + `enemies.json` (threat costs, guard, spacing) | ✅ | placement test: every unit open + reachable from the player base, spacing kept |
| Mission rules: `rules.mode = 'campaign'`, win = HQ destroyed, time out = loss, team 1 no respawn, player respawns at own base | ✅ | unit tests (win / time out / stars) |
| Stars (1 win, 2 deaths ≤ N, 3 within time) + credits, unlock chain, best time | ✅ | `tests/progression.test.ts` |
| Garage: armor/engine/gun × 3 levels per tank (`progression.json`), applied to the player's tank in every mode | ✅ | unit test (boost only on tank 0); e2e 04 |
| Quick Match pays credits (5/kill, +25 for a won match) | ✅ | e2e 07 |
| Save schema v5 (campaign stars/bestTime, garage; v4 saves migrate) | ✅ | `tests/save.test.ts` |
| UI: Kampanya + Garaj buttons enabled, level list, mission HUD (objective chip under the timer, HQ hp, enemies left, HQ direction arrow), mission results | ✅ | e2e `round05.spec.ts` (7), screenshots `docs/screens/round-05/` inspected (HUD overlap with the timer found and fixed) |

Headless campaign (`npx tsx tools/campaign-sim.ts standard normal`, a bot plays tank 0): c1 won in 189 s (9 enemies),
c2 won in 236 s (13), c3 won in 349 s (15). Quick Match balance unchanged (200 matches hard/desert: Scout 63.9 %, Heavy 63.6 %,
Standard 50.5 %, Artillery 22.7 %).

Gates: lint ✅ typecheck ✅ unit 165 ✅ E2E 36 ✅ (round-04 menu test updated: Kampanya is enabled now). Perf gate in this container:
p95 33.4 ms ❌ (container is slower than CI — round 04 baseline here was 66.7 ms). **GitHub CI #43/#44 green including the perf gate (< 22 ms)**; PR #5, APK run #25.
Not verified on a phone: everything in this round.

All new numbers (tower/HQ stats, threat costs, level budgets, star limits, rewards, garage costs and %) are Claude's first proposal —
owner decides (rule 4). Assumption: HQ direction arrow on screen (part of open decision K3).

To try on the phone: Tek Oyunculu → Kampanya → Bölüm 1; find and destroy the HQ (red arrow + distance); towers shoot when you come
close; enemy tanks stay at their outposts; results stars/credits; Garaj: buy an upgrade and feel it in a match.

## Open questions for the owner

See `CLAUDE.md` §1 "Pending owner decisions" for options and proposals:
- B1 Artillery weak (≈22 %), B2 Heavy strong (≈63–67 %).
- A Auto-aim only on enemies visible on screen (bug since D-037).
- K1 Multiplayer (online / Wi-Fi / later; INTERNET permission), K2 campaign map size and level count,
  K3 map awareness after the Trapper (minimap for all? objective arrow?), K4 campaign enemy placement,
  K5 spray fire for Scout only or all, K7 Scout numbers, K8 skill + ult per tank and cooldowns,
  K9 work order, K10 merge PRs #1 → #2 → #3, K11 delete the Trapper from code or keep it disabled.
- T Ability trees, G tank art pipeline (owner's 4 images needed in the repo).
- Phone test of APK #16, including whether the update/signature error is gone after one uninstall.
