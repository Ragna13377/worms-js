import { seededRandom, TerrainModel } from '../../Terrain/model/terrain';

export const CRATER_RADIUS = 38;
export const WORLD_WIDTH_FACTOR = 2.25;

export function clampCameraX(x: number, worldWidth: number, viewportWidth: number): number {
	const limit = Math.max(0, (worldWidth - viewportWidth) / 2);
	return Math.max(-limit, Math.min(limit, x));
}

/** Signed edge-scroll speed; the outer 48px ramp smoothly up to full speed. */
export function edgePanDirection(pointerX: number | null, viewportWidth: number): number {
	if (pointerX === null || !Number.isFinite(pointerX) || viewportWidth <= 0) return 0;
	if (pointerX < 0 || pointerX > viewportWidth) return 0;
	const edge = Math.min(48, viewportWidth * 0.1);
	if (pointerX < edge) return -(1 - pointerX / edge);
	if (pointerX > viewportWidth - edge) return (pointerX - viewportWidth + edge) / edge;
	return 0;
}

export function createWorld(viewportWidth: number, viewportHeight: number, seed: number) {
	const terrain = new TerrainModel(viewportWidth * WORLD_WIDTH_FACTOR, viewportHeight, seed);
	return {
		seed,
		terrain,
		width: terrain.width,
		height: terrain.height,
		waterLevel: -terrain.height * 0.25,
		wind: seededRandom(seed ^ 0x57a1d)() * 2 - 1,
	};
}

export type GameWorld = ReturnType<typeof createWorld>;
