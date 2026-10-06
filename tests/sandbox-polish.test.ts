import assert from 'node:assert/strict';
import { test } from 'vitest';
import { launchProjectile, stepProjectile } from '../src/entities/Projectile/model/projectile';
import { equipmentProgress } from '../src/entities/Weapon/model/presentation';
import { createWeaponState } from '../src/entities/Weapon/model/weapon';
import { createWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { NO_INPUT, stepWorm } from '../src/entities/Worm/model/physics';
import { createWorm } from '../src/entities/Worm/model/worm';
import { advanceGame } from '../src/widgets/Gameplay/model/simulation';
import { createControlledGame as createGame } from './gameFixture';

const dt = WORM.fixedStep;
test('full charge automatically fires once even while Space remains held', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	advanceGame(game, world, { moveDirection: 0, commands: ['chargeStart'] }, dt);
	for (let i = 0; i < 100; i++) advanceGame(game, world, { moveDirection: 0, commands: [] }, dt);
	assert.equal(game.nextProjectileId, 2);
	assert.equal(game.weapon.isCharging, false);
	advanceGame(game, world, { moveDirection: 0, commands: ['fire'] }, dt);
	assert.equal(game.nextProjectileId, 2);
});
test('full vertical bazooka reaches apex in approximately one second and wind visibly displaces it', () => {
	const world = createWorld(800, 600, 13377);
	world.terrain.destroyCircle(0, 0, 10000);
	world.waterLevel = -1000;
	world.wind = 1;
	const weapon = createWeaponState();
	weapon.charge = 1;
	weapon.aimAngle = Math.PI / 2;
	const p = launchProjectile(1, createWorm('a', 'RED', 0, 100), weapon);
	let apex = 0;
	while (p.velocity.y > 0 && apex < 4) {
		stepProjectile(p, world, [], dt, []);
		apex += dt;
	}
	assert.ok(apex >= 0.8 && apex <= 1.3, `apex ${apex}`);
	assert.ok(p.position.x >= 100, `wind displacement ${p.position.x}`);
});
test('a damaging landing on a 65 degree raster slope continues sliding downhill', () => {
	const world = createWorld(800, 600, 13377);
	world.waterLevel = -280;
	const cells = (world.terrain as unknown as { cells: Uint8Array }).cells;
	cells.fill(0);
	for (let x = 0; x < world.width; x++)
		for (let y = 0; y < world.height; y++)
			if (y + world.terrain.bottom < (x + world.terrain.left) * Math.tan((65 * Math.PI) / 180))
				cells[y * world.width + x] = 1;
	const worm = createWorm('a', 'RED', 0, 18);
	worm.grounded = false;
	worm.velocity.y = -450;
	for (let i = 0; i < 20; i++) stepWorm(worm, world, NO_INPUT, dt, i * dt);
	assert.ok(worm.hp < 100 && worm.alive, `hp ${worm.hp}`);
	const x = worm.position.x;
	for (let i = 20; i < 45; i++) stepWorm(worm, world, NO_INPUT, dt, i * dt);
	assert.ok(worm.position.x < x - 5, `slide ${worm.position.x - x}`);
});

test('walking removes equipment immediately and stopping delays the held pose and reticle together', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	const worm = game.worms[0];
	for (let i = 0; i < 40; i++) advanceGame(game, world, { moveDirection: 0, commands: [] }, dt);
	assert.equal(equipmentProgress(worm, game.weapon), 1);
	advanceGame(game, world, { moveDirection: 1, commands: [] }, dt);
	assert.equal(equipmentProgress(worm, game.weapon), 0);
	assert.equal(game.turnMarker, false);
	for (let i = 0; i < 12; i++) advanceGame(game, world, { moveDirection: 0, commands: [] }, dt);
	assert.equal(equipmentProgress(worm, game.weapon), 0);
	for (let i = 0; i < 20; i++) advanceGame(game, world, { moveDirection: 0, commands: [] }, dt);
	assert.equal(equipmentProgress(worm, game.weapon), 1);
	game.match.turnTimeRemaining = dt;
	advanceGame(game, world, { moveDirection: 0, commands: [] }, dt);
	for (let i = 0; i < 80; i++) advanceGame(game, world, { moveDirection: 0, commands: [] }, dt);
	assert.equal(game.match.activeWormId, 'BLUE-1');
	assert.equal(game.turnMarker, true);
});
