import type { Worm } from './worm';

export function healthFeedbackReady(worm: Worm) {
	return (
		!worm.alive ||
		(worm.grounded &&
			!worm.sliding &&
			worm.animationState === 'idle' &&
			Math.hypot(worm.velocity.x, worm.velocity.y) < 0.01)
	);
}

export const HEALTH_RECOVERY_DELAY = 0.45;
export const HEALTH_COUNTER_DURATION = 1.2;
export const DAMAGE_NOTICE_DURATION = 1.65;
export function createHealthFeedback(hp: number) {
	return {
		actual: hp,
		displayed: hp,
		from: hp,
		counterAge: HEALTH_COUNTER_DURATION,
		nextId: 0,
		readyAge: 0,
		notices: [] as { id: number; amount: number; age: number }[],
	};
}
export type HealthFeedback = ReturnType<typeof createHealthFeedback>;
/** Presentation only: authoritative HP is never delayed or changed. */
export function advanceHealthFeedback(state: HealthFeedback, hp: number, dt: number, ready = true) {
	const elapsed = Math.max(0, Number.isFinite(dt) ? dt : 0);

	for (const notice of state.notices) notice.age += elapsed;
	state.notices = state.notices.filter((n) => n.age < DAMAGE_NOTICE_DURATION);
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
			state.notices.push({ id: state.nextId++, amount: state.actual - hp, age: 0 });
			if (state.notices.length > 4) state.notices.shift();
			state.from = state.displayed;
			state.counterAge = 0;
		} else {
			state.from = hp;
			state.counterAge = HEALTH_COUNTER_DURATION;
		}
		state.actual = hp;
		state.readyAge = 0;
	}
	const t = Math.min(1, state.counterAge / HEALTH_COUNTER_DURATION);
	state.displayed = Math.round(state.actual + (state.from - state.actual) * (1 - t) ** 3);
	return state;
}
