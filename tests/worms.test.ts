import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createWorld } from '../src/entities/World/model/world';
import { spawnWorms } from '../src/entities/Worm/model/spawn';

test('six seeded worms spawn clear of the live terrain, supported and safely separated', () => {
	const world = createWorld(800, 600, 13377);
	const result = spawnWorms(world, { RED: 3, BLUE: 3 });
	assert.equal(result.worms.length, 6);
	assert.equal(result.missing, 0);
	assert.deepEqual(result, spawnWorms(world, { RED: 3, BLUE: 3 }));
	for (const worm of result.worms) {
		const { x, y } = worm.position;
		assert.equal(world.terrain.collideCircle(x, y, worm.collisionRadius), null);
		assert.ok(world.terrain.collideCircle(x, y - 1, worm.collisionRadius));
		assert.ok(y - worm.collisionRadius > world.waterLevel + 30);
		for (const other of result.worms) {
			if (other.id === worm.id) continue;
			assert.ok(Math.abs(x - other.position.x) >= (worm.team === other.team ? 48 : 140));
		}
	}
});

import { WORM } from '../src/entities/Worm/model/config';
import { stepWorm, type WormInput } from '../src/entities/Worm/model/physics';

const idle: WormInput = { moveDirection: 0, forwardJumpPressed: false, highJumpPressed: false };

test('active intentions move a supported worm and destroyed support immediately causes falling', () => {
	const world = createWorld(800, 600, 13377);
	const worm = spawnWorms(world).worms[0];
	const x = worm.position.x;
	for (let i = 0; i < 30; i++)
		stepWorm(worm, world, { ...idle, moveDirection: 1 }, WORM.fixedStep, i / 60);
	assert.ok(worm.position.x > x + 10);
	assert.equal(worm.facing, 'right');
	const y = worm.position.y;
	world.terrain.destroyCircle(worm.position.x, y - worm.collisionRadius, 38);
	stepWorm(worm, world, idle, WORM.fixedStep, 1);
	assert.equal(worm.grounded, false);
	assert.equal(worm.animationState, 'fall');
	assert.ok(worm.position.y < y);
});

import { fallDamage } from '../src/entities/Worm/model/worm';

test('three jumps are distinct, backflip converts only the early high jump, and air jumps are rejected', () => {
	const world = createWorld(800, 600, 13377);
	const forward = spawnWorms(world).worms[0];
	const high = spawnWorms(world).worms[0];
	stepWorm(forward, world, { ...idle, forwardJumpPressed: true }, WORM.fixedStep, 0);
	stepWorm(high, world, { ...idle, highJumpPressed: true }, WORM.fixedStep, 0);
	assert.ok(forward.velocity.x > 0);
	assert.equal(high.velocity.x, 0);
	assert.ok(high.velocity.y > forward.velocity.y);
	stepWorm(high, world, { ...idle, highJumpPressed: true }, WORM.fixedStep, 0.1);
	assert.equal(high.jumpType, 'backflip');
	assert.ok(high.velocity.x < 0);
	assert.ok(high.velocity.y > forward.velocity.y);
	for (let i = 0; i < 20; i++)
		stepWorm(
			high,
			world,
			{ ...idle, highJumpPressed: true, forwardJumpPressed: true },
			WORM.fixedStep,
			0.12 + i / 60
		);
	assert.ok(high.velocity.y < WORM.highJumpY);
	assert.equal(high.jumpType, 'backflip');
	const late = spawnWorms(world).worms[0];
	late.facing = 'left';
	stepWorm(late, world, { ...idle, highJumpPressed: true }, WORM.fixedStep, 0);
	stepWorm(late, world, { ...idle, highJumpPressed: true }, WORM.fixedStep, 0.201);
	assert.equal(late.jumpType, 'high');
});

test('Backspace after the double-tap window and near the apex cannot relaunch a high jump', () => {
	for (const delay of [13, 15, 30]) {
		const world = createWorld(800, 600, 13377);
		const worm = spawnWorms(world).worms[0];
		stepWorm(worm, world, { ...idle, highJumpPressed: true }, WORM.fixedStep, 0);
		for (let frame = 1; frame < delay; frame++)
			stepWorm(worm, world, idle, WORM.fixedStep, frame * WORM.fixedStep);
		const velocity = worm.velocity.y;
		assert.equal(worm.grounded, false);
		stepWorm(
			worm,
			world,
			{ ...idle, highJumpPressed: true },
			WORM.fixedStep,
			delay * WORM.fixedStep
		);
		assert.equal(worm.jumpType, 'high');
		assert.equal(worm.velocity.x, 0);
		assert.ok(Math.abs(worm.velocity.y - (velocity - WORM.gravity * WORM.fixedStep)) < 1e-8);
	}
});

