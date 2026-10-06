import { clampCameraX } from '../../../entities/World/model/world';
import { WORM } from '../../../entities/Worm/model/config';
import type { HealthFeedback } from '../../../entities/Worm/model/healthFeedback';
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
		deathEffectId: 0,
		releasedSubmergedId: null as number | null,
		until: 0,
		affectedWormIds: new Set<string>(),
		target: null as ShotResult['position'] | null,
	};
}
/** A fresh shot interrupts the hold; each resolution is consumed once, even without an explosion. */
export function shotCameraTarget(
	control: ReturnType<typeof createShotCamera>,
	shot:
		| {
				id: number;
				position: ShotResult['position'];
				previousPosition?: ShotResult['position'];
				state?: string;
		  }
		| undefined,
	result: ShotResult | null,
	time: number,
	effects: { id: number; source: string; position: ShotResult['position'] }[] = [],
	view?: { bottom: number; alpha: number },
	feedback?: { worms: Worm[]; health: Map<string, HealthFeedback> }
) {
	if (result && result.id !== control.resultId) {
		control.resultId = result.id;
		control.affectedWormIds.clear();
		if (!result.submerged && feedback)
			for (const worm of feedback.worms) {
				const hp = feedback.health.get(worm.id);
				if (
					hp &&
					(worm.hp < hp.actual || hp.notices.some((n) => n.age < 0.1)) &&
					Math.hypot(worm.position.x - result.position.x, worm.position.y - result.position.y) < 160
				)
					control.affectedWormIds.add(worm.id);
			}
		control.target = result.submerged ? null : { ...result.position };
		control.until = result.time + (result.submerged ? 0 : RESULT_HOLD_SECONDS);
	}
	if (shot) {
		control.affectedWormIds.clear();
		control.target = null;
		if (shot.state === 'submerged') {
			const previousY = shot.previousPosition?.y ?? shot.position.y;
			const visibleY = previousY + (shot.position.y - previousY) * (view?.alpha ?? 1);
			if (view && visibleY + 12 < view.bottom) control.releasedSubmergedId = shot.id;
			if (control.releasedSubmergedId === shot.id) return null;
		}
		return shot.position;
	}
	// Keep an ensuing death blast visible when it completes the animation near the held impact.
	for (const effect of effects)
		if (effect.source === 'death' && effect.id > control.deathEffectId) {
			control.deathEffectId = effect.id;
			if (
				control.target &&
				time < control.until &&
				Math.hypot(effect.position.x - control.target.x, effect.position.y - control.target.y) < 120
			) {
				control.target = { ...effect.position };
				control.until = time + RESULT_HOLD_SECONDS;
			}
		}
	if (control.target && feedback) {
		for (const worm of feedback.worms) {
			const hp = feedback.health.get(worm.id);
			if (!hp) continue;
			if (
				time < control.until &&
				worm.hp < hp.actual &&
				Math.hypot(worm.position.x - control.target.x, worm.position.y - control.target.y) < 160
			)
				control.affectedWormIds.add(worm.id);
			if (
				control.affectedWormIds.has(worm.id) &&
				(worm.hp < hp.actual || hp.displayed !== hp.actual || hp.notices.length)
			)
				control.until = Math.max(control.until, time + 0.2);
		}
	}
	if (time >= control.until) {
		control.target = null;
		control.affectedWormIds.clear();
	}
	return control.target;
}
