import backflip from '@src/assets/props/Worms/wbackflp.png';
import idle from '@src/assets/props/Worms/wbrth1.png';
import death from '@src/assets/props/Worms/wdie.png';
import fall from '@src/assets/props/Worms/wfall.png';
import jump from '@src/assets/props/Worms/wjump.png';
import land from '@src/assets/props/Worms/wland1.png';
import hurt from '@src/assets/props/Worms/wland2.png';
import walk from '@src/assets/props/Worms/wwalk.png';
import type { Worm } from '../model/worm';

export const SPRITES = {
	idle: { image: idle, fps: 12, loop: true },
	walk: { image: walk, fps: 20, loop: true },
	jump: { image: jump, fps: 18, loop: false },
	fall: { image: fall, fps: 5, loop: true },
	land: { image: land, fps: 28, loop: false },
	hurt: { image: hurt, fps: 20, loop: false },
	death: { image: death, fps: 25, loop: false },
	drown: { image: fall, fps: 5, loop: true },
	backflip: { image: backflip, fps: 24, loop: false },
} as const;

export type SpriteName = keyof typeof SPRITES;

export function spriteName(worm: Worm): SpriteName {
	if (worm.alive && !worm.grounded && worm.jumpType === 'backflip') return 'backflip';
	return worm.animationState;
}
