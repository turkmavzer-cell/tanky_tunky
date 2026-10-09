/** Standard — SWIFT: 2x move speed, 2x fire rate, half charge time for `duration`. Movement is sub-stepped in tank.ts. */
import { abilityParam } from './params';
import type { AbilityModule } from './types';

export const swift: AbilityModule = {
  activate: () => true,
  speedMul: (t) => abilityParam(t, 'speedMul'),
  fireRateMul: (t) => abilityParam(t, 'fireRateMul'),
  chargeTimeMul: (t) => abilityParam(t, 'chargeTimeMul'),
};
