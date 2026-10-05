import { clampCameraX } from '../../../entities/World/model/world';
import { WORM } from '../../../entities/Worm/model/config';
import type { Worm } from '../../../entities/Worm/model/worm';
import { followCamera, type GameInput } from './simulation';

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
	const moving = input.moveDirection !== 0 || input.commands.some((command) => command !== 'cycle');
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
