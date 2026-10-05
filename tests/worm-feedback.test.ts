import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { NO_INPUT, stepWorm } from '../src/entities/Worm/model/physics';
import { restingY } from '../src/entities/Worm/model/support';
import { createWorm } from '../src/entities/Worm/model/worm';

function steppedGround(drop: number) {
	const world = createWorld(800, 600, 13377);
	const cells = (world.terrain as unknown as { cells: Uint8Array }).cells;
	cells.fill(0);
	for (let row = 0; row < world.terrain.height / 2; row++)
		for (let col = 0; col < world.terrain.width; col++)
			if (row < world.terrain.height / 2 - (col >= world.terrain.width / 2 ? drop : 0))
				cells[row * world.terrain.width + col] = 1;
	const y = restingY(world.terrain, -15, 20, 0, WORM.radius);
	assert.ok(y !== null);
	return { world, worm: createWorm('step', 'RED', -15, y) };
}

test('walking down a small seven-pixel ledge retains support instead of starting an early fall', () => {
	const { world, worm } = steppedGround(7);
	for (let frame = 0; frame < 40; frame++) {
		stepWorm(worm, world, { ...NO_INPUT, moveDirection: 1 }, WORM.fixedStep, frame / 60);
		assert.equal(worm.grounded, true, `frame ${frame}, x=${worm.position.x}, y=${worm.position.y}`);
	}
	assert.ok(worm.position.x > 15);
	assert.equal(worm.hp, 100);
});

import { spawnWorms } from '../src/entities/Worm/model/spawn';
import { spriteGroundDrop } from '../src/entities/Worm/model/support';
import {
	advanceCamera,
	createCameraControl,
	panCamera,
} from '../src/widgets/Gameplay/model/camera';

test('a real cliff still starts a fall instead of snapping down to distant ground', () => {
	const { world, worm } = steppedGround(40);
	let fell = false;
	for (let frame = 0; frame < 40; frame++) {
		stepWorm(worm, world, { ...NO_INPUT, moveDirection: 1 }, WORM.fixedStep, frame / 60);
		if (!worm.grounded) {
			fell = true;
			break;
		}
	}
	assert.ok(fell);
	assert.ok(worm.position.y > -20);
});

test('standing sprite grounding removes a circular-collider gap on slopes and stays bounded near edges', () => {
	const { world } = steppedGround(0);
	assert.equal(spriteGroundDrop(world.terrain, 0, 7, WORM.radius), 0);
	assert.equal(spriteGroundDrop(world.terrain, 0, 10, WORM.radius), 3);
	assert.equal(spriteGroundDrop(world.terrain, 0, 100, WORM.radius), 0);
	const stepped = steppedGround(7).world;
	assert.equal(spriteGroundDrop(stepped.terrain, 1, 7, WORM.radius), 7);
});

test('each regeneration assigns six unique seeded funny names without replacing stable IDs', () => {
	const first = spawnWorms(createWorld(800, 600, 13377)).worms;
	const again = spawnWorms(createWorld(800, 600, 13377)).worms;
	const next = spawnWorms(createWorld(800, 600, 42)).worms;
	assert.equal(new Set(first.map((worm) => worm.name)).size, 6);
	assert.deepEqual(
		first.map((worm) => worm.name),
		again.map((worm) => worm.name)
	);
	assert.notDeepEqual(
		first.map((worm) => worm.name),
		next.map((worm) => worm.name)
	);
	assert.ok(first.every((worm) => worm.name !== worm.id && !/\d/.test(worm.name)));
});

