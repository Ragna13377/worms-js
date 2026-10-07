import assert from 'node:assert/strict';
import { test } from 'vitest';
import { timeoutResult } from '../src/entities/Match/model/match';
import { createWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { killWorm } from '../src/entities/Worm/model/worm';
import { createMatchWorld } from '../src/widgets/Gameplay/model/matchWorld';
import { advanceGame, createGame } from '../src/widgets/Gameplay/model/simulation';
import { createWormBubbles, updateWormBubbles } from '../src/widgets/Gameplay/model/wormBubbles';
import { createControlledGame } from './gameFixture';

const idle = { moveDirection: 0 as const, commands: [] };
test('preparation lasts three seconds and dismisses the arrow automatically', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	for (let i = 0; i < Math.round(2 / WORM.fixedStep); i++)
		advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(game.match.turnState, 'TURN_START');
	for (let i = 0; i < Math.round(1 / WORM.fixedStep); i++)
		advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(game.match.turnState, 'CONTROL');
	assert.equal(game.turnMarker, false);
	assert.equal(game.match.turnTimeRemaining, 45);
});
test('a fresh action starts the full turn during preparation', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	advanceGame(game, world, idle, WORM.fixedStep);
	advanceGame(game, world, { moveDirection: 1, commands: ['chargeStart'] }, WORM.fixedStep);
	assert.equal(game.match.turnState, 'CONTROL');
	assert.equal(game.turnMarker, false);
	assert.ok(game.weapon.isCharging);
	assert.ok(game.match.turnTimeRemaining > 44.9);
});
test('the ten minute round expires as a draw', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	game.match.matchTimeRemaining = WORM.fixedStep;
	advanceGame(game, world, idle, WORM.fixedStep);
	for (let i = 0; i < 180; i++) advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(game.match.result, 'DRAW');
	assert.equal(game.match.turnState, 'MATCH_END');
});
test('pause freezes preparation, both clocks and simulation until resumed', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	game.paused = true;
	const before = JSON.stringify(game.match);
	advanceGame(game, world, { moveDirection: 1, commands: ['chargeStart'] }, 0.2);
	assert.equal(JSON.stringify(game.match), before);
	assert.equal(game.time, 0);
	assert.equal(game.weapon.isCharging, false);
	game.paused = false;
	advanceGame(game, world, idle, WORM.fixedStep);
	assert.ok(game.match.phaseTime > 0);
});
test('timeout rewards the team with more total living HP', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	const red = game.worms.find((w) => w.team === 'RED');
	assert.ok(red);
	red.hp = 50;
	game.match.matchTimeRemaining = WORM.fixedStep;
	advanceGame(game, world, idle, WORM.fixedStep);
	for (let i = 0; i < 480; i++) advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(game.match.result, 'BLUE');
});
test('wind is resampled at each turn and stays fixed during a turn', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	const first = world.wind;
	game.match.turnState = 'TURN_END';
	advanceGame(game, world, idle, WORM.fixedStep);
	assert.notEqual(world.wind, first);
	const next = world.wind;
	advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(world.wind, next);
});
test('drowning sinks the worm and emits rising mouth bubbles before removal', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	const worm = game.worms[0];
	worm.position.y = world.waterLevel - 30;
	killWorm(worm, 'drown');
	const y = worm.position.y,
		bubbles = createWormBubbles();
	advanceGame(game, world, idle, WORM.fixedStep);
	assert.ok(worm.position.y < y);
	updateWormBubbles(bubbles, game.worms, game.time, world.waterLevel);
	assert.ok(bubbles.points.length > 0);
	const first = bubbles.points[0];
	updateWormBubbles(bubbles, [], game.time + 0.1, world.waterLevel);
	assert.ok(bubbles.points.includes(first));
	for (let i = 0; i < 180; i++) advanceGame(game, world, idle, WORM.fixedStep);
	updateWormBubbles(bubbles, game.worms, game.time, world.waterLevel);
	assert.ok(bubbles.points.length > 0);
	updateWormBubbles(bubbles, game.worms, game.time + 2, world.waterLevel, world.waterLevel);
	assert.equal(bubbles.points.length, 0);
});
test('end animation clocks continue while HP and gameplay controls stay frozen', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	game.match.turnState = 'MATCH_END';
	game.match.result = 'RED';
	const time = game.worms[0].stateTime,
		x = game.worms[0].position.x;
	advanceGame(game, world, { moveDirection: 1, commands: ['chargeStart'] }, 0.1);
	assert.ok(game.worms[0].stateTime > time);
	assert.equal(game.worms[0].position.x, x);
	assert.equal(game.worms[0].hp, 100);
	assert.equal(game.weapon.isCharging, false);
});
test('timeout compares absolute total HP rather than each teams percentage', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world, { RED: 3, BLUE: 1 });
	for (const worm of game.worms) if (worm.team === 'RED') worm.hp = 50;
	assert.equal(timeoutResult(game.worms), 'RED');
	game.worms[0].alive = false;
	assert.equal(timeoutResult(game.worms), 'DRAW');
});
test('timeout locks input but lets an already flying shot finish before scoring', () => {
	const world = createWorld(800, 600, 13377),
		game = createControlledGame(world, { RED: 1, BLUE: 1 });
	game.weapon.aimAngle = Math.PI / 2;
	advanceGame(game, world, { ...idle, commands: ['chargeStart'] }, WORM.fixedStep);
	advanceGame(game, world, { ...idle, commands: ['fire'] }, WORM.fixedStep);
	game.match.matchTimeRemaining = WORM.fixedStep;
	advanceGame(game, world, { ...idle, commands: ['chargeStart'] }, WORM.fixedStep);
	assert.equal(game.match.turnState, 'SETTLING');
	assert.equal(game.projectiles.length, 1);
	assert.equal(game.weapon.isCharging, false);
	for (let i = 0; i < 1200; i++) advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(game.projectiles.length, 0);
	assert.equal(game.match.turnState, 'MATCH_END');
});
test('random map selection rejects incomplete teams before starting a round', () => {
	const world = createMatchWorld(929, 1037, 1593277517, { RED: 3, BLUE: 3 });
	const game = createGame(world);
	assert.equal(game.missing, 0);
	assert.equal(game.worms.filter((w) => w.team === 'BLUE').length, 3);
	assert.equal(game.worms.filter((w) => w.team === 'RED').length, 3);
});
