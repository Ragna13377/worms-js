import type { Vector3 } from '@react-three/fiber';
import type { TVector2, Uniformize } from '@shared/types';
import type { Ref } from 'react';
import type { Color, ShaderMaterial } from 'three';

export type TWaveShaderConfig = {
	uAmplitude: number;
	uFrequency: number;
	uColorFrom: Color;
	uColorTo: Color;
	uColorBlendPower: number;
};

export type TWaveConfig = {
	thickness: number;
	overlapFactor: number;
};

export type TWaveUniforms = Uniformize<
	TWaveShaderConfig & {
		uPhaseOffset: number;
		uSpeedVariation: number;
	}
>;

export type WaveProps = TWaveConfig & {
	index: number;
	row?: number;
	depth?: number;
	width: number;
	baseYPos: number;
	phaseOffset: number;
	shaderConfig: TWaveShaderConfig;
};

export type WaveUIProps = {
	materialRef: Ref<ShaderMaterial>;
	size: TVector2;
	position: Vector3;
	uniforms: TWaveUniforms;
};
