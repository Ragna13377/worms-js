import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
	createMatch,
	teamCurrentHp,
	teamMaxHp,
	turnOrder,
} from '../src/entities/Match/model/match';
import { createWorm } from '../src/entities/Worm/model/worm';

test('stable ordinal interleaving is independent of roster array order', () => {
	const worms = [
		createWorm('BLUE-2', 'BLUE', 0, 0),
		createWorm('RED-1', 'RED', 0, 0),
		createWorm('BLUE-1', 'BLUE', 0, 0),
		createWorm('RED-2', 'RED', 0, 0),
		createWorm('RED-3', 'RED', 0, 0),
	];
	assert.deepEqual(turnOrder(worms), ['RED-1', 'BLUE-1', 'RED-2', 'BLUE-2', 'RED-3']);
	const match = createMatch(worms, {
		RED: 3,
		BLUE: 2,
		teamNames: { RED: 'Scarlet', BLUE: 'Azure' },
	});
	assert.equal(match.activeWormId, 'RED-1');
	assert.equal(match.turnState, 'TURN_START');
	assert.equal(match.turnTimeRemaining, 45);
	worms[1].hp = 70;
	worms[3].hp = 0;
	worms[3].alive = false;
	assert.equal(teamCurrentHp(worms, 'RED'), 170);
	assert.equal(teamMaxHp(match, 'RED'), 300);
});

import { MATCH } from '../src/entities/Match/model/match';
import { createWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { advanceGame, createGame } from '../src/widgets/Gameplay/model/simulation';

const idle = { moveDirection: 0 as const, commands: [] };
function advanceSeconds(
	game: ReturnType<typeof createGame>,
	world: ReturnType<typeof createWorld>,
	seconds: number
) {
	for (let i = 0; i < Math.round(seconds / WORM.fixedStep); i++)
		advanceGame(game, world, idle, WORM.fixedStep);
}
test('intro locks input and the 45-second control timer times out without firing stale edges', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world, { RED: 1, BLUE: 1 });
	const x = game.worms[0].position.x;
	advanceGame(
		game,
		world,
		{ moveDirection: 1, commands: ['chargeStart', 'forwardJump'] },
		WORM.fixedStep
	);
	assert.equal(game.match.turnState, 'TURN_START');
	assert.equal(game.worms[0].position.x, x);
	assert.equal(game.weapon.isCharging, false);
	assert.equal(game.match.turnTimeRemaining, 45);
	advanceSeconds(game, world, MATCH.introSeconds);
	assert.equal(game.match.turnState, 'CONTROL');
	advanceSeconds(game, world, 44.5);
	advanceGame(game, world, { ...idle, commands: ['chargeStart'] }, WORM.fixedStep);
	advanceSeconds(game, world, 0.5);
	assert.equal(game.match.turnState, 'SETTLING');
	assert.equal(game.weapon.isCharging, false);
	assert.equal(game.nextProjectileId, 1);
	advanceGame(game, world, { ...idle, commands: ['fire'] }, WORM.fixedStep);
	assert.equal(game.nextProjectileId, 1);
	advanceSeconds(game, world, 1.2);
	assert.equal(game.match.activeWormId, 'BLUE-1');
	assert.equal(game.match.turnState, 'CONTROL');
	assert.ok(game.match.turnTimeRemaining > 44.8);
});

import {
	advanceHealthFeedback,
	createHealthFeedback,
	HEALTH_RECOVERY_DELAY,
} from '../src/entities/Worm/model/healthFeedback';

test('ordinary damage traverses every integer after recovery without changing authoritative HP', () => {
	const worm = createWorm('hp', 'RED', 0, 0),
		state = createHealthFeedback(100);
	worm.hp = 70;
	advanceHealthFeedback(state, worm.hp, HEALTH_RECOVERY_DELAY, true);
	const values = [state.displayed];
	for (let i = 0; i < 180; i++) {
		advanceHealthFeedback(state, worm.hp, WORM.fixedStep, true);
		if (state.displayed !== values.at(-1)) values.push(state.displayed);
	}
	assert.deepEqual(
		values,
		Array.from({ length: 31 }, (_, i) => 100 - i)
	);
	assert.equal(worm.hp, 70);
});

