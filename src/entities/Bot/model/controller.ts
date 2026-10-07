import type { Command, Game, GameInput } from '../../../widgets/Gameplay/model/simulation';
import { WEAPON } from '../../Weapon/model/config';
import type { GameWorld } from '../../World/model/world';
import { WORM } from '../../Worm/model/config';
import { BOT } from './config';
import { type BotPlan, BotPlanner, fallbackShot, turnSeed } from './planner';
import { isStable, movementInput } from './prediction';

export function isBotTurn(game: Game) {
	const mode = game.match.config.mode;
	return (
		mode?.type === 'bot' &&
		game.worms.some((w) => w.alive && w.id === game.match.activeWormId && w.team === mode.botTeam)
	);
}
export type BotPhase =
	| 'IDLE'
	| 'THINKING'
	| 'MOVING'
	| 'REEVALUATING'
	| 'AIMING'
	| 'CHARGING'
	| 'DONE';
const idle = (): GameInput => ({ moveDirection: 0, commands: [] });
/** Transient executor. Observes authoritative state and emits only ordinary input. */
export class BotController {
	phase: BotPhase = 'IDLE';
	private key = '';
	private phaseAt = 0;
	private movementStep = 0;
	private repositions = 0;
	private planner: BotPlanner | null = null;
	private plan: BotPlan | null = null;
	private seed = 0;
	reset() {
		this.phase = 'IDLE';
		this.key = '';
		this.planner = null;
		this.plan = null;
		this.repositions = 0;
	}
	consume(game: Game, world: GameWorld): GameInput {
		if (game.paused) return idle();
		const worm = game.worms.find((w) => w.id === game.match.activeWormId && w.alive);
		if (!worm || !isBotTurn(game) || game.match.turnState !== 'CONTROL') {
			this.reset();
			return idle();
		}
		const key = `${game.match.turnIndex}:${worm.id}`;
		if (key !== this.key) {
			this.reset();
			this.key = key;
			this.phaseAt = game.time;
			this.seed = turnSeed(world.seed, game.match.turnIndex, worm.id);
			this.phase = 'THINKING';
		}
		const remaining = game.match.turnTimeRemaining;
		if (this.phase === 'THINKING' || this.phase === 'REEVALUATING') {
			const delay = this.phase === 'THINKING' ? BOT.thinkingSeconds : BOT.regardSeconds;
			if (!isStable(worm) && remaining > BOT.fallbackBelow) return idle();
			if (!this.planner)
				this.planner = new BotPlanner(
					world,
					worm,
					game.worms,
					this.repositions < BOT.maxRepositions && remaining > BOT.stopMovementBelow
				);
			this.planner.step();
			// Planning and emergency decisions cannot bypass presentation time.
			if (game.time - this.phaseAt + 1e-9 < delay) return idle();
			if (
				!this.planner.complete &&
				remaining > BOT.stopMovementBelow &&
				game.time - this.phaseAt < BOT.maxPlanningSeconds
			)
				return idle();
			this.plan = this.planner.choose(
				this.seed + this.repositions,
				remaining > BOT.stopMovementBelow
			) ?? {
				movement: { direction: 0, seconds: 0 },
				shot: fallbackShot(worm, game.worms),
				positionScore: BOT.uselessScore,
			};
			this.planner = null;
			this.phaseAt = game.time;
			this.phase =
				this.plan.movement.direction && this.repositions < BOT.maxRepositions ? 'MOVING' : 'AIMING';
			this.movementStep = 0;
		}
		if (this.phase === 'MOVING' && this.plan) {
			const move = this.plan.movement;
			const elapsed = game.time - this.phaseAt;
			if (
				remaining < BOT.stopMovementBelow ||
				elapsed >= BOT.movementHorizon ||
				(elapsed >= move.seconds && this.movementStep > 1 && isStable(worm))
			) {
				this.repositions++;
				this.phase = 'REEVALUATING';
				this.phaseAt = game.time;
				this.plan = null;
				return idle();
			}
			const input = movementInput(move, this.movementStep++);
			return {
				moveDirection: input.moveDirection,
				commands: input.forwardJumpPressed
					? ['forwardJump']
					: input.highJumpPressed
						? input.backflipPressed
							? ['highJump', 'highJump']
							: ['highJump']
						: [],
			};
		}
		if (this.phase === 'AIMING' && this.plan) {
			const shot = this.plan.shot;
			if (!isStable(worm) && remaining > BOT.fallbackBelow) return idle();
			if (worm.facing !== shot.facing)
				return { moveDirection: shot.facing === 'left' ? -1 : 1, commands: [] };
			const difference = shot.angle - game.weapon.aimAngle;
			if (Math.abs(difference) > (WEAPON.aimSpeed * WORM.fixedStep) / 2 && remaining > 2)
				return { moveDirection: 0, aimDirection: difference > 0 ? 1 : -1, commands: [] };
			this.phase = 'CHARGING';
			return {
				moveDirection: 0,
				commands: [shot.weapon, `fuse${shot.fuse}` as Command, 'chargeStart'],
			};
		}
		if (this.phase === 'CHARGING' && this.plan) {
			if (!game.weapon.isCharging) {
				this.phase = 'AIMING';
				return idle();
			}
			if (game.weapon.charge + 1e-9 >= this.plan.shot.power || remaining < 0.15) {
				this.phase = 'DONE';
				return { moveDirection: 0, commands: ['fire'] };
			}
		}
		return idle();
	}
}
/** Kept outside Game: save/load and restart always create a fresh executor. */
const controllers = new WeakMap<Game, BotController>();
export function botController(game: Game) {
	let controller = controllers.get(game);
	if (!controller) {
		controller = new BotController();
		controllers.set(game, controller);
	}
	return controller;
}
