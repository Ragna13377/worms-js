import { blastDamage, blastStrength } from '../../Explosion/model/explosion';
import { WEAPON } from '../../Weapon/model/config';
import type { Worm } from '../../Worm/model/worm';
import { BOT } from './config';
import type { ShotPrediction } from './prediction';

export function scoreShot(prediction: ShotPrediction, worms: Worm[], shooter: Worm) {
	if (prediction.outcome !== 'explosion') return BOT.uselessScore;
	let score = 0;
	for (const worm of worms) {
		if (!worm.alive) continue;
		const distance = Math.hypot(
			worm.position.x - prediction.position.x,
			worm.position.y - prediction.position.y
		);
		const strength = blastStrength(
			Math.max(0, distance - worm.collisionRadius),
			WEAPON.blast.radius
		);
		const damage =
			strength > 0
				? Math.max(1, blastDamage(distance, WEAPON.blast.radius, WEAPON.blast.maxDamage))
				: 0;
		const kill = damage >= worm.hp;
		const effective = Math.min(worm.hp, damage);
		if (worm.team !== shooter.team) score += effective + (kill ? BOT.enemyKillBonus : 0);
		else if (worm.id === shooter.id)
			score -= effective * BOT.selfWeight + (kill ? BOT.selfKillPenalty : 0);
		else score -= effective * BOT.friendlyWeight + (kill ? BOT.friendlyKillPenalty : 0);
	}
	return score || BOT.uselessScore;
}
/** Penalize close enemy blast exposure; distance is never a positive objective. */
export function selfExposure(worm: Worm, worms: Worm[]) {
	return (
		worms
			.filter((w) => w.alive && w.team !== worm.team)
			.reduce(
				(sum, enemy) =>
					sum +
					blastDamage(
						Math.hypot(worm.position.x - enemy.position.x, worm.position.y - enemy.position.y),
						WEAPON.blast.radius * 2,
						WEAPON.blast.maxDamage
					),
				0
			) * BOT.exposureWeight
	);
}