import { matchResult, nextLivingCursor } from '../src/entities/Match/model/match';
import { killWorm } from '../src/entities/Worm/model/worm';
import { GameplayControls } from '../src/widgets/Gameplay/model/controls';
import { matchConfigFromQuery } from '../src/widgets/Gameplay/model/matchConfig';
import {
	canControlWorm,
	isHealthFeedbackComplete,
	isWorldSettled,
} from '../src/widgets/Gameplay/model/turns';
import { createControlledGame } from './gameFixture';

for (const size of [1, 2, 3])
	test(`${size}v${size} cyclic turns alternate exact stable ordinal slots`, () => {
		const world = createWorld(960, 640, 13377),
			game = createControlledGame(world, { RED: size, BLUE: size });
		const seen = [game.match.activeWormId];
		for (let slot = 0; slot < size * 2; slot++) {
			game.match.turnTimeRemaining = WORM.fixedStep;
			advanceGame(game, world, idle, WORM.fixedStep);
			advanceSeconds(game, world, 1.1);
			assert.equal(game.match.turnState, 'CONTROL');
			seen.push(game.match.activeWormId);
		}
		assert.deepEqual(seen, [
			...Array.from({ length: size }, (_, i) => [`RED-${i + 1}`, `BLUE-${i + 1}`]).flat(),
			'RED-1',
		]);
	});
