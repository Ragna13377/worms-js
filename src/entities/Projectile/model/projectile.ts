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
	restingOnWormId?: string;
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
function submerge(p: Projectile) {
	p.state = 'submerged';
	p.restingOnWormId = undefined;
	p.velocity.x *= p.type === 'grenade' ? 0 : WEAPON.submergedHorizontalRetention;
	p.velocity.y *= WEAPON.submergedVerticalRetention;
	if (p.type === 'grenade')
		p.velocity.y = Math.min(-WEAPON.grenade.submergedMinSpeed, p.velocity.y);
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
		submerge(p);
		return;
	}
	if (p.state === 'resting') {
		const supportWorm = worms.find((w) => w.id === p.restingOnWormId && w.alive);
		const supported = supportWorm
			? Math.hypot(p.position.x - supportWorm.position.x, p.position.y - supportWorm.position.y) <=
				p.radius + supportWorm.collisionRadius + WEAPON.restProbe + WEAPON.collisionSkin
			: !p.restingOnWormId &&
				world.terrain.collideCircle(p.position.x, p.position.y - WEAPON.restProbe, p.radius);
		if (!supported) {
			p.state = 'flying';
			p.restingOnWormId = undefined;
		}
	}
	if (p.state === 'flying') {
		p.velocity.y -= WEAPON[p.type].gravity * dt;
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
				if (oldY - p.radius > world.waterLevel && waterSkip(p, world.waterLevel)) continue;
				submerge(p);
				return;
			}
			const contact = world.terrain.collideCircle(p.position.x, p.position.y, p.radius);
			if (contact) {
				if (p.type === 'bazooka') {
					detonate(p, explosions);
					break;
				}
				bounceGrenade(p, contact, dt / steps);
			}
			const owner = worms.find((w) => w.id === p.ownerWormId);
			if (
				!owner ||
				Math.hypot(p.position.x - owner.position.x, p.position.y - owner.position.y) >
					owner.collisionRadius + p.radius + WEAPON.launchGap
			)
				p.ownerCleared = true;
			for (const worm of worms) {
				if (!worm.alive || (worm.id === p.ownerWormId && !p.ownerCleared)) continue;
				const dx = p.position.x - worm.position.x,
					dy = p.position.y - worm.position.y;
				const distance = Math.hypot(dx, dy),
					radius = worm.collisionRadius + p.radius;
				if (distance > radius) continue;
				if (p.type === 'bazooka') {
					detonate(p, explosions);
					break;
				}
				const speed = Math.hypot(p.velocity.x, p.velocity.y);
				const normalX = distance > 1e-8 ? dx / distance : speed > 1e-8 ? -p.velocity.x / speed : 0;
				const normalY = distance > 1e-8 ? dy / distance : speed > 1e-8 ? -p.velocity.y / speed : 1;
				bounceGrenade(p, { normalX, normalY, penetration: radius - distance }, dt / steps, worm.id);
			}
		}
	}
	if (p.alive && p.type === 'grenade' && p.age + WEAPON.fuseEpsilon >= p.fuse)
		detonate(p, explosions);
}

/** One impact reflection; low-speed ground contact uses time-based friction instead of micro-bouncing. */
function bounceGrenade(
	p: Projectile,
	contact: { normalX: number; normalY: number; penetration: number },
	dt: number,
	wormId?: string
) {
	const { normalX: nx, normalY: ny } = contact;
	p.position.x += nx * (contact.penetration + WEAPON.collisionSkin);
	p.position.y += ny * (contact.penetration + WEAPON.collisionSkin);
	const into = p.velocity.x * nx + p.velocity.y * ny;
	if (into >= 0) return;
	const tx = p.velocity.x - into * nx,
		ty = p.velocity.y - into * ny;
	const grounded = ny > WEAPON.restNormalMin;
	const gentle = grounded && -into < WEAPON.grenade.settleSpeed;
	const retention = gentle
		? WEAPON.grenade.groundRetentionPerSecond ** dt
		: WEAPON.grenade.tangentRetention;
	const rebound = gentle ? 0 : -into * WEAPON.grenade.restitution;
	p.velocity.x = tx * retention + rebound * nx;
	p.velocity.y = ty * retention + rebound * ny;
	if (grounded && Math.hypot(p.velocity.x, p.velocity.y) < WEAPON.grenade.settleSpeed) {
		p.velocity.x = p.velocity.y = 0;
		p.state = 'resting';
		p.restingOnWormId = wormId;
	}
}
