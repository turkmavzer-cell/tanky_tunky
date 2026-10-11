# Balance report

Reproduce: `npx tsx tools/balance.ts <matches> <mapSize>` (headless, deterministic, bots on both sides).
Win rate counts only decisive matches (team with more kills wins). Target band: **45–55 %** per class (brief §10.2).

## Round 01 — first measurement (2026-10-08) — NOT tuned yet (owner will tune in-game)

300 matches, 3v3, 40×40, 60 s, random rosters, AI level "normal". Draws 42 (14 %), avg 6.2 kills/match, runtime 73 s.

| Class | Appearances | Win rate (decisive) | K/D | Kills / match | Ability uses / match | Shots / match | Charged shots (≥30 %) | Band 45–55 % |
|---|---|---|---|---|---|---|---|---|
| Scout (Saklan) | 377 | 40.3 % | 0.65 | 0.92 | 4.83 | 16.7 | 43 % | ❌ |
| Heavy (Gümbürtü) | 356 | 67.0 % | 2.91 | 1.43 | 0.75 | 5.5 | 54 % | ❌ |
| Standard (Swift) | 369 | 69.9 % | 1.94 | 1.55 | 1.98 | 12.0 | 46 % | ❌ |
| Artillery (Yaylım) | 333 | 27.1 % | 0.22 | 0.27 | 2.98 | 16.7 | 89 % | ❌ |
| Trapper (Mayın) | 365 | 44.5 % | 0.78 | 0.91 | 12.09 | 6.2 | 53 % | ❌ (just outside) |

### Bugs found and fixed by the simulation (before the numbers above)
1. Artillery bots charged randomly → shells landed short/long (0.04 kills/match). Fix: bots solve the charge for the target distance (`artilleryChargeFor`).
2. Arcing shells never get a "direct" hit, so they only dealt the 50 % splash fraction. Fix: `combat.json → shell.artillerySplash = 1` (full damage at the blast centre).
3. Barrage used the auto-aim lock only (bots have none) and fired at a point ahead of the turret. Fix: barrage target uses the shared `selectTarget`.
4. A bot's "pain" estimate could lie outside the map → crash in `clearGroundPath`. Fixed + 40-match fuzz test.

### Reading / suggestions for the in-game tuning pass (not applied)
- **Heavy & Standard dominate** (≈ 67–70 %): the 3x charged hit on high base damage (Heavy 114 / perfect 131) one-shots Scouts/Artillery; Standard's Swift doubles both speed and fire rate for 5 s on an 8 s cooldown. Candidates: Heavy `damage` 38→32 or `chargeTime` 2.2→2.6; Swift `fireRateMul` 2→1.6 or cooldown 8→10.
- **Artillery weakest**: bots still miss moving targets (flight time ~1.2 s) and get caught at short range (min range 3). Candidates: `shellSpeed` 7→8.5, `splash` 0.9→1.1, `hp` 85→95, or AI that keeps distance (retreat when an enemy is < min range).
- **Scout** dies a lot (K/D 0.65); Hide is used ~5x/match but bots break it immediately by firing. Candidate: AI waits for a flank before firing; `hp` 70→80.
- **Trapper** ≈ band; mines are used a lot (12/match) — fine for a 2 s cooldown; mine kills are credited to the Trapper.
- Draw rate 14 % with 6 kills/match: matches are short and low-scoring; consider 40×40 maps with fewer spawn points far from the centre.

All values live in `src/data/tanks.json`, `combat.json`, `abilities.json`, `ai.json`; cooldowns can be scaled live in Settings → Developer → "Bekleme çarpanı".

## Update 2026-10-09 — ×25 scale (D-027) + short Barrage (D-028)

300 matches, same seeds. The ×25 scale alone changes nothing (uniform); the differences come from the 6-shells-in-1-s Barrage.

| Class | Win rate before → after | K/D before → after | Kills / match before → after |
|---|---|---|---|
| scout | 40.3 % → 40.2 % | 0.65 → 0.64 | 0.92 → 0.97 |
| heavy | 67.0 % → 66.3 % | 2.91 → 2.69 | 1.43 → 1.34 |
| standard | 69.9 % → 69.0 % | 1.94 → 1.74 | 1.55 → 1.59 |
| artillery | 27.1 % → 27.6 % | 0.22 → 0.39 | 0.27 → 0.53 |
| trapper | 44.5 % → 45.5 % | 0.78 → 0.85 | 0.91 → 1.04 |

## Round 02 — option B (D-034), hard bots, 5-minute matches

`npx tsx tools/balance.ts 300 40 hard` (300 matches, same seeds for every run).

