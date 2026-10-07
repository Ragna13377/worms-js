import { WORM } from './config';
import type { Worm } from './worm';

/** Continue the visual descent after the deterministic death timer has finished. */
export function drowningY(worm: Worm, y = worm.position.y) {
	return y - Math.max(0, worm.stateTime - WORM.drownDuration) * WORM.drownSinkSpeed;
}

export function drowningVisible(y: number, screenBottom: number) {
	return y + 60 >= screenBottom;
}
