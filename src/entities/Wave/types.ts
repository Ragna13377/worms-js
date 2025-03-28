import { Vector3 } from '@react-three/fiber';
import { TVector2, Uniformize } from '@shared/types';
import { Color } from 'three';

export type TWaveShaderConfig = {
	uAmplitude: number;
	uFrequency: number;
	uColorFrom: Color;
	uColorTo: Color;
	uColorBlendPower: number;
};

export type TWaveUniforms = Uniformize<
	TWaveShaderConfig & {
		uPhaseOffset: number;
		uSpeedVariation: number;
	}
>;

export type WaveProps = {
	index: number;
	baseYPos: number;
	width: number;
	phaseOffset: number;
	thickness?: number;
	overlapFactor?: number;
	shaderConfig?: Partial<TWaveShaderConfig>;
};

export type WaveUIProps = {
	size: TVector2;
	position: Vector3;
	uniforms: TWaveUniforms;
};
