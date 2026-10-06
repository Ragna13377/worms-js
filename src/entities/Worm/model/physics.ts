import type { GameWorld } from '../../World/model/world';
import { WORM } from './config';
import { damageWorm } from './damage';
import { restingY, supportAt } from './support';
import { fallDamage, killWorm, setAnimation, type Worm } from './worm';

export type WormInput = {
	moveDirection: -1 | 0 | 1;
	forwardJumpPressed: boolean;
	highJumpPressed: boolean;
	backflipPressed?: boolean;
};

export const NO_INPUT: WormInput = {
	moveDirection: 0,
	forwardJumpPressed: false,
	highJumpPressed: false,
};

function jump(worm: Worm, input: WormInput, time: number) {
	const direction = worm.facing === 'right' ? 1 : -1;
	if (
		input.highJumpPressed &&
		worm.jumpType === 'high' &&
		!worm.grounded &&
		time - worm.highJumpStartedAt <= WORM.doubleTapWindow
	) {
		worm.jumpType = 'backflip';
		worm.jumpTime = 0;
		worm.velocity.x = -direction * WORM.backflipX;
		// Add the launch-energy difference, so delayed conversion does not add extra height.
		worm.velocity.y = Math.sqrt(
			Math.max(0, worm.velocity.y ** 2 + WORM.backflipY ** 2 - WORM.highJumpY ** 2)
		);
		setAnimation(worm, 'jump');
		return;
	}
	if (!worm.grounded || (!input.forwardJumpPressed && !input.highJumpPressed)) return;
	worm.knockedBack = false;
	worm.jumpType = input.backflipPressed ? 'backflip' : input.highJumpPressed ? 'high' : 'forward';
	worm.highJumpStartedAt = input.highJumpPressed ? time : -Infinity;
	worm.jumpTime = 0;
	worm.velocity.x = input.backflipPressed
		? -direction * WORM.backflipX
		: input.highJumpPressed
			? 0
			: direction * WORM.forwardJumpX;
	worm.velocity.y = input.backflipPressed
		? WORM.backflipY
		: input.highJumpPressed
			? WORM.highJumpY
			: WORM.forwardJumpY;
	worm.grounded = false;
	setAnimation(worm, 'jump');
}

function finishLanding(worm: Worm, impact: number) {
	const damage = worm.sliding ? 0 : fallDamage(impact);
	worm.sliding = false;
	worm.knockedBack = false;
	worm.grounded = true;
	worm.velocity.x = worm.velocity.y = 0;
	worm.jumpType = null;
	worm.highJumpStartedAt = -Infinity;
	damageWorm(worm, damage);
	if (worm.alive && !damage) setAnimation(worm, 'land');
}

