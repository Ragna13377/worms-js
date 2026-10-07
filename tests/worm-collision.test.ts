import assert from 'node:assert/strict';
import { test } from 'vitest';
import { predictMovement } from '../src/entities/Bot/model/prediction';
import { createWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { NO_INPUT, stepWorm } from '../src/entities/Worm/model/physics';
import { restingY } from '../src/entities/Worm/model/support';
import { createWorm } from '../src/entities/Worm/model/worm';
import { advanceGame } from '../src/widgets/Gameplay/model/simulation';
import { createControlledGame } from './gameFixture';

function flatMatch() {
	const world = createWorld(800, 600, 13377);
	const cells = new Uint8Array(world.width * world.height);
	for (let row = 0; row < world.height / 2; row++)
		cells.fill(1, row * world.width, (row + 1) * world.width);
	world.terrain.restoreCells(cells);
	world.waterLevel = -200;
	const game = createControlledGame(world, { RED: 1, BLUE: 1 });
	assert.ok(game.match.activeWormId);
	const walker = createWorm(game.match.activeWormId, 'RED', -30, WORM.radius + WORM.skin);
	const opponent = game.worms.find((w) => w.id !== walker.id);
	assert.ok(opponent);
	const other = createWorm(opponent.id, 'BLUE', 0, walker.position.y);
	game.worms = [walker, other];
	return { world, game, walker, other };
}

test('walking crosses a living worm by climbing over it without intersecting or pushing it', () => {
	const { world, game, walker, other } = flatMatch();
	const initialOther = { ...other.position };
	let highest = walker.position.y;
	for (let frame = 0; frame < 120; frame++) {
		advanceGame(game, world, { moveDirection: 1, commands: [] }, WORM.fixedStep);
		highest = Math.max(highest, walker.position.y);
		assert.ok(
			Math.hypot(walker.position.x - other.position.x, walker.position.y - other.position.y) >=
				walker.collisionRadius + other.collisionRadius - 0.05,
			`worms overlap at frame ${frame}`
		);
	}
	assert.ok(walker.position.x > other.position.x + 20);
	assert.ok(highest > initialOther.y + 12);
	assert.ok(Math.abs(walker.position.y - initialOther.y) < 0.1);
	assert.deepEqual(other.position, initialOther);
});

test('an uphill worm blocks walking but a forward jump clears it', () => {
	const { world, game, walker, other } = flatMatch();
	const cells = new Uint8Array(world.width * world.height);
	for (let col = 0; col < world.width; col++) {
		const x = world.terrain.left + col + 0.5;
		const top = Math.floor(world.height / 2 + x * 0.5);
		for (let row = 0; row < top; row++) cells[row * world.width + col] = 1;
	}
	world.terrain.restoreCells(cells);
	for (const worm of game.worms) {
		const y = restingY(world.terrain, worm.position.x, 100, -100, worm.collisionRadius);
		assert.ok(y !== null);
		worm.position.y = y;
	}
	for (let frame = 0; frame < 90; frame++)
		advanceGame(game, world, { moveDirection: 1, commands: [] }, WORM.fixedStep);
	assert.ok(walker.position.x < other.position.x - 8, JSON.stringify(walker.position));
	assert.equal(walker.grounded, true);
	// Leave enough launch space to clear the uphill body's side before reaching it.
	for (let frame = 0; frame < 22; frame++)
		advanceGame(game, world, { moveDirection: -1, commands: [] }, WORM.fixedStep);
	for (let frame = 0; frame < 150; frame++) {
		advanceGame(
			game,
			world,
			{
				moveDirection: 1,
				commands: frame === 0 ? ['forwardJump'] : [],
			},
			WORM.fixedStep
		);
		assert.ok(
			Math.hypot(walker.position.x - other.position.x, walker.position.y - other.position.y) >=
				13.95
		);
	}
	assert.ok(walker.position.x > other.position.x + 15, JSON.stringify(walker.position));
});

test('a falling worm lands on another worm, stays supported and falls if it disappears', () => {
	const { world, walker, other } = flatMatch();
	walker.position = { x: 0, y: 70 };
	walker.grounded = false;
	const worms = [walker, other];
	for (let frame = 0; frame < 120; frame++)
		stepWorm(walker, world, NO_INPUT, WORM.fixedStep, frame / 60, worms);
	assert.equal(walker.grounded, true);
	assert.ok(Math.abs(walker.position.y - other.position.y - 14) < 0.1);
	other.alive = false;
	stepWorm(walker, world, NO_INPUT, WORM.fixedStep, 2, worms);
	assert.equal(walker.grounded, false);
	assert.ok(walker.velocity.y < 0);
});

test('dead worms do not obstruct walking', () => {
	const { world, walker, other } = flatMatch();
	other.alive = false;
	let highest = walker.position.y;
	for (let frame = 0; frame < 120; frame++) {
		stepWorm(walker, world, { ...NO_INPUT, moveDirection: 1 }, WORM.fixedStep, frame / 60, [
			walker,
			other,
		]);
		highest = Math.max(highest, walker.position.y);
	}
	assert.ok(walker.position.x > 20);
	assert.ok(highest < 8);
});

test('teammates have the same collision in both walking directions', () => {
	for (const direction of [-1, 1] as const) {
		const { world, walker, other } = flatMatch();
		other.team = walker.team;
		walker.position.x = -direction * 30;
		let highest = walker.position.y;
		for (let frame = 0; frame < 120; frame++) {
			stepWorm(
				walker,
				world,
				{ ...NO_INPUT, moveDirection: direction },
				WORM.fixedStep,
				frame / 60,
				[walker, other]
			);
			highest = Math.max(highest, walker.position.y);
			assert.ok(
				Math.hypot(walker.position.x - other.position.x, walker.position.y - other.position.y) >=
					13.95
			);
		}
		assert.ok(walker.position.x * direction > 20);
		assert.ok(highest > other.position.y + 12);
	}
});

test('bot movement prediction observes other worms without mutating them', () => {
	const { world, walker, other } = flatMatch();
	const before = structuredClone([walker, other]);
	const predicted = predictMovement(world, walker, { direction: 1, seconds: 0.8 }, [walker, other]);
	assert.ok(predicted);
	assert.ok(predicted.worm.position.y > other.position.y + 12);
	assert.deepEqual([walker, other], before);
});
