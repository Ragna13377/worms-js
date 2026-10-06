export const HEALTH_COUNTER_DURATION = 0.9;
export const DAMAGE_NOTICE_DURATION = 1.3;
export function createHealthFeedback(hp: number) {
	return {
		actual: hp,
		displayed: hp,
		from: hp,
		counterAge: HEALTH_COUNTER_DURATION,
		nextId: 0,
		notices: [] as { id: number; amount: number; age: number }[],
	};
}
export type HealthFeedback = ReturnType<typeof createHealthFeedback>;
/** Presentation only: authoritative HP is never delayed or changed. */
export function advanceHealthFeedback(state: HealthFeedback, hp: number, dt: number) {
	const elapsed = Math.max(0, Number.isFinite(dt) ? dt : 0);
	state.counterAge += elapsed;
	for (const notice of state.notices) notice.age += elapsed;
	state.notices = state.notices.filter((n) => n.age < DAMAGE_NOTICE_DURATION);
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
	}
	const t = Math.min(1, state.counterAge / HEALTH_COUNTER_DURATION);
	state.displayed = Math.round(state.actual + (state.from - state.actual) * (1 - t) ** 3);
	return state;
}