| Class | Before B | Round 1 | Round 2 | **Round 3 (current)** |
|---|---|---|---|---|
| scout | 42.1 % | 47.4 % | 50.9 % | **48.3 %** ✅ |
| heavy | 69.2 % | 66.2 % | 62.0 % | **63.4 %** ❌ |
| standard | 62.6 % | 58.1 % | 58.5 % | **56.5 %** ≈ |
| artillery | 24.1 % | 26.9 % | 28.0 % | **31.5 %** ❌ |
| trapper | 51.2 % | 50.3 % | 49.0 % | **50.7 %** ✅ |

Final table:

| Class | Appearances | Win rate (decisive) | K/D | Kills / match | Ability uses / match | Shots / match | Charged shots (≥30 %) | Band 45–55 % |
|---|---|---|---|---|---|---|---|---|
| scout | 377 | 48.3 % | 1.01 | 3.90 | 29.13 | 45.1 | 38 % | ✅ |
| heavy | 356 | 63.4 % | 1.45 | 3.09 | 2.70 | 12.7 | 56 % | ❌ |
| standard | 369 | 56.5 % | 1.09 | 3.33 | 5.89 | 29.0 | 44 % | ❌ |
| artillery | 333 | 31.5 % | 0.66 | 2.67 | 16.14 | 112.5 | 92 % | ❌ |
| trapper | 365 | 50.7 % | 1.01 | 3.88 | 60.68 | 16.5 | 56 % | ✅ |


### Why Heavy and Artillery are still outside the band
- **Artillery** — a probe over 40 matches: **131 damage per shot** on average although the shell's tap damage is 780. Only 54 % of shells touch anyone, and those land near the blast edge (damage falls linearly to 0 at the edge; arcing shells never score a direct hit), so a hit deals about 20 % of the listed damage. More damage/hp barely moves it (+7 points over three rounds). It needs a rule change, e.g. full damage inside the inner half of the blast radius, or a short-range auto-correction of the landing point toward the locked target.
- **Heavy** — accurate (93 % of shots hit) and very hard to kill; all its option-B levers are at the ±20 % limit. The remaining lever is its hp (5500, owner's anchor value) or Rumble.

Owner decides the next step; nothing outside option B was changed.

## Round 03 — Trapper removed, full visibility, upgrades, regen, new maps (not tuned)

`npx tsx tools/balance.ts 300 40 hard desert|city`. Nothing was tuned this round; the numbers are for the owner's next decision.

Matches: 300 (3v3, 40x40, 300 s, random rosters, hard bots, desert map) — draws 11 (4 %), avg kills/match 51.2, runtime 232.1 s

| Class | Appearances | Win rate (decisive) | K/D | Kills / match | Ability uses / match | Shots / match | Charged shots (≥30 %) | Band 45–55 % |
|---|---|---|---|---|---|---|---|---|
| scout | 467 | 59.0 % | 1.39 | 11.29 | 39.96 | 129.9 | 53 % | ❌ |
| heavy | 444 | 63.1 % | 1.33 | 8.20 | 3.83 | 36.8 | 74 % | ❌ |
| standard | 428 | 56.7 % | 1.12 | 10.02 | 15.86 | 87.1 | 56 % | ❌ |
| artillery | 461 | 22.5 % | 0.43 | 4.68 | 29.07 | 221.2 | 91 % | ❌ |


Matches: 300 (3v3, 40x40, 300 s, random rosters, hard bots, city map) — draws 11 (4 %), avg kills/match 53.5, runtime 224.5 s

| Class | Appearances | Win rate (decisive) | K/D | Kills / match | Ability uses / match | Shots / match | Charged shots (≥30 %) | Band 45–55 % |
|---|---|---|---|---|---|---|---|---|
| scout | 467 | 57.2 % | 1.36 | 11.90 | 40.63 | 136.0 | 51 % | ❌ |
| heavy | 444 | 66.7 % | 1.42 | 8.54 | 4.84 | 37.9 | 71 % | ❌ |
| standard | 428 | 54.9 % | 1.11 | 10.48 | 16.41 | 91.3 | 53 % | ✅ |
| artillery | 461 | 22.1 % | 0.42 | 4.84 | 28.93 | 221.7 | 90 % | ❌ |


Observations
- Much more fighting: ~52 kills per 5-minute match (bots see everyone now; regen + upgrades keep tanks in the fight).
- **Artillery 22 %** remains the outlier (same blast-edge cause as in round 02). **Heavy 63–67 %**. Scout rose to 57–59 % with 2200 hp and full visibility (no ambush penalty).
- Both maps give nearly identical class results, so the maps themselves are fair.
