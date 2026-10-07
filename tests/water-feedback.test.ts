import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	createExplosionState,
	explode,
	resolveExplosions,
} from '../src/entities/Explosion/model/explosion';
import { launchProjectile, stepProjectile } from '../src/entities/Projectile/model/projectile';
import { WEAPON } from '../src/entities/Weapon/model/config';
import { grenadeSpinFrame, powerDotProgress } from '../src/entities/Weapon/model/presentation';
import { createWeaponState } from '../src/entities/Weapon/model/weapon';
import { createWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { createWorm, killWorm } from '../src/entities/Worm/model/worm';
import {
	createRocketBubbles,
	updateRocketBubbles,
} from '../src/widgets/Gameplay/model/rocketBubbles';
import { createRocketTrail, updateRocketTrail } from '../src/widgets/Gameplay/model/rocketTrail';
import { waterCoverage, waterWaveLayer } from '../src/widgets/Water/model/coverage';

test('death blast waits for the animation endpoint then damages neighbours and terrain exactly once', () => {
	const world = createWorld(800, 600, 13377),
		state = createExplosionState();
	const ground = world.terrain.heightAt(0);
	assert.ok(ground !== null);
	const a = createWorm('a', 'RED', 0, ground + 7),
		b = createWorm('b', 'BLUE', 10, a.position.y);
	killWorm(a, 'death');
	resolveExplosions(state, world, [a, b]);
	assert.equal(state.effects.length, 0);
	assert.equal(b.hp, 100);
	a.stateTime = WORM.deathDuration;
	resolveExplosions(state, world, [a, b]);
	assert.equal(state.effects.length, 1);
	assert.ok(b.hp < 100);
	assert.equal(world.terrain.isSolid(a.position.x, a.position.y - 10), false);
	resolveExplosions(state, world, [a, b]);
	assert.equal(state.effects.length, 1);
});
test('a living worm inside the blast edge loses HP whenever the blast gives it an impulse', () => {
	const world = createWorld(800, 600, 13377),
		s = createExplosionState();
	const worm = createWorm('edge', 'BLUE', WEAPON.blast.radius + WORM.radius - 0.1, 100);
	explode(s, world, [worm], { position: { x: 0, y: 100 }, ...WEAPON.blast, source: 'weapon' });
	assert.ok(worm.hp < 100);
	assert.ok(worm.velocity.x > 0);
});
test('sinking missiles never emit smoke; surface skips keep the smoke trail', () => {
	const trail = createRocketTrail();
	const shot = {
		id: 1,
		type: 'bazooka' as const,
		age: 1,
		position: { x: 0, y: 0 },
		velocity: { x: 500, y: -500 },
		state: 'flying' as 'flying' | 'submerged',
	};
	updateRocketTrail(trail, shot, 1);
	assert.equal(trail.points.length, 1);
	shot.state = 'submerged';
	updateRocketTrail(trail, shot, 1.1);
	assert.equal(trail.points.length, 0);
	shot.id = 2;
	shot.state = 'flying';
	updateRocketTrail(trail, shot, 1.2);
	assert.equal(trail.points.length, 1);
});

test('water covers the camera bottom while rear waves stay behind terrain and front waves stay in front', () => {
	for (const cameraY of [0, -200, -600, -1200]) {
		const c = waterCoverage(-250, -300, cameraY, 900);
		assert.equal(c.y + c.height / 2, -250);
		assert.ok(c.y - c.height / 2 < cameraY - 450);
	}
	const layers = Array.from({ length: 5 }, (_, i) => waterWaveLayer(i, 2));
	assert.equal(layers.filter((l) => l.depth < 3).length, 2);
	assert.equal(layers.filter((l) => l.depth > 3).length, 3);
	assert.deepEqual(
		layers.map((l) => l.row),
		[-2, -1, 0, 1, 2]
	);
});
test('charge dots grow continuously at cell boundaries instead of suddenly showing full circles', () => {
	for (let i = 0; i < 13; i++) {
		const start = i / 13;
		assert.equal(powerDotProgress(start, i), 0);
		assert.ok(powerDotProgress(start + 0.001, i) > 0 && powerDotProgress(start + 0.001, i) < 0.01);
		assert.ok(powerDotProgress(start + 0.04, i) > 0.4 && powerDotProgress(start + 0.04, i) < 0.7);
		assert.equal(powerDotProgress((i + 1) / 13, i), 1);
	}
});
test('sinking continues below terrain bounds, emits rising bubbles and cleans up without an explosion', () => {
	const world = createWorld(800, 600, 13377);
	world.terrain.destroyCircle(0, 0, 5000);
	const p = launchProjectile(1, createWorm('a', 'RED', 0, 0), createWeaponState());
	p.position = { x: 0, y: world.waterLevel - 20 };
	p.state = 'submerged';
	p.velocity = { x: 0, y: -150 };
	const bubbles = createRocketBubbles(),
		q = [] as Parameters<typeof stepProjectile>[4];
	for (let i = 0; i < 60; i++) {
		stepProjectile(p, world, [], WORM.fixedStep, q);
		updateRocketBubbles(bubbles, p, i * WORM.fixedStep, world.waterLevel);
		assert.ok(p.alive);
		assert.ok(bubbles.points.length <= 16);
	}
	assert.ok(p.position.y < world.terrain.bottom);
	assert.ok(bubbles.points.length > 2);
	assert.ok(bubbles.points.every((b) => b.y > p.position.y));
	for (let i = 0; i < 150; i++) stepProjectile(p, world, [], WORM.fixedStep, q);
	assert.equal(p.alive, false);
	assert.equal(q.length, 0);
	updateRocketBubbles(bubbles, undefined, 5, world.waterLevel);
	assert.equal(bubbles.points.length, 0);
});

test('water entry reduces vertical speed while leaving a successful skip unchanged', () => {
	const world = createWorld(800, 600, 13377);
	world.terrain.destroyCircle(0, 0, 5000);
	const p = launchProjectile(1, createWorm('a', 'RED', 0, 0), createWeaponState());
	p.position = { x: 0, y: world.waterLevel + 4 };
	p.velocity = { x: 0, y: -500 };
	stepProjectile(p, world, [], WORM.fixedStep, []);
	assert.equal(p.state, 'submerged');
	assert.ok(Math.abs(p.velocity.y) < 400 && Math.abs(p.velocity.y) > 200);
	const skim = launchProjectile(2, createWorm('b', 'RED', 0, 0), createWeaponState());
	skim.position = { x: 0, y: world.waterLevel + 4 };
	skim.velocity = { x: 450, y: -50 };
	stepProjectile(skim, world, [], WORM.fixedStep, []);
	assert.equal(skim.skipCount, 1);
	assert.equal(skim.state, 'flying');
	assert.ok(skim.velocity.y > 35, 'a successful skip must retain its reflected lift');
});

test('grenade water entry freezes spin, emits bubbles and sinks without horizontal drift or fuse explosion', () => {
	const world = createWorld(800, 600, 13377);
	world.terrain.destroyCircle(0, 0, 5000);
	const weapon = createWeaponState();
	weapon.selectedWeapon = 'grenade';
	const p = launchProjectile(1, createWorm('a', 'RED', 0, 0), weapon);
	p.position = { x: 0, y: world.waterLevel + p.radius + 1 };
	p.velocity = { x: 100, y: -250 };
	p.age = 0.9;
	p.fuse = 1;
	const bubbles = createRocketBubbles(),
		q: Parameters<typeof stepProjectile>[4] = [];
	stepProjectile(p, world, [], WORM.fixedStep, q);
	assert.equal(p.state, 'submerged');
	const frame = grenadeSpinFrame(p, 32),
		x = p.position.x,
		y = p.position.y;
	for (let i = 0; i < 90; i++) {
		stepProjectile(p, world, [], WORM.fixedStep, q);
		updateRocketBubbles(bubbles, p, p.age, world.waterLevel);
		assert.equal(grenadeSpinFrame(p, 32), frame);
		assert.equal(p.position.x, x);
		assert.equal(p.alive, true);
		assert.ok(bubbles.points.length <= 16);
	}
	assert.ok(p.position.y < y);
	assert.ok(bubbles.points.length > 0);
	assert.equal(q.length, 0);
});
