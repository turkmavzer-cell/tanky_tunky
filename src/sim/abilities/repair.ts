/** Heavy ULT — ONARIM / Repair: instantly restores the tank to full health (max hp incl. crate upgrades). Refused when already full. */
import { maxHp } from '../upgrades';
import type { AbilityModule } from './types';

export const repair: AbilityModule = {
  activate: ({ t }) => {
    const max = maxHp(t);
    if (t.hp >= max - 1e-6) return false;
    t.hp = max;
    return true;
  },
};
