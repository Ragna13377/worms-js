import { expect, it } from 'vitest';
import { createWorld } from '../src/entities/World/model/world';
import {
	MATCH_OUTRO,
	matchOutro,
	rankedTeams,
	teamDisplayedHp,
} from '../src/widgets/Gameplay/model/matchPresentation';
import { advanceGame, createGame } from '../src/widgets/Gameplay/model/simulation';

function fixture() {
	const world = createWorld(320, 240, 7);
	return { world, game: createGame(world, { RED: 1, BLUE: 1 }) };
}

it('HUD HP follows visible counters; rankings swap on damage and keep ties stable', () => {
	const { game } = fixture();
	const red = game.worms.find((w) => w.team === 'RED');
	if (!red) throw new Error('Missing RED worm in fixture');
	const feedback = game.healthFeedback.get(red.id);
	if (!feedback) throw new Error('Missing health feedback in fixture');
	red.hp = 20;
	expect(teamDisplayedHp(game, 'RED')).toBe(100);
	expect(rankedTeams(game, ['RED', 'BLUE'])).toEqual(['RED', 'BLUE']);
	feedback.displayed = 20;
	expect(rankedTeams(game, ['RED', 'BLUE'])).toEqual(['BLUE', 'RED']);
	feedback.displayed = 100;
	expect(rankedTeams(game, ['BLUE', 'RED'])).toEqual(['BLUE', 'RED']);
});

it('outro holds the empty bar, slides it away, celebrates, fades, then exits using simulation time', () => {
	const { game, world } = fixture();
	game.match.turnState = 'MATCH_END';
	game.match.result = 'RED';
	game.match.endedAt = game.time;
	const startedAt = game.time;
	const at = (age: number) => {
		game.time = startedAt + age;
		return matchOutro(game);
	};
	expect(at(0)).toMatchObject({ slide: false, announce: false, fade: 0, done: false });
	expect(at(MATCH_OUTRO.emptyHold + 0.01)).toMatchObject({ slide: true, announce: false, fade: 0 });
	const messageAt = MATCH_OUTRO.emptyHold + MATCH_OUTRO.slide;
	expect(at(messageAt + 0.01)).toMatchObject({ announce: true, fade: 0, done: false });
	expect(at(messageAt + MATCH_OUTRO.celebration + MATCH_OUTRO.fade / 2).fade).toBeCloseTo(0.5);
	expect(at(messageAt + MATCH_OUTRO.celebration + MATCH_OUTRO.fade + 0.01).done).toBe(true);
	const previous = game.time;
	game.paused = true;
	advanceGame(game, world, { moveDirection: 1, commands: ['chargeStart'] }, 0.1);
	expect(game.time).toBe(previous);
	game.paused = false;
	advanceGame(game, world, { moveDirection: 1, commands: ['chargeStart'] }, 0.1);
	expect(game.time).toBeGreaterThan(previous);
	expect(game.weapon.isCharging).toBe(false);
	expect(game.projectiles).toHaveLength(0);
});

it('draw uses the same automatic outro without eliminating a living team', () => {
	const { game } = fixture();
	game.match.turnState = 'MATCH_END';
	game.match.result = 'DRAW';
	game.match.endedAt = 0;
	game.time = 5;
	expect(matchOutro(game).done).toBe(true);
	expect(teamDisplayedHp(game, 'RED')).toBe(100);
	expect(teamDisplayedHp(game, 'BLUE')).toBe(100);
});
