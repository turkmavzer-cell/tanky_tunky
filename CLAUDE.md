# Tanky Tunky — Claude working notes (START HERE)

Offline, landscape-only Android isometric tank game (React + Vite + TypeScript + PixiJS + Capacitor).
3v3 Quick Match against bots on procedural maps, charged shots, class abilities, crate upgrades.
The owner (Cihan) plays the debug APK on a phone and sends feedback in rounds; Claude implements them.
(Vision: since round 03 everything is visible to everyone — no fog; the old "only the Trapper sees the whole map"
design is gone with the Trapper, see D-036/D-037 and open decision K3.)

**A new session (phone, desktop, cloud — any device) continues from the repo alone:** read §0 and §1 here, then
`docs/CHANGELOG.md` (newest entries first), then `docs/PROGRESS.md` (latest round) and `docs/DECISIONS.md`.

---

## 0. Owner rules — always follow

1. **Talk to the owner in Turkish.** Code, comments, commits, technical docs: English (Conventional Commits).
   Turkish docs: `README.md`, `docs/CHANGELOG.md`, `docs/TANKS.md`.
2. **Plan first, then wait for "uygula".** When the owner lists changes: collect them, show a short plan
   (tables of current → planned values when numbers change), ask the open questions, and **change nothing until the
   owner says "uygula" / "uygulamaya başla" / "yap"**. A message that only asks a question, a table or a report is
   never permission to edit files. (Why: in round 02 Claude applied the ×25 scale and the 6-shell Barrage before the
   owner had finished listing changes; the owner asked never to start without "uygula".)
3. **Every change updates the docs in the same commit/PR** (owner request, D-042) — see §4b for the change log:
   - `docs/CHANGELOG.md` via `npm run log` (every change, fix, revert, decision, owner request, open question),
   - `CLAUDE.md` §1 (current state, PR chain, latest APK, pending decisions) and §7 (next steps),
   - `docs/PROGRESS.md` (round section: done + evidence + "to try on the phone"),
   - `docs/DECISIONS.md` — **only decisions the owner approved**, one D-xxx row each, with the reason,
   - `docs/TANKS.md` when any tank/ability number changes, `docs/BALANCE_REPORT.md` when balance is measured,
   - `docs/PLAYTEST_CHECKLIST.md` when something new can be felt on the phone, `docs/PERF.md` after perf work,
   - `README.md` when features visible to players change.
4. **Never change balance numbers on your own.** Measure and report; the owner decides.
5. **Never merge PRs or push to someone else's branch without the owner saying so.**
6. Done = lint + typecheck + unit + E2E + screenshots inspected + docs updated + CI green + APK link given.
   Never report something as working without running it; mark unverified facts as "doğrulanmadı / not verified".
7. At the end of a round give the owner a short Turkish report: what changed, the APK link (Actions → "Android APK"
   run → Artifacts), what to try on the phone, open questions.

## 1. Where we are now (update every round)

- **Last finished round:** Round 06 (2026-10-11, branch `fix/round-06-missions-perf-parts`, PR into the round-05 branch) — Kampanya → "Görevler"
  (D-049), spray-fire stutter fixes (D-050), upgrade parts → class perks (D-051), save v6. See `docs/PROGRESS.md`.
