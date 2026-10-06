import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	blastStrength,
	createExplosionState,
	type Explosion,
	explode,
	resolveExplosions,
} from '../src/entities/Explosion/model/explosion';
import {
	launchProjectile,
	stepProjectile,
	waterSkip,
} from '../src/entities/Projectile/model/projectile';
import { TerrainModel } from '../src/entities/Terrain/model/terrain';
import { WEAPON } from '../src/entities/Weapon/model/config';
import { aimDirection, createWeaponState } from '../src/entities/Weapon/model/weapon';
import { createWorld, type GameWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { NO_INPUT, stepWorm } from '../src/entities/Worm/model/physics';
import { createWorm, killWorm } from '../src/entities/Worm/model/worm';
import { GameplayControls } from '../src/widgets/Gameplay/model/controls';
import {
	activeWorm,
	advanceGame,
	cancelGameInput,
	createGame,
	type GameInput,
} from '../src/widgets/Gameplay/model/simulation';

const dt = WORM.fixedStep;
const idle: GameInput = { moveDirection: 0, commands: [] };
function emptyWorld(): GameWorld {
	const terrain = new TerrainModel(1200, 800, 1);
	terrain.destroyCircle(0, 0, 2000);
	return {
		terrain,
		width: terrain.width,
		height: terrain.height,
		waterLevel: -350,
		seed: 1,
		wind: 0,
	};
}
function flatWorld(slope = 0): GameWorld {
	const world = emptyWorld();
	// Deterministic fixtures specify occupancy through the public raster query seam.
	world.terrain.cellAt = (x, y) =>
		x >= 0 &&
		x < world.width &&
		y >= 0 &&
		y < world.height &&
		y + world.terrain.bottom < slope * (x + world.terrain.left);
	return world;
}
function projectile(type: 'bazooka' | 'grenade' = 'bazooka', x = 0, y = 150, vx = 100, vy = 0) {
	const state = createWeaponState();
	state.selectedWeapon = type;
	const p = launchProjectile(1, createWorm('owner', 'RED', x, y), state);
	p.position = { x, y };
	p.previousPosition = { x, y };
	p.velocity = { x: vx, y: vy };
	p.ownerCleared = true;
	return p;
}
function run(
	p: ReturnType<typeof projectile>,
	world: GameWorld,
	seconds: number,
	queue: Explosion[] = []
) {
	for (let i = 0; i < Math.round(seconds / dt) && p.alive; i++)
		stepProjectile(p, world, [], dt, queue);
	return queue;
}

test('aim increments, decrements, clamps, stays stable, and mirrors with facing', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	const start = game.weapon.aimAngle;
	advanceGame(game, world, { ...idle, aimDirection: 1 }, dt);
	assert.ok(game.weapon.aimAngle > start);
	advanceGame(game, world, { ...idle, aimDirection: -1 }, dt);
	assert.ok(Math.abs(game.weapon.aimAngle - start) < 1e-8);
	advanceGame(game, world, idle, dt);
	assert.equal(game.weapon.aimAngle, start);
	for (let i = 0; i < 200; i++) advanceGame(game, world, { ...idle, aimDirection: 1 }, dt);
	assert.equal(game.weapon.aimAngle, WEAPON.aimMax);
	for (let i = 0; i < 400; i++) advanceGame(game, world, { ...idle, aimDirection: -1 }, dt);
	assert.equal(game.weapon.aimAngle, WEAPON.aimMin);
	const worm = createWorm('a', 'RED', 0, 100);
	worm.facing = 'right';
	const right = aimDirection(worm, start);
	worm.facing = 'left';
	const left = aimDirection(worm, start);
	assert.equal(right.x, -left.x);
	assert.equal(right.y, left.y);
});
test('charge uses simulation time, caps, blocks cycling/movement and releases exactly once', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world),
		worm = activeWorm(game);
	assert.ok(worm);
	const id = worm.id,
		x = worm.position.x;
	advanceGame(game, world, { ...idle, commands: ['chargeStart'] }, dt);
	for (let i = 0; i < 29; i++)
		advanceGame(game, world, { moveDirection: 1, commands: ['cycle'] }, dt);
	assert.ok(Math.abs(game.weapon.charge - 0.5 / WEAPON.chargeDuration) < 1e-8);
	assert.equal(activeWorm(game)?.id, id);
	assert.equal(worm.position.x, x);
	for (let i = 0; i < 100; i++) advanceGame(game, world, idle, dt);
	assert.equal(game.weapon.charge, 0);
	advanceGame(game, world, { ...idle, commands: ['fire', 'fire'] }, dt);
	assert.equal(game.nextProjectileId, 2);
	assert.equal(game.weapon.charge, 0);
	assert.equal(game.weapon.isCharging, false);
});
test('browser edges reject repeats and blur cancels rather than firing a stuck Space', () => {
	const c = new GameplayControls();
	c.press('Space');
	c.press('Space', true);
	assert.deepEqual(c.consume().commands, ['chargeStart']);
	c.release('Space');
	c.release('Space');
	assert.deepEqual(c.consume().commands, ['fire']);
	c.press('Space');
	c.consume();
	c.clear();
	c.release('Space');
	assert.deepEqual(c.consume().commands, ['cancelCharge']);
	for (let i = 1; i <= 5; i++) {
		c.press(`Digit${i}`);
		c.release(`Digit${i}`);
		assert.deepEqual(c.consume().commands, [`fuse${i}`]);
	}
});
test('fixed simulation gives identical charge, projectile and blast results at 30/60/144 fps', () => {
	function scenario(fps: number) {
		const world = createWorld(800, 600, 13377),
			game = createGame(world);
		for (let i = 0; i < fps; i++)
			advanceGame(game, world, { ...idle, commands: i === 0 ? ['chargeStart'] : [] }, 1 / fps);
		const charge = game.weapon.charge;
		for (let i = 0; i < fps * 5; i++)
			advanceGame(game, world, { ...idle, commands: i === 0 ? ['fire'] : [] }, 1 / fps);
		return {
			charge,
			projectiles: game.projectiles,
			worms: game.worms,
			next: game.explosions.nextEffectId,
		};
	}
	const sixty = scenario(60);
	assert.deepEqual(scenario(30), sixty);
	assert.deepEqual(scenario(144), sixty);
});
test('launch power and facing determine speed and origin clears shooter collider', () => {
	const worm = createWorm('a', 'RED', 0, 0),
		weapon = createWeaponState();
	worm.facing = 'right';
	const weak = launchProjectile(1, worm, weapon);
	weapon.charge = 1;
	const strong = launchProjectile(2, worm, weapon);
	assert.ok(
		Math.hypot(strong.velocity.x, strong.velocity.y) >
			Math.hypot(weak.velocity.x, weak.velocity.y) * 5
	);
	assert.ok(Math.hypot(weak.position.x, weak.position.y) > worm.collisionRadius + weak.radius);
	worm.facing = 'left';
	assert.ok(launchProjectile(3, worm, weapon).velocity.x < 0);
});
test('bazooka gravity and signed wind alter flight while grenade ignores wind', () => {
	for (const type of ['bazooka', 'grenade'] as const) {
		const results = [-1, 0, 1].map((wind) => {
			const world = emptyWorld();
			world.wind = wind;
			const p = projectile(type, 0, 250);
			run(p, world, 0.5);
			return p;
		});
		for (const p of results) assert.ok(p.velocity.y < 0 && p.position.y < 250);
		if (type === 'bazooka') {
			assert.ok(results[0].position.x < results[1].position.x);
			assert.ok(results[1].position.x < results[2].position.x);
			assert.ok(Math.abs(results[1].position.x - 50) < 1e-8);
		} else assert.deepEqual(results[0], results[2]);
	}
});
test('fast bazooka collides with a one-unit wall and a living worm at actual impact', () => {
	const world = emptyWorld();
	world.terrain.cellAt = (x, y) => x === 610 && y >= 0 && y < world.height;
	const p = projectile('bazooka', 0, 100, 1000, 0),
		queue: Explosion[] = [];
	stepProjectile(p, world, [], dt, queue);
	assert.equal(p.alive, false);
	assert.equal(queue.length, 1);
	assert.ok(p.position.x <= 10);
	const target = createWorm('target', 'BLUE', 10, 100),
		shot = projectile('bazooka', 0, 100, 1000, 0),
		hits: Explosion[] = [];
	stepProjectile(shot, emptyWorld(), [target], dt, hits);
	assert.equal(hits.length, 1);
});
test('shallow fast water impact skips with energy loss and bounded count; steep/slow shots submerge without blast', () => {
	const p = projectile('bazooka', 0, -346.3, 450, -50),
		world = emptyWorld(),
		queue: Explosion[] = [];
	stepProjectile(p, world, [], dt, queue);
	assert.equal(p.skipCount, 1);
	assert.ok(p.velocity.y > 0);
	assert.ok(p.velocity.x < 450);
	assert.equal(queue.length, 0);
	for (let i = 1; i < WEAPON.skip.maxCount; i++) {
		p.velocity = { x: 450, y: -50 };
		assert.equal(waterSkip(p, world.waterLevel), true);
	}
	p.velocity = { x: 450, y: -50 };
	assert.equal(waterSkip(p, world.waterLevel), false);
	for (const [vx, vy] of [
		[30, -20],
		[300, -300],
	]) {
		const shot = projectile('bazooka', 0, -346, vx, vy);
		run(shot, world, 0.5, queue);
		assert.equal(shot.state, 'submerged');
		assert.equal(shot.alive, true);
		run(shot, world, WEAPON.skip.submergedLifetime + 0.1, queue);
		assert.equal(shot.alive, false);
		assert.equal(shot.skipCount, 0);
	}
	assert.equal(queue.length, 0);
});
test('projectile lifetime and world bounds clean up without explosion', () => {
	const world = emptyWorld();
	for (const shot of [projectile('bazooka', 1001, 100), projectile('bazooka')]) {
		if (shot.position.x < 1000) shot.age = WEAPON.maxLifetime;
		const q: Explosion[] = [];
		stepProjectile(shot, world, [], dt, q);
		assert.equal(shot.alive, false);
		assert.equal(q.length, 0);
	}
});
for (let fuse = 1; fuse <= 5; fuse++)
	test(`grenade fuse ${fuse}s expires within one fixed step while resting`, () => {
		const world = flatWorld(),
			p = projectile('grenade', 0, 4.02, 0, 0);
		p.state = 'resting';
		p.fuse = fuse;
		const q: Explosion[] = [];
		run(p, world, fuse - dt, q);
		assert.equal(q.length, 0);
		assert.equal(p.state, 'resting');
		stepProjectile(p, world, [], dt, q);
		assert.equal(q.length, 1);
		assert.ok(Math.abs(p.age - fuse) < 1e-8);
	});
