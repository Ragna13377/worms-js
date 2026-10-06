import type { Explosion } from '../../Explosion/model/explosion';
import { WEAPON } from '../../Weapon/model/config';
import { aimDirection, type WeaponState, type WeaponType } from '../../Weapon/model/weapon';
import type { GameWorld } from '../../World/model/world';
import type { Worm } from '../../Worm/model/worm';

export type Projectile = {
	id: number;
	type: WeaponType;
	ownerWormId: string;
	position: { x: number; y: number };
	previousPosition: { x: number; y: number };
	velocity: { x: number; y: number };
	radius: number;
	age: number;
	fuse: number;
	alive: boolean;
	state: 'flying' | 'resting' | 'submerged';
	skipCount: number;
	submergedAge: number;
	ownerCleared: boolean;
};
export function launchProjectile(id: number, worm: Worm, weapon: WeaponState): Projectile {
	const tuning = WEAPON[weapon.selectedWeapon];
	const direction = aimDirection(worm, weapon.aimAngle);
	const offset = worm.collisionRadius + tuning.radius + WEAPON.launchGap;
	const position = {
		x: worm.position.x + direction.x * offset,
		y: worm.position.y + direction.y * offset,
	};
	const speed = tuning.minSpeed + (tuning.maxSpeed - tuning.minSpeed) * weapon.charge;
	return {
		id,
		type: weapon.selectedWeapon,
		ownerWormId: worm.id,
		position,
		previousPosition: { ...position },
		velocity: { x: direction.x * speed, y: direction.y * speed },
		radius: tuning.radius,
		age: 0,
		fuse: weapon.grenadeFuse,
		alive: true,
		state: 'flying',
		skipCount: 0,
		submergedAge: 0,
		ownerCleared: false,
	};
}
export function waterSkip(projectile: Projectile, waterLevel: number) {
	const { velocity: v } = projectile;
	const speed = Math.hypot(v.x, v.y);
	const valid =
		v.y < 0 &&
		speed >= WEAPON.skip.minSpeed &&
		Math.abs(v.y) / speed <= WEAPON.skip.maxVerticalRatio &&
		projectile.skipCount < WEAPON.skip.maxCount;
	if (!valid) return false;
	projectile.skipCount++;
	projectile.position.y = waterLevel + projectile.radius + WEAPON.waterSkin;
	v.x *= WEAPON.skip.horizontalRetention;
	v.y = Math.max(WEAPON.skip.minLift, -v.y * WEAPON.skip.verticalRetention);
	return true;
}
function detonate(projectile: Projectile, explosions: Explosion[]) {
	projectile.alive = false;
	explosions.push({ position: { ...projectile.position }, ...WEAPON.blast, source: 'weapon' });
}
/** <=0.75-unit sweeps sample the same live raster mask and living worm circles. */
export function stepProjectile(
	p: Projectile,
	world: GameWorld,
	worms: Worm[],
	dt: number,
	explosions: Explosion[]
) {
	if (!p.alive) return;
	p.previousPosition = { ...p.position };
	p.age += dt;
	if (
		p.age >= WEAPON.maxLifetime ||
		p.position.x < world.terrain.left - WEAPON.worldMargin ||
		p.position.x > world.terrain.left + world.width + WEAPON.worldMargin ||
		p.position.y > world.height / 2 + WEAPON.verticalWorldMargin ||
		(p.state !== 'submerged' && p.position.y < world.terrain.bottom)
	) {
		p.alive = false;
		return;
	}
	if (p.state === 'submerged') {
		p.submergedAge += dt;
		p.position.x += p.velocity.x * dt;
		p.position.y += p.velocity.y * dt;
		if (p.submergedAge >= WEAPON.skip.submergedLifetime) p.alive = false;
		return;
	}
	if (p.position.y - p.radius <= world.waterLevel) {
		p.alive = false;
		return;
	}
	if (
		p.state === 'resting' &&
		!world.terrain.collideCircle(p.position.x, p.position.y - WEAPON.restProbe, p.radius)
	)
		p.state = 'flying';
	if (p.state === 'flying') {
		p.velocity.y -= (p.type === 'bazooka' ? WEAPON.bazooka.gravity : WEAPON.gravity) * dt;
		if (p.type === 'bazooka') p.velocity.x += world.wind * WEAPON.windAcceleration * dt;
		const steps = Math.max(
			1,
			Math.ceil((Math.hypot(p.velocity.x, p.velocity.y) * dt) / WEAPON.maxMotionStep)
		);
		for (let i = 0; i < steps && p.alive && p.state === 'flying'; i++) {
			const oldY = p.position.y;
			p.position.x += (p.velocity.x * dt) / steps;
			p.position.y += (p.velocity.y * dt) / steps;
			// Water contact never produces an explosion, including at shore boundaries.
			if (p.position.y - p.radius <= world.waterLevel) {
				if (p.type === 'grenade') {
					p.alive = false;
					break;
				}
				if (oldY - p.radius > world.waterLevel && waterSkip(p, world.waterLevel)) continue;
				p.state = 'submerged';
				p.velocity.x *= WEAPON.submergedHorizontalRetention;
				break;
			}
			const contact = world.terrain.collideCircle(p.position.x, p.position.y, p.radius);
			if (contact) {
				if (p.type === 'bazooka') {
					detonate(p, explosions);
					break;
				}
				p.position.x += contact.normalX * (contact.penetration + WEAPON.collisionSkin);
				p.position.y += contact.normalY * (contact.penetration + WEAPON.collisionSkin);
				const into = p.velocity.x * contact.normalX + p.velocity.y * contact.normalY;
				if (into < 0) {
					const tx = p.velocity.x - into * contact.normalX,
						ty = p.velocity.y - into * contact.normalY;
					p.velocity.x =
						tx * WEAPON.grenade.tangentRetention -
						into * contact.normalX * WEAPON.grenade.restitution;
					p.velocity.y =
						ty * WEAPON.grenade.tangentRetention -
						into * contact.normalY * WEAPON.grenade.restitution;
					if (
						contact.normalY > WEAPON.restNormalMin &&
						Math.hypot(p.velocity.x, p.velocity.y) < WEAPON.grenade.settleSpeed
					) {
						p.velocity.x = p.velocity.y = 0;
						p.state = 'resting';
					}
				}
			}
			if (p.type === 'bazooka') {
				const owner = worms.find((w) => w.id === p.ownerWormId);
				if (
					!owner ||
					Math.hypot(p.position.x - owner.position.x, p.position.y - owner.position.y) >
						owner.collisionRadius + p.radius + WEAPON.launchGap
				)
					p.ownerCleared = true;
				const hit = worms.some(
					(w) =>
						w.alive &&
						(w.id !== p.ownerWormId || p.ownerCleared) &&
						Math.hypot(p.position.x - w.position.x, p.position.y - w.position.y) <=
							w.collisionRadius + p.radius
				);
				if (hit) detonate(p, explosions);
			}
		}
	}
	if (p.alive && p.type === 'grenade' && p.age + WEAPON.fuseEpsilon >= p.fuse)
		detonate(p, explosions);
}
