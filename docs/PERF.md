# Performance

Budget (brief §10.4, §13): 60 FPS target, 45 FPS floor → **p95 frame < 22 ms on a 96×96 map at CPU 4x throttle**; APK < 40 MB; cold start < 3 s.

## Measurement environment caveat

The CI/cloud containers have no GPU; Chromium renders WebGL through SwiftShader on the CPU. Full-resolution
frame times there are fill-rate bound (~130 ms/frame for *any* engine) and do not predict phone performance.
The gate therefore measures (a) JS work per frame and (b) frame time with a reduced backbuffer that keeps the
same world view (fill-rate-normalised). Real-device numbers are recorded below by hand.

## Log

| Date | Build | Scenario | Result |
|---|---|---|---|
| 2026-10-08 | engine spike | Pixi 8, 96×96, 200 objects, fog, CPU 4x, 320×180 backbuffer | p95 23.9 ms, 60 FPS mean, JS work 4.5 ms (p95 9.0) |
| 2026-10-08 | engine spike | Phaser 4, same | p95 53.3 ms, 30 FPS, JS work 7.4 ms |
| 2026-10-08 | phase 3 (first run) | Game, 96×96, 5 tanks fighting, CPU 4x, 0.25 backbuffer | p95 33.3 ms ❌ — JS work 11.8 ms; profile: Pixi batching of off-screen sprites |
| 2026-10-08 | phase 3 (D-011 fix) | same | **60 FPS, p95 16.7 ms ✅**, JS work mean 6.2 ms (p95 11.3), ~820 sprites |
| 2026-10-08 | round 01 (before) | 96×96, 6 tanks, fog+vision, CPU 4x — CI runner | p95 33.3 ms ❌ (JS work mean ~10 ms) |
| 2026-10-08 | round 01 (D-026 ground bake + culler) | same, local | **60 FPS, p95 16.7 ms ✅**, JS work mean 4.6–5.5 ms (p95 11–13), ~1040 sprites |

Profiling helper: `npm run build && node tools/profile.mjs` (top self-time functions of a live match at CPU 4x).
