import { Color } from 'three';
import { TBubbleBase, TBubbleConfig, TBubbleType } from '@entities/Bubble/types';

export const DEFAULT_BUBBLE_CONFIG: TBubbleConfig = {
	amplitude: 1.5,
	frequency: 2.0,
	wobbleIntensity: 0.25,
	wobbleSpeed: 15.0,
	color: new Color('#5f6bcd'),
	delay: { range: [50, 150], step: 10 },
};

export const bubbleTypes: Record<TBubbleType, TBubbleBase> = {
	small: {
		size: [1, 3],
		speed: {
			range: [200, 250],
			step: 10,
		},
	},
	medium: {
		size: [3, 5],
		speed: {
			range: [100, 150],
			step: 10,
		},
	},
};
