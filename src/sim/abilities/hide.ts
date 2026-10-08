/** Scout — SAKLAN / Hide: invisible for `duration`; firing ends it immediately. Visibility rules live in visibility.ts. */
import type { AbilityModule } from './types';

export const hide: AbilityModule = {
  activate: () => true,
  onFire: (c) => {
    // revealing yourself: end now (cooldown starts) — handled by the dispatcher via endAbility
    c.t.ability.active = 0;
  },
};
