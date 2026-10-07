import { expect, it } from 'vitest';
import { TerrainModel } from '../src/entities/Terrain/model/terrain';
import { WORM } from '../src/entities/Worm/model/config';
import { advanceGrave, createGraveMotion } from '../src/entities/Worm/model/grave';

it('a grave falls when its support disappears, sinks through water and leaves the visible world', () => {
	const terrain = new TerrainModel(800, 600, 13377);
	terrain.destroyCircle(0, 0, 5000);
	const grave = createGraveMotion(50);
	advanceGrave(grave, terrain, 0, WORM.radius, -150, 1 / 60, true);
	expect(grave.y).toBeLessThan(50);
	for (let i = 0; i < 600; i++) advanceGrave(grave, terrain, 0, WORM.radius, -150, 1 / 60, false);
	expect(grave.sinking).toBe(true);
	expect(grave.y).toBeLessThan(terrain.bottom - 60);
	expect(grave.visible).toBe(false);
});

it('a grave rests on surviving dry land and cannot reappear after sinking', () => {
	const terrain = new TerrainModel(800, 600, 13377);
	const cells = new Uint8Array(800 * 600);
	cells.fill(1, 0, 800 * 300);
	terrain.restoreCells(cells);
	const grave = createGraveMotion(WORM.radius + 1);
	for (let i = 0; i < 180; i++) advanceGrave(grave, terrain, 0, WORM.radius, -150, 1 / 60, i === 0);
	expect(grave.y).toBeGreaterThan(0);
	expect(grave.sinking).toBe(false);
	expect(grave.visible).toBe(true);
	terrain.destroyCircle(0, 0, 5000);
	for (let i = 0; i < 600; i++) advanceGrave(grave, terrain, 0, WORM.radius, -150, 1 / 60, i === 0);
	terrain.restoreCells(cells);
	advanceGrave(grave, terrain, 0, WORM.radius, -150, 1 / 60, true);
	expect(grave.visible).toBe(false);
});
