/**
 * Artillery SKILL — HAZIR ATIŞ / Ready shot: for up to `duration` seconds the next fire press shoots at once
 * (no charge-up) with full landing reach and `power` charge worth of damage/blast; it then ends and the cooldown starts.
 */
import { abilityParam } from './params';
import type { AbilityModule } from './types';

export const readyshot: AbilityModule = {
  activate: () => true,
  instantShot: (a) => ({ power: abilityParam(a, 'power'), reach: abilityParam(a, 'reach') }),
};