- **Round 05** (branch `fix/round-05-campaign-progression`, **PR #5 into the round-04 branch, CI green incl. perf gate, not merged**) —
  D campaign (3 levels, towers + HQ + guarded outposts) and E progression (stars, credits, garage, save v5).
- **Previous:** Round 04 (branch `fix/round-04-balance-aim-skills`, **PR #4 open, CI green incl. perf gate, not merged** — waiting for
  the owner's "birleştir") — B1 Artillery +25 %, A aim on screen only, C two abilities per tank + Scout spray, B menu skeleton.
- **Branches / PRs:** PR #1–#3 were merged into the default branch `claude/tanky-tunky-setup-dw06hp` on 2026-10-11
  (owner: "birleştir"; merge head `f94cbf8`). The default branch now holds round 03 + the change log. **Start new work
  from the default branch**: `git checkout -b fix/round-04-<topic> origin/claude/tanky-tunky-setup-dw06hp`.
  From 2026-10-11 the owner continues in the cloud/phone session; the desktop session pulls before working.
- **Latest debug APK:** Android APK run **#25** (round 05 = round 04 + campaign + garage; 4.5 MB artifact). Previous: #23 (round 04), #16 (round 03). Signed with the committed debug
  key (`keystore/debug.sha256`), CI fails if the signature differs (D-035). The owner must uninstall **once** after
  D-035, then every newer APK installs over the old one — **not yet confirmed on the phone**.

### Pending owner decisions (nothing below is implemented)
| # | Topic | Options / proposal | Source |
|---|---|---|---|
| B1 | ✅ +25 % done (D-044), still ≈22 % → needs landing correction · Artillery weak (≈22 %) | it deals ~131 dmg/shot vs 780 listed (shells land at the blast edge) → full damage in the inner half of the blast, or landing correction | BALANCE_REPORT r02–03 |
| B2 | Heavy strong (≈63–67 %) | lower its hp (5500 = owner's anchor) or weaken Rumble | BALANCE_REPORT |
| A | ✅ DONE (D-045) **Auto-aim locks off-screen enemies** (owner: "only aim at enemies visible on screen") | since full visibility (D-037) `selectTarget` picks the nearest enemy anywhere: limit to the camera view (+ small margin, grows when zoomed out) and/or gun range | cloud note #2, confirmed in current code |
| K1 | Multiplayer | online relay vs same Wi-Fi vs postpone; needs the INTERNET permission (currently removed in the manifest) | cloud note |
| K2 | ✅ proposal used (D-048): 96×96, first 3 levels — 12 levels / 128 tiles later if wanted | 96 → 128 tiles? first 3 or all 12 levels? | cloud note |
| K3 | Map awareness after Trapper (campaign got an HQ direction arrow — assumption, remove if unwanted) | everyone sees everything now; minimap for all? edge-of-screen objective arrow in campaign? 6-trap design dropped? | cloud note + D-036/37 |
| K4 | ✅ DONE (D-048) Enemy placement in campaign | hybrid: `levels.json` outposts with threat budget + zone, solver fills them | cloud note |
| K5 | Spray (machine-gun) fire | assumed Scout only (D-047) — tell me if all tanks | cloud note |
| K6 | ~~current Hide/Rumble values~~ | **answered**: they exist (§1 table, `docs/TANKS.md`) | report 2026-10-11 |
| K7 | ✅ DONE (D-046/047) Scout update | faster (4.2 → ~5.0), spray fire ~10 shots/s with low damage per bullet (**needs rescaling to the ×25 numbers**: tap damage is 260 now), skill = Hide (now 5 s / cd 4 s, ends on fire), ult = fire rate ×3 for 5 s / cd 30 s | cloud note §5.1 |
| K8 | ✅ DONE (D-046, numbers = proposal) Two abilities per tank (skill 5–10 s cd + ult 30–60 s cd) | Heavy: Rumble bigger, equal damage centre→edge (now falls to 35 %), more damage; ult = instant full heal, cd 45 or 60 s. Standard: skill (Swift exists now) or shield; ult EMP stun r4 2.5 s cd 40 s. Artillery: skill "ready shot" (no charge, full range) cd 8 s; ult bombardment (Barrage already = 6 shells in 1 s, cd 10 s) | cloud note §5.1 |
| K9 | ✅ A, C, B done first; D–G wait for K1/K2/K4 · Work order | aim fix + menu skeleton first, or tank update first; then campaign/PvE, progression, multiplayer | cloud note |
| K10 | ✅ DONE: PRs #1–#3 merged 2026-10-11 | | report |
| K11 | Trapper in code | keep disabled (now) or delete from code/data entirely | cloud note |
| T | Ability trees | cards show "Yakında"; owner designs them | round 02 |
| G | Tank art | owner has 4 Nano Banana images (Çevik, Dengeli, Ağır, Topçu; **not in the repo**). Plan: hull and turret as separate images → image→3D (.glb) → render 16–32 angles → atlas + team colour; procedural art stays as fallback. Fixes noted: Heavy emblem must be a square, Artillery barrel faces the wrong way | this chat + cloud note §5.5 |

### Current game (round 06)
| Topic | State | Data / code |
|---|---|---|
| Classes | Scout (Çevik), Heavy (Ağır), Standard (Dengeli), Artillery (Topçu); Trapper disabled (`enabled: false`, data kept) | `src/data/tanks.json`, `docs/TANKS.md` |
| Scale | hp/damage ×25 of the original (Heavy hp 5500) | D-027 |
| Abilities (skill + ult) | Çevik: Saklan 5 s/cd 5 · Aşırı Yük (fire rate ×3, 5 s/cd 30) · Ağır: Gümbürtü r 4, flat 1000, cd 10 · Onarım (full heal, cd 45) · Dengeli: Swift 4 s/cd 8 · EMP (r 4, stun 2.5 s, cd 40) · Topçu: Hazır Atış (cd 8) · Yaylım Ateşi (6 shells, cd 45) · Mine (Trapper only). Keys E / Q, `BTN_ABILITY`/`BTN_ULT` | `src/data/abilities.json`, `src/sim/abilities/` |
| Match | 3v3 Quick Match, 5 minutes, 3-2-1 countdown, respawn 2 s + 2 s protection away from death/enemy sight, K/D + results screen | `src/data/match.json`, `src/sim/match.ts` |
| Maps | Desert ruins (default), Modern city, Forest/river (original) — chosen on the tank-select screen | `src/world/themes.ts`, `generator.ts` |
| Visibility | No darkening, everything visible; enemy in forest only within 3 tiles (40 % opacity); Hide = invisible | `src/data/vision.json`, D-037 |
| Crate upgrades | +5 % hp and damage per pickup, max +60 %, lost on death, crates rebuild after 45 s | `combat.json → upgrades`, `src/sim/upgrades.ts` |
| Regeneration | 5 s out of combat → +5 % max hp every 5 s | `combat.json → regen` |
| Bots | FSM AI (patrol/suspicion/chase/attack/retreat); Kolay/Normal/Zor/Ekstrem (first shot 5/3/1/0 s after an enemy is in range), allies use the same level | `src/data/ai.json`, `src/systems/ai/bot.ts` |
| Auto-aim | nearest visible enemy **inside the camera view** (D-045), 10 % hysteresis; touch manual aim needs a 60 px drag | `targeting.ts`, `touchControls.ts` |
| Heights | cliffs/ramps from one `isPassable` rule, bump flash + haptic, "Engel vurgusu" setting | `passability.ts`, D-020/021 |
| UI | main menu Tek Oyunculu (Hızlı Maç, Görevler [= campaign], Garaj) / Çok Oyunculu ("Yakında") / Ayarlar, swipeable tank cards (skill + ult), map + difficulty selectors, two ability buttons with countdown rings, upgrade chip | `src/ui/` |
| Campaign (round 05) | 3 levels (`levels.json`), 96×96 themed maps; towers + HQ = `pve` classes in `tanks.json`; outpost solver + guard mode (`enemies.json`); win = HQ destroyed, time out = loss; player respawns at own base; stars/credits | `src/game/campaign.ts`, `src/systems/ai/tower.ts`, `tools/campaign-sim.ts` |
| Progression (round 05) | credits (campaign rewards, Quick Match 5/kill + 25/win), unlock chain, garage armor/engine/gun × 3 → `Tank.boost` for the player only | `src/game/progression.ts`, `src/data/progression.json` |
| Upgrade parts (round 06) | +1 per won mission (+1 first 3-star win) → perk level on a chosen tank: Heavy hp, Scout fire rate, Standard charge time, Artillery blast radius (6 %/level, 5 levels) → `Tank.boost` | `progression.json → parts/perks`, `src/ui/PerkPicker.tsx` |
| Save | schema v6 (settings, records, credits, campaign stars/bestTime, garage, parts, perks) | `src/core/save.ts` |
| Android | no INTERNET permission, explicit debug signing, isometric tank icon | `android/`, D-033, D-035 |

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
| **Change log entry** | `npm run log -- <yenilik\|degisiklik\|duzeltme\|geri-alma\|karar\|konusma\|acik-soru> "Başlık" "Ayrıntı"` |
| Balance sim (headless bots) | `npx tsx tools/balance.ts 300 40 hard desert` (args: matches, size, level, theme) |
| Campaign sim (bots play every level) | `npx tsx tools/campaign-sim.ts standard normal` |
| Round screenshots | `npx playwright test e2e/round03.spec.ts --project=mobile-landscape` → `docs/screens/round-03/` |
| App icon (SVG → all Android sizes) | `npm run icons` |
| Debug APK | CI only (no Android SDK in the cloud container): push → Actions "Android APK" → artifact |
| Signed release | push tag `v*` (secrets described in `docs/RELEASE.md`) |

Never run `playwright install` (Chromium is preinstalled; version pinned to 1.56.1).
Dev URL overrides: `?silent&campaign=c1&roster=scout&theme=desert|city|forest&map=40|64|96|debug_heights&seed=5&cls=heavy&diff=hard&bots=idle|enemies&endless&dur=20&renderScale=0.25&view=20,20&zoom=0.4`.

## 4. Architecture

```
src/sim      Deterministic, DOM-free simulation core (fixed 60 Hz). Runs in Node (headless tests/balance).
             rng.ts (sfc32) · dmath.ts (polynomial sin/cos/atan2) · input.ts (quantized input) · sim.ts (step)
             tank.ts (move/fire/charge) · combat.ts (shells, explosions, kill log) · targeting.ts (auto-aim)
             visibility.ts (full visibility + forest/Hide rules; LOS kept in vision.los for spawn safety)
             match.ts (timer, respawn) · upgrades.ts (crate pickups, regen) · abilities/ (data + modules) · collision.ts
src/world    terrain.ts · map.ts (SoA tile map, theme) · passability.ts (THE movement rule) · generator.ts (forest map +
             validateMap) · themes.ts (desert/city generators) · mapLoader.ts · reach.ts · noise.ts · iso.ts
src/systems/ai  AiBot: A* nav (throttled) + FSM, difficulty levels, ability habits, pickup seeking, outpost guard (data/ai.json)
             tower.ts: TowerBot + the Controller interface (one per tank in MatchHandle.bots)
src/game     matchSetup.ts: match setup, headless runner, scoreboard (scene, tests, tools/balance.ts)
             campaign.ts: levels, outpost solver, campaign match, mission result · progression.ts: credits, stars, garage
src/core     loop.ts · keyboard.ts · save.ts/storage.ts (versioned) · platform.ts (Capacitor) · frameStats.ts
src/render   worldRenderer.ts (baked ground + culled features) · terrainArt.ts (all procedural tile/feature art)
             tankArt.ts + tankView.ts (sprite-stacked tanks) · overlays.ts · fx.ts · fogLayer.ts (LOS mode only) · camera.ts
src/audio    Procedural Web Audio
src/scenes   GameScene.ts = Pixi app + loop + match + fx/audio/haptics wiring
src/ui       React screens (MainMenu, ClassSelect cards, settings, GameView HUD, results) + touchControls.ts
src/data     tanks · combat · abilities · ai · match · vision · terrain · traps (.json) — ALL gameplay numbers
             enemies.json (threat costs, guard) · levels.json (campaign) · progression.json (garage, credits)
src/i18n     tr/en/ar JSON + t()
tests/       Vitest suites     e2e/  Playwright (smoke, controls, visual, round01-05, perf)
tools/       balance.ts · campaign-sim.ts · make-icons.mjs · changelog.mjs (npm run log) · profile.mjs · art/audio previews
docs/        CHANGELOG.md (Turkish change/conversation log) + the files in §9
android/     Capacitor project (committed), keystore/ debug key (committed) + debug.sha256
```

## 4b. Changelog rule (mandatory)

- Read `docs/CHANGELOG.md` at the start of every session (owner requests, decisions, reverts, open questions).
- In the **same commit** as every change, feature, fix, revert, decision or new owner request, add an entry:
  `npm run log -- <yenilik|degisiklik|duzeltme|geri-alma|karar|konusma|acik-soru> "Kısa başlık" "Ayrıntı"`.
  Entries are Turkish, newest first (the script inserts below `LOG:START`).
- Log what was reverted or corrected and why. Log owner requests/decisions made in chat, even when no code changed.
- Never log something as working unless it was actually run. Mark unverified facts as such.
- `.github/workflows/changelog-check.yml` warns (non-blocking) when code changes without a changelog entry.

## 5. Technical rules

- `src/sim`, `src/world`, `src/systems` stay deterministic: no `Math.random/sin/cos/atan2/pow…`, no `Date.now`, no DOM
  (ESLint enforces; `src/world/iso.ts` is render-side). Use `Rng` and `dmath`; roll random values **once per mirrored
  tile pair** in map generators (symmetry test catches it).
- Sim positions are tile units; iso projection only in the render layer. Input reaches the sim only as `PlayerInput`.
- Gameplay numbers live in `src/data/*.json`; UI cards read them, so docs/TANKS.md must be updated by hand.
- Pool objects in hot paths; no per-frame allocations in sim/render loops. Perf gate: p95 frame < 22 ms at CPU 4x.
- Tests: unit arenas default to line-of-sight vision (`rules.fullVisibility=false`); the game default is full visibility.

## 6. Git / CI and parallel sessions

- Branch per round: `fix/round-NN-<topic>`, PR into the previous round's branch until merged (see §1).
- **Two sessions (desktop + cloud) may run in parallel.** Rules: each works on its **own branch** created from the
  newest round branch; never two sessions on one branch; never push to the other's branch; docs-only work may go on a
  `docs/<topic>` branch. High-conflict files — tell the owner before touching them while another session is active:
  `src/scenes/GameScene.ts`, `src/sim/sim.ts`, `src/sim/tank.ts`, `src/sim/input.ts`, `src/data/tanks.json`,
  `src/data/abilities.json`, `src/ui/App.tsx`, `src/ui/MainMenu.tsx`, `src/ui/touchControls.ts`, `src/core/save.ts`, `CLAUDE.md`.
- `.github/workflows/ci.yml`: lint → typecheck → unit → build → E2E → perf gate, on every push and PR.
- `.github/workflows/android-apk.yml`: debug APK on pushes to `main`, `claude/**`, `fix/**`, `phase/**`;
  versionCode = run number; verifies the signer SHA-256; 40 MB size budget. `release.yml`: signed APK/AAB on tags.
- `.github/workflows/changelog-check.yml`: warning only (see §4b).
- Commit trailer and session link are added by the harness; never put model names in commits/PRs.

## 7. Next steps (update every round)

0. Owner: say "birleştir" to merge PR #4, #5 and the round-06 PR in order (into the default branch `claude/tanky-tunky-setup-dw06hp`).
1. Owner: install the round-06 APK (contains rounds 04–06; GitHub artifacts need a signed-in browser — offered: a Release page without sign-in) (Actions → "Android APK" → artifact; first uninstall once if the update error appears), test with
   `docs/PLAYTEST_CHECKLIST.md`, report feel of spray / ultimates / menu and whether the update error is gone.
2. Open owner decisions (§1): K1 multiplayer, K3 map awareness (keep the HQ arrow?), K11 Trapper in code, T ability trees, G images; review the round-05/06 numbers (tower/HQ, budgets, stars, rewards, garage, perks); report whether Scout spray still stutters on the phone (FPS counter).
3. Campaign follow-ups (D): levels 4–12, other objectives (convoy, flag, survive), boss tanks every 4 levels, foot soldiers, hand-made/asymmetric maps.
   Not started: **(F)** multiplayer (lockstep over relay or Wi-Fi; needs INTERNET permission);
   **(G)** tank art pipeline from the owner's images / 3D models.
4. Balance: B1 follow-up (Artillery ≈22 % even with +25 %: landing correction), B2 Heavy (≈68 %), Scout ≈62 % after spray.
5. Perf: the cloud container measured p95 66.7 ms for default branch AND round 04 (machine slower than in round 03); confirm in CI / on a phone.

**Blocked on the owner:** K1 (INTERNET permission + relay vs Wi-Fi) blocks F; the 4 tank images block G;
B1 landing correction / B2 Heavy are balance numbers (rule 4).

## 8. Roadmap

| Phase / stream | Status |
|---|---|
| 0 Engine, 1 Skeleton, 2 World, 3 Tanks & controls | ✅ done (default branch) |
| 4 Vision | ✅ built in round 01 (LOS, forest, Hide); replaced by full visibility in round 03 (D-037), LOS kept for spawns |
| 5 Classes & Trapper map | ✅ 4 distinct classes + 1 ability each (round 01–02); Trapper/minimap dropped (D-036); skill + ult per tank done in round 04 |
| 6 Traps | ⏸ dropped with the Trapper (only Mine exists, disabled with it); redefine or remove after K3/K11 |
| 7 AI | ✅ FSM + A* + difficulty levels (round 01–03) |
| 8 Headless sim & balance | ✅ tool + reports; auto-tune not done — balance is decided by the owner |
| Skill system (C) | ✅ two abilities per tank + ult button (round 04, D-046); ability trees (T) later |
| PvE / campaign (D) | ✅ MVP round 05: 3 levels, towers, guarded outposts, HQ (D-048); soldiers, bosses, more objectives later |
| 9 Modes & progression (E) | partly: Quick Match + campaign, credits/stars/garage (round 05); survival, daily challenge, replays later |
| Multiplayer (F) | planned, decision K1 |
| 10 Polish | partly (icon, menus); tutorial, accessibility, weather/day-night later |
| 11 Release | signed AAB pipeline exists; README screenshots done; v1.0.0 later |

## 9. Doc map

| File | Purpose |
|---|---|
| `docs/CHANGELOG.md` | **Turkish change/conversation log — every change, request, decision, revert (newest first)** |
| `README.md` | Turkish overview for people opening the repo |
| `docs/GAME_BRIEF.md` | Original brief from the owner (source of intent; later owner decisions override it) |
| `docs/PROGRESS.md` | Per-phase/round log with evidence, phone-test notes, open questions |
| `docs/DECISIONS.md` | Owner-approved decisions D-001… with reasons |
| `docs/TANKS.md` | Tank, damage, charge and ability tables + proposals (Turkish) |
| `docs/BALANCE_REPORT.md` | Bot-vs-bot simulation results per round |
| `docs/PLAYTEST_CHECKLIST.md` | What to check by hand on the phone |
| `docs/PERF.md` | Performance gate method and measurements |
| `docs/RELEASE.md` | Signing, releases, update errors on the phone |
| `docs/ENGINE_DECISION.md` | Engine comparison |
| `docs/screens/round-NN/` | Inspected screenshots per round |

## 10. Known risks

- **No INTERNET permission** — must be confirmed on a real device (blank screen = add it back). Multiplayer (F) needs it:
  remove the `tools:node="remove"` INTERNET line from `android/app/src/main/AndroidManifest.xml` and update this note.
- **No GPU in cloud CI** — perf gate uses a fill-rate-normalised backbuffer; real-device FPS must be noted by hand.
- **Object occlusion** — tall buildings / plateau edges can hide tanks behind them (no see-through yet).
- **Busier fights since round 03** — JS work per frame ~+2 ms vs round 02 (CPU 4x, 96×96); keep an eye on the perf gate.
- **Spray fire load (C)** — mitigated in round 06 (D-050, perf spec "spray stress"); phone not measured. 10–30 shells/s: pool shells, small hits = sparks not explosions, knockback scaled by damage,
  aggregated damage numbers, continuous haptic pattern, capped sfx; spread via the sim `Rng`.
- **Parallel sessions** — see §6; a session reading only the default branch sees an outdated game until PRs are merged.
