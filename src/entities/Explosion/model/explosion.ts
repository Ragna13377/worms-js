import { WEAPON } from '../../Weapon/model/config';
import type { GameWorld } from '../../World/model/world';
import { WORM } from '../../Worm/model/config';
import { damageWorm } from '../../Worm/model/damage';
import type { Worm } from '../../Worm/model/worm';

export type Point = { x: number; y: number };
export type Explosion = {
	position: Point;
	radius: number;
	terrainRadius: number;
	maxDamage: number;
	knockback: number;
	source: 'weapon' | 'death';
};
export type ExplosionEffect = Explosion & { id: number; age: number };
export function createExplosionState() {
	return {
		queue: [] as Explosion[],
		effects: [] as ExplosionEffect[],
		deathEmitted: new Set<string>(),
		nextEffectId: 1,
	};
}
export type ExplosionState = ReturnType<typeof createExplosionState>;
/** Full inner 20%; smoothstep to exactly zero at the collider-adjusted edge. */
export function blastStrength(distance: number, radius: number) {
	const t = Math.max(0, Math.min(1, (distance / radius - 0.2) / 0.8));
	return 1 - t * t * (3 - 2 * t);
}
export function queueDeaths(state: ExplosionState, worms: Worm[]) {
	for (const worm of worms) {
		if (worm.alive || worm.deathPending || state.deathEmitted.has(worm.id)) continue;
		if (worm.animationState !== 'drown' && worm.stateTime + 1e-9 < WORM.deathDuration) continue;
		state.deathEmitted.add(worm.id);
		if (worm.animationState !== 'drown')
			state.queue.push({ position: { ...worm.position }, ...WEAPON.death, source: 'death' });
	}
}
/** Shared path for weapons and death chains: mask -> damage -> impulse -> FX. */
export function explode(state: ExplosionState, world: GameWorld, worms: Worm[], blast: Explosion) {
	world.terrain.destroyCircle(blast.position.x, blast.position.y, blast.terrainRadius);
	const affected = worms
		.filter((w) => w.alive || w.deathPending)
		.map((worm) => {
			const dx = worm.position.x - blast.position.x,
				dy = worm.position.y - blast.position.y;
			const distance = Math.hypot(dx, dy);
			return {
				worm,
				dx,
				dy,
				distance,
				strength: blastStrength(Math.max(0, distance - worm.collisionRadius), blast.radius),
			};
		});
	for (const { worm, strength, distance } of affected)
		damageWorm(
			worm,
			strength > 0 ? Math.max(1, blastDamage(distance, blast.radius, blast.maxDamage)) : 0
		);
	for (const { worm, dx, dy, distance, strength } of affected) {
		if ((!worm.alive && !worm.deathPending) || strength <= 0) continue;
		// Clear grounded before Stage 2 advances, preserving airborne horizontal momentum.
		worm.grounded = false;
		worm.impulsePending = true;
		worm.knockedBack = true;
		worm.blastFallProtected = true;
		worm.jumpType = null;
		worm.highJumpStartedAt = -Infinity;
		worm.velocity.x += (distance > 1e-6 ? dx / distance : 0) * blast.knockback * strength;
		worm.velocity.y += (distance > 1e-6 ? dy / distance : 1) * blast.knockback * strength;
	}
	state.effects.push({
		...blast,
		position: { ...blast.position },
		id: state.nextEffectId++,
		age: 0,
	});
}
export function resolveExplosions(state: ExplosionState, world: GameWorld, worms: Worm[]) {
	queueDeaths(state, worms);
	// At most one death per worm plus the already queued producers; no recursion.
	const budget = state.queue.length + worms.length;
	for (let i = 0; i < budget && state.queue.length; i++) {
		const blast = state.queue.shift();
		if (blast) explode(state, world, worms, blast);
		queueDeaths(state, worms);
	}
	if (state.queue.length) throw new Error('Explosion queue exceeded finite death-chain budget');
}
export function advanceExplosionEffects(state: ExplosionState, dt: number) {
	for (const effect of state.effects) effect.age += dt;
	state.effects = state.effects.filter((effect) => effect.age < WEAPON.fxDuration);
}

/** Center-distance linear approximation; no full-damage plateau around a worm collider. */
export function blastDamage(distance: number, radius: number, maximum: number) {
	return Math.floor(maximum * Math.max(0, 1 - distance / radius));
}
