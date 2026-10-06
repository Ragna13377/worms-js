import backflip from '@src/assets/props/Worms/wbackflp.png';
import idle from '@src/assets/props/Worms/wbrth1.png';
import death from '@src/assets/props/Worms/wdie.png';
import fall from '@src/assets/props/Worms/wfall.png';
import flight from '@src/assets/props/Worms/wfly1.png';
import descent from '@src/assets/props/Worms/wflydn.png';
import rise from '@src/assets/props/Worms/wflyup.png';
import jump from '@src/assets/props/Worms/wjump.png';
import land from '@src/assets/props/Worms/wland1.png';
import hurt from '@src/assets/props/Worms/wland2.png';
import twang from '@src/assets/props/Worms/wtwang.png';
import walk from '@src/assets/props/Worms/wwalk.png';
import { IDLE_PLAYBACK, jumpPhase } from '../model/animation';
import type { Worm } from '../model/worm';

export const SPRITES = {
	twang: { image: twang, fps: 28, playback: 'once' },
	flight: { image: flight, fps: 0, playback: 'once' },
	idle: { image: idle, fps: 12, playback: IDLE_PLAYBACK },
	walk: { image: walk, fps: 20, playback: 'pingpong' },
	jump: { image: jump, fps: 75, playback: 'once' },
	rise: { image: rise, fps: 8, playback: 'loop' },
	descent: { image: descent, fps: 8, playback: 'loop' },
	fall: { image: fall, fps: 5, playback: 'loop' },
	land: { image: land, fps: 28, playback: 'once' },
	hurt: { image: hurt, fps: 20, playback: 'once' },
	death: { image: death, fps: 25, playback: 'once' },
	drown: { image: fall, fps: 5, playback: 'loop' },
	backflip: { image: backflip, fps: 24, playback: 'once' },
} as const;

export type SpriteName = keyof typeof SPRITES;

export function spriteName(worm: Worm): SpriteName {
	if (worm.alive && !worm.grounded && !worm.sliding && worm.knockedBack) return 'flight';
	if (worm.alive && !worm.grounded && worm.jumpType)
		return jumpPhase(worm.jumpType, worm.jumpTime, worm.velocity.y);
	return worm.animationState;
}