test('grenade flat bounce loses normal/tangent energy and eventually settles without jitter', () => {
	const world = flatWorld(),
		p = projectile('grenade', 0, 4.1, 100, -150);
	p.fuse = 5;
	stepProjectile(p, world, [], dt, []);
	assert.ok(p.velocity.y > 0);
	assert.ok(p.velocity.y < 150);
	assert.ok(p.velocity.x < 100);
	run(p, world, 3);
	assert.equal(p.state, 'resting');
	const position = { ...p.position };
	run(p, world, 0.5);
	assert.deepEqual(p.position, position);
});
test('grenade slope collision reflects incoming normal and dissipates energy', () => {
	const world = flatWorld(0.35),
		p = projectile('grenade', 0, 4.1, 90, -140);
	const before = Math.hypot(p.velocity.x, p.velocity.y);
	stepProjectile(p, world, [], dt, []);
	assert.ok(p.velocity.y > 0);
	assert.ok(Math.hypot(p.velocity.x, p.velocity.y) < before);
	run(p, world, 2);
	assert.equal(p.alive, true);
});
test('resting grenade wakes when support in the live mask is removed', () => {
	const world = createWorld(800, 600, 13377),
		worm = createGame(world).worms[0];
	const p = projectile(
		'grenade',
		worm.position.x,
		(world.terrain.heightAt(worm.position.x) ?? 0) + 4.02,
		0,
		0
	);
	p.state = 'resting';
	world.terrain.destroyCircle(p.position.x, p.position.y, 20);
	stepProjectile(p, world, [], dt, []);
	assert.equal(p.state, 'flying');
	assert.ok(p.velocity.y < 0);
});
test('grenade water contact at fuse expiry despawns without explosion', () => {
	const world = emptyWorld(),
		p = projectile('grenade', 0, -345, 0, -200),
		q: Explosion[] = [];
	p.fuse = dt;
	stepProjectile(p, world, [], dt, q);
	assert.equal(p.alive, false);
	assert.equal(q.length, 0);
});
test('blast profile is full within 20%, smooth to zero at edge, and zero outside', () => {
	assert.equal(blastStrength(0, 100), 1);
	assert.equal(blastStrength(20, 100), 1);
	assert.ok(blastStrength(60, 100) > 0 && blastStrength(60, 100) < 1);
	assert.ok(blastStrength(99, 100) < 0.001);
	assert.equal(blastStrength(100, 100), 0);
	assert.equal(blastStrength(130, 100), 0);
	assert.ok(Math.abs(blastStrength(20.01, 100) - blastStrength(19.99, 100)) < 1e-6);
});
test('shared blast destroys collision mask and damages owner, friend and enemy with radial impulses', () => {
	const world = createWorld(800, 600, 13377),
		s = createExplosionState(),
		origin = createGame(world).worms[0].position;
	const worms = [
		createWorm('owner', 'RED', origin.x, origin.y),
		createWorm('friend', 'RED', origin.x + 15, origin.y),
		createWorm('enemy', 'BLUE', origin.x - 15, origin.y),
		createWorm('edge', 'BLUE', origin.x + 80, origin.y),
		createWorm('outside', 'BLUE', origin.x + 90, origin.y),
	];
	assert.ok(world.terrain.isSolid(origin.x, origin.y - 10));
	explode(s, world, worms, { position: { ...origin }, ...WEAPON.blast, source: 'weapon' });
	assert.equal(world.terrain.isSolid(origin.x, origin.y - 10), false);
	assert.equal(world.terrain.collideCircle(origin.x, origin.y - 10, 3), null);
	assert.equal(worms[0].hp, 50);
	assert.equal(worms[1].hp, 60);
	assert.equal(worms[2].hp, 60);
	assert.equal(worms[4].hp, 100);
	assert.ok(worms[0].velocity.y > 0);
	assert.ok(worms[1].velocity.x > 0);
	assert.ok(worms[2].velocity.x < 0);
	assert.ok(worms[3].velocity.x < worms[1].velocity.x);
	assert.equal(worms[0].grounded, false);
	assert.equal(s.effects.length, 1);
});
test('blast adds real airborne velocity without default extra fall damage', () => {
	const world = flatWorld(),
		worm = createWorm('a', 'RED', 0, 7.02),
		s = createExplosionState();
	explode(s, world, [worm], { position: { x: 0, y: -1 }, ...WEAPON.blast, source: 'weapon' });
	const hpAfterBlast = worm.hp;
	assert.ok(hpAfterBlast > 50 && hpAfterBlast < 100);
	let apex = worm.position.y;
	for (let i = 0; i < 180 && worm.alive; i++) {
		stepWorm(worm, world, NO_INPUT, dt, i * dt);
		apex = Math.max(apex, worm.position.y);
	}
	assert.ok(apex > 100);
	assert.equal(worm.hp, hpAfterBlast);
	assert.ok(worm.grounded || !worm.alive);
});
test('death chains wait for each animation then emit once, destroy terrain and propagate kills', () => {
	const world = createWorld(800, 600, 13377),
		origin = createGame(world).worms[0].position,
		s = createExplosionState();
	const a = createWorm('a', 'RED', origin.x, origin.y),
		b = createWorm('b', 'BLUE', origin.x + 10, origin.y),
		c = createWorm('c', 'RED', origin.x + 25, origin.y),
		d = createWorm('d', 'BLUE', origin.x + 50, origin.y);
	a.hp = 1;
	b.hp = 20;
	c.hp = 20;
	killWorm(a, 'death');
	a.stateTime = WORM.deathDuration;
	resolveExplosions(s, world, [a, b, c, d]);
	assert.equal(b.alive, false);
	assert.equal(c.alive, true);
	assert.equal(s.effects.length, 1);
	b.stateTime = WORM.deathDuration;
	resolveExplosions(s, world, [a, b, c, d]);
	assert.equal(c.alive, false);
	c.stateTime = WORM.deathDuration;
	resolveExplosions(s, world, [a, b, c, d]);
	assert.ok(d.hp < 100);
	assert.ok(d.velocity.x > 0);
	assert.equal(s.effects.length, 3);
	assert.equal(s.deathEmitted.size, 3);
	assert.equal(world.terrain.isSolid(origin.x, origin.y - 10), false);
	resolveExplosions(s, world, [a, b, c, d]);
	assert.equal(s.effects.length, 3);
});
test('drowning remains nonexplosive; lethal fall and non-water OOB each explode once', () => {
	const world = flatWorld(),
		s = createExplosionState(),
		drowned = createWorm('d', 'RED', 0, -351);
	stepWorm(drowned, world, NO_INPUT, dt, 0);
	resolveExplosions(s, world, [drowned]);
	assert.equal(drowned.animationState, 'drown');
	assert.equal(s.effects.length, 0);
	const fall = createWorm('f', 'RED', 0, 8);
	fall.hp = 1;
	fall.grounded = false;
	fall.velocity.y = -500;
	stepWorm(fall, world, NO_INPUT, dt, 0);
	fall.stateTime = WORM.deathDuration;
	resolveExplosions(s, world, [drowned, fall]);
	assert.equal(fall.alive, false);
	assert.equal(s.effects.length, 1);
	const oob = createWorm('o', 'BLUE', 601, 200);
	stepWorm(oob, world, NO_INPUT, dt, 0);
	oob.stateTime = WORM.deathDuration;
	resolveExplosions(s, world, [drowned, fall, oob]);
	assert.equal(oob.alive, false);
	assert.equal(s.effects.length, 2);
});

