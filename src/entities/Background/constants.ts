import { TBackgroundShader } from '@entities/Background/types';

export const DEFAULT_BACKGROUND_SHADER_CONFIG: Required<
	Omit<TBackgroundShader, 'uTopColor' | 'uBottomColor'>
> = {
	uEdgeSharpness: 1.0,
	uBlendFactor: 2.0,
	uGradientPower: 1.5,
};
