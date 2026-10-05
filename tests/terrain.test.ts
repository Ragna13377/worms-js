import assert from 'node:assert/strict';
import { test } from 'vitest';
import { seededRandom, TerrainModel } from '../src/entities/Terrain/model/terrain';
import { createTerrainTiles } from '../src/entities/Terrain/ui/terrainTiles';
import { clampCameraX, createWorld } from '../src/entities/World/model/world';

test('equal seed and dimensions generate identical data; different seeds vary', () => {
	const first = new TerrainModel(512, 256, 13377);
	assert.deepEqual(first.initialSurface, new TerrainModel(512, 256, 13377).initialSurface);
	assert.notDeepEqual(first.initialSurface, new TerrainModel(512, 256, 42).initialSurface);
});

test('starting landscape is contiguous ground with sky above in every column', () => {
	for (const seed of [0, 1, 42, 13377, 0xffffffff]) {
		const terrain = new TerrainModel(512, 256, seed);
		let sawGround = false;
		let reachedOcean = false;
		for (let col = 0; col < terrain.width; col++) {
			const x = terrain.left + col + 0.5;
			const height = terrain.heightAt(x);
			if (height === null) {
				if (sawGround) reachedOcean = true;
				for (let row = 0; row < terrain.height; row++)
					assert.equal(terrain.cellAt(col, row), false);
				continue;
			}
			assert.equal(
				reachedOcean,
				false,
				'Island must not have an empty column inside its ground mass'
			);
			sawGround = true;
			assert.ok(height > terrain.bottom && height < -terrain.bottom - 1);
			for (let row = 0; row < terrain.height; row++) {
				const y = terrain.bottom + row + 0.5;
				assert.equal(terrain.isSolid(x, y), y < height);
			}
			if (col > 0)
				assert.ok(Math.abs(terrain.initialSurface[col] - terrain.initialSurface[col - 1]) < 4);
		}
	}
});

test('circular destruction empties inside cells and preserves distant ones', () => {
	const terrain = new TerrainModel(512, 256, 42);
	const y = terrain.bottom + 30.5;
	assert.ok(terrain.isSolid(0.5, y));
	terrain.destroyCircle(0.5, y, 12);
	for (let dx = -15; dx <= 15; dx++) {
		for (let dy = -15; dy <= 15; dy++)
			assert.equal(terrain.isSolid(0.5 + dx, y + dy), dx * dx + dy * dy > 144);
	}
	assert.ok(terrain.isSolid(70, y));
});

test('overlaps merge, tunneling persists, original crust is never regenerated', () => {
	const terrain = new TerrainModel(512, 256, 42);
	const original = terrain.initialSurface.slice();
	const y = terrain.bottom + 35;
	for (let x = -50; x <= 50; x += 10) terrain.destroyCircle(x, y, 14);
	for (let x = -50; x <= 50; x++) assert.equal(terrain.isSolid(x, y), false);
	assert.deepEqual(terrain.initialSurface, original);
	assert.ok(terrain.isSolid(0, y + 22));
});

test('heightAt follows a crater and returns null for a removed column', () => {
	const terrain = new TerrainModel(512, 256, 13377);
	const surface = terrain.heightAt(0);
	assert.ok(surface !== null);
	terrain.destroyCircle(0, surface, 20);
	assert.ok((terrain.heightAt(0) ?? Infinity) < surface - 15);
	terrain.destroyCircle(0, 0, 400);
	assert.equal(terrain.heightAt(0), null);
});

test('bounds, invalid queries, edge craters and invalid radii are safe', () => {
	const terrain = new TerrainModel(100, 100, 3);
	for (const value of [-1e9, 1e9, Infinity, NaN]) {
		assert.equal(terrain.isSolid(value, value), false);
		assert.equal(terrain.heightAt(value), null);
		assert.equal(terrain.collideCircle(value, value, 2), null);
		assert.doesNotThrow(() => terrain.destroyCircle(value, value, 10));
	}
	assert.equal(terrain.isSolid(50, 0), false);
	assert.equal(terrain.isSolid(0, 50), false);
	assert.doesNotThrow(() => terrain.destroyCircle(-50, -50, 10));
	assert.equal(terrain.collideCircle(0, 0, -1), null);
	assert.throws(() => new TerrainModel(0, 10, 0), RangeError);
});