test('safe impacts do no damage; severe impacts are bounded and lethal', () => {
	assert.equal(fallDamage(220), 0);
	assert.equal(fallDamage(325), 20);
	assert.equal(fallDamage(1000), 100);
	const world = createWorld(800, 600, 13377);
	const worm = spawnWorms(world).worms[0];
	worm.position.y += 12;
	worm.grounded = false;
	worm.velocity.y = -700;
	for (let i = 0; i < 10 && worm.alive; i++) stepWorm(worm, world, idle, WORM.fixedStep, i / 60);
	assert.equal(worm.hp, 0);
	assert.equal(worm.alive, false);
	assert.equal(worm.animationState, 'death');
});

test('water and either horizontal boundary kill immediately', () => {
	const world = createWorld(800, 600, 13377);
	for (const side of ['left', 'right', 'water']) {
		const worm = spawnWorms(world).worms[0];
		if (side === 'water') {
			worm.position.x = world.terrain.left + 10;
			worm.position.y = world.waterLevel;
		} else {
			worm.position.y = world.height / 2;
			worm.position.x = side === 'left' ? world.terrain.left : -world.terrain.left;
		}
		stepWorm(worm, world, idle, WORM.fixedStep, 0);
		assert.equal(worm.alive, false);
		assert.equal(worm.hp, 0);
		assert.equal(worm.animationState, side === 'water' ? 'drown' : 'death');
	}
});

test('spawn remains bounded on empty/tiny worlds and supports every requested team count', () => {
	for (let count = 1; count <= 3; count++) {
		const world = createWorld(800, 600, 42);
		const result = spawnWorms(world, { RED: count, BLUE: count });
		assert.equal(result.worms.filter((worm) => worm.team === 'RED').length, count);
		assert.equal(result.worms.filter((worm) => worm.team === 'BLUE').length, count);
	}
	const empty = createWorld(50, 50, 42);
	empty.terrain.destroyCircle(0, 0, 1000);
	assert.deepEqual(spawnWorms(empty), { worms: [], missing: 6 });
});

import { GameplayControls } from '../src/widgets/Gameplay/model/controls';
import {
	activeWorm,
	advanceGame,
	createGame,
	cycleWorm,
	followCamera,
} from '../src/widgets/Gameplay/model/simulation';

test('fixed simulation preserves edge commands, ignores long pauses, and controls only the active worm', () => {
	const world = createWorld(800, 600, 13377);
	const game = createGame(world);
	const otherPositions = game.worms.slice(1).map((worm) => ({ ...worm.position }));
	assert.equal(advanceGame(game, world, { moveDirection: 0, commands: ['forwardJump'] }, 0.001), 0);
	advanceGame(game, world, { moveDirection: 0, commands: [] }, 1 / 60);
	assert.equal(activeWorm(game)?.jumpType, 'forward');
	assert.deepEqual(
		game.worms.slice(1).map((worm) => worm.position),
		otherPositions
	);
	assert.ok(advanceGame(game, world, { moveDirection: 0, commands: [] }, 1000) <= 9);
	cycleWorm(game);
	assert.equal(activeWorm(game)?.id, 'RED-2');
	const active = activeWorm(game);
	assert.ok(active);
	active.alive = false;
	advanceGame(game, world, { moveDirection: 0, commands: [] }, 1 / 60);
	assert.equal(activeWorm(game)?.id, 'RED-1');
	for (const worm of game.worms) worm.alive = false;
	cycleWorm(game);
	assert.equal(activeWorm(game), null);
});

test('held input produces deliberate movement, repeats do not queue jumps, and blur clears input', () => {
	const controls = new GameplayControls();
	controls.press('ArrowLeft');
	controls.press('Enter');
	controls.press('Enter', true);
	assert.deepEqual(controls.consume(), { moveDirection: -1, commands: ['forwardJump'] });
	assert.deepEqual(controls.consume(), { moveDirection: -1, commands: [] });
	controls.release('ArrowLeft');
	controls.press('Backspace');
	controls.clear();
	assert.deepEqual(controls.consume(), { moveDirection: 0, commands: [] });
});

test('equivalent render rates produce the same fixed gameplay trajectory and camera eases monotonically', () => {
	const worldA = createWorld(800, 600, 13377);
	const worldB = createWorld(800, 600, 13377);
	const gameA = createGame(worldA);
	const gameB = createGame(worldB);
	for (let i = 0; i < 60; i++)
		advanceGame(gameA, worldA, { moveDirection: 1, commands: [] }, 1 / 60);
	for (let i = 0; i < 144; i++)
		advanceGame(gameB, worldB, { moveDirection: 1, commands: [] }, 1 / 144);
	assert.deepEqual(gameA.worms, gameB.worms);
	assert.ok(followCamera(0, 100, 1 / 60) > 0);
	assert.ok(followCamera(0, 100, 1 / 60) < 100);
});

