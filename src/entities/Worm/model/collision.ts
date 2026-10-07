import type { CircleContact, TerrainModel } from '../../Terrain/model/terrain';
import type { WormSurface } from './support';
import type { Worm } from './worm';

/** Other living bodies are obstacles and supports, using the same swept solver as terrain. */
export function wormSurface(terrain: TerrainModel, worm: Worm, worms: readonly Worm[]) {
	const others = worms.filter(
		(other) => other.id !== worm.id && (other.alive || other.deathPending)
	);
	function collideWorms(x: number, y: number, radius: number) {
		let contact: CircleContact | null = null;
		for (const other of others) {
			const dx = x - other.position.x;
			const dy = y - other.position.y;
			const distance = Math.hypot(dx, dy);
			const penetration = radius + other.collisionRadius - distance;
			if (penetration <= 0 || (contact && penetration <= contact.penetration)) continue;
			contact = {
				normalX: distance > 0 ? dx / distance : worm.id < other.id ? -1 : 1,
				normalY: distance > 0 ? dy / distance : 0,
				penetration,
			};
		}
		return contact;
	}
	const surface: WormSurface = {
		bottom: terrain.bottom,
		isSolid(x, y) {
			return (
				terrain.isSolid(x, y) ||
				others.some(
					(other) => Math.hypot(x - other.position.x, y - other.position.y) < other.collisionRadius
				)
			);
		},
		collideCircle(x, y, radius) {
			const ground = terrain.collideCircle(x, y, radius);
			const body = collideWorms(x, y, radius);
			return body && (!ground || body.penetration > ground.penetration) ? body : ground;
		},
	};
	return { surface, collideWorms };
}
