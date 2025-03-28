import { TBackgroundShader } from '@entities/Background/types';
import { Color } from 'three';

export const DEFAULT_BACKGROUND_SHADER_CONFIG: TBackgroundShader = {
	uTopColor: new Color('#fff'),
	uBottomColor: new Color('#000'),
	uEdgeSharpness: 1.0,
	uBlendFactor: 1.2,
	uGradientPower: 1.5,
	uCenterPoint: 0.5,
};