test('next living search skips consecutive dead slots and bounds an empty roster', () => {
	const worms = ['RED-1', 'BLUE-1', 'RED-2', 'BLUE-2', 'RED-3', 'BLUE-3'].map((id) =>
		createWorm(id, id.startsWith('RED') ? 'RED' : 'BLUE', 0, 0)
	);
	const match = createMatch(worms);
	worms[1].alive = false;
	worms[2].alive = false;
	assert.equal(nextLivingCursor(match, worms), 3);
	worms.forEach((w) => {
		w.alive = false;
	});
	assert.equal(nextLivingCursor(match, worms), null);
	assert.equal(matchResult(worms), 'DRAW');
});
test('shot creation immediately locks every control and consumes the turn even on a miss', () => {
	const world = createWorld(800, 600, 13377),
		game = createControlledGame(world, { RED: 1, BLUE: 1 });
	game.weapon.aimAngle = Math.PI / 2;
	advanceGame(game, world, { ...idle, commands: ['chargeStart'] }, WORM.fixedStep);
	advanceGame(game, world, { ...idle, commands: ['fire'] }, WORM.fixedStep);
	assert.equal(game.match.turnState, 'FIRING');
	assert.equal(canControlWorm(game), false);
	const owner = game.worms[0],
		position = { ...owner.position },
		aim = game.weapon.aimAngle;
	advanceGame(
		game,
		world,
		{
			moveDirection: 1,
			aimDirection: -1,
			commands: ['grenade', 'fuse1', 'forwardJump', 'chargeStart', 'fire'],
		},
		WORM.fixedStep
	);
	assert.deepEqual(owner.position, position);
	assert.equal(game.weapon.aimAngle, aim);
	assert.equal(game.weapon.selectedWeapon, 'bazooka');
	assert.equal(game.weapon.grenadeFuse, 3);
	assert.equal(game.nextProjectileId, 2);
	game.projectiles[0].alive = false;
	advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(game.match.turnState, 'SETTLING');
	advanceSeconds(game, world, 4);
	assert.equal(game.match.activeWormId, 'BLUE-1');
	assert.equal(game.match.turnState, 'CONTROL');
});
test('only active worm moves/jumps and neutral input is required across timeout', () => {
	const world = createWorld(960, 640, 13377),
		game = createControlledGame(world, { RED: 2, BLUE: 2 });
	const other = game.worms.filter((w) => w.id !== 'RED-1').map((w) => ({ ...w.position }));
	advanceGame(game, world, { moveDirection: 1, commands: ['forwardJump'] }, WORM.fixedStep);
	assert.equal(game.worms[0].jumpType, 'forward');
	assert.deepEqual(
		game.worms.filter((w) => w.id !== 'RED-1').map((w) => w.position),
		other
	);
	advanceSeconds(game, world, 3);
	game.match.turnTimeRemaining = WORM.fixedStep;
	advanceGame(game, world, { moveDirection: 1, commands: [] }, WORM.fixedStep);
	for (let i = 0; i < 100; i++)
		advanceGame(game, world, { moveDirection: 1, commands: [] }, WORM.fixedStep);
	assert.equal(game.match.activeWormId, 'BLUE-1');
	const blue = game.worms.find((w) => w.id === 'BLUE-1');
	assert.ok(blue);
	const x = blue.position.x;
	advanceGame(game, world, { moveDirection: 1, commands: [] }, WORM.fixedStep);
	assert.equal(blue.position.x, x);
	advanceGame(game, world, idle, WORM.fixedStep);
	advanceGame(game, world, { moveDirection: 1, commands: [] }, WORM.fixedStep);
	assert.ok(blue.position.x > x);
});
test('browser held keys and late Space release never leak into next player', () => {
	const controls = new GameplayControls();
	controls.press('ArrowRight');
	controls.press('Space');
	controls.consume();
	controls.setEnabled(false);
	controls.press('Enter');
	controls.press('F2');
	controls.setEnabled(true);
	controls.press('ArrowRight', true);
	controls.release('Space');
	assert.deepEqual(controls.consume(), idle);
	controls.release('ArrowRight');
	controls.press('ArrowRight');
	assert.equal(controls.consume().moveDirection, 1);
	assert.equal(controls.press('Tab'), false);
});
test('settled predicate excludes projectiles, pending gameplay explosions and each unresolved motion', () => {
	const world = createWorld(960, 640, 13377),
		game = createControlledGame(world);
	assert.equal(isWorldSettled(game), true);
	const worm = game.worms[0];
	for (const mutate of [
		(w: typeof worm) => {
			w.grounded = false;
		},
		(w: typeof worm) => {
			w.sliding = true;
		},
		(w: typeof worm) => {
			w.velocity.x = 1;
		},
		(w: typeof worm) => {
			w.impulsePending = true;
		},
		(w: typeof worm) => {
			w.knockedBack = true;
		},
		(w: typeof worm) => {
			w.animationState = 'twang';
		},
	]) {
		const snapshot = {
			impulsePending: false,
			knockedBack: false,
			sliding: false,
			...structuredClone(worm),
		};
		mutate(worm);
		assert.equal(isWorldSettled(game), false);
		Object.assign(worm, snapshot);
	}
	game.explosions.queue.push({
		position: { x: 0, y: 0 },
		radius: 0,
		terrainRadius: 0,
		maxDamage: 0,
		knockback: 0,
		source: 'death',
	});
	assert.equal(isWorldSettled(game), false);
	game.explosions.queue.length = 0;
	game.explosions.effects.push({
		position: { x: 0, y: 0 },
		radius: 0,
		terrainRadius: 0,
		maxDamage: 0,
		knockback: 0,
		source: 'weapon',
		id: 1,
		age: 0,
	});
	assert.equal(isWorldSettled(game), true);
	killWorm(worm, 'death');
	assert.equal(isWorldSettled(game), false);
	worm.stateTime = 10;
	assert.equal(isWorldSettled(game), false);
	game.explosions.deathEmitted.add(worm.id);
	assert.equal(isWorldSettled(game), true);
});
test('stability resets when a second blast creates work during the window', () => {
	const world = createWorld(960, 640, 13377),
		game = createControlledGame(world);
	game.match.turnTimeRemaining = WORM.fixedStep;
	advanceGame(game, world, idle, WORM.fixedStep);
	advanceSeconds(game, world, 0.15);
	assert.ok(game.match.settleStableTime > 0);
	const worm = game.worms[2];
	game.explosions.queue.push({
		position: { x: worm.position.x, y: worm.position.y - 10 },
		radius: 30,
		terrainRadius: 0,
		maxDamage: 0,
		knockback: 50,
		source: 'weapon',
	});
	advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(game.match.settleStableTime, 0);
	assert.equal(game.match.turnState, 'SETTLING');
	advanceSeconds(game, world, 0.3);
	assert.equal(game.match.turnState, 'SETTLING');
	advanceSeconds(game, world, 8);
	assert.equal(game.match.activeWormId, 'BLUE-1');
});
for (const eliminated of ['RED', 'BLUE', 'BOTH'] as const)
	test(`coherent elimination of ${eliminated} waits for death work and feedback then remains MATCH_END`, () => {
		const world = createWorld(960, 640, 13377),
			game = createControlledGame(world, { RED: 1, BLUE: 1 });
		for (const worm of game.worms)
			if (eliminated === 'BOTH' || worm.team === eliminated) killWorm(worm, 'death');
		// Passive elimination during CONTROL is resolved through the same lifecycle.
		game.match.turnTimeRemaining = WORM.fixedStep;
		advanceGame(game, world, idle, WORM.fixedStep);
		assert.equal(game.match.result, null);
		advanceSeconds(game, world, 1);
		assert.equal(game.match.result, null);
		advanceSeconds(game, world, 8);
		assert.equal(game.match.turnState, 'MATCH_END');
		assert.equal(
			game.match.result,
			eliminated === 'BOTH' ? 'DRAW' : eliminated === 'RED' ? 'BLUE' : 'RED'
		);
		const cursor = game.match.turnCursor,
			next = game.nextProjectileId;
		advanceGame(
			game,
			world,
			{ moveDirection: 1, commands: ['chargeStart', 'fire'] },
			WORM.fixedStep
		);
		assert.equal(game.match.turnCursor, cursor);
		assert.equal(game.nextProjectileId, next);
		assert.equal(game.match.activeWormId, null);
	});