test('cancel clears queued fire and movement edges before a fixed step can replay them', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world),
		controls = new GameplayControls();
	const worm = activeWorm(game);
	assert.ok(worm);
	const position = { ...worm.position };
	controls.press('Space');
	controls.release('Space');
	controls.press('Enter');
	controls.release('Enter');
	controls.press('ArrowRight');
	controls.release('ArrowRight');
	advanceGame(game, world, controls.consume(), dt / 4);
	assert.equal(game.nextProjectileId, 1);
	controls.clear();
	cancelGameInput(game);
	advanceGame(game, world, controls.consume(), dt);
	assert.equal(game.nextProjectileId, 1);
	assert.equal(game.weapon.isCharging, false);
	assert.deepEqual(worm.position, position);
});
test('brief aim taps survive a render frame without a physics step', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world),
		controls = new GameplayControls();
	const initial = game.weapon.aimAngle;
	controls.press('ArrowUp');
	controls.release('ArrowUp');
	advanceGame(game, world, controls.consume(), dt / 4);
	advanceGame(game, world, controls.consume(), dt);
	assert.ok(game.weapon.aimAngle > initial);
});
test('grenade settles stably on a slope and still explodes on its five-second fuse', () => {
	const world = flatWorld(0.35),
		p = projectile('grenade', 0, 4.1, 90, -140),
		q: Explosion[] = [];
	p.fuse = 5;
	run(p, world, 3, q);
	assert.equal(p.state, 'resting');
	const position = { ...p.position };
	run(p, world, 1, q);
	assert.deepEqual(p.position, position);
	assert.equal(q.length, 0);
	run(p, world, 1, q);
	assert.equal(q.length, 1);
	assert.equal(p.alive, false);
});

