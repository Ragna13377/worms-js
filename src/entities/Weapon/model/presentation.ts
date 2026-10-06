import type { Worm } from '../../Worm/model/worm';
import { WEAPON } from './config';
import type { WeaponState } from './weapon';
/** Both the held pose and reticle use the same fixed simulation clock. */
export function equipmentProgress(worm: Worm, weapon: WeaponState) {
	if (!worm.alive || !worm.grounded || worm.animationState !== 'idle') return 0;
	if (weapon.isCharging) return 1;
	return Math.max(0, Math.min(1, (worm.stateTime - WEAPON.equipDelay) / WEAPON.equipDuration));
}