test('team health uses actual living HP and initial maxima for 1/2/3 worms', () => {
	for (const size of [1, 2, 3]) {
		const world = createWorld(960, 640, 13377),
			game = createGame(world, { RED: size, BLUE: size });
		assert.equal(teamMaxHp(game.match, 'RED'), size * 100);
		game.worms[0].hp = 70;
		assert.equal(teamCurrentHp(game.worms, 'RED'), size * 100 - 30);
		game.worms[0].alive = false;
		assert.equal(teamCurrentHp(game.worms, 'RED'), (size - 1) * 100);
	}
});
test('new match from saved config clears dirty gameplay and presentation state', () => {
	const world = createWorld(960, 640, 13377),
		old = createControlledGame(world, { RED: 2, BLUE: 1, teamNames: { RED: 'Custom' } });
	old.worms[0].hp = 0;
	old.worms[0].alive = false;
	old.match.result = 'BLUE';
	old.match.turnState = 'MATCH_END';
	old.match.turnCursor = 2;
	old.weapon.grenadeFuse = 1;
	old.lastShotResult = { id: 7, position: { x: 0, y: 0 }, time: 5 };
	old.explosions.deathEmitted.add('RED-1');
	const oldHealth = old.healthFeedback.get('RED-1');
	assert.ok(oldHealth);
	oldHealth.displayed = 50;
	const fresh = createGame(createWorld(960, 640, 13378), old.match.config);
	assert.equal(fresh.worms.length, 3);
	assert.ok(fresh.worms.every((w) => w.alive && w.hp === 100));
	assert.equal(fresh.match.activeWormId, 'RED-1');
	assert.equal(fresh.match.turnState, 'TURN_START');
	assert.equal(fresh.match.result, null);
	assert.equal(fresh.match.turnTimeRemaining, 45);
	assert.equal(fresh.match.matchTimeRemaining, 600);
	assert.equal(fresh.match.turnCursor, 0);
	assert.equal(fresh.match.config.teamNames.RED, 'Custom');
	assert.equal(fresh.weapon.grenadeFuse, 3);
	assert.equal(fresh.weapon.selectedWeapon, 'bazooka');
	assert.equal(fresh.lastShotResult, null);
	assert.equal(fresh.projectiles.length, 0);
	assert.equal(fresh.explosions.queue.length, 0);
	assert.equal(fresh.explosions.effects.length, 0);
	assert.equal(fresh.explosions.deathEmitted.size, 0);
	assert.equal(isHealthFeedbackComplete(fresh), true);
});
test('query counts are validated outside match domain and invalid explicit counts fail', () => {
	assert.deepEqual(matchConfigFromQuery('?red=1&blue=2'), { RED: 1, BLUE: 2 });
	assert.deepEqual(matchConfigFromQuery('?red=-1&blue=99'), { RED: 1, BLUE: 3 });
	assert.deepEqual(matchConfigFromQuery('?red=no&blue=1.5'), { RED: 3, BLUE: 3 });
	assert.throws(() => createGame(createWorld(800, 600, 1), { RED: 0, BLUE: 3 }), RangeError);
});
test('fixed-step timeout point and match countdown are independent of render chunking', () => {
	const scenario = (fps: number) => {
		const world = createWorld(800, 600, 13377),
			game = createGame(world, { RED: 1, BLUE: 1 });
		for (let i = 0; i < fps * 46; i++) advanceGame(game, world, idle, 1 / fps);
		return { match: game.match, time: game.time, worms: game.worms };
	};
	assert.deepEqual(scenario(30), scenario(60));
	assert.deepEqual(scenario(144), scenario(60));
});

