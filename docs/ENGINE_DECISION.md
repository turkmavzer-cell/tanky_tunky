# Engine Decision

**Winner: PixiJS 8.22 (WebGL) + custom deterministic simulation core, packaged with Vite + React (menus) + Capacitor 8.**

Time-boxed spike, measured on 2026-10-08. Reproduce with `npm run bench:engines` (see `bench/`).

## 1. Shortlist (desk evaluation)

| Candidate | Stack fit (React/Vite/TS/Capacitor) | Cloud APK on GH Actions | APK size | Iso depth sort / fog | CLI testability | Verdict |
|---|---|---|---|---|---|---|
| **PixiJS 8** | Native (npm, ESM, TS types) | Same as any Capacitor app (Gradle) | ~6–9 MB APK (≈90 kB gz renderer) | Manual z-sort (zIndex), RenderTexture/canvas mask easy | Excellent: sim is plain TS, Node + Playwright | **Benchmarked** |
| **Phaser 4** (3.x successor, 4.2.1) | Native | Same | ~10 MB (≈360 kB gz engine) | Built-in iso tilemaps, depth, filters | Good | **Benchmarked** |
| Three.js / Babylon.js (ortho) | Native | Same | Babylon heavy (>1 MB gz) | Depth buffer free, but 2D sprite workflow and fog mask need custom shaders | Good | Overkill for 2D iso sprites; larger bundle |
| Godot 4 | Separate editor/export pipeline, no React/Vite | Possible (godot-ci images, export templates ~ 1 GB download) | 25–40 MB base APK | Good | Headless Godot possible but no Vitest/Playwright | Breaks required stack, APK budget risk |
| Unity | Separate, licence, no React/Vite | game-ci with licence secrets | 20–40 MB | Good | Poor from CLI | Breaks stack, licence + build time |
| Defold | Separate (Lua) | bob.jar works headless | Small (~5 MB) | OK | Lua tests only | Breaks TS/React stack |
| Cocos Creator | Editor-centric build | Hard headless | 10–20 MB | Good | Poor | Editor dependence |
| Kaplay / Excalibur | Native TS | Same | Small | No iso tooling, weaker batching | Good | Lower perf ceiling than Pixi |

Only Pixi and Phaser satisfy every hard constraint (stack, cloud build without editors/licences, < 40 MB, CLI-testable), so they went into the benchmark. Godot/Unity were not selected, therefore no Godot/Unity APK proof was required.

## 2. Benchmark spike

Identical scene in both engines (`bench/common.ts`):

- 96×96 isometric map, 128×64 tiles, viewport culling with a sprite pool
- ~12 % of tiles carry a tall tree, depth-sorted (x+y) against moving objects
- 200 moving objects (100 bullets + 100 additive-blend particles)
- Fog of war: 192×192 alpha mask recomputed on the CPU at 15 Hz with a cheap LOS test, uploaded as a texture and drawn through an isometric transform (bilinear upscaling = soft edges)
- Camera continuously orbiting over the map; 1280×720 viewport
- Metrics: 3 s warm-up, 10 s measurement, rAF frame deltas; "work" = JS update + render submission time per frame
- Headless Chromium 141 (Playwright 1.56), `Emulation.setCPUThrottlingRate`, 2 runs each, 4 vCPU container, **no GPU** (WebGL via SwiftShader software rasterizer)

### Results (mean of 2 runs)

**A. Full resolution 1280×720** — frame time is dominated by SwiftShader rasterizing ~3 full-screen layers on the CPU; both engines are pinned at ~6–8 FPS. These numbers say nothing about a phone GPU, but the CPU work column is still valid:

| Engine | CPU throttle | FPS | p50 frame | p95 frame | JS work mean | JS work p95 |
|---|---|---|---|---|---|---|
| PixiJS 8 | 1x | 7.6 | 131 ms | 194 ms | **1.45 ms** | 3.35 ms |
| Phaser 4 | 1x | 7.8 | 126 ms | 221 ms | 2.06 ms | 5.40 ms |
| PixiJS 8 | 4x | 5.7 | 172 ms | 273 ms | **5.97 ms** | 15.8 ms |
| Phaser 4 | 4x | 6.2 | 161 ms | 203 ms | 7.01 ms | 13.6 ms |

**B. Fill-rate-normalised: same world view rendered into a 320×180 backbuffer** (removes most of the software-rasterizer cost so engine overhead becomes visible):

| Engine | CPU throttle | FPS | p50 frame | **p95 frame** | JS work mean | JS work p95 |
|---|---|---|---|---|---|---|
| **PixiJS 8** | 1x | **60.0** | 16.7 ms | **19.0 ms** | 1.27 ms | 2.75 ms |
| Phaser 4 | 1x | 37.1 | 26.2 ms | 37.8 ms | 1.50 ms | 2.55 ms |
| **PixiJS 8** | **4x** | **60.0** | 16.7 ms | **23.9 ms** | 4.47 ms | 8.95 ms |
| Phaser 4 | 4x | 30.0 | 32.7 ms | 53.3 ms | 7.35 ms | 13.7 ms |

Bundle (minified): Pixi 8 ≈ 520 kB total / ≈ 150 kB gzip (incl. lazily loaded chunks); Phaser 4 ≈ 1.38 MB / 359 kB gzip.

Screenshots of the spike (both correct: culled iso ground, z-sorted trees, additive particles, soft fog with memory): `docs/img/bench-pixi.png`, `docs/img/bench-phaser.png`.

### Reading the numbers honestly

- The container has no GPU, so absolute FPS at full resolution is **not** predictive of a phone. The p95 < 22 ms performance gate (brief §10.4) will therefore be enforced in CI on the fill-rate-normalised configuration plus a JS-work budget, and must be confirmed on a real device (see `docs/PERF.md`).
- At equal pixel count Pixi delivered 60 FPS at 4x CPU throttle while Phaser 4 delivered 30 FPS with the same scene, and Pixi's CPU work was 15–40 % lower. Phaser's new v4 renderer appears to add per-frame GPU passes in this configuration (layers removed made no difference: 29 FPS).
- Mid-range Android GPUs (Adreno 6xx / Mali-G5x) handle this fill rate easily; the CPU budget (≈6 ms of 16.7 ms at 4x throttle) is what matters for 60 FPS, and Pixi has the bigger margin.

## 3. Decision

**PixiJS 8** as the rendering layer. Reasons, in order:

1. Best measured frame times and CPU headroom in the spike (60 FPS @ 4x vs 30 FPS for Phaser 4 at equal pixels).
2. 2.4–4.5x smaller bundle → faster cold start (< 3 s target), smaller APK.
3. Our architecture puts simulation, input (multi-touch joystick), audio (procedural Web Audio), AI and visibility in our own engine-agnostic TypeScript (`src/sim`); Phaser's built-in physics/input/sound/scene systems would go unused, Pixi is "just the renderer" we need.
4. First-class TS/ESM, works inside Vite/React/Capacitor with zero glue.

Accepted trade-offs: we write our own camera, z-sorting, tile culling and scene management (all small and already prototyped in the spike).

Rejected: Phaser 4 (slower in this scene, heavier), Three/Babylon (3D overhead), Godot/Unity/Cocos/Defold (break the required React/Vite/TS/Capacitor stack and CLI testability; bigger APKs), Kaplay/Excalibur (lower performance ceiling, no iso tooling).
