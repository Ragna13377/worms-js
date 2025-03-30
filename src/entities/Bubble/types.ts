import { Ref } from 'react';
import { Mesh, Color } from 'three';
import { Vector3 } from '@react-three/fiber';
import { TRange, TVector2 } from '@shared/types';

export type TBubbleConfig = {
	amplitude: number;
	frequency: number;
	wobbleIntensity: number;
	wobbleSpeed: number;
	color: Color;
	delay: TRange;
};

export type BubbleProps = {
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
