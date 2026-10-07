import { describe, expect, it } from 'vitest';
import { WORM } from '../src/entities/Worm/model/config';
import { InputTimeline } from '../src/shared/realtime/inputTimeline';
import { createOnlineGame } from '../src/shared/realtime/onlineMatch';
import type { InputCommit, OnlineConfig, Seat } from '../src/shared/realtime/protocol';
import { stateHash } from '../src/shared/realtime/stateHash';
import { advanceGame, type GameInput } from '../src/widgets/Gameplay/model/simulation';
import { canControlWorm, canPrepareTurn } from '../src/widgets/Gameplay/model/turns';

const config: OnlineConfig = {
	matchId: '00000000-0000-4000-8000-000000000000',
	seed: 7,
	roster: 3,
	worldWidth: 1280,
	worldHeight: 720,
};
const event = (sequence: number, tick: number, change: InputCommit['change']): InputCommit => ({
	type: 'INPUT_COMMIT',
	matchId: config.matchId,
	seat: 'HOST',
	turnIndex: 0,
	serverSequence: sequence,
	effectiveTick: tick,
	change,
});
it('timeline keeps sticky axes, consumes edges once, and rejects late / gapped ordering', () => {
	const t = new InputTimeline();
	t.enqueue(event(1, 0, { moveDirection: 1, aimDirection: -1, commands: ['forwardJump'] }));
	expect(t.consume(0, 'HOST')).toEqual({
		moveDirection: 1,
		aimDirection: -1,
		commands: ['forwardJump'],
	});
	expect(t.consume(0, 'HOST').commands).toEqual([]);
	t.enqueue(event(1, 0, { commands: [] }));
	expect(() => t.enqueue(event(3, 4, { commands: [] }))).toThrow('BAD_SEQUENCE');
	expect(() => t.enqueue(event(2, 0, { commands: [] }))).toThrow('LATE_INPUT');
	t.neutralize();
	expect(t.consume(1, 'GUEST').moveDirection).toBe(0);
});
it('obsolete turn input cannot leak into the next owner', () => {
	const t = new InputTimeline();
	t.enqueue(event(1, 0, { moveDirection: 1, commands: ['fire'] }));
	expect(t.consume(1, 'GUEST')).toEqual({ moveDirection: 0, aimDirection: 0, commands: [] });
});
describe('authoritative checksum', () => {
	it.each(['position', 'hp', 'terrain', 'wind', 'turn', 'weapon', 'projectile', 'shot'])(
		'detects %s changes',
		(field) => {
			const { game, world } = createOnlineGame(config);
			const before = stateHash(game, world, 0);
			if (field === 'position') game.worms[0].position.x += 0.001;
			if (field === 'hp') game.worms[0].hp--;
			if (field === 'terrain')
				world.terrain.destroyCircle(game.worms[0].position.x, game.worms[0].position.y - 10, 20);
			if (field === 'wind') world.wind += 0.001;
			if (field === 'turn') game.match.turnIndex++;
			if (field === 'weapon') game.weapon.grenadeFuse = 1;
			if (field === 'projectile') game.nextProjectileId++;
			if (field === 'shot') game.lastShotResult = { id: 1, time: 1, position: { x: 0, y: 0 } };
			expect(stateHash(game, world, 0)).not.toBe(before);
		}
	);
	it('ignores presentation/session properties', () => {
		const { game, world } = createOnlineGame(config);
		const before = stateHash(game, world, 0);
		Object.assign(game, { camera: 55, localTeam: 'BLUE', socket: {}, ui: 'menu' });
		game.paused = true;
		expect(stateHash(game, world, 0)).toBe(before);
	});
});
it('two independent online simulations execute the same weapons, jumps, terrain/damage and complete a ten-minute match', () => {
	const a = createOnlineGame(config),
		b = createOnlineGame(config);
	expect(a.world.width).toBe(1280);
	expect(a.world.height).toBe(720);
	const timelines = [new InputTimeline(), new InputTimeline()];
	let sequence = 0,
		lastTurn = -1,
		controlTicks = 0,
		projectiles = 0,
		blasts = 0,
		minHp = 100,
		jumps = 0;
	let bounced = false,
		remembered = false,
		deathBlast = false;
	const launched = new Set<string>();
	const terrainBefore = a.world.terrain.exportCells();
	for (let tick = 0; tick < 38000; tick++) {
		const g = a.game;
		const owner: Seat | null =
			canControlWorm(g) || canPrepareTurn(g)
				? g.worms.find((w) => w.id === g.match.activeWormId)?.team === 'RED'
					? 'HOST'
					: 'GUEST'
				: null;
		if (lastTurn !== g.match.turnIndex) {
			if (g.match.turnIndex >= 2 && owner === 'HOST') {
				expect(g.weapon.selectedWeapon).toBe('grenade');
				remembered = true;
			}
			lastTurn = g.match.turnIndex;
			controlTicks = 0;
		}
		if (owner) {
			const commands: GameInput['commands'] = [];
			let move: -1 | 0 | 1 | undefined, aim: -1 | 0 | 1 | undefined;
			if (controlTicks === 10) {
				commands.push(owner === 'HOST' ? 'grenade' : 'bazooka');
				move = 1;
				aim = 1;
			}
			if (controlTicks === 18) {
				move = 0;
				aim = 0;
				commands.push('forwardJump');
			}
			if (controlTicks === 95) commands.push('highJump');
			if (controlTicks === 98) commands.push('highJump');
			if (controlTicks === 200) commands.push('fuse1', 'chargeStart');
			if (controlTicks === 220) commands.push('fire');
			if (commands.length || move !== undefined || aim !== undefined) {
				const e: InputCommit = {
					...event(++sequence, tick, {
						...(move === undefined ? {} : { moveDirection: move }),
						...(aim === undefined ? {} : { aimDirection: aim }),
						commands,
					}),
					seat: owner,
					turnIndex: g.match.turnIndex,
				};
				for (const t of timelines) t.enqueue(e);
			}
			controlTicks++;
		}
		const previousGrenades = new Map(
			a.game.projectiles
				.filter((p) => p.type === 'grenade')
				.map((p) => [p.id, { vy: p.velocity.y, age: p.age, fuse: p.fuse }])
		);
		for (let i = 0; i < 2; i++) {
			const sim = i === 0 ? a : b,
				t = timelines[i],
				turn = sim.game.match.turnIndex;
			advanceGame(sim.game, sim.world, t.consume(turn, owner), WORM.fixedStep);
			if (
				turn !== sim.game.match.turnIndex ||
				!(canControlWorm(sim.game) || canPrepareTurn(sim.game))
			)
				t.neutralize();
		}
		for (const p of a.game.projectiles) {
			launched.add(p.type);
			const prev = previousGrenades.get(p.id);
			if (prev && prev.vy < 0 && (p.velocity.y > 0 || p.state === 'resting')) bounced = true;
		}
		for (const [id, prev] of previousGrenades)
			if (
				a.game.lastShotResult?.id === id &&
				!a.game.lastShotResult.submerged &&
				a.game.explosions.effects.some((e) => e.source === 'weapon' && e.age === 0)
			)
				expect(prev.age + WORM.fixedStep + 1e-8).toBeGreaterThanOrEqual(prev.fuse);
		projectiles = Math.max(projectiles, a.game.nextProjectileId - 1);
		blasts = Math.max(blasts, a.game.explosions.nextEffectId - 1);
		if (a.game.explosions.effects.some((e) => e.source === 'death')) deathBlast = true;
		minHp = Math.min(minHp, ...a.game.worms.map((w) => w.hp));
		if (a.game.worms.some((w) => w.jumpType)) jumps++;
		if (
			tick % 300 === 0 ||
			lastTurn !== a.game.match.turnIndex ||
			a.game.match.turnState === 'MATCH_END'
		)
			expect(stateHash(a.game, a.world, tick + 1)).toBe(stateHash(b.game, b.world, tick + 1));
		if (a.game.match.turnState === 'MATCH_END') break;
	}
	expect(launched).toEqual(new Set(['grenade', 'bazooka']));
	expect(bounced).toBe(true);
	expect(deathBlast).toBe(true);
	expect(remembered).toBe(true);
	expect(a.game.worms.some((w) => !w.alive)).toBe(true);
	expect(a.game.explosions.deathEmitted.size).toBeGreaterThan(0);
	expect(projectiles).toBeGreaterThan(1);
	expect(blasts).toBeGreaterThan(1);
	expect(jumps).toBeGreaterThan(0);
	expect(minHp).toBeLessThan(100);
	expect(a.game.match.turnIndex).toBeGreaterThan(1);
	expect(a.game.match.turnState).toBe('MATCH_END');
	expect(a.game.match.result).toBe(b.game.match.result);
	expect(a.world.terrain.exportCells()).not.toEqual(terrainBefore);
}, 30000);