test('mouse camera pan persists while idle and movement resumes smooth clamped following', () => {
	const world = createWorld(800, 600, 13377);
	const worm = spawnWorms(world).worms[0];
	const control = createCameraControl();
	const idle = { moveDirection: 0 as const, commands: [] };
	let x = advanceCamera(control, worm.position.x, worm, idle, 1 / 60, world.width, 800);
	const start = x;
	panCamera(control, 1);
	for (let frame = 0; frame < 30; frame++)
		x = advanceCamera(control, x, worm, idle, 1 / 60, world.width, 800);
	assert.ok(x > start + 150);
	panCamera(control, 0);
	assert.equal(advanceCamera(control, x, worm, idle, 1 / 60, world.width, 800), x);
	const returning = advanceCamera(
		control,
		x,
		worm,
		{ moveDirection: 1, commands: [] },
		1 / 60,
		world.width,
		800
	);
	assert.ok(returning < x && returning > worm.position.x);
	for (let frame = 0; frame < 120; frame++)
		x = advanceCamera(control, x, worm, idle, 1 / 60, world.width, 800);
	assert.ok(Math.abs(x - worm.position.x) < 1);
	panCamera(control, 1);
	for (let frame = 0; frame < 200; frame++)
		x = advanceCamera(control, x, worm, idle, 1 / 60, world.width, 800);
	assert.equal(x, (world.width - 800) / 2);
});

test('releasing walk at a circular crater lip lands on the nearby inner slope without launching across it', () => {
	const { world, worm } = steppedGround(0);
	world.terrain.destroyCircle(38, 0, 38);
	for (let frame = 0; frame < 90 && worm.grounded; frame++)
		stepWorm(worm, world, { ...NO_INPUT, moveDirection: 1 }, WORM.fixedStep, frame / 60);
	const departureX = worm.position.x;
	for (let frame = 90; frame < 270; frame++)
		stepWorm(worm, world, NO_INPUT, WORM.fixedStep, frame / 60);
	assert.ok(
		worm.position.x <= departureX + WORM.radius,
		`departed x=${departureX}, landed x=${worm.position.x}, y=${worm.position.y}`
	);
	assert.ok(worm.grounded);
	assert.equal(worm.hp, 100);
});

import { IDLE_PLAYBACK, spriteFrame } from '../src/entities/Worm/model/animation';

test('idle breathing returns through its poses instead of snapping from last frame to first', () => {
	const frames = 20;
	const sequence = Array.from({ length: frames * 4 }, (_, frame) =>
		spriteFrame(frame, frames, IDLE_PLAYBACK)
	);
	assert.deepEqual(sequence.slice(18, 23), [18, 19, 18, 17, 16]);
	for (let index = 1; index < sequence.length; index++)
		assert.equal(Math.abs(sequence[index] - sequence[index - 1]), 1);
});

test('walking animation reverses at its endpoints with no last-to-first pose jump', () => {
	const frames = 15;
	const sequence = Array.from({ length: 60 }, (_, frame) => spriteFrame(frame, frames, 'pingpong'));
	assert.deepEqual(sequence.slice(12, 18), [12, 13, 14, 13, 12, 11]);
	assert.deepEqual(sequence.slice(26, 31), [2, 1, 0, 1, 2]);
	for (let index = 1; index < sequence.length; index++)
		assert.equal(Math.abs(sequence[index] - sequence[index - 1]), 1);
	assert.equal(spriteFrame(100, 60, 'once'), 59);
	assert.equal(spriteFrame(21, 20, 'loop'), 1);
});

import { jumpPhase } from '../src/entities/Worm/model/animation';

test('every jump begins with crouch release, followed by the matching ascent/airborne clip', () => {
	for (const type of ['forward', 'high', 'backflip'] as const) {
		assert.equal(jumpPhase(type, 0, 165), 'jump');
		assert.equal(jumpPhase(type, 0.1, 165), 'jump');
	}
	assert.equal(jumpPhase('forward', 0.13, 150), 'rise');
	assert.equal(jumpPhase('high', 0.4, 50), 'rise');
	assert.equal(jumpPhase('high', 0.6, -40), 'descent');
	assert.equal(jumpPhase('backflip', 0.13, 200), 'backflip');
});
