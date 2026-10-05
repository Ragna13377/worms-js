import type { Worm } from './worm';
import { killWorm, setAnimation } from './worm';

/** All ordinary HP loss, including landing and explosions, shares this transition. */
export function damageWorm(worm: Worm, amount: number) {
	if (!worm.alive || amount <= 0) return;
	worm.hp = Math.max(0, worm.hp - amount);
	if (!worm.hp) killWorm(worm, 'death');
	else setAnimation(worm, 'hurt');
}
