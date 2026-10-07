import { describe, expect, it } from 'vitest';
import type { TurnState } from '../src/entities/Match/model/match';
import { createWorld } from '../src/entities/World/model/world';
import { GameplayControls } from '../src/widgets/Gameplay/model/controls';
import { advanceGame } from '../src/widgets/Gameplay/model/simulation';
import { createControlledGame } from './gameFixture';

describe('local pause', () => {
	it.each<TurnState>(['TURN_START', 'CONTROL', 'FIRING', 'SETTLING', 'TURN_END', 'MATCH_END'])(
		'freezes all simulation state in %s',
		(phase) => {
			const world = createWorld(900, 600, 42);
			const game = createControlledGame(world);
			advanceGame(game, world, { moveDirection: 0, commands: ['grenade', 'chargeStart'] }, 0.2);
			advanceGame(game, world, { moveDirection: 0, commands: ['fire'] }, 0.05);
			expect(game.projectiles).toHaveLength(1);
			game.match.turnState = phase;
			game.paused = true;
			const before = structuredClone(game);
			const cells = world.terrain.exportCells();
			const wind = world.wind;
			for (let i = 0; i < 300; i++)
				advanceGame(game, world, { moveDirection: 1, commands: ['switchWeapon'] }, 0.1);
			expect(game).toEqual(before);
			expect(world.wind).toBe(wind);
			expect(world.terrain.exportCells()).toEqual(cells);
			game.paused = false;
			advanceGame(game, world, { moveDirection: 0, commands: [] }, 0.1);
			expect(game.time).toBeGreaterThan(before.time);
		}
	);
});
it('Q switches weapons once per press and cancels an active charge', () => {
	const world = createWorld(900, 600, 42);
	const game = createControlledGame(world);
	const controls = new GameplayControls();
	advanceGame(game, world, { moveDirection: 0, commands: ['chargeStart'] }, 0.1);
	expect(game.weapon.isCharging).toBe(true);
	controls.press('KeyQ');
	controls.press('KeyQ', true);
	advanceGame(game, world, controls.consume(), 0.1);
	expect(game.weapon.selectedWeapon).toBe('grenade');
	expect(game.weapon.isCharging).toBe(false);
	expect(game.fuseNotice?.fuse).toBe(game.weapon.grenadeFuse);
	controls.release('KeyQ');
	controls.press('KeyQ');
	advanceGame(game, world, controls.consume(), 0.1);
	expect(game.weapon.selectedWeapon).toBe('bazooka');
	expect(game.fuseNotice).toBeNull();
	expect(controls.press('KeyR')).toBe(false);
});
