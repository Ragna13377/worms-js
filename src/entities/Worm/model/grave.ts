import type { TerrainModel } from '../../Terrain/model/terrain';
import { WORM } from './config';
import { restingY } from './support';

export function createGraveMotion(y: number) {
	return { y, velocity: 0, floor: null as number | null, sinking: false, visible: true };
}
export function advanceGrave(
	grave: ReturnType<typeof createGraveMotion>,
	terrain: TerrainModel,
	x: number,
	radius: number,
	waterLevel: number,
	delta: number,
	dirty: boolean
) {
	if (!grave.visible) return;
	const dt = Math.max(0, Math.min(delta, 0.05));
	if (!grave.sinking && dirty)
		grave.floor = restingY(terrain, x, grave.y + radius * 2, terrain.bottom, radius);
	if (grave.y - radius <= waterLevel) grave.sinking = true;
	if (grave.sinking) {
		grave.y -= WORM.drownSinkSpeed * dt;
		grave.visible = grave.y + 60 >= terrain.bottom;
		return;
	}
	const floor = grave.floor !== null && grave.floor - radius > waterLevel ? grave.floor : null;
	if (floor !== null && grave.y <= floor) {
		grave.y = floor;
		grave.velocity = 0;
		return;
	}
	grave.velocity = Math.min(WORM.maxFallSpeed, grave.velocity + WORM.gravity * dt);
	grave.y = Math.max(floor ?? -Infinity, grave.y - grave.velocity * dt);
}
