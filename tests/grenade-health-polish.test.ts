import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createExplosionState, explode } from '../src/entities/Explosion/model/explosion';
import { WEAPON } from '../src/entities/Weapon/model/config';
import { createWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { createWorm } from '../src/entities/Worm/model/worm';
import { advanceGame, createGame } from '../src/widgets/Gameplay/model/simulation';

test('blast survivors retain a flight-pose marker independently of jump commands', () => {
	const world = createWorld(800, 600, 13377);
	const worm = createWorm('flight', 'RED', 0, 150);
	explode(createExplosionState(), world, [worm], {
		position: { x: 0, y: 145 },
		...WEAPON.blast,
		source: 'weapon',
	});
	assert.equal(worm.alive, true);
	assert.equal(worm.knockedBack, true);
	assert.equal(worm.jumpType, null);
});
test('fuse notice only appears after digits with a grenade and clears on weapon selection', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	const command = (commands: Parameters<typeof advanceGame>[2]['commands']) =>
		advanceGame(game, world, { moveDirection: 0, commands }, WORM.fixedStep);
	assert.equal(game.weapon.grenadeFuse, 3);
	command(['grenade']);
	assert.equal(game.fuseNotice, null);
	command(['fuse2']);
	const notice = game.fuseNotice as ReturnType<typeof createGame>['fuseNotice'];
	assert.equal(notice?.fuse, 2);
	assert.ok(notice && notice.until > game.time);
	command(['bazooka']);
	assert.equal(game.fuseNotice, null);
	command(['fuse5']);
	assert.equal(game.fuseNotice, null);
	command(['grenade']);
	assert.equal(game.fuseNotice, null);
});

import { flightFrame } from '../src/entities/Worm/model/animation';
import {
	advanceHealthFeedback,
	createHealthFeedback,
	DAMAGE_NOTICE_DURATION,
	HEALTH_COUNTER_DURATION,
} from '../src/entities/Worm/model/healthFeedback';
import { NO_INPUT, stepWorm } from '../src/entities/Worm/model/physics';

test('flight poses follow velocity through upward, sideways and inverted downward positions', () => {
	assert.equal(flightFrame({ x: 0, y: 300 }, 32), 0);
	assert.equal(flightFrame({ x: 0, y: -300 }, 32), 31);
	assert.equal(flightFrame({ x: 300, y: 0 }, 32), 16);
	assert.equal(flightFrame({ x: -300, y: 0 }, 32), 16);
});
test('HP counts down quickly then slows and finishes before floating damage disappears', () => {
	const state = createHealthFeedback(100);
	advanceHealthFeedback(state, 57, 0);
	assert.equal(state.displayed, 100);
	assert.equal(state.actual, 57);
	assert.equal(state.notices[0].amount, 43);
	advanceHealthFeedback(state, 57, 0.3);
	const early = state.displayed;
	advanceHealthFeedback(state, 57, 0.3);
	const late = state.displayed;
	assert.ok(100 - early > early - late);
	advanceHealthFeedback(state, 57, HEALTH_COUNTER_DURATION - 0.6 + 0.01);
	assert.equal(state.displayed, 57);
	assert.equal(state.notices.length, 1);
	advanceHealthFeedback(state, 57, DAMAGE_NOTICE_DURATION);
	assert.equal(state.notices.length, 0);
	assert.equal(state.displayed, 57);
});
test('successive damage restarts from displayed HP and keeps independent bounded notices', () => {
	const state = createHealthFeedback(100);
	advanceHealthFeedback(state, 80, 0);
	advanceHealthFeedback(state, 80, 0.2);
	const before = state.displayed;
	advanceHealthFeedback(state, 60, 0);
	assert.equal(state.displayed, before);
	assert.deepEqual(
		state.notices.map((n) => n.amount),
		[20, 20]
	);
	for (let hp = 59; hp > 40; hp--) advanceHealthFeedback(state, hp, 0);
	assert.equal(state.notices.length, 4);
	advanceHealthFeedback(state, 0, 2);
	advanceHealthFeedback(state, 0, 2);
	assert.equal(state.displayed, 0);
	assert.equal(state.notices.length, 0);
});
test('landing clears blast flight while ordinary commanded jumps keep their own sequence', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world);
	const worm = game.worms[0];
	worm.knockedBack = true;
	worm.grounded = false;
	worm.velocity.y = -1;
	for (let i = 0; i < 180 && !worm.grounded; i++)
		stepWorm(worm, world, NO_INPUT, WORM.fixedStep, i / 60);
	assert.equal(worm.grounded, true);
	assert.equal(worm.knockedBack, false);
	stepWorm(worm, world, { ...NO_INPUT, forwardJumpPressed: true }, WORM.fixedStep, 4);
	assert.equal(worm.jumpType, 'forward');
	assert.equal(worm.knockedBack, false);
});
