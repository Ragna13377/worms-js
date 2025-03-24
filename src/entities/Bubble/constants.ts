import { Color } from 'three';
import { TBubbleBase, TBubbleShaderConfig, TBubbleType } from '@entities/Bubble/types';

export const DEFAULT_BUBBLE_CONFIG: TBubbleShaderConfig = {
	uAmplitude: 10.0,
	uFrequency: 5.0,
	uWobbleIntensity: 5.0,
	uWobbleSpeed: 10.0,
	uColor: new Color('#fff'),
};

export const bubbleTypes: Record<TBubbleType, TBubbleBase> = {
	small: {
		size: [1, 3],
		speed: {
			range: [250, 350],
			step: 10,
		},
	},
	medium: {
		size: [3, 5],
		speed: {
			range: [200, 300],
			step: 10,
		},
	},
};
