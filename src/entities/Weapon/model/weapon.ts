import type { Worm } from '../../Worm/model/worm';
import { WEAPON } from './config';

export type WeaponType = 'bazooka' | 'grenade';
export type WeaponCommand =
	| 'aimUp'
	| 'aimDown'
	| 'chargeStart'
	| 'fire'
	| 'cancelCharge'
	| 'bazooka'
	| 'grenade'
	| 'fuse1'
	| 'fuse2'
	| 'fuse3'
	| 'fuse4'
	| 'fuse5';
export function createWeaponState() {
	return {
		selectedWeapon: 'bazooka' as WeaponType,
		aimAngle: WEAPON.defaultAim as number,
		charge: 0,
		isCharging: false,
		grenadeFuse: 3,
		shooterId: null as string | null,
	};
}
export type WeaponState = ReturnType<typeof createWeaponState>;
export function aimDirection(worm: Worm, angle: number) {
	return { x: (worm.facing === 'right' ? 1 : -1) * Math.cos(angle), y: Math.sin(angle) };
}
export function cancelCharge(state: WeaponState) {
	state.charge = 0;
	state.isCharging = false;
	state.shooterId = null;
}
export function updateAim(state: WeaponState, direction: number, dt: number) {
	state.aimAngle = Math.max(
		WEAPON.aimMin,
		Math.min(WEAPON.aimMax, state.aimAngle + direction * WEAPON.aimSpeed * dt)
	);
}
