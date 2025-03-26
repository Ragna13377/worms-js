import { Color } from 'three';
import { TVector2, Uniformize } from '@shared/types';
import { Vector3 } from '@react-three/fiber';

export type TBackgroundShader = {
	uTopColor: Color;
	uBottomColor: Color;
	uEdgeSharpness?: number;
	uBlendFactor?: number;
	uGradientPower?: number;
};

export type TBackgroundUniforms = Uniformize<Required<TBackgroundShader>>;

export type BackgroundProps = {
	size: TVector2;
	position: Vector3;
	shader: TBackgroundShader;
};

export type BackgroundUIProps = Omit<BackgroundProps, 'shader'> & {
	uniform: TBackgroundUniforms;
};
