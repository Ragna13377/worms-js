import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/entities/World/model/world';
import { en, ru } from '../src/shared/i18n/translations';
import { createSnapshot, restoreSnapshot } from '../src/widgets/Gameplay/model/saveGame';
import { advanceGame, createGame } from '../src/widgets/Gameplay/model/simulation';

describe('full game snapshots', () => {
	it('restores craters, clocks, teams, wind and every simulation field without sharing data', () => {
		const world = createWorld(900, 600, 42);
		const game = createGame(world, { RED: 2, BLUE: 2 });
		advanceGame(game, world, { moveDirection: 0, commands: [] }, 0.2);
		world.terrain.destroyCircle(0, -100, 40);
		world.wind = -0.75;
		game.match.turnTimeRemaining = 12.25;
		game.match.matchTimeRemaining = 321.5;
		game.paused = true;
		const snapshot = createSnapshot(game, world, 'pvp');
		const restored = restoreSnapshot(structuredClone(snapshot));
		expect(restored.world.terrain.exportCells()).toEqual(world.terrain.exportCells());
		expect(restored.world.wind).toBe(-0.75);
		expect(restored.game).toEqual({ ...game, paused: false });
		expect(restored.game.healthFeedback).toBeInstanceOf(Map);
		expect(restored.game.worms).not.toBe(game.worms);
		game.worms[0].hp = 10;
		expect(snapshot.game.worms[0].hp).toBe(100);
		world.terrain.destroyCircle(0, -200, 50);
		expect(snapshot.terrain).not.toEqual(world.terrain.exportCells());
	});
	it('continues an in-flight grenade identically after reload', () => {
		const world = createWorld(900, 600, 42);
		const game = createGame(world, { RED: 3, BLUE: 3 });
		const idle = { moveDirection: 0 as const, commands: [] };
		for (let i = 0; i < 200; i++) advanceGame(game, world, idle, 1 / 60);
		advanceGame(game, world, { moveDirection: 0, commands: ['grenade', 'chargeStart'] }, 0.2);
		advanceGame(game, world, { moveDirection: 0, commands: ['fire'] }, 0.05);
		expect(game.projectiles).toHaveLength(1);
		const restored = restoreSnapshot(createSnapshot(game, world, 'pvp'));
		for (let i = 0; i < 240; i++) {
			advanceGame(game, world, idle, 1 / 60);
			advanceGame(restored.game, restored.world, idle, 1 / 60);
		}
		expect(restored.game).toEqual(game);
		expect(restored.world.terrain.exportCells()).toEqual(world.terrain.exportCells());
	});
	it('allows local modes, rejects lobbies and incompatible or broken snapshots', () => {
		const world = createWorld(900, 600, 42);
		const game = createGame(world);
		expect(createSnapshot(game, world, 'bot').mode).toBe('bot');
		expect(() => createSnapshot(game, world, 'lobby')).toThrow();
		const snapshot = createSnapshot(game, world, 'pvp');
		expect(() => restoreSnapshot({ ...snapshot, version: 2 } as never)).toThrow();
		expect(() => restoreSnapshot({ ...snapshot, terrain: new Uint8Array(1) })).toThrow();
	});
});
it('has identical translation keys and substitutions in both languages', () => {
	expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
	for (const key of Object.keys(ru) as (keyof typeof ru)[]) {
		expect(en[key].length).toBeGreaterThan(0);
		expect(en[key].match(/\{\w+\}/g)).toEqual(ru[key].match(/\{\w+\}/g));
	}
});
