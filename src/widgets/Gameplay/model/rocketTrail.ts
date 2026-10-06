import type { Projectile } from '../../../entities/Projectile/model/projectile';
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
	shot: Pick<Projectile, 'id' | 'type' | 'age' | 'position'> | undefined,
	time: number
) {
	if (shot?.type !== 'bazooka') {
		trail.shotId = null;
		trail.points = trail.points.filter((p) => time - p.born < 0.35);
		return;
	}
	if (trail.shotId !== shot.id) {
		trail.shotId = shot.id;
		trail.points = [];
		trail.nextAt = time;
		trail.launchAt = time - shot.age;
		trail.sample = { ...shot.position, time };
	}
	while (trail.nextAt <= time + 1e-9) {
		const span = time - trail.sample.time;
		const alpha =
			span > 0 ? Math.max(0, Math.min(1, (trail.nextAt - trail.sample.time) / span)) : 1;
		trail.points.push({
			x: trail.sample.x + (shot.position.x - trail.sample.x) * alpha,
			y: trail.sample.y + (shot.position.y - trail.sample.y) * alpha,
			born: trail.nextAt,
		});
		if (trail.points.length > TRAIL_LIMIT) trail.points.shift();
		trail.nextAt += trailInterval(Math.max(0, trail.nextAt - trail.launchAt));
	}
	trail.sample = { ...shot.position, time };
}
