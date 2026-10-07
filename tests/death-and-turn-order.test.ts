import { expect, it } from 'vitest';
import {
	createExplosionState,
	explode,
	queueDeaths,
} from '../src/entities/Explosion/model/explosion';
import { createMatch, nextLivingCursor } from '../src/entities/Match/model/match';
import { TerrainModel } from '../src/entities/Terrain/model/terrain';
import { WEAPON } from '../src/entities/Weapon/model/config';
import type { GameWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { createHealthFeedback } from '../src/entities/Worm/model/healthFeedback';
import { createWorm, killWorm } from '../src/entities/Worm/model/worm';
import { advanceGame, createGame } from '../src/widgets/Gameplay/model/simulation';

const idle = { moveDirection: 0 as const, commands: [] };
const dt = WORM.fixedStep;
function flatGame() {
	const terrain = new TerrainModel(1200, 800, 7);
	const cells = new Uint8Array(terrain.width * terrain.height);
	cells.fill(1, 0, (terrain.width * terrain.height) / 2);
	terrain.restoreCells(cells);
	const world: GameWorld = {
		terrain,
		width: 1200,
		height: 800,
		waterLevel: -300,
		seed: 7,
		wind: 0,
	};
	const game = createGame(world, { RED: 1, BLUE: 1 });
	game.worms = [createWorm('RED-1', 'RED', -200, 7), createWorm('BLUE-1', 'BLUE', 0, 100)];
	game.match = createMatch(game.worms, { RED: 1, BLUE: 1 });
	game.match.turnState = 'CONTROL';
	game.healthFeedback = new Map(game.worms.map((w) => [w.id, createHealthFeedback(w.hp)]));
	return { game, world };
}

it('a lethal airborne blast preserves flight, waits for recovery and HP zero, then plays death and explodes', () => {
	const { game, world } = flatGame();
	const victim = game.worms[1];
	victim.hp = 10;
	game.healthFeedback.set(victim.id, createHealthFeedback(10));
	explode(game.explosions, world, game.worms, {
		position: { x: 0, y: 90 },
		...WEAPON.blast,
		source: 'weapon',
	});
	expect(victim.hp).toBe(0);
	expect(victim.alive).toBe(false);
	expect(victim.velocity.y).toBeGreaterThan(0);
	expect(victim.animationState).not.toBe('death');
	const queue = createExplosionState();
	const flightAge = victim.stateTime;
	victim.stateTime = WORM.deathDuration + 1;
	queueDeaths(queue, [victim]);
	expect(queue.queue).toHaveLength(0);
	victim.stateTime = flightAge;
	const initialY = victim.position.y;
	advanceGame(game, world, idle, dt);
	expect(victim.position.y).toBeGreaterThan(initialY);
	expect(game.healthFeedback.get(victim.id)?.displayed).toBe(10);
	let counted = false,
		startedDeath = false;
	for (let i = 0; i < 1200; i++) {
		advanceGame(game, world, idle, dt);
		const hp = game.healthFeedback.get(victim.id);
		if (victim.animationState === 'death' && !startedDeath) {
			startedDeath = true;
			expect(hp?.displayed).toBe(0);
			expect(Math.hypot(victim.velocity.x, victim.velocity.y)).toBe(0);
			expect(victim.stateTime).toBeLessThan(dt * 2);
		}
		if (!startedDeath && !victim.grounded) {
			expect(hp?.displayed).toBe(10);
			expect(game.explosions.deathEmitted.has(victim.id)).toBe(false);
		}
		if (hp && hp.displayed < 10 && hp.displayed > 0) counted = true;
		if (game.explosions.deathEmitted.has(victim.id)) break;
	}
	expect(counted).toBe(true);
	expect(startedDeath).toBe(true);
	expect(game.explosions.deathEmitted.has(victim.id)).toBe(true);
});

it('one surviving human worm receives a turn between both surviving bot worms', () => {
	const worms = ['RED-1', 'BLUE-1', 'RED-2', 'BLUE-2'].map((id) =>
		createWorm(id, id.startsWith('RED') ? 'RED' : 'BLUE', 0, 7)
	);
	worms[2].alive = false;
	worms[2].hp = 0;
	worms[0].hp = 5;
	const match = createMatch(worms, {
		RED: 2,
		BLUE: 2,
		mode: { type: 'bot', humanTeam: 'RED', botTeam: 'BLUE' },
	});
	const turns = [match.activeWormId];
	for (let i = 0; i < 6; i++) {
		const cursor = nextLivingCursor(match, worms);
		expect(cursor).not.toBeNull();
		match.turnCursor = cursor as number;
		match.activeWormId = match.turnOrder[match.turnCursor];
		const team = worms.find((w) => w.id === match.activeWormId)?.team;
		if (team) match.teamTurnCursor[team] = match.turnCursor;
		turns.push(match.activeWormId);
	}
	expect(turns).toEqual(['RED-1', 'BLUE-1', 'RED-1', 'BLUE-2', 'RED-1', 'BLUE-1', 'RED-1']);
});

it('a pending lethal hit survives save/load and can drown without a death blast', async () => {
	const { createSnapshot, restoreSnapshot } = await import(
		'../src/widgets/Gameplay/model/saveGame'
	);
	const { game, world } = flatGame();
	const victim = game.worms[1];
	victim.hp = 10;
	game.healthFeedback.set(victim.id, createHealthFeedback(10));
	explode(game.explosions, world, game.worms, {
		position: { x: 0, y: 90 },
		...WEAPON.blast,
		source: 'weapon',
	});
	advanceGame(game, world, idle, dt);
	const restored = restoreSnapshot(createSnapshot(game, world, 'pvp'));
	expect(restored.game.worms[1].deathPending).toBe(true);
	expect(restored.game.worms[1].velocity.y).toBeGreaterThan(0);
	expect(restored.game.healthFeedback.get(victim.id)?.displayed).toBe(10);
	const sinking = restored.game.worms[1];
	sinking.position.y = restored.world.waterLevel - 10;
	advanceGame(restored.game, restored.world, idle, dt);
	expect(sinking.animationState).toBe('drown');
	expect(sinking.deathPending).toBe(false);
	for (let i = 0; i < 300; i++) advanceGame(restored.game, restored.world, idle, dt);
	expect(restored.game.explosions.effects.some((e) => e.source === 'death')).toBe(false);
	expect(restored.game.match.result).toBe('RED');
});

it('the match engine grants full human CONTROL between bots after casualties and across save/load', async () => {
	const { createSnapshot, restoreSnapshot } = await import(
		'../src/widgets/Gameplay/model/saveGame'
	);
	let { game, world } = flatGame();
	game.worms = [
		createWorm('RED-1', 'RED', -200, 7),
		createWorm('RED-2', 'RED', -400, 7),
		createWorm('BLUE-1', 'BLUE', 100, 7),
		createWorm('BLUE-2', 'BLUE', 200, 7),
	];
	killWorm(game.worms[1], 'death');
	game.worms[1].stateTime = WORM.deathDuration;
	game.worms[0].hp = 5;
	game.healthFeedback = new Map(game.worms.map((w) => [w.id, createHealthFeedback(w.hp)]));
	game.match = createMatch(game.worms, {
		RED: 2,
		BLUE: 2,
		mode: { type: 'bot', humanTeam: 'RED', botTeam: 'BLUE' },
	});
	const turns = [game.match.activeWormId];
	for (let i = 0; i < 6; i++) {
		game.match.turnState = 'TURN_END';
		advanceGame(game, world, idle, dt);
		for (let j = 0; j < 180; j++) advanceGame(game, world, idle, dt);
		expect(game.match.turnState).toBe('CONTROL');
		expect(game.match.turnTimeRemaining).toBeGreaterThan(44.9);
		turns.push(game.match.activeWormId);
		if (i === 1) {
			const restored = restoreSnapshot(createSnapshot(game, world, 'bot'));
			game = restored.game;
			world = restored.world;
		}
	}
	expect(turns).toEqual(['RED-1', 'BLUE-1', 'RED-1', 'BLUE-2', 'RED-1', 'BLUE-1', 'RED-1']);
});
