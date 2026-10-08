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
