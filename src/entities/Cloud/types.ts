import { Group } from 'three';
import { Vector3 } from '@react-three/fiber';
import { TSpriteObj, TVector2 } from '@shared/types';
import { getRandomDirection } from '@shared/utils/mathUtils';

export type TCloudType = 'small' | 'medium' | 'large';
export type TCloudConfig = {
	name: string;
	size: number;
	scale: Vector3;
	baseHeight: number;
};

export type CloudProps = Omit<TCloudConfig, 'baseHeight'> & {
	position: Vector3;
	direction: ReturnType<typeof getRandomDirection>;
	speed: number;
	airWidth: number;
	delayRange?: TVector2;
};

export type CloudUIProps = {
	ref: React.Ref<Group>;
	spriteObj: TSpriteObj;
	position: Vector3;
	scale: Vector3;
	name: string;
};
