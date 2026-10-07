import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createWorld } from '../src/entities/World/model/world';
import { WORM } from '../src/entities/Worm/model/config';
import { drowningVisible, drowningY } from '../src/entities/Worm/model/drowning';
import { killWorm } from '../src/entities/Worm/model/worm';
import { createGame } from '../src/widgets/Gameplay/model/simulation';
import { createWormBubbles, updateWormBubbles } from '../src/widgets/Gameplay/model/wormBubbles';

test('a visible drowned worm keeps emitting bubbles after the death timer', () => {
	const world = createWorld(800, 600, 13377),
		game = createGame(world),
		worm = game.worms[0];
	killWorm(worm, 'drown');
	worm.position.y = world.waterLevel - 80;
	worm.stateTime = WORM.drownDuration + 1;
	const bubbles = createWormBubbles();
	updateWormBubbles(bubbles, [worm], 4, world.waterLevel);
	assert.equal(bubbles.points.length, 1);
	assert.equal(bubbles.points[0].y, worm.position.y - WORM.drownSinkSpeed + 7);
});

test('descent continues at constant speed until the full sprite leaves the screen', () => {
	const worm = createGame(createWorld(800, 600, 13377)).worms[0];
	killWorm(worm, 'drown');
	worm.position.y = 0;
	worm.stateTime = WORM.drownDuration;
	assert.equal(drowningY(worm), 0);
	worm.stateTime += 1;
	assert.equal(drowningY(worm), -WORM.drownSinkSpeed);
	assert.equal(drowningVisible(drowningY(worm), -100), true);
	worm.stateTime += 4;
	assert.equal(drowningVisible(drowningY(worm), -100), false);
	assert.equal(worm.position.y, 0);
});
