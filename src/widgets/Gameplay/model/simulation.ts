import { botController, isBotTurn } from '../../../entities/Bot/model/controller';
import {
	advanceExplosionEffects,
	createExplosionState,
	resolveExplosions,
} from '../../../entities/Explosion/model/explosion';
import { createMatch, type MatchConfig } from '../../../entities/Match/model/match';
import {
	launchProjectile,
	type Projectile,
	stepProjectile,
} from '../../../entities/Projectile/model/projectile';
import { WEAPON } from '../../../entities/Weapon/model/config';
import {
	cancelCharge,
	createWeaponState,
	updateAim,
	type WeaponCommand,
	type WeaponType,
} from '../../../entities/Weapon/model/weapon';
import { type GameWorld, windForTurn } from '../../../entities/World/model/world';
import { WORM } from '../../../entities/Worm/model/config';
import {
	advanceHealthFeedback,
	createHealthFeedback,
	healthFeedbackReady,
} from '../../../entities/Worm/model/healthFeedback';
import { NO_INPUT, stepWorm, type WormInput } from '../../../entities/Worm/model/physics';
import { spawnWorms } from '../../../entities/Worm/model/spawn';
import { killWorm } from '../../../entities/Worm/model/worm';
import {
	advanceMatchClock,
	advanceMatchResolution,
	canControlWorm,
	canPrepareTurn,
	canStartCharge,
	leaveControl,
	startPreparedTurn,
} from './turns';

export type ShotResult = {
	id: number;
	position: { x: number; y: number };
	time: number;
	submerged?: boolean;
};

export type Command =
	| 'forwardJump'
	| 'highJump'
	| 'moveLeft'
	| 'moveRight'
	| 'switchWeapon'
	| WeaponCommand;
export type GameInput = {
	moveDirection: -1 | 0 | 1;
	aimDirection?: -1 | 0 | 1;
	commands: Command[];
};
export function createGame(world: GameWorld, counts?: MatchConfig) {
	const spawn = spawnWorms(world, counts ? { RED: counts.RED, BLUE: counts.BLUE } : undefined);
	return {
		...spawn,
		paused: false,
		healthFeedback: new Map(spawn.worms.map((worm) => [worm.id, createHealthFeedback(worm.hp)])),
		match: createMatch(spawn.worms, counts),
		inputNeedsNeutral: true,
		time: 0,
		accumulator: 0,
		pendingCommands: [] as Command[],
		weapon: createWeaponState(),
		teamWeapons: { RED: 'bazooka' as WeaponType, BLUE: 'bazooka' as WeaponType },
		fuseNotice: null as { fuse: number; until: number } | null,
		projectiles: [] as Projectile[],
		lastShotResult: null as ShotResult | null,
		explosions: createExplosionState(),
		nextProjectileId: 1,
		turnMarker: true,
	};
}
export type Game = ReturnType<typeof createGame>;
export function activeWorm(game: Game) {
	return game.worms.find((worm) => worm.id === game.match.activeWormId && worm.alive) ?? null;
}
/** Browser cancellation drops stale edges even if no fixed step consumed them yet. */
export function cancelGameInput(game: Game) {
	game.pendingCommands.length = 0;
	game.pendingCommands.push('cancelCharge');
}
/** Commands -> aim/charge/spawn -> projectiles -> FIFO blasts -> worms -> death chains -> time.
 * Edge commands survive render frames without a fixed step and are consumed only once. */
