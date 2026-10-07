import { describe, expect, it } from 'vitest';
import { BOT } from '../src/entities/Bot/model/config';
import { BotController, botController } from '../src/entities/Bot/model/controller';
import { BotPlanner, localMovements, turnSeed } from '../src/entities/Bot/model/planner';
import {
	predictMovement,
	type Shot,
	simulateCandidateShot,
} from '../src/entities/Bot/model/prediction';
import { scoreShot } from '../src/entities/Bot/model/scoring';
import { createMatch } from '../src/entities/Match/model/match';
import { launchProjectile } from '../src/entities/Projectile/model/projectile';
import { TerrainModel } from '../src/entities/Terrain/model/terrain';
import { createWeaponState } from '../src/entities/Weapon/model/weapon';
import type { GameWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { createHealthFeedback } from '../src/entities/Worm/model/healthFeedback';
import { createWorm } from '../src/entities/Worm/model/worm';
import { createMatchWorld } from '../src/widgets/Gameplay/model/matchWorld';
import { createSnapshot, restoreSnapshot } from '../src/widgets/Gameplay/model/saveGame';
import { advanceGame, createGame, type GameInput } from '../src/widgets/Gameplay/model/simulation';

const dt = WORM.fixedStep;
const idle: GameInput = { moveDirection: 0, commands: [] };
it('starts a complete bot match with the explicit menu configuration', () => {
	const config = {
		RED: 1,
		BLUE: 1,
		mode: { type: 'bot' as const, humanTeam: 'RED' as const, botTeam: 'BLUE' as const },
	};
	const world = createMatchWorld(1280, 720, 13377, config);
	expect(createGame(world, config).missing).toBe(0);
});
function fixture(enemyX = 220, surface: (x: number) => number = () => 0) {
	const terrain = new TerrainModel(1600, 800, 7);
	const cells = new Uint8Array(terrain.width * terrain.height);
	for (let y = 0; y < terrain.height; y++)
		for (let x = 0; x < terrain.width; x++)
			if (terrain.bottom + y < surface(terrain.left + x)) cells[y * terrain.width + x] = 1;
	terrain.restoreCells(cells);
	const world: GameWorld = {
		terrain,
		width: terrain.width,
		height: terrain.height,
		waterLevel: -300,
		seed: 7,
		wind: 0,
	};
	const game = createGame(world, {
		RED: 1,
		BLUE: 1,
		mode: { type: 'bot', humanTeam: 'RED', botTeam: 'BLUE' },
	});
	game.worms = [
		createWorm('BLUE-0', 'BLUE', 0, surface(0) + 7),
		createWorm('RED-0', 'RED', enemyX, surface(enemyX) + 7),
	];
	game.match = createMatch(game.worms, game.match.config);
	game.match.activeWormId = 'BLUE-0';
	game.match.turnCursor = 1;
	game.match.turnState = 'CONTROL';
	game.healthFeedback = new Map(game.worms.map((w) => [w.id, createHealthFeedback(w.hp)]));
	game.inputNeedsNeutral = false;
	return { game, world, shooter: game.worms[0] };
}
function plan(enemyX = 220, surface?: (x: number) => number) {
	const f = fixture(enemyX, surface);
	const planner = new BotPlanner(f.world, f.shooter, f.game.worms, true);
	while (!planner.complete) planner.step(100);
	return { ...f, planner, selected: planner.choose(7) };
}

describe('bot presentation and legal execution', () => {
	it('preserves a human charge and pending inputs when loading a bot-mode human turn', () => {
		const { game, world } = fixture();
		game.match.activeWormId = 'RED-0';
		game.weapon.isCharging = true;
		game.weapon.charge = 0.5;
		game.weapon.shooterId = 'RED-0';
		game.pendingCommands = ['fire'];
		const restored = restoreSnapshot(createSnapshot(game, world, 'bot'));
		expect(restored.game).toEqual(game);
	});
	it('emits no movement, aim or weapon input for two simulation seconds, even with hostile human input', () => {
		const { game, world, shooter } = fixture();
		const before = { ...shooter.position };
		const angle = game.weapon.aimAngle;
		for (let i = 0; i < 120; i++) {
			advanceGame(
				game,
				world,
				{
					moveDirection: -1,
					aimDirection: 1,
					commands: ['highJump', 'grenade', 'chargeStart', 'fire'],
				},
				dt
			);
			expect(shooter.position.x).toBe(before.x);
			expect(game.weapon.aimAngle).toBe(angle);
			expect(game.weapon.isCharging).toBe(false);
			expect(game.weapon.selectedWeapon).toBe('bazooka');
		}
		expect(game.time).toBeCloseTo(2);
		for (let i = 0; i < 1200 && game.match.turnState === 'CONTROL'; i++)
			advanceGame(game, world, idle, dt);
		expect(game.match.turnState).toBe('FIRING');
		expect(game.nextProjectileId).toBe(2);
		expect(game.match.turnTimeRemaining).toBeGreaterThan(20);
	});
	it('is idle outside bot CONTROL and never mutates observed gameplay', () => {
		const { game, world } = fixture();
		const bot = new BotController();
		for (const state of ['TURN_START', 'FIRING', 'SETTLING', 'TURN_END', 'MATCH_END'] as const) {
			game.match.turnState = state;
			expect(bot.consume(game, world)).toEqual(idle);
		}
		game.match.turnState = 'CONTROL';
		game.match.activeWormId = 'RED-0';
		expect(bot.consume(game, world)).toEqual(idle);
		game.match.activeWormId = 'BLUE-0';
		const before = structuredClone(game);
		for (let i = 0; i < 150; i++) bot.consume(game, world);
		expect(game).toEqual(before);
	});
	it('uses simulation time, freezes during pause and restarts thinking after load', () => {
		const { game, world } = fixture();
		advanceGame(game, world, idle, 0.1);
		game.paused = true;
		advanceGame(game, world, { moveDirection: 1, commands: ['chargeStart'] }, 10);
		expect(game.time).toBeCloseTo(0.1);
		game.weapon.isCharging = true;
		game.weapon.charge = 0.5;
		const restored = restoreSnapshot(createSnapshot(game, world, 'bot'));
		expect(restored.game.match.config.mode).toEqual({
			type: 'bot',
			botTeam: 'BLUE',
			humanTeam: 'RED',
		});
		expect(restored.game.weapon.isCharging).toBe(false);
		for (let i = 0; i < 120; i++) advanceGame(restored.game, restored.world, idle, dt);
		expect(restored.game.weapon.isCharging).toBe(false);
		expect(botController(restored.game).phase).toBe('THINKING');
	});
	it('honors the initial delay under timer pressure, then fires without movement', () => {
		const { game, world, shooter } = fixture();
		game.match.turnTimeRemaining = 5;
		for (let i = 0; i < 300 && game.match.turnState === 'CONTROL'; i++)
			advanceGame(game, world, idle, dt);
		expect(game.time).toBeGreaterThanOrEqual(2);
		expect(game.match.turnState).toBe('FIRING');
		expect(Math.abs(shooter.position.x)).toBeLessThan(1);
	});
	it('supports a RED bot and keeps hot-seat input working', () => {
		const { game, world } = fixture();
		game.match.config.mode = { type: 'bot', botTeam: 'RED', humanTeam: 'BLUE' };
		game.match.activeWormId = 'RED-0';
		advanceGame(game, world, { moveDirection: 1, commands: [] }, dt);
		expect(game.worms[1].position.x).toBe(220);
		game.match.config.mode = { type: 'hotseat' };
		advanceGame(game, world, { moveDirection: 1, commands: [] }, dt);
		expect(game.worms[1].position.x).toBeGreaterThan(220);
	});
});

describe('physics prediction', () => {
	for (const wind of [-0.7, 0, 0.7])
		for (const weapon of ['bazooka', 'grenade'] as const)
			it(`agrees with live ${weapon} resolution at wind ${wind}`, () => {
				const { game, world, shooter } = fixture();
				world.wind = wind;
				shooter.facing = 'right';
				const shot: Shot = { weapon, facing: 'right', angle: Math.PI / 4, power: 0.4, fuse: 3 };
				const cells = world.terrain.exportCells();
				const worms = structuredClone(game.worms);
				const prediction = simulateCandidateShot(world, game.worms, shooter, shot);
				expect(game.worms).toEqual(worms);
				expect(world.terrain.exportCells()).toEqual(cells);
				game.projectiles = [
					launchProjectile(1, shooter, {
						...createWeaponState(),
						selectedWeapon: weapon,
						aimAngle: shot.angle,
						charge: shot.power,
						grenadeFuse: shot.fuse,
					}),
				];
				game.match.turnState = 'FIRING';
				for (let i = 0; i < 600 && !game.lastShotResult; i++) advanceGame(game, world, idle, dt);
				expect(prediction.outcome).toBe('explosion');
				expect(game.lastShotResult?.position.x).toBeCloseTo(prediction.position.x, 5);
				expect(game.lastShotResult?.position.y).toBeCloseTo(prediction.position.y, 5);
			});
	it('handles water, immediate terrain and worm collision', () => {
		const { game, world, shooter } = fixture(45);
		const direct: Shot = { weapon: 'bazooka', facing: 'right', angle: 0, power: 0.6, fuse: 3 };
		const collision = simulateCandidateShot(world, game.worms, shooter, direct);
		expect(collision.outcome).toBe('explosion');
		expect(collision.position.x).toBeLessThan(45);
		world.terrain.destroyCircle(0, 0, 2000);
		expect(
			simulateCandidateShot(world, [shooter], shooter, { ...direct, angle: -0.5 }).outcome
		).toBe('water');
		const wall = fixture(220, (x) => (x > 12 && x < 28 ? 80 : 0));
		expect(
			simulateCandidateShot(wall.world, wall.game.worms, wall.shooter, direct).position.x
		).toBeLessThan(30);
	});
	it('uses real walking and jumps, and rejects lethal ledges', () => {
		const { world, shooter } = fixture();
		const walk = predictMovement(world, shooter, { direction: 1, seconds: 0.65 });
		expect(walk?.worm.position.x).toBeCloseTo(25.025, 1);
		const jump = predictMovement(world, shooter, {
			direction: 1,
			seconds: 2 / 60,
			jump: 'forward',
		});
		expect(jump?.worm.position.x).toBeGreaterThan(50);
		const ledge = fixture(220, (x) => (x < 15 ? 0 : -400));
		expect(predictMovement(ledge.world, ledge.shooter, { direction: 1, seconds: 1.5 })).toBeNull();
		expect(shooter.position.x).toBe(0);
	});
});

describe('tactical choices and medium errors', () => {
	it('stays for a good attack but evaluates local movement regardless of current shot quality', () => {
		const { selected, planner } = plan();
		expect(selected?.shot.score).toBeGreaterThan(25);
		expect(selected?.movement.direction).toBe(0);
		expect(planner.evaluated).toBeLessThan(7000);
		expect(localMovements().some((m) => m.jump === 'backflip')).toBe(true);
	});
	it('deliberately backs away from a close target to improve damage without blasting itself', () => {
		const { selected, planner } = plan(30);
		const stay = planner.choose(7, false);
		expect(selected?.movement.direction).not.toBe(0);
		expect(selected?.positionScore).toBeGreaterThan(
			(stay?.positionScore ?? 0) + BOT.improvementRequired
		);
	});
	it('penalizes self/friendly damage and rewards useful kills and grouped damage', () => {
		const { game, shooter } = fixture(150);
		const hit = { outcome: 'explosion' as const, position: { x: 150, y: 7 }, flightTime: 1 };
		const damage = scoreShot(hit, game.worms, shooter);
		game.worms[1].hp = 25;
		expect(scoreShot(hit, game.worms, shooter)).toBeGreaterThan(damage);
		game.worms.push(createWorm('RED-1', 'RED', 155, 7));
		expect(scoreShot(hit, game.worms, shooter)).toBeGreaterThan(damage + 25);
		game.worms.push(createWorm('BLUE-1', 'BLUE', 150, 7));
		expect(scoreShot(hit, game.worms, shooter)).toBeLessThan(damage);
		expect(scoreShot({ ...hit, position: { x: 0, y: 7 } }, game.worms, shooter)).toBeLessThan(0);
		expect(scoreShot({ ...hit, outcome: 'water' }, game.worms, shooter)).toBeLessThan(0);
	});
	it('reproduces fixed seeds, varies sensible aim and keeps execution error bounded', () => {
		const { planner } = plan();
		const first = planner.choose(turnSeed(7, 2, 'BLUE-0'));
		expect(planner.choose(turnSeed(7, 2, 'BLUE-0'))).toEqual(first);
		const samples = Array.from({ length: 20 }, (_, i) => planner.choose(turnSeed(7, i, 'BLUE-0')));
		expect(new Set(samples.map((p) => p?.shot.angle)).size).toBeGreaterThan(10);
		for (const sample of samples) {
			expect(sample?.shot.score).toBeGreaterThan(25);
			expect(sample?.shot.power).toBeGreaterThanOrEqual(0.05);
			expect(sample?.shot.power).toBeLessThanOrEqual(0.98);
		}
	});
});

it('walks to clear a nearby obstruction and jumps when a reachable position improves the attack', () => {
	const walk = plan(140, (x) => (x > 14 && x < 45 ? 80 : 0));
	expect(walk.selected?.movement.jump).toBeUndefined();
	expect(walk.selected?.movement.direction).toBe(-1);
	const jump = plan(700, (x) => (x > 14 && x < 45 ? 45 : 0));
	expect(jump.selected?.movement.jump).toBe('forward');
	expect(jump.selected?.positionScore).toBeGreaterThan(
		(jump.planner.choose(7, false)?.positionScore ?? 0) + 8
	);
});

it('chooses a bouncing grenade and evaluates its fuse under a low roof', () => {
	const f = fixture(350);
	const cells = f.world.terrain.exportCells();
	for (let y = 418; y < 480; y++) for (let x = 810; x < 1250; x++) cells[y * 1600 + x] = 1;
	f.world.terrain.restoreCells(cells);
	const planner = new BotPlanner(f.world, f.shooter, f.game.worms, false);
	while (!planner.complete) planner.step(100);
	const selected = planner.choose(7);
	expect(selected?.shot.weapon).toBe('grenade');
	expect(selected?.shot.score).toBeGreaterThan(30);
	expect(selected?.shot.fuse).toBe(1);
});
it('reobserves the actual landing and pauses briefly before aiming', () => {
	const { game, world } = fixture(30);
	let moving = false,
		rethinking = false,
		pauseStarted = 0,
		sawShot = false;
	for (let i = 0; i < 1200 && game.match.turnState === 'CONTROL'; i++) {
		advanceGame(game, world, idle, dt);
		const phase = botController(game).phase;
		if (phase === 'MOVING') moving = true;
		if (phase === 'REEVALUATING' && !rethinking) {
			rethinking = true;
			pauseStarted = game.time;
		}
		if (rethinking && game.time - pauseStarted < 0.55) {
			expect(game.weapon.isCharging).toBe(false);
			expect(phase).toBe('REEVALUATING');
		}
		if (game.nextProjectileId === 2) sawShot = true;
	}
	expect(moving).toBe(true);
	expect(rethinking).toBe(true);
	expect(sawShot).toBe(true);
	expect(game.worms[0].alive).toBe(true);
});
it('advances deterministic 1v1, 2v2 and 3v3 matches without deadlock', () => {
	for (const count of [1, 2, 3]) {
		const { game, world } = fixture(220);
		game.worms = Array.from({ length: count }, (_, i) => [
			createWorm(`RED-${i}`, 'RED', 220 + i * 60, 7),
			createWorm(`BLUE-${i}`, 'BLUE', -i * 60, 7),
		]).flat();
		game.match = createMatch(game.worms, {
			RED: count,
			BLUE: count,
			mode: { type: 'bot', botTeam: 'BLUE', humanTeam: 'RED' },
		});
		game.healthFeedback = new Map(game.worms.map((w) => [w.id, createHealthFeedback(w.hp)]));
		game.match.matchTimeRemaining = 60;
		let botShots = 0;
		for (let i = 0; i < 9000 && game.match.turnState !== 'MATCH_END'; i++) {
			const active = game.worms.find((w) => w.id === game.match.activeWormId);
			const human = active?.team === 'RED' && game.match.turnState === 'CONTROL';
			const input: GameInput = human
				? {
						moveDirection: 0,
						commands: game.weapon.isCharging
							? game.weapon.charge > 0.4
								? ['fire']
								: []
							: ['chargeStart'],
					}
				: idle;
			const id = game.nextProjectileId;
			advanceGame(game, world, input, dt);
			if (active?.team === 'BLUE' && game.nextProjectileId !== id) botShots++;
		}
		expect(botShots).toBeGreaterThan(0);
		expect(game.match.turnState).toBe('MATCH_END');
		expect(game.match.result).not.toBeNull();
	}
}, 10000);
