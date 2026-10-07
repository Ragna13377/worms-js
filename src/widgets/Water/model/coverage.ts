/** Keep the surface fixed and cover the entire camera view beneath it. */
export function waterSurfaceWidth(worldWidth: number, viewportWidth: number) {
	return Math.max(worldWidth, viewportWidth + 128);
}

export function waterCoverage(
	top: number,
	originalBottom: number,
	cameraY: number,
	viewportHeight: number
) {
	const bottom = Math.min(originalBottom, cameraY - viewportHeight / 2 - 64);
	return { height: top - bottom, y: (top + bottom) / 2 };
}
export function waterWaveLayer(index: number, backgroundCount: number) {
	return {
		row: index - backgroundCount,
		depth: index < backgroundCount ? 2.5 + index * 0.01 : 10 + (index - backgroundCount) * 0.01,
	};
}
