import { seededRandom } from '../../Terrain/model/terrain';
import { WEAPON } from '../../Weapon/model/config';
import type { GameWorld } from '../../World/model/world';
import type { Facing, Worm } from '../../Worm/model/worm';
import { BOT } from './config';
import {
	cloneWorm,
	type Movement,
	predictMovement,
	type Shot,
	simulateCandidateShot,
} from './prediction';
import { scoreShot, selfExposure } from './scoring';

type RankedShot = Shot & { score: number };
type Position = {
	worm: Worm;
	worms: Worm[];
	movement: Movement;
	cost: number;
	shots: RankedShot[];
};
export type BotPlan = { movement: Movement; shot: RankedShot; positionScore: number };
export function turnSeed(seed: number, turn: number, id: string) {
	let hash = seed ^ Math.imul(turn + 1, 0x9e3779b9);
	for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
	return hash >>> 0;
}
export function localMovements(): Movement[] {
	return [
		{ direction: 0, seconds: 0 },
		...([-1, 1] as const).flatMap((direction) => [
			{ direction, seconds: BOT.shortWalk },
			{ direction, seconds: BOT.mediumWalk },
			{ direction, seconds: 2 / 60, jump: 'forward' as const },
			{ direction, seconds: BOT.shortWalk, jump: 'high' as const },
			{ direction, seconds: 2 / 60, jump: 'backflip' as const },
		]),
	];
}
function* shotCandidates(shooter: Worm, worms: Worm[]): Generator<Shot> {
	const facings = new Set<Facing>(
		worms
			.filter((w) => w.alive && w.team !== shooter.team)
			.map((w) => (w.position.x < shooter.position.x ? 'left' : 'right'))
	);
	for (let angle = -BOT.angleStep; angle <= Math.PI / 2 + 1e-9; angle += BOT.angleStep)
		for (let p = 1; p <= 10; p++)
			for (const facing of facings)
				yield { weapon: 'bazooka', facing, angle, power: p * BOT.powerStep, fuse: 3 };
	for (let angle = 0; angle <= Math.PI / 2 + 1e-9; angle += BOT.angleStep * 2)
		for (const power of [0.2, 0.4, 0.6, 0.8, 1])
			for (const fuse of [1, 2, 3, 4, 5])
				for (const facing of facings) yield { weapon: 'grenade', facing, angle, power, fuse };
}
/** Incremental finite search; a step evaluates at most the configured number of shots. */
export class BotPlanner {
	private positions: Position[] = [];
	private search: Generator<void>;
	complete = false;
	evaluated = 0;
	constructor(
		private world: GameWorld,
		private shooter: Worm,
		worms: Worm[],
		allowMovement: boolean
	) {
		this.shooter = cloneWorm(shooter);
		const observed = worms.map(cloneWorm);
		for (const movement of allowMovement
			? localMovements()
			: [{ direction: 0 as const, seconds: 0 }]) {
			const predicted = movement.direction
				? predictMovement(world, this.shooter, movement, observed)
				: { worm: cloneWorm(this.shooter), seconds: 0 };
			if (!predicted) continue;
			if (
				movement.direction &&
				Math.hypot(
					predicted.worm.position.x - shooter.position.x,
					predicted.worm.position.y - shooter.position.y
				) < 6
			)
				continue;
			const positionWorms = observed.map((w) => (w.id === shooter.id ? predicted.worm : w));
			this.positions.push({
				worm: predicted.worm,
				worms: positionWorms,
				movement,
				cost:
					predicted.seconds * BOT.movementTimeCost +
					(shooter.hp - predicted.worm.hp) * BOT.movementDamageCost +
					selfExposure(predicted.worm, observed),
				shots: [],
			});
		}
		this.search = this.evaluate();
	}
	private rank(position: Position, shot: Shot) {
		const prediction = simulateCandidateShot(this.world, position.worms, position.worm, shot);
		const score = scoreShot(prediction, position.worms, position.worm);
		position.shots.push({ ...shot, score });
		position.shots.sort((a, b) => b.score - a.score);
		position.shots.length = Math.min(3, position.shots.length);
		this.evaluated++;
	}
	private *evaluate(): Generator<void> {
		// Round-robin positions: a time-limited search must still compare both directions.
		const searches = this.positions.map((position) => ({
			position,
			candidates: shotCandidates(position.worm, position.worms),
			done: false,
		}));
		while (searches.some((s) => !s.done))
			for (const search of searches) {
				if (search.done) continue;
				const next = search.candidates.next();
				search.done = Boolean(next.done);
				if (!next.done) {
					this.rank(search.position, next.value);
					yield;
				}
			}
		for (const position of this.positions) {
			for (const best of [...position.shots].slice(0, 2)) {
				for (const angleOffset of [-BOT.refineAngle, 0, BOT.refineAngle])
					for (const powerOffset of [-BOT.refinePower, 0, BOT.refinePower]) {
						this.rank(position, {
							...best,
							angle: Math.max(WEAPON.aimMin, Math.min(WEAPON.aimMax, best.angle + angleOffset)),
							power: Math.max(0, Math.min(1, best.power + powerOffset)),
						});
						yield;
					}
			}
		}
	}
	step(budget: number = BOT.candidatesPerStep) {
		for (let i = 0; i < budget && !this.complete; i++)
			this.complete = Boolean(this.search.next().done);
	}
	choose(seed: number, allowMovement = true): BotPlan | null {
		const stay = this.positions[0];
		if (!stay?.shots.length) return null;
		let selected = stay;
		const value = (position: Position) => (position.shots[0]?.score ?? -Infinity) - position.cost;
		if (allowMovement)
			for (const position of this.positions.slice(1))
				if (
					value(position) > value(stay) + BOT.improvementRequired &&
					value(position) > value(selected)
				)
					selected = position;
		const choices = selected.shots.filter((s) => s.score >= selected.shots[0].score - 6);
		const random = seededRandom(seed);
		const roll = random();
		const index = Math.min(choices.length - 1, roll < 0.76 ? 0 : roll < 0.95 ? 1 : 2);
		const shot = choices[index];
		return {
			movement: selected.movement,
			positionScore: value(selected),
			shot: {
				...shot,
				angle: Math.max(
					WEAPON.aimMin,
					Math.min(WEAPON.aimMax, shot.angle + (random() * 2 - 1) * BOT.angleError)
				),
				power: Math.max(0.05, Math.min(0.98, shot.power + (random() * 2 - 1) * BOT.powerError)),
			},
		};
	}
}
export function fallbackShot(shooter: Worm, worms: Worm[]): RankedShot {
	const target = worms
		.filter((w) => w.alive && w.team !== shooter.team)
		.sort(
			(a, b) =>
				Math.hypot(a.position.x - shooter.position.x, a.position.y - shooter.position.y) -
				Math.hypot(b.position.x - shooter.position.x, b.position.y - shooter.position.y)
		)[0];
	return {
		weapon: 'bazooka',
		facing: target && target.position.x < shooter.position.x ? 'left' : 'right',
		angle: Math.PI / 4,
		power: 0.6,
		fuse: 3,
		score: BOT.uselessScore,
	};
}