import { launchProjectile } from '../src/entities/Projectile/model/projectile';
import { WEAPON } from '../src/entities/Weapon/model/config';

test('last direct hit is authoritative immediately but victory waits for its death explosion', () => {
	const world = createWorld(960, 640, 13377),
		game = createControlledGame(world, { RED: 1, BLUE: 1 }),
		blue = game.worms.find((w) => w.team === 'BLUE');
	assert.ok(blue);
	blue.hp = 50;
	game.explosions.queue.push({ position: { ...blue.position }, ...WEAPON.blast, source: 'weapon' });
	game.match.turnTimeRemaining = WORM.fixedStep;
	advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(blue.hp, 0);
	assert.equal(blue.alive, false);
	assert.equal(game.match.result, null);
	advanceSeconds(game, world, 1);
	assert.equal(game.match.result, null);
	advanceSeconds(game, world, 8);
	assert.equal(game.match.result, 'RED');
	assert.equal(game.explosions.deathEmitted.has(blue.id), true);
});
test('final death chain can eliminate both teams and produce DRAW instead of an early win', () => {
	const world = createWorld(960, 640, 13377),
		game = createControlledGame(world, { RED: 1, BLUE: 1 }),
		red = game.worms[0],
		blue = game.worms[1];
	blue.position = { x: red.position.x + 10, y: red.position.y };
	blue.previousPosition = { ...blue.position };
	blue.hp = 10;
	killWorm(red, 'death');
	advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(game.match.result, null);
	advanceSeconds(game, world, 2);
	assert.equal(blue.alive, true);
	assert.equal(game.match.result, null);
	advanceSeconds(game, world, 8);
	assert.equal(blue.alive, false);
	assert.equal(game.match.result, 'DRAW');
	assert.equal(game.explosions.deathEmitted.size, 2);
});
test('a final ordinary falling death waits for embedded/death work and ends the match', () => {
	const world = createWorld(960, 640, 13377),
		game = createControlledGame(world, { RED: 1, BLUE: 1 }),
		blue = game.worms[1];
	blue.hp = 1;
	blue.position.y += 80;
	blue.grounded = false;
	blue.velocity.y = -650;
	game.match.turnTimeRemaining = WORM.fixedStep;
	advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(game.match.turnState, 'SETTLING');
	advanceSeconds(game, world, 0.3);
	assert.equal(blue.alive, false);
	assert.equal(game.match.result, null);
	advanceSeconds(game, world, 10);
	assert.equal(game.match.result, 'RED');
});
test('a death crater makes a second supported worm fall and settling waits for it', () => {
	const world = createWorld(960, 640, 13377),
		game = createControlledGame(world, { RED: 2, BLUE: 1 }),
		dead = game.worms[0],
		victim = game.worms[1];
	victim.position = { x: dead.position.x + 8, y: dead.position.y + 2 };
	victim.previousPosition = { ...victim.position };
	killWorm(dead, 'death');
	advanceGame(game, world, idle, WORM.fixedStep);
	advanceSeconds(game, world, 2.5);
	assert.equal(game.match.turnState, 'SETTLING');
	assert.ok(victim.hp < 100 || !victim.grounded);
	advanceSeconds(game, world, 0.1);
	assert.equal(game.match.turnState, 'SETTLING');
	advanceSeconds(game, world, 15);
	assert.equal(game.match.activeWormId, 'BLUE-1');
});
test('a live projectile and queued death delay settling and dead worms never enter CONTROL', () => {
	const world = createWorld(960, 640, 13377),
		game = createControlledGame(world, { RED: 2, BLUE: 2 });
	const blue1 = game.worms.find((w) => w.id === 'BLUE-1');
	assert.ok(blue1);
	killWorm(blue1, 'death');
	const p = launchProjectile(99, game.worms[0], game.weapon);
	p.position.y = 1000;
	p.previousPosition = { ...p.position };
	p.velocity = { x: 0, y: 0 };
	game.projectiles.push(p);
	game.match.turnState = 'FIRING';
	assert.equal(isWorldSettled(game), false);
	advanceSeconds(game, world, 0.5);
	assert.equal(game.match.turnState, 'FIRING');
	assert.equal(game.match.activeWormId, 'RED-1');
	p.alive = false;
	advanceGame(game, world, idle, WORM.fixedStep);
	assert.equal(game.match.turnState, 'SETTLING');
	assert.equal(game.match.result, null);
	advanceSeconds(game, world, 10);
	assert.equal(game.match.activeWormId, 'RED-2');
	assert.equal(game.match.turnState, 'CONTROL');
});
test('sequential and lethal HP loss converges through all integers without blocking forever', () => {
	const health = createHealthFeedback(100),
		values = [100];
	let target = 70;
	for (let i = 0; i < 600; i++) {
		if (i === 50) target = 0;
		advanceHealthFeedback(health, target, WORM.fixedStep, true);
		if (health.displayed !== values.at(-1)) values.push(health.displayed);
	}
	assert.deepEqual(
		values,
		Array.from({ length: 101 }, (_, i) => 100 - i)
	);
	assert.equal(health.notices.length, 0);
	assert.equal(health.actual, 0);
});

