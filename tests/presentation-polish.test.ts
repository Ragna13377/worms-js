import assert from 'node:assert/strict';
import { test } from 'vitest';
import { TerrainModel } from '../src/entities/Terrain/model/terrain';
import { createTerrainTiles } from '../src/entities/Terrain/ui/terrainTiles';
import { createRocketTrail, updateRocketTrail } from '../src/widgets/Gameplay/model/rocketTrail';

test('rocket trail retains only the last twelve particles and emission gaps grow with flight age', () => {
	const trail = createRocketTrail();
	for (let i = 0; i < 300; i++) {
		const t = i / 120;
		updateRocketTrail(
			trail,
			{ id: 1, type: 'bazooka', age: t, position: { x: t * 500, y: 100 } },
			t
		);
		assert.ok(trail.points.length <= 12);
	}
	assert.equal(trail.points.length, 12);
	assert.ok(trail.points[0].x > 500, 'launch particles must already be discarded');
	const early = createRocketTrail();
	for (let i = 0; i < 24; i++) {
		const t = i / 120;
		updateRocketTrail(
			early,
			{ id: 1, type: 'bazooka', age: t, position: { x: t * 500, y: 100 } },
			t
		);
	}
	const gap = (p: typeof trail.points) => {
		assert.ok(p.length >= 2);
		return p[p.length - 1].x - p[p.length - 2].x;
	};
	assert.ok(gap(trail.points) > gap(early.points) * 2);
	updateRocketTrail(trail, undefined, 3);
	assert.equal(trail.points.length, 0);
	updateRocketTrail(trail, { id: 2, type: 'bazooka', age: 0, position: { x: 0, y: 0 } }, 3.1);
	assert.equal(trail.points.length, 1);
});
test('crater rims repaint both sides of tile seams without changing collision or distant texture', () => {
	const terrain = new TerrainModel(256, 256, 13377),
		rendering = createTerrainTiles(terrain);
	const unsubscribe = terrain.subscribe(rendering.update);
	const pixel = (x: number, y: number) => {
		const tile = rendering.tiles.find(
			(t) => x >= t.x && x < t.x + t.width && y >= t.y && y < t.y + t.height
		);
		assert.ok(tile);
		const i = ((y - tile.y) * tile.width + x - tile.x) * 4;
		return [...tile.pixels.slice(i, i + 4)];
	};
	const distant = pixel(160, 32),
		original = pixel(141, 32);
	terrain.destroyCircle(terrain.left + 128.5, terrain.bottom + 32.5, 12);
	assert.equal(pixel(128, 32)[3], 0);
	assert.equal(terrain.cellAt(128, 32), false);
	for (const x of [115, 141]) {
		assert.equal(pixel(x, 32)[3], 255);
		assert.ok(pixel(x, 32)[2] > original[2] + 80);
		assert.equal(terrain.cellAt(x, 32), true);
	}
	assert.deepEqual(pixel(160, 32), distant);
	terrain.destroyCircle(terrain.left + 141.5, terrain.bottom + 32.5, 10);
	assert.equal(pixel(141, 32)[3], 0);
	unsubscribe();
	rendering.dispose();
});
