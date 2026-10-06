import assert from 'node:assert/strict';
import { test } from 'vitest';
import { launchProjectile, stepProjectile } from '../src/entities/Projectile/model/projectile';
import { createWeaponState } from '../src/entities/Weapon/model/weapon';
import { createWorld } from '../src/entities/World/model/world';
import { grenadePoseFrame } from '../src/entities/Worm/model/animation';
import { WORM } from '../src/entities/Worm/model/config';
import {
	advanceHealthFeedback,
	createHealthFeedback,
} from '../src/entities/Worm/model/healthFeedback';
import { createWorm } from '../src/entities/Worm/model/worm';
import { advanceGame, createGame } from '../src/widgets/Gameplay/model/simulation';

test('grenade hitting a living worm reflects without detonating or damaging the worm', () => {
	const world = createWorld(800, 600, 1);
	world.terrain.destroyCircle(0, 0, 5000);
	const owner = createWorm('owner', 'RED', -150, 100),
		target = createWorm('target', 'BLUE', 0, 100),
		state = createWeaponState();
	state.selectedWeapon = 'grenade';
	const p = launchProjectile(1, owner, state);
	p.position = { x: -15, y: 100 };
	p.previousPosition = { ...p.position };
	p.velocity = { x: 400, y: 0 };
	p.ownerCleared = true;
	const queue: Parameters<typeof stepProjectile>[4] = [];
	stepProjectile(p, world, [owner, target], WORM.fixedStep, queue);
	assert.ok(p.velocity.x < 0);
	assert.ok(p.position.x < -10);
	assert.equal(p.alive, true);
	assert.equal(queue.length, 0);
	assert.equal(target.hp, 100);
});
test('grenade sheet endpoints follow the reported up/down orientation', () => {
	assert.equal(grenadePoseFrame(Math.PI / 2, 32), 31);
	assert.equal(grenadePoseFrame(-Math.PI / 2, 32), 0);
});
test('aim input hides the turn arrow including held aim without command edges', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	advanceGame(game, world, { moveDirection: 0, aimDirection: 1, commands: [] }, WORM.fixedStep);
	assert.equal(game.turnMarker, false);
});
test('health holds an additional pause after recovery before starting the countdown', () => {
	const state = createHealthFeedback(100);
	advanceHealthFeedback(state, 57, 0.2, true);
	assert.equal(state.displayed, 100);
	assert.equal(state.notices.length, 0);
});

import {
	DAMAGE_NOTICE_DURATION,
	HEALTH_COUNTER_DURATION,
	HEALTH_RECOVERY_DELAY,
} from '../src/entities/Worm/model/healthFeedback';
import { createShotCamera, shotCameraTarget } from '../src/widgets/Gameplay/model/camera';

test('result camera waits for recovery, delayed HP and the floating number before returning', () => {
	const worm = createWorm('hit', 'BLUE', 0, 100),
		health = createHealthFeedback(100),
		camera = createShotCamera();
	worm.hp = 57;
	const feedback = { worms: [worm], health: new Map([[worm.id, health]]) };
	const result = { id: 1, position: { x: 0, y: 100 }, time: 0 };
	assert.deepEqual(
		shotCameraTarget(camera, undefined, result, 0, [], undefined, feedback),
		result.position
	);
	assert.deepEqual(
		shotCameraTarget(camera, undefined, result, 4, [], undefined, feedback),
		result.position
	);
	advanceHealthFeedback(health, 57, HEALTH_RECOVERY_DELAY, true);
	assert.deepEqual(
		shotCameraTarget(camera, undefined, result, 4.5, [], undefined, feedback),
		result.position
	);
	advanceHealthFeedback(health, 57, HEALTH_COUNTER_DURATION, true);
	assert.equal(health.displayed, 57);
	assert.equal(health.notices.length, 1);
	assert.deepEqual(
		shotCameraTarget(camera, undefined, result, 5.7, [], undefined, feedback),
		result.position
	);
	advanceHealthFeedback(health, 57, DAMAGE_NOTICE_DURATION, true);
	assert.equal(shotCameraTarget(camera, undefined, result, 8, [], undefined, feedback), null);
	worm.hp = 30;
	assert.equal(shotCameraTarget(camera, undefined, result, 9, [], undefined, feedback), null);
});

test('a fresh shot interrupts pending HP camera hold and submerged cleanup never starts one', () => {
	const worm = createWorm('hit', 'BLUE', 0, 100),
		health = createHealthFeedback(100),
		camera = createShotCamera();
	worm.hp = 57;
	const feedback = { worms: [worm], health: new Map([[worm.id, health]]) },
		result = { id: 1, position: { x: 0, y: 100 }, time: 0 };
	shotCameraTarget(camera, undefined, result, 0, [], undefined, feedback);
	const shot = { id: 2, position: { x: 50, y: 300 } };
	assert.equal(shotCameraTarget(camera, shot, result, 1, [], undefined, feedback), shot.position);
	assert.equal(camera.affectedWormIds.size, 0);
	assert.equal(
		shotCameraTarget(
			camera,
			undefined,
			{ id: 2, position: { x: 50, y: -200 }, time: 2, submerged: true },
			2,
			[],
			undefined,
			feedback
		),
		null
	);
});

test('recovery pause resets if a worm starts moving again and batches later damage', () => {
	const state = createHealthFeedback(100);
	advanceHealthFeedback(state, 70, 0.3, true);
	advanceHealthFeedback(state, 57, 0.2, false);
	advanceHealthFeedback(state, 57, 0.3, true);
	assert.equal(state.displayed, 100);
	assert.equal(state.notices.length, 0);
	advanceHealthFeedback(state, 57, 0.15, true);
	assert.equal(state.notices[0].amount, 43);
});

test('grenade settles on a worm and resumes falling when that support disappears', () => {
	const world = createWorld(800, 600, 1);
	world.terrain.destroyCircle(0, 0, 5000);
	const owner = createWorm('owner', 'RED', -150, 100),
		target = createWorm('target', 'BLUE', 0, 100),
		state = createWeaponState();
	state.selectedWeapon = 'grenade';
	const p = launchProjectile(1, owner, state);
	p.position = { x: 0, y: target.position.y + target.collisionRadius + p.radius + 0.1 };
	p.previousPosition = { ...p.position };
	p.velocity = { x: 0, y: -5 };
	p.ownerCleared = true;
	stepProjectile(p, world, [owner, target], WORM.fixedStep, []);
	assert.equal(p.state, 'resting');
	assert.equal(p.restingOnWormId, target.id);
	stepProjectile(p, world, [owner, target], WORM.fixedStep, []);
	assert.equal(p.state, 'resting');
	target.alive = false;
	stepProjectile(p, world, [owner, target], WORM.fixedStep, []);
	assert.equal(p.state, 'flying');
	assert.ok(p.velocity.y < 0);
});