export function advanceGame(game: Game, world: GameWorld, input: GameInput, elapsed: number) {
	if (game.paused) return 0;
	const automated = isBotTurn(game);
	if (automated) input = { moveDirection: 0, commands: [] };
	if (game.match.turnState === 'MATCH_END') {
		const dt = Math.min(
			WORM.maxAccumulatedTime,
			Math.max(0, Number.isFinite(elapsed) ? elapsed : 0)
		);
		game.time += dt;
		advanceExplosionEffects(game.explosions, dt);
		for (const worm of game.worms) {
			if (!worm.alive) stepWorm(worm, world, NO_INPUT, dt, game.time);
			else worm.stateTime += dt;
		}
		return 0;
	}
	if (
		canPrepareTurn(game) &&
		((!game.inputNeedsNeutral && (input.moveDirection || input.aimDirection)) ||
			input.commands.some((c) => c !== 'cancelCharge') ||
			game.pendingCommands.some((c) => c !== 'cancelCharge'))
	) {
		startPreparedTurn(game, true);
	}
	if (canControlWorm(game)) game.pendingCommands.push(...input.commands);
	else game.pendingCommands.length = 0;
	game.accumulator = Math.min(
		WORM.maxAccumulatedTime,
		game.accumulator + Math.max(0, Number.isFinite(elapsed) ? elapsed : 0)
	);
	let steps = 0;
	while (game.accumulator + 1e-10 >= WORM.fixedStep) {
		const wasControl = canControlWorm(game);
		const turnIndex = game.match.turnIndex;
		advanceMatchClock(game, WORM.fixedStep);
		if (game.match.turnIndex !== turnIndex)
			world.wind = windForTurn(world.seed, game.match.turnIndex);
		const controllable = wasControl && canControlWorm(game);
		const botInput = botController(game).consume(game, world);
		const stepInput = isBotTurn(game) ? botInput : input;
		if (isBotTurn(game)) game.pendingCommands = [...botInput.commands];
		if (!controllable) game.pendingCommands.length = 0;
		if (!stepInput.moveDirection && !stepInput.aimDirection) game.inputNeedsNeutral = false;
		const intentions: WormInput = {
			...NO_INPUT,
			moveDirection: controllable && !game.inputNeedsNeutral ? stepInput.moveDirection : 0,
		};
		if (controllable && !game.inputNeedsNeutral)
			updateAim(game.weapon, stepInput.aimDirection ?? 0, WORM.fixedStep);
		for (const command of [...game.pendingCommands]) {
			if (!canControlWorm(game)) break;
			const shooter = activeWorm(game);
			if (command === 'aimUp' || command === 'aimDown') {
				if (!stepInput.aimDirection)
					updateAim(game.weapon, command === 'aimUp' ? 1 : -1, WORM.fixedStep);
			} else if (command === 'cancelCharge') cancelCharge(game.weapon);
			else if (command === 'chargeStart') {
				if (shooter && canStartCharge(game)) {
					game.weapon.isCharging = true;
					game.weapon.charge = 0;
					game.weapon.shooterId = shooter.id;
				}
			} else if (command === 'fire') {
				if (
					game.weapon.isCharging &&
					shooter?.id === game.weapon.shooterId &&
					!game.projectiles.length
				) {
					game.projectiles.push(launchProjectile(game.nextProjectileId++, shooter, game.weapon));
					leaveControl(game, 'FIRING');
				}
				cancelCharge(game.weapon);
			} else if (command === 'bazooka' || command === 'grenade' || command === 'switchWeapon') {
				cancelCharge(game.weapon);
				const selected =
					command === 'switchWeapon'
						? game.weapon.selectedWeapon === 'bazooka'
							? 'grenade'
							: 'bazooka'
						: command;
				game.weapon.selectedWeapon = selected;
				if (shooter) game.teamWeapons[shooter.team] = selected;
				game.fuseNotice =
					selected === 'grenade' ? { fuse: game.weapon.grenadeFuse, until: game.time + 2 } : null;
			} else if (command.startsWith('fuse')) {
				game.weapon.grenadeFuse = Number(command.slice(4));
				if (game.weapon.selectedWeapon === 'grenade')
					game.fuseNotice = { fuse: game.weapon.grenadeFuse, until: game.time + 2 };
			} else if (command === 'forwardJump') intentions.forwardJumpPressed = true;
			else if (command === 'highJump') {
				intentions.backflipPressed = intentions.highJumpPressed;
				intentions.highJumpPressed = true;
			} else if (!stepInput.moveDirection)
				intentions.moveDirection = command === 'moveLeft' ? -1 : 1;
		}
		if (
			(controllable && !game.inputNeedsNeutral && stepInput.aimDirection) ||
			game.pendingCommands.some((c) => c === 'aimUp' || c === 'aimDown') ||
			intentions.moveDirection ||
			intentions.forwardJumpPressed ||
			intentions.highJumpPressed
		)
			game.turnMarker = false;
		game.pendingCommands.length = 0;
		const chargingThisStep = game.weapon.isCharging;
		if (chargingThisStep) {
			game.weapon.charge = Math.min(1, game.weapon.charge + WORM.fixedStep / WEAPON.chargeDuration);
			if (game.weapon.charge >= 1 - 1e-9) {
				const shooter = activeWorm(game);
				if (shooter?.id === game.weapon.shooterId && !game.projectiles.length) {
					game.projectiles.push(launchProjectile(game.nextProjectileId++, shooter, game.weapon));
					leaveControl(game, 'FIRING');
				}
				cancelCharge(game.weapon);
			}
		}
		advanceExplosionEffects(game.explosions, WORM.fixedStep);
		for (const p of game.projectiles) {
			stepProjectile(p, world, game.worms, WORM.fixedStep, game.explosions.queue);
			if (!p.alive)
				game.lastShotResult = {
					id: p.id,
					position: { ...p.position },
					time: game.time + WORM.fixedStep,
					submerged: p.state === 'submerged',
				};
		}
		game.projectiles = game.projectiles.filter((p) => p.alive);
		resolveExplosions(game.explosions, world, game.worms);
		for (const worm of game.worms)
			stepWorm(
				worm,
				world,
				canControlWorm(game) && worm.id === game.match.activeWormId && !chargingThisStep
					? intentions
					: NO_INPUT,
				WORM.fixedStep,
				game.time
			);
		resolveExplosions(game.explosions, world, game.worms);
		for (const worm of game.worms) {
			const feedback = game.healthFeedback.get(worm.id);
			if (feedback)
				advanceHealthFeedback(feedback, worm.hp, WORM.fixedStep, healthFeedbackReady(worm));
			if (
				worm.deathPending &&
				healthFeedbackReady(worm) &&
				(!feedback || (feedback.actual === 0 && feedback.displayed === 0))
			)
				killWorm(worm, 'death');
		}
		advanceMatchResolution(game, WORM.fixedStep);
		game.time += WORM.fixedStep;
		game.accumulator = Math.max(0, game.accumulator - WORM.fixedStep);
		steps++;
	}
	return steps;
}
export function followCamera(current: number, target: number, elapsed: number) {
	return current + (target - current) * (1 - Math.exp(-WORM.cameraResponse * Math.max(0, elapsed)));
}
