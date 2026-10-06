/** Reverse the sprite sheet without jumping between its endpoint poses. */
export function cloudFrame(rawFrame: number, frames: number) {
	if (frames <= 1) return 0;
	const period = (frames - 1) * 2;
	const phase = rawFrame % period;
	return phase < frames ? phase : period - phase;
}