import { restingY, supportAt } from '../src/entities/Worm/model/support';
import { createWorm } from '../src/entities/Worm/model/worm';

function craterWorm(x: number) {
	const world = createWorld(800, 600, 13377);
	world.waterLevel = -400;
	world.terrain.destroyCircle(0, -200, 50);
	const y = restingY(world.terrain, x, -200, -260, WORM.radius);
	assert.ok(y !== null);
	return { world, worm: createWorm('test', 'RED', x, y) };
}

test('live crater walls block climbing instead of teleporting onto the original surface', () => {
	const { world, worm } = craterWorm(0);
	for (let i = 0; i < 180; i++)
		stepWorm(worm, world, { ...idle, moveDirection: 1 }, WORM.fixedStep, i / 60);
	assert.ok(worm.position.x < 50);
	assert.ok(worm.position.y < -200);
	assert.equal(
		world.terrain.collideCircle(worm.position.x, worm.position.y, worm.collisionRadius),
		null
	);
});

test('a near-vertical live raster slope still slides downhill without movement input', () => {
	const world = createWorld(800, 600, 13377);
	world.waterLevel = -400;
	const cells = (world.terrain as unknown as { cells: Uint8Array }).cells;
	cells.fill(0);
	for (let col = 0; col < world.terrain.width; col++) {
		const surface = -150 + (col + 0.5 + world.terrain.left) * 8;
		const top = Math.max(
			0,
			Math.min(world.terrain.height, Math.floor(surface - world.terrain.bottom))
		);
		for (let row = 0; row < top; row++) cells[row * world.terrain.width + col] = 1;
	}
	const y = restingY(world.terrain, 0.5, -40, -150, WORM.radius);
	assert.ok(y !== null);
	const worm = createWorm('steep', 'RED', 0.5, y);
	const initial = { ...worm.position };
	const support = supportAt(world.terrain, initial.x, initial.y, WORM.radius);
	assert.ok(support && Math.abs(support.slope) >= WORM.slideSlope, JSON.stringify(support));
	for (let frame = 0; frame < 60; frame++) stepWorm(worm, world, idle, WORM.fixedStep, frame / 60);
	assert.ok(worm.position.x < initial.x - 3);
	assert.ok(worm.position.y < initial.y - 5);
});
test('normal jumps land safely without tunnelling and return to idle', () => {
	for (const type of ['forward', 'high', 'backflip']) {
		const { world, worm } = craterWorm(0);
		// Remove the overhead chamber ceiling, preserving its bottom support.
		world.terrain.destroyCircle(0, 10000, 10200);

		stepWorm(
			worm,
			world,
			{ ...idle, forwardJumpPressed: type === 'forward', highJumpPressed: type !== 'forward' },
			WORM.fixedStep,
			0
		);
		if (type === 'backflip')
			stepWorm(worm, world, { ...idle, highJumpPressed: true }, WORM.fixedStep, 0.1);
		assert.equal(worm.jumpType, type);
		for (let i = 0; i < 180; i++) stepWorm(worm, world, idle, WORM.fixedStep, 0.12 + i / 60);
		assert.equal(worm.hp, 100, type);
		assert.equal(worm.alive, true, type);
		assert.equal(worm.grounded, true, type);
		assert.equal(worm.animationState, 'idle', type);
		assert.equal(
			world.terrain.collideCircle(worm.position.x, worm.position.y, worm.collisionRadius),
			null,
			type
		);
	}
});

test('a very fast double Backspace queued within one fixed step still triggers a backflip', () => {
	const world = createWorld(800, 600, 13377);
	const game = createGame(world);
	advanceGame(
		game,
		world,
		{ moveDirection: 0, commands: ['highJump', 'highJump'] },
		WORM.fixedStep
	);
	assert.equal(activeWorm(game)?.jumpType, 'backflip');
});

test('regeneration across many seeds preserves safe six-worm spawning', () => {
	for (let seed = 0; seed < 40; seed++) {
		const world = createWorld(960, 640, seed * 1234567);
		const result = spawnWorms(world);
		assert.equal(result.missing, 0, `seed ${seed}`);
		assert.equal(result.worms.length, 6);
		for (const worm of result.worms) {
			assert.ok(worm.position.y - worm.collisionRadius > world.waterLevel + 30);
			assert.equal(
				world.terrain.collideCircle(worm.position.x, worm.position.y, worm.collisionRadius),
				null
			);
			assert.ok(supportAt(world.terrain, worm.position.x, worm.position.y, worm.collisionRadius));
		}
	}
});

