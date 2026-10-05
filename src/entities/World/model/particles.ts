/** Advance recycled background debris in world coordinates (+Y up). */
export function advanceWindParticles(
	positions: Float32Array,
	speeds: Float32Array,
	wind: number,
	width: number,
	top: number,
	bottom: number,
	delta: number
): void {
	const dt = Math.min(delta, 0.05);
	for (let i = 0; i < speeds.length; i++) {
		positions[i * 3] += wind * 95 * speeds[i] * dt;
		positions[i * 3 + 1] -= 32 * speeds[i] * dt;
		if (positions[i * 3] > width / 2) positions[i * 3] -= width;
		if (positions[i * 3] < -width / 2) positions[i * 3] += width;
		if (positions[i * 3 + 1] < bottom) positions[i * 3 + 1] = top;
	}
}
