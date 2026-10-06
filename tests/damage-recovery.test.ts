import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createExplosionState, explode } from '../src/entities/Explosion/model/explosion';
import { WEAPON } from '../src/entities/Weapon/model/config';
import { createWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import {
	advanceHealthFeedback,
	createHealthFeedback,
} from '../src/entities/Worm/model/healthFeedback';
import { NO_INPUT, stepWorm } from '../src/entities/Worm/model/physics';
import { createWorm, fallDamage } from '../src/entities/Worm/model/worm';

test('ordinary self-blast plus landing does not kill a healthy worm on level terrain', () => {
	const world = createWorld(800, 600, 13377);
	const cells = (world.terrain as unknown as { cells: Uint8Array }).cells;
	cells.fill(0);
	for (let row = 0; row < world.terrain.height / 2; row++)
		for (let col = 0; col < world.terrain.width; col++) cells[row * world.terrain.width + col] = 1;
	const worm = createWorm('self', 'RED', 0, 7);
	explode(createExplosionState(), world, [worm], {
		position: { x: 0, y: -3 },
		...WEAPON.blast,
		source: 'weapon',
	});
	for (let i = 0; i < 360 && (!worm.grounded || i === 0); i++)
		stepWorm(worm, world, NO_INPUT, WORM.fixedStep, i / 60);
	assert.equal(worm.grounded, true);
	assert.equal(worm.alive, true);
	assert.equal(worm.hp, 57);
	assert.equal(worm.animationState, 'twang');
});
test('standard falling uses the original speed limit and 67 HP maximum', () =>
	assert.equal(fallDamage(1600), 67));
test('HP presentation retains 100 during flight and batches blast plus landing loss until recovery', () => {
	const state = createHealthFeedback(100);
	advanceHealthFeedback(state, 60, 0.5, false);
	assert.equal(state.displayed, 100);
	assert.equal(state.notices.length, 0);
	advanceHealthFeedback(state, 57, 0.5, false);
	assert.equal(state.displayed, 100);
	assert.equal(state.notices.length, 0);
	advanceHealthFeedback(state, 57, 0.45, true);
	assert.equal(state.notices.length, 1);
	assert.equal(state.notices[0].amount, 43);
	advanceHealthFeedback(state, 57, 1.2, true);
	assert.equal(state.displayed, 57);
});

import { blastDamage } from '../src/entities/Explosion/model/explosion';
import { grenadePoseFrame } from '../src/entities/Worm/model/animation';
import { healthFeedbackReady } from '../src/entities/Worm/model/healthFeedback';

test('center-distance blast damage has no collider-wide maximum plateau', () => {
	assert.equal(blastDamage(0, 75, 50), 50);
	assert.equal(blastDamage(10, 75, 50), 43);
	assert.equal(blastDamage(15, 75, 50), 40);
	assert.equal(blastDamage(75, 75, 50), 0);
	assert.equal(blastDamage(100, 75, 50), 0);
	for (let distance = 1; distance < 75; distance++)
		assert.ok(blastDamage(distance, 75, 50) <= blastDamage(distance - 1, 75, 50));
});
test('fall formula converts world seconds to original 50 Hz pixels per frame', () => {
	assert.equal(fallDamage(399), 0);
	assert.equal(fallDamage(400), 1);
	assert.equal(fallDamage(500), 6);
	assert.equal(fallDamage(800), 23);
	assert.equal(fallDamage(1000), 34);
	assert.equal(fallDamage(1600), 67);
	assert.equal(fallDamage(10000), 67);
});
test('damage feedback waits through falling, sliding, landing and twang recovery for every worm', () => {
	const worm = createWorm('recovery', 'BLUE', 0, 0);
	worm.hp = 57;
	worm.grounded = false;
	assert.equal(healthFeedbackReady(worm), false);
	worm.grounded = true;
	worm.sliding = true;
	assert.equal(healthFeedbackReady(worm), false);
	worm.sliding = false;
	for (const state of ['hurt', 'land', 'twang', 'walk'] as const) {
		worm.animationState = state;
		assert.equal(healthFeedbackReady(worm), false);
	}
	worm.animationState = 'idle';
	assert.equal(healthFeedbackReady(worm), true);
	worm.velocity.x = 3;
	assert.equal(healthFeedbackReady(worm), false);
});
test('hard landing plays embedded-head recovery before idle and blocks early movement', () => {
	const world = createWorld(800, 600, 13377);
	const ground = world.terrain.heightAt(0);
	assert.ok(ground !== null);
	const worm = createWorm('twang', 'RED', 0, ground + 10);
	worm.grounded = false;
	worm.velocity.y = -500;
	for (let i = 0; i < 10 && !worm.grounded; i++)
		stepWorm(worm, world, NO_INPUT, WORM.fixedStep, i / 60);
	assert.equal(worm.animationState, 'twang');
	assert.ok(worm.hp > 0 && worm.hp < 100);
	const position = { ...worm.position };
	stepWorm(
		worm,
		world,
		{ ...NO_INPUT, moveDirection: 1, forwardJumpPressed: true },
		WORM.fixedStep,
		0.2
	);
	assert.deepEqual(worm.position, position);
	assert.equal(worm.jumpType, null);
	for (let i = 0; i < 120; i++) stepWorm(worm, world, NO_INPUT, WORM.fixedStep, 0.3 + i / 60);
	assert.equal(worm.animationState, 'idle');
	assert.equal(healthFeedbackReady(worm), true);
});
test('grenade ready pose follows aim through all three cardinal angles', () => {
	assert.equal(grenadePoseFrame(Math.PI / 2, 32), 31);
	assert.equal(grenadePoseFrame(0, 32), 16);
	assert.equal(grenadePoseFrame(-Math.PI / 2, 32), 0);
	assert.equal(grenadePoseFrame(99, 32), 31);
	assert.equal(grenadePoseFrame(-99, 32), 0);
});
test('normal death blast uses 30 HP at its exact center and decreases with distance', () => {
	const world = createWorld(800, 600, 13377),
		a = createWorm('a', 'RED', 0, 200),
		b = createWorm('b', 'BLUE', 10, 200);
	explode(createExplosionState(), world, [a, b], {
		position: { x: 0, y: 200 },
		...WEAPON.death,
		source: 'death',
	});
	assert.equal(a.hp, 70);
	assert.ok(b.hp > 70 && b.hp < 100);
	assert.equal(a.blastFallProtected, true);
	assert.equal(b.blastFallProtected, true);
});
