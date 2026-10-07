import { expect, it } from 'vitest';
import { createWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { createSnapshot, restoreSnapshot } from '../src/widgets/Gameplay/model/saveGame';
import { advanceGame, createGame } from '../src/widgets/Gameplay/model/simulation';

const idle = { moveDirection: 0 as const, commands: [] };

it.each([false, true])(
	'each team restores its own weapon for other worms, including save/load=%s',
	(reload) => {
		let world = createWorld(600, 400, 7);
		let game = createGame(world, { RED: 2, BLUE: 2 });
		const choose = (commands: Parameters<typeof advanceGame>[2]['commands']) => {
			game.match.turnState = 'CONTROL';
			game.inputNeedsNeutral = false;
			advanceGame(game, world, { moveDirection: 0, commands }, WORM.fixedStep);
		};
		const next = () => {
			game.match.turnState = 'TURN_END';
			advanceGame(game, world, idle, WORM.fixedStep);
		};
		choose(['grenade', 'switchWeapon']);
		expect(game.weapon.selectedWeapon).toBe('bazooka');
		next();
		expect(game.match.activeWormId).toBe('BLUE-1');
		choose(['grenade']);
		if (reload) {
			const restored = restoreSnapshot(createSnapshot(game, world, 'pvp'));
			game = restored.game;
			world = restored.world;
		}
		next();
		expect(game.match.activeWormId).toBe('RED-2');
		expect(game.weapon.selectedWeapon).toBe('bazooka');
		next();
		expect(game.match.activeWormId).toBe('BLUE-2');
		expect(game.weapon.selectedWeapon).toBe('grenade');
		next();
		expect(game.match.activeWormId).toBe('RED-1');
		expect(game.weapon.selectedWeapon).toBe('bazooka');
	}
);

it('an old save preserves the active team weapon and defaults the other team to bazooka', () => {
	const world = createWorld(600, 400, 7);
	const game = createGame(world, { RED: 1, BLUE: 1 });
	game.weapon.selectedWeapon = 'grenade';
	const snapshot = createSnapshot(game, world, 'pvp');
	Reflect.deleteProperty(snapshot.game, 'teamWeapons');
	const restored = restoreSnapshot(snapshot);
	expect(restored.game.teamWeapons).toEqual({ RED: 'grenade', BLUE: 'bazooka' });
	restored.game.match.turnState = 'TURN_END';
	advanceGame(restored.game, restored.world, idle, WORM.fixedStep);
	expect(restored.game.weapon.selectedWeapon).toBe('bazooka');
});
