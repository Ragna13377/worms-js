import { clampCameraX } from '../../../entities/World/model/world';
import { WORM } from '../../../entities/Worm/model/config';
import type { Worm } from '../../../entities/Worm/model/worm';
import { followCamera, type GameInput, type ShotResult } from './simulation';

export function createCameraControl() {
	return { following: true, panDirection: 0, activeId: null as string | null };
}
export type CameraControl = ReturnType<typeof createCameraControl>;

export function panCamera(control: CameraControl, direction: number) {
	control.panDirection = direction;
	if (direction) control.following = false;
}

/** Manual inspection persists while idle; intentional movement and selection resume tracking. */
export function advanceCamera(
	control: CameraControl,
	x: number,
	active: Worm | null,
	input: GameInput,
	delta: number,
	worldWidth: number,
	viewportWidth: number
) {
	const nextActiveId = active?.id ?? null;
	const moving =
		input.moveDirection !== 0 ||
		input.commands.some((command) =>
			['moveLeft', 'moveRight', 'forwardJump', 'highJump'].includes(command)
		);
	if (nextActiveId !== control.activeId || moving || input.commands.includes('cycle')) {
		control.following = true;
		control.panDirection = 0;
	}
	control.activeId = nextActiveId;
	const dt = Math.min(delta, WORM.maxAccumulatedTime);
	const next =
		control.following && active
			? followCamera(x, active.position.x, dt)
			: x + control.panDirection * 430 * dt;
	return clampCameraX(next, worldWidth, viewportWidth);
}

export const RESULT_HOLD_SECONDS = 2.5;
export function createShotCamera() {
	return {
		resultId: null as number | null,
		until: 0,
		target: null as ShotResult['position'] | null,
	};
}
/** A fresh shot interrupts the hold; each resolution is consumed once, even without an explosion. */
export function shotCameraTarget(
	control: ReturnType<typeof createShotCamera>,
	shot: { id: number; position: ShotResult['position'] } | undefined,
	result: ShotResult | null,
	time: number
) {
	if (result && result.id !== control.resultId) {
		control.resultId = result.id;
		control.target = { ...result.position };
		control.until = result.time + RESULT_HOLD_SECONDS;
	}
	if (shot) {
		control.target = null;
		return shot.position;
	}
	return time < control.until ? control.target : null;
}
