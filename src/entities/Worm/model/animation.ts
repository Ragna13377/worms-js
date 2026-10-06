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

/** Flight sheets run from head-up through horizontal to head-down. */
export function flightFrame(velocity: { x: number; y: number }, frames: number) {
	return Math.round((Math.atan2(Math.abs(velocity.x), velocity.y) / Math.PI) * (frames - 1));
}

/** The held-grenade sheet runs from downward aim to upward aim. */
export function grenadePoseFrame(angle: number, frames: number) {
	return Math.round(Math.max(0, Math.min(1, 0.5 + angle / Math.PI)) * (frames - 1));
}
