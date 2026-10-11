/** Scout ULT — AŞIRI YÜK / Overdrive: fire rate x `fireRateMul` (default 3) for `duration`. Works with the spray fire. */
import { abilityParam } from './params';
import type { AbilityModule } from './types';

export const overdrive: AbilityModule = {
  activate: () => true,
  fireRateMul: (a) => abilityParam(a, 'fireRateMul'),
};
