import type { GameWorld } from './world';
export const WORLD_ZOOM = 0.8;
export function worldLayout(world: GameWorld) {
	let peak = world.terrain.bottom;
	for (const height of world.terrain.initialSurface)
		peak = Math.max(peak, world.terrain.bottom + height);
	const cameraY = Math.min(
		Math.max(0, peak + (world.height / WORLD_ZOOM) * 0.12),
		world.waterLevel + (world.height / WORLD_ZOOM) * 0.34
	);
	const cloudTop =
		Math.max(0, peak + (world.height / WORLD_ZOOM) * 0.12) + (world.height / WORLD_ZOOM) * 0.36;
	return { cameraY, cloudTop, debrisTop: cloudTop - 105 };
}