test('a damaging landing immediately reduces real HP and dead worms cannot move or jump', () => {
	const { world, worm } = craterWorm(0);
	worm.position.y += 5;
	worm.velocity.y = -325;
	worm.grounded = false;
	for (let i = 0; i < 5 && worm.hp === 100; i++)
		stepWorm(worm, world, idle, WORM.fixedStep, i / 60);
	assert.ok(worm.hp > 0 && worm.hp < 100);
	assert.equal(worm.animationState, 'hurt');
	worm.alive = false;
	const position = { ...worm.position };
	stepWorm(
		worm,
		world,
		{ moveDirection: 1, forwardJumpPressed: true, highJumpPressed: true },
		WORM.fixedStep,
		1
	);
	assert.deepEqual(worm.position, position);
});

test('a short direction tap between physics frames still moves once and updates facing', () => {
	const world = createWorld(800, 600, 13377);
	const game = createGame(world);
	const controls = new GameplayControls();
	const worm = activeWorm(game);
	assert.ok(worm);
	const x = worm.position.x;
	controls.press('ArrowLeft');
	controls.release('ArrowLeft');
	advanceGame(game, world, controls.consume(), 1 / 144);
	advanceGame(game, world, controls.consume(), 1 / 60);
	assert.ok(worm.position.x < x);
	assert.equal(worm.facing, 'left');
});

test('every valid backflip delay lands safely on the same flat live terrain surface', () => {
	for (let delay = 1; delay * WORM.fixedStep <= WORM.doubleTapWindow; delay++) {
		const world = createWorld(800, 600, 13377);
		// Explicit live-mask fixture: flat ground at y=0, with no overhead obstacles.
		const cells = (world.terrain as unknown as { cells: Uint8Array }).cells;
		cells.fill(0);
		cells.fill(1, 0, world.terrain.width * (world.terrain.height / 2));
		const y = restingY(world.terrain, 0, 20, 0, WORM.radius);
		assert.ok(y !== null);
		const worm = createWorm('flat', 'RED', 0, y);
		stepWorm(worm, world, { ...idle, highJumpPressed: true }, WORM.fixedStep, 0);
		for (let frame = 1; frame < delay; frame++)
			stepWorm(worm, world, idle, WORM.fixedStep, frame * WORM.fixedStep);
		stepWorm(
			worm,
			world,
			{ ...idle, highJumpPressed: true },
			WORM.fixedStep,
			delay * WORM.fixedStep
		);
		assert.equal(worm.jumpType, 'backflip');
		for (let frame = delay + 1; frame < 180; frame++)
			stepWorm(worm, world, idle, WORM.fixedStep, frame * WORM.fixedStep);
		assert.equal(worm.hp, 100, `delay ${delay / 60}s`);
		assert.equal(worm.grounded, true);
		assert.equal(worm.animationState, 'idle');
		assert.ok(Math.abs(worm.position.y - y) < WORM.supportProbe);
	}
});

test('the reachable inner crater slope holds a standing worm instead of immediately sliding to its bottom', () => {
	const { world, worm } = craterWorm(39);
	const initial = { ...worm.position };
	for (let frame = 0; frame < 120; frame++) stepWorm(worm, world, idle, WORM.fixedStep, frame / 60);
	assert.equal(worm.grounded, true);
	assert.equal(worm.animationState, 'idle');
	assert.ok(Math.abs(worm.position.x - initial.x) < 0.1);
	assert.ok(Math.abs(worm.position.y - initial.y) < 0.1);
});

test('walking climbs most of either open round crater wall but cannot leave without jumping', () => {
	for (const direction of [-1, 1] as const) {
		const { world, worm } = craterWorm(0);
		world.terrain.destroyCircle(0, 10000, 10200);
		const bottom = worm.position.y;
		for (let frame = 0; frame < 240; frame++)
			stepWorm(worm, world, { ...idle, moveDirection: direction }, WORM.fixedStep, frame / 60);
		const fraction = (worm.position.y - bottom) / (-200 + WORM.radius - bottom);
		assert.ok(
			fraction >= 0.65 && fraction < 0.95,
			`direction ${direction}, climbed ${fraction}, x=${worm.position.x}, y=${worm.position.y}`
		);
		assert.ok(Math.abs(worm.position.x) < 50);
		assert.equal(worm.hp, 100);
	}
});
