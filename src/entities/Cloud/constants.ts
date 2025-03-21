import { TCloudConfig, TCloudType } from '@entities/Cloud/types';
import { TVector2 } from '@shared/types';

export const baseCloudName = 'cloud';
export const cloudsDelayRange: TVector2 = [1000, 3000];
export const cloudsSpeedRange: TVector2 = [20, 100];

//TODO: настроить высоты
export const CLOUD_CONFIGS: Record<TCloudType, TCloudConfig> = {
	small: { name: `${baseCloudName}s`, scale: [7, 7, 1], size: 60, baseHeight: 50 },
	medium: { name: `${baseCloudName}m`, scale: [10, 10, 1], size: 128, baseHeight: 80 },
	large: { name: `${baseCloudName}l`, scale: [12, 11, 1], size: 160, baseHeight: 110 },
};