/** Deterministic kinematic circle solver; no browser, React, or immutable-surface dependency. */
export function stepWorm(worm: Worm, world: GameWorld, input: WormInput, dt: number, time: number) {
	worm.previousPosition.x = worm.position.x;
	worm.previousPosition.y = worm.position.y;
	worm.stateTime += dt;
	worm.jumpTime += dt;
	if (!worm.alive) return;
	if (input.moveDirection) worm.facing = input.moveDirection < 0 ? 'left' : 'right';
	const radius = worm.collisionRadius;
	const support = supportAt(world.terrain, worm.position.x, worm.position.y, radius);
	const sliding =
		support !== null &&
		(Math.abs(support.slope) >= WORM.slideSlope ||
			(worm.sliding && Math.abs(support.slope) >= WORM.slideStopSlope) ||
			(!worm.grounded && worm.velocity.y < 0 && Math.abs(support.slope) >= WORM.landingSlideSlope));
	if (sliding && !worm.sliding) {
		damageWorm(worm, fallDamage(Math.max(0, -worm.velocity.y)));
		worm.sliding = true;
		worm.knockedBack = false;
		worm.jumpType = null;
	}
	const wasGrounded = worm.grounded;
	const impulsePending = worm.impulsePending;
	if (impulsePending) worm.impulsePending = false;
	const impact = Math.max(0, -worm.velocity.y);
	worm.grounded = Boolean(
		!impulsePending && support && !sliding && worm.velocity.y <= 0 && worm.jumpType === null
	);
	if (!wasGrounded && worm.grounded) finishLanding(worm, impact);
	if (!worm.alive) return;
	jump(worm, input, time);
	if (worm.grounded) {
		worm.velocity.x = input.moveDirection * WORM.walkSpeed;
		worm.velocity.y = 0;
		if (input.moveDirection) {
			const distance = worm.velocity.x * dt;
			const steps = Math.max(1, Math.ceil(Math.abs(distance) / WORM.maxMotionStep));
			for (let step = 0; step < steps; step++) {
				const dx = distance / steps;
				const x = worm.position.x + dx;
				const rise = Math.min(WORM.maxStep, Math.abs(dx) * Math.tan(WORM.maxWalkableSlope) + 0.5);
				const y = restingY(
					world.terrain,
					x,
					worm.position.y + rise,
					worm.position.y - WORM.snapDown,
					radius
				);
				if (y === null) {
					// An empty path is a ledge, an occupied path is a wall.
					if (!world.terrain.collideCircle(x, worm.position.y + rise, radius)) {
						worm.position.x = x;
						worm.grounded = false;
					} else worm.velocity.x = 0;
					break;
				}
				const nextSupport = supportAt(world.terrain, x, y, radius);
				if (
					y > worm.position.y + WORM.skin &&
					nextSupport &&
					Math.abs(nextSupport.slope) > WORM.maxWalkableSlope
				) {
					worm.velocity.x = 0;
					break;
				}
				worm.position.x = x;
				worm.position.y = y;
				if (nextSupport && Math.abs(nextSupport.slope) >= WORM.slideSlope) {
					worm.grounded = false;
					break;
				}
			}
		}
		const transient =
			(worm.animationState === 'land' && worm.stateTime < WORM.landDuration) ||
			(worm.animationState === 'hurt' && worm.stateTime < WORM.hurtDuration);
		if (!transient) setAnimation(worm, worm.velocity.x ? 'walk' : 'idle');
	}
	if (!worm.grounded) {
		// Walking off a lip is a drop, not a jump with persistent horizontal launch speed.
		if (wasGrounded && worm.jumpType === null && !sliding) worm.velocity.x = 0;
		if (sliding) worm.velocity.x -= Math.sign(support.slope) * WORM.slideAcceleration * dt;
		worm.velocity.y -= WORM.gravity * dt;
		const steps = Math.max(
			1,
			Math.ceil((Math.hypot(worm.velocity.x, worm.velocity.y) * dt) / WORM.maxMotionStep)
		);
		for (let step = 0; step < steps && !worm.grounded; step++) {
			worm.position.x += (worm.velocity.x * dt) / steps;
			worm.position.y += (worm.velocity.y * dt) / steps;
			const impact = Math.max(0, -worm.velocity.y);
			for (let pass = 0; pass < 6; pass++) {
				const contact = world.terrain.collideCircle(worm.position.x, worm.position.y, radius);
				if (!contact) break;
				worm.position.x += contact.normalX * (contact.penetration + WORM.skin);
				worm.position.y += contact.normalY * (contact.penetration + WORM.skin);
				const into = worm.velocity.x * contact.normalX + worm.velocity.y * contact.normalY;
				if (into < 0) {
					worm.velocity.x -= into * contact.normalX;
					worm.velocity.y -= into * contact.normalY;
				}
				const landed = supportAt(world.terrain, worm.position.x, worm.position.y, radius);
				if (
					landed &&
					Math.abs(landed.slope) >= WORM.landingSlideSlope &&
					impact > 0 &&
					!worm.sliding
				) {
					damageWorm(worm, fallDamage(impact));
					worm.sliding = true;
					worm.jumpType = null;
				}
				if (
					impact > 0 &&
					contact.normalY > Math.cos(WORM.slideSlope) &&
					landed &&
					Math.abs(landed.slope) < (worm.sliding ? WORM.slideStopSlope : WORM.landingSlideSlope)
				) {
					finishLanding(worm, impact);
					break;
				}
			}
		}
		if (!worm.grounded && worm.alive) setAnimation(worm, worm.velocity.y > 0 ? 'jump' : 'fall');
	}
	if (worm.position.y - radius <= world.waterLevel) killWorm(worm, 'drown');
	else if (
		worm.position.x - radius < world.terrain.left ||
		worm.position.x + radius > world.terrain.left + world.width ||
		worm.position.y + radius < world.terrain.bottom
	)
		killWorm(worm, 'death');
}
