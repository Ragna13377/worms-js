import {
	advanceExplosionEffects,
	createExplosionState,
	resolveExplosions,
} from '../../../entities/Explosion/model/explosion';
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
} from '../../../entities/Weapon/model/weapon';
import type { GameWorld } from '../../../entities/World/model/world';
import { WORM } from '../../../entities/Worm/model/config';
import { NO_INPUT, stepWorm, type WormInput } from '../../../entities/Worm/model/physics';
import { spawnWorms, type TeamCounts } from '../../../entities/Worm/model/spawn';

export type ShotResult = {
	id: number;
	position: { x: number; y: number };
	time: number;
	submerged?: boolean;
};

export type Command =
	| 'forwardJump'
	| 'highJump'
	| 'cycle'
	| 'moveLeft'
	| 'moveRight'
	| WeaponCommand;
export type GameInput = {
	moveDirection: -1 | 0 | 1;
	aimDirection?: -1 | 0 | 1;
	commands: Command[];
};
export function createGame(world: GameWorld, counts?: TeamCounts) {
	const spawn = spawnWorms(world, counts);
	return {
		...spawn,
		debugActiveWormId: spawn.worms[0]?.id ?? null,
		time: 0,
		accumulator: 0,
		pendingCommands: [] as Command[],
		weapon: createWeaponState(),
		projectiles: [] as Projectile[],
		lastShotResult: null as ShotResult | null,
		explosions: createExplosionState(),
		nextProjectileId: 1,
		turnMarker: true,
	};
}
export type Game = ReturnType<typeof createGame>;
export function activeWorm(game: Game) {
	return game.worms.find((worm) => worm.id === game.debugActiveWormId && worm.alive) ?? null;
}
export function cycleWorm(game: Game) {
	if (game.weapon.isCharging) return;
	const living = game.worms.filter((worm) => worm.alive);
	const index = living.findIndex((worm) => worm.id === game.debugActiveWormId);
	game.debugActiveWormId = living[(index + 1) % living.length]?.id ?? null;
	game.turnMarker = true;
}
/** Browser cancellation drops stale edges even if no fixed step consumed them yet. */
export function cancelGameInput(game: Game) {
	game.pendingCommands.length = 0;
	game.pendingCommands.push('cancelCharge');
}
/** Commands -> aim/charge/spawn -> projectiles -> FIFO blasts -> worms -> death chains -> time.
 * Edge commands survive render frames without a fixed step and are consumed only once. */
export function advanceGame(game: Game, world: GameWorld, input: GameInput, elapsed: number) {
	game.pendingCommands.push(...input.commands);
	game.accumulator = Math.min(
		WORM.maxAccumulatedTime,
		game.accumulator + Math.max(0, Number.isFinite(elapsed) ? elapsed : 0)
	);
	let steps = 0;
	while (game.accumulator + 1e-10 >= WORM.fixedStep) {
		if (!activeWorm(game)) {
			cancelCharge(game.weapon);
			cycleWorm(game);
		}
		const intentions: WormInput = { ...NO_INPUT, moveDirection: input.moveDirection };
		updateAim(game.weapon, input.aimDirection ?? 0, WORM.fixedStep);
		for (const command of game.pendingCommands) {
			const shooter = activeWorm(game);
			if (command === 'aimUp' || command === 'aimDown') {
				if (!input.aimDirection)
					updateAim(game.weapon, command === 'aimUp' ? 1 : -1, WORM.fixedStep);
			} else if (command === 'cancelCharge') cancelCharge(game.weapon);
			else if (command === 'chargeStart') {
				if (shooter && !game.projectiles.length && !game.weapon.isCharging) {
					game.weapon.isCharging = true;
					game.weapon.charge = 0;
					game.weapon.shooterId = shooter.id;
				}
			} else if (command === 'fire') {
				if (
					game.weapon.isCharging &&
					shooter?.id === game.weapon.shooterId &&
					!game.projectiles.length
				)
					game.projectiles.push(launchProjectile(game.nextProjectileId++, shooter, game.weapon));
				cancelCharge(game.weapon);
			} else if (command === 'bazooka' || command === 'grenade') {
				cancelCharge(game.weapon);
				game.weapon.selectedWeapon = command;
			} else if (command.startsWith('fuse')) game.weapon.grenadeFuse = Number(command.slice(4));
			else if (command === 'cycle') {
				cycleWorm(game);
				intentions.forwardJumpPressed = intentions.highJumpPressed = false;
				intentions.backflipPressed = false;
			} else if (command === 'forwardJump') intentions.forwardJumpPressed = true;
			else if (command === 'highJump') {
				intentions.backflipPressed = intentions.highJumpPressed;
				intentions.highJumpPressed = true;
			} else if (!input.moveDirection) intentions.moveDirection = command === 'moveLeft' ? -1 : 1;
		}
		if (intentions.moveDirection || intentions.forwardJumpPressed || intentions.highJumpPressed)
			game.turnMarker = false;
		game.pendingCommands.length = 0;
		const chargingThisStep = game.weapon.isCharging;
		if (chargingThisStep) {
			game.weapon.charge = Math.min(1, game.weapon.charge + WORM.fixedStep / WEAPON.chargeDuration);
			if (game.weapon.charge >= 1 - 1e-9) {
				const shooter = activeWorm(game);
				if (shooter?.id === game.weapon.shooterId && !game.projectiles.length)
					game.projectiles.push(launchProjectile(game.nextProjectileId++, shooter, game.weapon));
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
				worm.id === game.debugActiveWormId && !chargingThisStep ? intentions : NO_INPUT,
				WORM.fixedStep,
				game.time
			);
		resolveExplosions(game.explosions, world, game.worms);
		if (!activeWorm(game)) {
			cancelCharge(game.weapon);
			cycleWorm(game);
		}
		game.time += WORM.fixedStep;
		game.accumulator = Math.max(0, game.accumulator - WORM.fixedStep);
		steps++;
	}
	return steps;
}
export function followCamera(current: number, target: number, elapsed: number) {
	return current + (target - current) * (1 - Math.exp(-WORM.cameraResponse * Math.max(0, elapsed)));
}
