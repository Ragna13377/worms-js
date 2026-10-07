import type { Explosion } from '../../Explosion/model/explosion';
import { launchProjectile, stepProjectile } from '../../Projectile/model/projectile';
import { createWeaponState, type WeaponType } from '../../Weapon/model/weapon';
import type { GameWorld } from '../../World/model/world';
import { WORM } from '../../Worm/model/config';
import { NO_INPUT, stepWorm } from '../../Worm/model/physics';
import type { Facing, Worm } from '../../Worm/model/worm';
import { BOT } from './config';

export type Shot = {
	weapon: WeaponType;
	facing: Facing;
	angle: number;
	power: number;
	fuse: number;
};
export type ShotPrediction = {
	outcome: 'explosion' | 'water' | 'miss';
	position: { x: number; y: number };
	flightTime: number;
};
export function cloneWorm(worm: Worm): Worm {
	return {
		...worm,
		position: { ...worm.position },
		previousPosition: { ...worm.previousPosition },
		velocity: { ...worm.velocity },
	};
}
/** Runtime integrator, private projectile/queue/worms, read-only live collision mask. */
export function simulateCandidateShot(
	world: GameWorld,
	worms: Worm[],
	shooter: Worm,
	shot: Shot
): ShotPrediction {
	const weapon = {
		...createWeaponState(),
		selectedWeapon: shot.weapon,
		aimAngle: shot.angle,
		charge: shot.power,
		grenadeFuse: shot.fuse,
	};
	const projectedShooter = cloneWorm(shooter);
	projectedShooter.facing = shot.facing;
	const projectedWorms = worms.map((w) => cloneWorm(w.id === shooter.id ? projectedShooter : w));
	const projectile = launchProjectile(0, projectedShooter, weapon);
	const queue: Explosion[] = [];
	for (let i = 0; i < Math.ceil(BOT.shotHorizon / WORM.fixedStep) && projectile.alive; i++) {
		stepProjectile(projectile, world, projectedWorms, WORM.fixedStep, queue);
		if (queue.length || projectile.state === 'submerged') break;
	}
	return {
		outcome: queue.length
			? 'explosion'
			: projectile.state === 'submerged' ||
					projectile.position.y - projectile.radius <= world.waterLevel
				? 'water'
				: 'miss',
		position: { ...projectile.position },
		flightTime: projectile.age,
	};
}
export type Movement = {
	direction: -1 | 0 | 1;
	seconds: number;
	jump?: 'forward' | 'high' | 'backflip';
};
/** One normal facing step followed by the same jump edges used during execution. */
export function movementInput(move: Movement, step: number) {
	return {
		...NO_INPUT,
		moveDirection: step * WORM.fixedStep < move.seconds ? move.direction : (0 as const),
		forwardJumpPressed: step === 1 && move.jump === 'forward',
		highJumpPressed: step === 1 && (move.jump === 'high' || move.jump === 'backflip'),
		backflipPressed: step === 1 && move.jump === 'backflip',
	};
}
export function isStable(worm: Worm) {
	return (
		worm.alive &&
		worm.grounded &&
		!worm.sliding &&
		!worm.impulsePending &&
		Math.hypot(worm.velocity.x, worm.velocity.y) < 0.01
	);
}
export function predictMovement(
	world: GameWorld,
	worm: Worm,
	move: Movement,
	worms: readonly Worm[] = []
) {
	const predicted = cloneWorm(worm);
	let step = 0;
	for (; step < Math.ceil(BOT.movementHorizon / WORM.fixedStep) && predicted.alive; step++) {
		stepWorm(
			predicted,
			world,
			movementInput(move, step),
			WORM.fixedStep,
			step * WORM.fixedStep,
			worms
		);
		if (step * WORM.fixedStep >= move.seconds && step > 1 && isStable(predicted)) break;
	}
	return isStable(predicted) ? { worm: predicted, seconds: (step + 1) * WORM.fixedStep } : null;
}
