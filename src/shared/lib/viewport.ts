/** Match the original 1280 × 720 composition without tying game units to monitor pixels. */
export function viewportScale(width: number, height: number) {
	return Math.max(1, Math.min(width / 1280, height / 720));
}

export function logicalViewport(width: number, height: number) {
	const scale = viewportScale(width, height);
	return { width: Math.round(width / scale), height: Math.round(height / scale) };
}
