import { WORM } from './config';
import type { JumpType } from './worm';
export type Playback = 'loop' | 'pingpong' | 'once';
export const IDLE_PLAYBACK: Playback = 'pingpong';

/** Ping-pong never jumps from the final pose straight to the first pose. */
export function spriteFrame(rawFrame: number, frames: number, playback: Playback) {
	if (frames <= 1) return 0;
	if (playback === 'once') return Math.min(frames - 1, rawFrame);
	if (playback === 'loop') return rawFrame % frames;
	const period = (frames - 1) * 2;
	const phase = rawFrame % period;
	return phase < frames ? phase : period - phase;
}

export function jumpPhase(type: JumpType, time: number, velocityY: number) {
	if (time < WORM.jumpPreparationDuration) return 'jump';
	if (type === 'backflip') return 'backflip';
	return velocityY > 0 ? 'rise' : 'descent';
}
