import { Vector3 } from '@react-three/fiber';
import { TVector2, Uniformize } from '@shared/types';

export type TWaveShaderConfig = {
	uAmplitude: number;
	uFrequency: number;
	uColorFrom: Vector3;
	uColorTo: Vector3;
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
	shaderConfig?: TWaveShaderConfig;
};

export type WaveUIProps = {
	size: TVector2;
	position: Vector3;
	uniforms: TWaveUniforms;
};
