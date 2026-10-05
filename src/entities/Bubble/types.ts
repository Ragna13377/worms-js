import type { Vector3 } from '@react-three/fiber';
import type { TRange, TVector2 } from '@shared/types';
import type { Ref } from 'react';
import type { Color, Mesh } from 'three';

export type TBubbleConfig = {
	amplitude: number;
	frequency: number;
	wobbleIntensity: number;
	wobbleSpeed: number;
	color: Color;
	delay: TRange;
};

export type BubbleProps = {
	wind?: number;
	type: TBubbleType;
	xRange: TRange;
	yRange: TRange;
	fadeRange: TRange;
	config: TBubbleConfig;
};

export type BubbleUIProps = {
	color: Color;
	position: Vector3;
	size: TVector2;
	ref: Ref<Mesh>;
};

export type TBubbleType = 'small' | 'medium';
export type TBubbleBase = {
	speed: TRange;
	size: TVector2;
};
