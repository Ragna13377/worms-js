import { Color } from 'three';
import { TWaveConfig, TWaveShaderConfig } from '@entities/Wave/types';

export const defaultWaveQuality = 128;

export const DEFAULT_WAVE_SHADER_CONFIG: TWaveShaderConfig = {
	uAmplitude: 10.0,
	uFrequency: 5.0,
	uColorFrom: new Color('#323B7E'),
	uColorTo: new Color('#8389C2'),
	uColorBlendPower: 0.75,
};

export const DEFAULT_WAVE_CONFIG: TWaveConfig = {
	thickness: 18,
	overlapFactor: 1,
};