test('horizontal blast momentum enters the worm sweep even when edge support remains', () => {
	const world = flatWorld(),
		worm = createWorm('edge', 'RED', 60, 7.02),
		s = createExplosionState();
	explode(s, world, [worm], { position: { x: 0, y: 7.02 }, ...WEAPON.blast, source: 'weapon' });
	const x = worm.position.x;
	assert.ok(worm.velocity.x > 0);
	stepWorm(worm, world, NO_INPUT, dt, 0);
	assert.ok(worm.position.x > x);
});

test('a returning bazooka can hit its owner after leaving the launch grace zone', () => {
	const world = emptyWorld(),
		owner = createWorm('owner', 'RED', 0, 100),
		weapon = createWeaponState();
	weapon.aimAngle = 0;
	weapon.charge = 1;
	const p = launchProjectile(1, owner, weapon),
		q: Explosion[] = [];
	stepProjectile(p, world, [owner], dt, q);
	assert.equal(p.ownerCleared, true);
	assert.equal(q.length, 0);
	p.velocity = { x: -680, y: 0 };
	for (let i = 0; i < 4 && p.alive; i++) stepProjectile(p, world, [owner], dt, q);
	assert.equal(q.length, 1);
	assert.equal(p.alive, false);
});
test('full vertical bazooka can reach its apex and return within configured useful bounds', () => {
	const world = emptyWorld(),
		p = projectile('bazooka', 0, 100, 0, WEAPON.bazooka.maxSpeed);
	run(p, world, 1.2);
	assert.equal(p.alive, true);
	assert.ok(p.position.y > 650);
	assert.ok(p.velocity.y < 0);
});
