# Playtest checklist (real device)

Things that cannot be measured headlessly. Tick on a real phone (landscape), note device + build number.
Measurable items (frame time, input latency proxies, APK size) are automated — see `PERF.md`.

## Install / startup
- [ ] APK installs over the previous debug build without "package conflicts" (persistent debug key).
- [ ] Opens straight into landscape, system bars hidden (immersive), screen stays on.
- [ ] Notch / rounded corners: no HUD element is cut off.
- [ ] From icon tap to driving a tank < 60 s (target: two taps — "Hızlı Maç").
- [ ] No network permission prompt; works in airplane mode.

## Controls (phase 3)
- [ ] Joystick appears under the thumb anywhere in the left half; small wiggles inside the dead zone do not move the tank.
- [ ] Analog: half deflection = clearly slower driving.
- [ ] "Up" on the joystick drives the tank up the screen (iso diagonal), not sideways.
- [ ] Hull turns smoothly toward the stick direction; turret turns independently (aim assist on/off in settings).
- [ ] Driving + holding FIRE + pressing ABILITY simultaneously all work (3 fingers).
- [ ] Dragging away from FIRE aims the turret manually; releasing fires in that direction.
- [ ] Tap FIRE = quick shot; hold = ring fills around the button AND around the tank.
- [ ] At 100 %: perfect glow + sound + light vibration; releasing right then feels rewarding.
- [ ] Holding too long: red overheat, short lock; feels fair, not frustrating.
- [ ] Tank slows noticeably while charging (heavier classes slow more).
- [ ] Buttons are comfortable size (≥ 48 dp) and reachable; left-handed mode mirrors them.

## Hit feel
- [ ] Muzzle flash + recoil + smoke on every shot; bigger for charged shots.
- [ ] Camera shake: present but not nauseating; "reduce shake" setting clearly reduces it.
- [ ] Haptics: light on tap shots, stronger on charged, heavy when hit; can be disabled.
- [ ] Hits show sparks + damage numbers; kills show a big explosion and wreck smoke.
- [ ] Heavy shells ricochet once off walls; artillery arcs over walls and lands at the charged distance.
- [ ] Crates/walls break after enough hits.

## World (phase 2)
- [ ] Terrain reads clearly: water vs grass vs mud vs sand; cliffs and ramps are obvious.
- [ ] Tanks drive up/down ramps smoothly; cannot drive off cliffs.
- [ ] Tanks/trees/walls overlap in the correct order (no "tank drawn over a tree in front of it").
- [ ] Mud and shallow water feel slow; bridges cross deep water.

## Audio
- [ ] Engine tone follows speed; each class sounds different.
- [ ] Charge tone rises with charge; perfect / overheat cues are distinct.
- [ ] Explosions are punchy, not clipping/distorted at max volume.

## Performance
- [ ] No visible stutter while driving across the map (note FPS counter: target 60, min 45).
- [ ] Device does not get uncomfortably hot after 10 min.
