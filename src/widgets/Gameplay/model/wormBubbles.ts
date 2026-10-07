import { drowningVisible, drowningY } from '../../../entities/Worm/model/drowning';
import type { Worm } from '../../../entities/Worm/model/worm';

export const WORM_BUBBLE_LIMIT = 96;
export function createWormBubbles() {
	return {
		emitted: new Map<string, number>(),
		points: [] as { x: number; y: number; born: number }[],
	};
}
export function updateWormBubbles(
	state: ReturnType<typeof createWormBubbles>,
	worms: Worm[],
	time: number,
	waterLevel: number,
	screenBottom = Number.NEGATIVE_INFINITY
) {
	state.points = state.points.filter(
		(p) => time - p.born < 1.6 && p.y + (time - p.born) * 45 < waterLevel - 2
	);
	for (const worm of worms) {
		if (worm.animationState !== 'drown') continue;
		const y = drowningY(worm);
		if (!drowningVisible(y, screenBottom)) continue;
		const slot = Math.floor(worm.stateTime / 0.08);
		if (state.emitted.get(worm.id) === slot) continue;
		state.emitted.set(worm.id, slot);
		state.points.push({
			x: worm.position.x + (worm.facing === 'right' ? 5 : -5),
			y: Math.min(waterLevel - 4, y + 7),
			born: time,
		});
	}
	if (state.points.length > WORM_BUBBLE_LIMIT)
		state.points.splice(0, state.points.length - WORM_BUBBLE_LIMIT);
}
