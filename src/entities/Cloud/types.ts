import { Group } from 'three';
import { Vector3 } from '@react-three/fiber';
import { SpriteAnimatorProps } from '@react-three/drei';
import { TRange } from '@shared/types';
import { getRandomDirection } from '@shared/utils/mathUtils';

export type TCloudType = 'small' | 'medium' | 'large';
export type TCloudConfig = {
	name: string;
	size: number;
	scale: Vector3;
	fps: number;
};

export type CloudBaseProps = {
	position: Vector3;
	direction: ReturnType<typeof getRandomDirection>;
	speed: number;
	airWidth: number;
	delayRange?: TRange;
};

export type CloudProps = Omit<TCloudConfig, 'baseHeight'> & CloudBaseProps;

export type CloudUIProps = SpriteAnimatorProps & {
	ref: React.Ref<Group>;
};
