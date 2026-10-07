import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { prepareMatch } from '../realtime/src/match';
import { createMatchWorld } from '../src/widgets/Gameplay/model/matchWorld';

it('different online rooms receive fresh seeds and distinct terrain while peers share one map', () => {
	const rooms = Array.from({ length: 8 }, () => prepareMatch(1).config);
	expect(new Set(rooms.map((r) => r.seed)).size).toBe(8);
	const terrain = (seed: number) => {
		const world = createMatchWorld(1280, 720, seed, { RED: 1, BLUE: 1 });
		return createHash('sha256').update(world.terrain.exportCells()).digest('hex');
	};
	const hashes = rooms.map((r) => terrain(r.seed));
	expect(new Set(hashes).size).toBe(8);
	expect(terrain(rooms[0].seed)).toBe(hashes[0]);
});

it('local match generation varies terrain by seed for either roster', () => {
	for (const count of [1, 3]) {
		const worlds = [13377, 42, 71, 98123].map((seed) =>
			createMatchWorld(1280, 720, seed, { RED: count, BLUE: count })
		);
		const hashes = worlds.map((w) =>
			createHash('sha256').update(w.terrain.exportCells()).digest('hex')
		);
		expect(new Set(hashes).size).toBe(4);
	}
});
