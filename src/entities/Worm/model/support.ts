import type { TerrainModel } from '../../Terrain/model/terrain';
import { WORM } from './config';

/** Local downward ray through the live mask, never the original height curve. */
function floorBelow(terrain: TerrainModel, x: number, top: number, depth: number) {
	const start = Math.floor(top - terrain.bottom);
	for (let row = start; row >= Math.max(0, start - Math.ceil(depth)); row--) {
		const y = terrain.bottom + row + 0.5;
		if (terrain.isSolid(x, y) && !terrain.isSolid(x, y + 1)) return y + 0.5;
	}
	return null;
}

export function supportAt(terrain: TerrainModel, x: number, y: number, radius: number) {
	const contact = terrain.collideCircle(x, y - WORM.supportProbe, radius);
	if (!contact || contact.normalY <= 0.05) return null;
	const footprint = radius * 0.4;
	const contactX = x - contact.normalX * radius;
	const left = floorBelow(terrain, contactX - footprint, y + radius, radius * 4);
	const right = floorBelow(terrain, contactX + footprint, y + radius, radius * 4);
	const slope =
		left !== null && right !== null
			? Math.atan2(right - left, footprint * 2)
			: Math.atan2(-contact.normalX, contact.normalY);
	return { slope, contact };
}

/** Sweep down to first support; bounded stepping prevents snapping into a lower cave floor. */
export function restingY(
	terrain: TerrainModel,
	x: number,
	top: number,
	bottom: number,
	radius: number
) {
	if (terrain.collideCircle(x, top, radius)) return null;
	for (let y = top; y >= bottom; y -= 0.5) {
		const contact = terrain.collideCircle(x, y, radius);
		if (!contact) continue;
		if (contact.normalY < 0.1) return null;
		let resolved = y + contact.penetration / contact.normalY + WORM.skin;
		for (let pass = 0; pass < 4; pass++) {
			const remaining = terrain.collideCircle(x, resolved, radius);
			if (!remaining) return resolved;
			if (remaining.normalY < 0.1) return null;
			resolved += remaining.penetration / remaining.normalY + WORM.skin;
		}
		return null;
	}
	return null;
}

/** Keep standing artwork on the local ground while the circular collider touches a slope. */
export function spriteGroundDrop(terrain: TerrainModel, x: number, y: number, radius: number) {
	const floor = floorBelow(terrain, x, y, radius * 2 + 1);
	return floor === null ? 0 : Math.max(0, Math.min(radius, y - radius - floor));
}
