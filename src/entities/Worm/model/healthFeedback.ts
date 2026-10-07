import type { Worm } from './worm';

export function healthFeedbackReady(worm: Worm) {
	return (
		(!worm.alive && !worm.deathPending) ||
		(worm.grounded &&
			!worm.sliding &&
			worm.animationState === 'idle' &&
			Math.hypot(worm.velocity.x, worm.velocity.y) < 0.01)
	);
}

export const HEALTH_RECOVERY_DELAY = 0.45;
export const HEALTH_COUNTER_DURATION = 2.3;
export const DAMAGE_NOTICE_DURATION = 2.5;
export const HEALTH_COUNT_INTERVAL = 1 / 30;
export const HEALTH_COUNT_SLOWING = 0.02;
export function createHealthFeedback(hp: number) {
	return {
		actual: hp,
		displayed: hp,
		from: hp,
		counterAge: HEALTH_COUNTER_DURATION,
		nextId: 0,
		readyAge: 0,
		countAccumulator: 0,
		notices: [] as { id: number; amount: number; age: number; lifetime: number }[],
	};
}
export type HealthFeedback = ReturnType<typeof createHealthFeedback>;
/** Presentation only: authoritative HP is never delayed or changed. */
export function advanceHealthFeedback(state: HealthFeedback, hp: number, dt: number, ready = true) {
	const elapsed = Math.max(0, Number.isFinite(dt) ? dt : 0);

	for (const notice of state.notices) notice.age += elapsed;
	state.notices = state.notices.filter((n) => n.age < n.lifetime);
	if (!ready) {
		state.readyAge = 0;
		return state;
	}
	if (hp < state.actual) {
		state.readyAge += elapsed;
		if (state.readyAge + 1e-9 < HEALTH_RECOVERY_DELAY) return state;
	}
	state.counterAge += elapsed;
	if (hp !== state.actual) {
		if (hp < state.actual) {
			state.notices.push({
				id: state.nextId++,
				amount: state.actual - hp,
				age: 0,
				lifetime: Math.max(
					DAMAGE_NOTICE_DURATION,
					(state.displayed - hp) * (HEALTH_COUNT_INTERVAL + HEALTH_COUNT_SLOWING) + 0.25
				),
			});
			if (state.notices.length > 4) state.notices.shift();
			state.from = state.displayed;
			state.counterAge = 0;
			state.countAccumulator = 0;
		} else {
			state.from = hp;
			state.counterAge = HEALTH_COUNTER_DURATION;
			state.displayed = hp;
		}
		state.actual = hp;
		state.readyAge = 0;
	}
	if (state.counterAge > 0 && state.displayed > state.actual) {
		state.countAccumulator += elapsed;
		while (state.displayed > state.actual) {
			const progress = (state.from - state.displayed) / Math.max(1, state.from - state.actual);
			const interval = HEALTH_COUNT_INTERVAL + HEALTH_COUNT_SLOWING * progress;
			if (state.countAccumulator + 1e-9 < interval) break;
			state.countAccumulator -= interval;
			state.displayed--;
		}
	}
	return state;
}