test('circle contact has an outward unit normal and follows live destruction', () => {
	const terrain = new TerrainModel(512, 256, 13377);
	const surface = terrain.heightAt(0);
	assert.ok(surface !== null);
	const contact = terrain.collideCircle(0.5, surface + 2, 6);
	assert.ok(contact);
	assert.ok(contact.normalY > 0);
	assert.ok(Math.abs(Math.hypot(contact.normalX, contact.normalY) - 1) < 1e-6);
	assert.ok(contact.penetration > 0);
	assert.equal(terrain.collideCircle(0, surface + 20, 3), null);
	assert.ok(terrain.collideCircle(0, surface - 10, 3));
	terrain.destroyCircle(0, surface - 10, 25);
	assert.equal(terrain.collideCircle(0, surface - 10, 3), null);
});

test('off-center embedded circles escape a flat surface vertically without residual contact', () => {
	const terrain = new TerrainModel(512, 256, 13377);
	const column = Array.from({ length: terrain.width - 8 }, (_, i) => i + 4).find((col) => {
		const h = terrain.heightAt(terrain.left + col);
		return (
			h !== null &&
			Array.from({ length: 9 }, (_, i) => terrain.heightAt(terrain.left + col + i - 4)).every(
				(value) => value === h
			)
		);
	});
	assert.ok(column !== undefined);
	const x = terrain.left + column + 0.1;
	const height = terrain.heightAt(x);
	assert.ok(height !== null);
	const y = height - 0.1;
	const contact = terrain.collideCircle(x, y, 3);
	assert.ok(contact);
	assert.equal(contact.normalX, 0);
	assert.equal(contact.normalY, 1);
	assert.ok(Math.abs(contact.penetration - 3.1) < 1e-9);
	assert.equal(terrain.collideCircle(x, y + contact.penetration + 1e-6, 3), null);
});

test('dirty notifications are bounded and empty craters do not notify', () => {
	const terrain = new TerrainModel(512, 256, 3);
	let calls = 0;
	const unsubscribe = terrain.subscribe((region) => {
		calls++;
		assert.ok(region.right - region.left <= 20 && region.top - region.bottom <= 20);
	});
	terrain.destroyCircle(0, -100, 10);
	terrain.destroyCircle(0, -100, 10);
	assert.equal(calls, 1);
	unsubscribe();
	terrain.destroyCircle(40, -100, 10);
	assert.equal(calls, 1);
});

test('tile alpha exactly matches live collision mask after 100 craters; buffers stay stable', () => {
	const terrain = new TerrainModel(1440, 640, 13377);
	const rendering = createTerrainTiles(terrain);
	const unsubscribe = terrain.subscribe(rendering.update);
	const buffers = rendering.tiles.map((tile) => tile.pixels);
	const versions = rendering.tiles.map((tile) => tile.texture.version);
	terrain.destroyCircle(terrain.left + 562, terrain.bottom + 50, 10);
	assert.equal(rendering.tiles.filter((tile, i) => tile.texture.version !== versions[i]).length, 1);
	const random = seededRandom(91);
	const start = performance.now();
	for (let i = 0; i < 100; i++)
		terrain.destroyCircle(
			(random() - 0.5) * terrain.width,
			terrain.bottom + random() * terrain.height * 0.7,
			38
		);
	console.log(`100 craters with tile updates: ${(performance.now() - start).toFixed(1)}ms`);
	for (const [i, tile] of rendering.tiles.entries()) {
		assert.equal(tile.pixels, buffers[i]);
		for (let y = 0; y < tile.height; y++) {
			for (let x = 0; x < tile.width; x++)
				assert.equal(
					tile.pixels[(y * tile.width + x) * 4 + 3] > 0,
					terrain.cellAt(tile.x + x, tile.y + y)
				);
		}
	}
	unsubscribe();
	rendering.dispose();
});

test('world regeneration resets terrain, wind is deterministic, camera clamps at both ends', () => {
	const world = createWorld(800, 600, 13377);
	assert.equal(world.width, 1800);
	assert.equal(world.waterLevel, -150);
	assert.ok(world.wind >= -1 && world.wind <= 1);
	assert.equal(world.wind, createWorld(800, 600, 13377).wind);
	assert.notEqual(world.wind, createWorld(800, 600, 42).wind);
	world.terrain.destroyCircle(0, -200, 30);
	assert.equal(world.terrain.isSolid(0, -200), false);
	assert.equal(createWorld(800, 600, 13377).terrain.isSolid(0, -200), true);
	assert.equal(clampCameraX(-10000, 1800, 800), -500);
	assert.equal(clampCameraX(10000, 1800, 800), 500);
	assert.equal(clampCameraX(20, 1800, 800), 20);
	assert.equal(clampCameraX(20, 200, 800), 0);
});
