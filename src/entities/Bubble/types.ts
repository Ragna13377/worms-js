import { Ref } from 'react';
import { Mesh, Color } from 'three';
import { Vector3 } from '@react-three/fiber';
import { TRange, TVector2, Uniformize } from '@shared/types';

export type TBubbleShaderConfig = {
	uAmplitude: number;
	uFrequency: number;
	uWobbleIntensity: number;
	uWobbleSpeed: number;
	uColor: Color;
};

export type TBubbleUniforms = Uniformize<
	TBubbleShaderConfig & {
		uSpeed: number;
	}
>;

export type BubbleProps = {
	type: TBubbleType;
	color?: Color;
};

export type BubbleUIProps = {
	uniforms: TBubbleUniforms;
	position: Vector3;
	size: TVector2;
	ref: Ref<Mesh>;
};

export type TBubbleType = 'small' | 'medium';
export type TBubbleBase = {
	speed: TRange;
	size: TVector2;
};
