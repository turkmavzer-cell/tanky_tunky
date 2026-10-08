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
