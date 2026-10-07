import type { Projectile } from '../../../entities/Projectile/model/projectile';
export const ROCKET_BUBBLE_LIMIT = 16;
export function createRocketBubbles() {
	return {
		shotId: null as number | null,
		nextAt: 0,
		points: [] as { x: number; y: number; born: number }[],
	};
}
/** Emit small rising rings over a sinking projectile, with a bounded pool and no impact blast. */
export function updateRocketBubbles(
	bubbles: ReturnType<typeof createRocketBubbles>,
	shot:
		| (Pick<Projectile, 'id' | 'type' | 'position'> & Partial<Pick<Projectile, 'state'>>)
		| undefined,
	time: number,
	waterLevel: number
) {
	bubbles.points = bubbles.points.filter(
		(p) => time - p.born < 1.2 && p.y + (time - p.born) * 45 < waterLevel - 3
	);
	if (shot?.state !== 'submerged') {
		bubbles.shotId = null;
		return;
	}
	if (bubbles.shotId !== shot.id) {
		bubbles.shotId = shot.id;
		bubbles.nextAt = time;
	}
	while (bubbles.nextAt <= time + 1e-9) {
		const i = Math.round(bubbles.nextAt * 100);
		bubbles.points.push({
			x: shot.position.x + Math.sin(i) * 3,
			y: Math.min(waterLevel - 5, shot.position.y + 10),
			born: bubbles.nextAt,
		});
		if (bubbles.points.length > ROCKET_BUBBLE_LIMIT) bubbles.points.shift();
		bubbles.nextAt += 0.04;
	}
}