import { aftermathWorm } from '../src/widgets/Gameplay/model/camera';

test('passive elimination of the non-active last opponent immediately locks CONTROL before coherent victory', () => {
	const world = createWorld(960, 640, 13377),
		game = createControlledGame(world, { RED: 1, BLUE: 1 }),
		blue = game.worms[1];
	blue.hp = 1;
	blue.position.y += 80;
	blue.grounded = false;
	blue.velocity.y = -650;
	advanceSeconds(game, world, 0.3);
	assert.equal(blue.alive, false);
	assert.equal(game.match.turnState, 'SETTLING');
	assert.equal(game.match.result, null);
	advanceSeconds(game, world, 10);
	assert.equal(game.match.result, 'RED');
});
test('aftermath camera retains a landed victim through delayed and counted HP then releases', () => {
	const world = createWorld(960, 640, 13377),
		game = createControlledGame(world),
		victim = game.worms[2];
	victim.hp = 60;
	victim.knockedBack = true;
	victim.grounded = false;
	assert.equal(aftermathWorm(game, null)?.id, victim.id);
	victim.knockedBack = false;
	victim.grounded = true;
	victim.animationState = 'idle';
	assert.equal(aftermathWorm(game, victim.id)?.id, victim.id);
	const health = game.healthFeedback.get(victim.id);
	assert.ok(health);
	advanceHealthFeedback(health, victim.hp, 0.45, true);
	advanceHealthFeedback(health, victim.hp, 1, true);
	assert.equal(aftermathWorm(game, victim.id)?.id, victim.id);
	advanceHealthFeedback(health, victim.hp, 10, true);
	assert.equal(aftermathWorm(game, victim.id), null);
});
