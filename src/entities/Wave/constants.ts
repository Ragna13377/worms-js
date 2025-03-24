import { hexToRgb } from '@shared/utils/colorFormatter';
import { TWaveShaderConfig } from '@entities/Wave/types';

export const defaultWaveQuality = 128;

export const DEFAULT_WAVE_SHADER_CONFIG: TWaveShaderConfig = {
	uAmplitude: 10.0,
	uFrequency: 5.0,
	uColorFrom: hexToRgb('#323B7E'),
	uColorTo: hexToRgb('#8389C2'),
	uColorBlendPower: 0.75,
};

export const DEFAULT_WAVE_CONFIG = {
	thickness: 18,
	overlapFactor: 1,
};
