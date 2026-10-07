import type { Worm } from './worm';
import { setAnimation } from './worm';

/** All ordinary HP loss, including landing and explosions, shares this transition. */
export function damageWorm(worm: Worm, amount: number) {
	if (!worm.alive || amount <= 0) return;
	worm.hp = Math.max(0, worm.hp - amount);
	if (!worm.hp) {
		worm.alive = false;
		worm.deathPending = true;
	}
	setAnimation(worm, 'hurt');
}
