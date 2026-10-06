import type { Projectile } from '../../../entities/Projectile/model/projectile';
import { WORM } from '../../../entities/Worm/model/config';
export const TRAIL_LIMIT = 12;
export function trailInterval(age: number) {
	return Math.min(0.08, 0.009 + age * 0.04);
}
export function createRocketTrail() {
	return {
		shotId: null as number | null,
		points: [] as { x: number; y: number; born: number }[],
		nextAt: 0,
		sample: { x: 0, y: 0, time: 0 },
		launchAt: 0,
	};
}
export function updateRocketTrail(
	trail: ReturnType<typeof createRocketTrail>,
	shot: Pick<Projectile, 'id' | 'type' | 'age' | 'position' | 'velocity'> | undefined,
	time: number
) {
	if (shot?.type !== 'bazooka') {
		trail.shotId = null;
		trail.points = trail.points.filter((p) => time - p.born < 0.35);
		return;
	}
	const speed = Math.hypot(shot.velocity.x, shot.velocity.y);
	const tail = {
		x: shot.position.x - (speed ? (shot.velocity.x / speed) * 12 : 0),
		y: shot.position.y - (speed ? (shot.velocity.y / speed) * 12 : 0),
	};
	if (trail.shotId !== shot.id) {
		trail.shotId = shot.id;
		trail.points = [];
		trail.nextAt = time;
		trail.launchAt = time - shot.age;
		trail.sample = { ...tail, time };
	}
	while (trail.nextAt <= time + 1e-9) {
		const span = time - trail.sample.time;
		const alpha =
			span > 0 ? Math.max(0, Math.min(1, (trail.nextAt - trail.sample.time) / span)) : 1;
		trail.points.push({
			x: trail.sample.x + (tail.x - trail.sample.x) * alpha,
			y: trail.sample.y + (tail.y - trail.sample.y) * alpha,
			born: trail.nextAt,
		});
		if (trail.points.length > TRAIL_LIMIT) trail.points.shift();
		trail.nextAt += trailInterval(Math.max(0, trail.nextAt - trail.launchAt));
	}
	trail.sample = { ...tail, time };
}

/** Emit on the same interpolated timeline as the visible projectile, not the next physics pose. */
export function rocketTrailSample(
	p: Pick<Projectile, 'id' | 'type' | 'age' | 'position' | 'previousPosition' | 'velocity'>,
	alpha: number,
	time: number
) {
	const a = Math.max(0, Math.min(1, alpha));
	return {
		shot: {
			...p,
			position: {
				x: p.previousPosition.x + (p.position.x - p.previousPosition.x) * a,
				y: p.previousPosition.y + (p.position.y - p.previousPosition.y) * a,
			},
		},
		time: Math.max(0, time - WORM.fixedStep * (1 - a)),
	};
}
