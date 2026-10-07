import { describe, expect, it } from 'vitest';
import { logicalViewport, viewportScale } from '../src/shared/lib/viewport';

describe('large display scaling', () => {
	it.each([
		[1600, 900, 1.25],
		[1920, 1080, 1.5],
		[2560, 1440, 2],
		[3840, 2160, 3],
	])('keeps the same game composition at %i × %i', (width, height, scale) => {
		expect(viewportScale(width, height)).toBe(scale);
		expect(logicalViewport(width, height)).toEqual({ width: 1280, height: 720 });
		expect(width / (0.8 * scale)).toBeCloseTo(1600);
	});
	it('preserves aspect ratio and fits within the shorter axis', () => {
		expect(logicalViewport(1920, 1200)).toEqual({ width: 1280, height: 800 });
		expect(logicalViewport(3440, 1440)).toEqual({ width: 1720, height: 720 });
	});
	it('does not shrink controls below their original size', () => {
		expect(viewportScale(800, 600)).toBe(1);
	});
});
