import { createWorld } from '../../../entities/World/model/world';
import { spawnWorms, type TeamCounts } from '../../../entities/Worm/model/spawn';

/** Reject random maps without enough safe, separated spawn sites for both teams. */
export function createMatchWorld(width: number, height: number, seed: number, counts: TeamCounts) {
	for (let attempt = 0; attempt < 32; attempt++) {
		const world = createWorld(width, height, (seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
		if (!spawnWorms(world, { RED: counts.RED, BLUE: counts.BLUE }).missing) return world;
	}
	throw new RangeError('Could not generate a map with a complete team roster');
}
