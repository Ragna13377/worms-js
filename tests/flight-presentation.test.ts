import assert from 'node:assert/strict';
import { test } from 'vitest';
import { cloudFrame } from '../src/entities/Cloud/model/animation';
import { createShotCamera, shotCameraTarget } from '../src/widgets/Gameplay/model/camera';
import {
	createRocketTrail,
	rocketTrailSample,
	updateRocketTrail,
} from '../src/widgets/Gameplay/model/rocketTrail';

test('cloud sheets reverse at both endpoints instead of resetting', () => {
	assert.deepEqual(
		Array.from({ length: 9 }, (_, i) => cloudFrame(i, 4)),
		[0, 1, 2, 3, 2, 1, 0, 1, 2]
	);
	for (let i = 1; i < 100; i++)
		assert.equal(Math.abs(cloudFrame(i, 20) - cloudFrame(i - 1, 20)), 1);
	assert.equal(cloudFrame(100, 1), 0);
});
test('new smoke comes from the displayed tail in every flight direction between fixed steps', () => {
	for (const velocity of [
		{ x: 900, y: 0 },
		{ x: -900, y: 0 },
		{ x: 0, y: 900 },
		{ x: 0, y: -900 },
		{ x: 400, y: -600 },
	]) {
		const p = {
			id: 1,
			type: 'bazooka' as const,
			age: 1,
			previousPosition: { x: 0, y: 0 },
			position: { x: velocity.x / 60, y: velocity.y / 60 },
			velocity,
		};
		for (const alpha of [0, 0.25, 0.5, 0.99]) {
			const sample = rocketTrailSample(p, alpha, 1);
			assert.ok(Math.abs(sample.shot.position.x - p.position.x * alpha) < 1e-9);
			assert.ok(Math.abs(sample.shot.position.y - p.position.y * alpha) < 1e-9);
			const trail = createRocketTrail();
			updateRocketTrail(trail, sample.shot, sample.time);
			const smoke = trail.points.at(-1);
			assert.ok(smoke);
			const dx = smoke.x - sample.shot.position.x,
				dy = smoke.y - sample.shot.position.y;
			assert.ok(
				dx * velocity.x + dy * velocity.y < 0,
				'smoke must stay behind the interpolated rocket'
			);
			assert.ok(Math.abs(Math.hypot(dx, dy) - 12) < 1e-9);
		}
	}
});
test('camera holds the final result for 2.5 seconds then releases to normal follow', () => {
	const control = createShotCamera();
	const impact = { id: 1, position: { x: 700, y: 150 }, time: 10 };
	assert.deepEqual(shotCameraTarget(control, { id: 1, position: { x: 650, y: 200 } }, null, 9), {
		x: 650,
		y: 200,
	});
	assert.deepEqual(shotCameraTarget(control, undefined, impact, 10), impact.position);
	assert.deepEqual(shotCameraTarget(control, undefined, impact, 12.49), impact.position);
	assert.equal(shotCameraTarget(control, undefined, impact, 12.5), null);
	assert.equal(
		shotCameraTarget(control, undefined, impact, 13),
		null,
		'old results never restart the delay'
	);
});
test('new shots override a held result; immediate resolutions and water cleanup also hold', () => {
	const control = createShotCamera();
	assert.deepEqual(
		shotCameraTarget(control, undefined, { id: 1, position: { x: 100, y: 50 }, time: 1 }, 1),
		{ x: 100, y: 50 }
	);
	assert.deepEqual(shotCameraTarget(control, { id: 2, position: { x: 300, y: 600 } }, null, 1.1), {
		x: 300,
		y: 600,
	});
	assert.deepEqual(
		shotCameraTarget(control, undefined, { id: 2, position: { x: 900, y: -200 }, time: 2 }, 3),
		{ x: 900, y: -200 }
	);
});

test('simulation records final impact and non-explosive cleanup even within one render frame', async () => {
	const { createWorld } = await import('../src/entities/World/model/world');
	const { launchProjectile } = await import('../src/entities/Projectile/model/projectile');
	const { createWeaponState } = await import('../src/entities/Weapon/model/weapon');
	const { createWorm } = await import('../src/entities/Worm/model/worm');
	const { WORM } = await import('../src/entities/Worm/model/config');
	const { advanceGame, createGame } = await import('../src/widgets/Gameplay/model/simulation');
	for (const explosive of [true, false]) {
		const world = createWorld(800, 600, 13377),
			game = createGame(world);
		world.waterLevel = world.terrain.bottom - 100;
		const p = launchProjectile(10, createWorm('fixture', 'RED', 0, 100), createWeaponState());
		p.position = { x: 0, y: world.terrain.bottom + 20 };
		p.previousPosition = { ...p.position };
		if (!explosive) p.position.y = world.terrain.bottom - 1;
		game.projectiles.push(p);
		advanceGame(game, world, { moveDirection: 0, commands: [] }, WORM.fixedStep * 3);
		assert.equal(game.projectiles.length, 0);
		assert.equal(game.explosions.effects.length > 0, explosive);
		assert.deepEqual(game.lastShotResult?.position, p.position);
		assert.equal(game.lastShotResult?.id, 10);
		assert.ok(game.lastShotResult);
		assert.ok(game.lastShotResult.time <= game.time);
		const target = shotCameraTarget(createShotCamera(), undefined, game.lastShotResult, game.time);
		assert.deepEqual(target, p.position);
	}
});

test('an ensuing death explosion near the impact stays observable without repeatedly extending the hold', () => {
	const control = createShotCamera(),
		result = { id: 1, position: { x: 0, y: 0 }, time: 0 };
	shotCameraTarget(control, undefined, result, 0);
	const effects = [{ id: 1, source: 'death', position: { x: 10, y: 0 } }];
	assert.deepEqual(shotCameraTarget(control, undefined, result, 2.4, effects), { x: 10, y: 0 });
	assert.deepEqual(shotCameraTarget(control, undefined, result, 4.8, effects), { x: 10, y: 0 });
	assert.equal(shotCameraTarget(control, undefined, result, 5, effects), null);
});

test('camera releases a sinking shot once its rendered sprite is below the viewport without a result hold', () => {
	const control = createShotCamera();
	const shot = {
		id: 1,
		state: 'submerged' as const,
		position: { x: 500, y: -480 },
		previousPosition: { x: 500, y: -460 },
	};
	assert.deepEqual(
		shotCameraTarget(control, shot, null, 1, [], { bottom: -500, alpha: 0.5 }),
		shot.position
	);
	shot.position.y = -550;
	shot.previousPosition.y = -530;
	assert.equal(shotCameraTarget(control, shot, null, 1.2, [], { bottom: -500, alpha: 0.5 }), null);
	assert.equal(
		shotCameraTarget(control, shot, null, 1.3, [], { bottom: -700, alpha: 0.5 }),
		null,
		'released sinking shots must not be tracked again'
	);
	const result = { id: 1, position: shot.position, time: 3, submerged: true };
	assert.equal(shotCameraTarget(control, undefined, result, 3), null);
});
