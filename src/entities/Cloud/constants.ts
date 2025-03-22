import { TCloudConfig, TCloudType } from '@entities/Cloud/types';
import { TVector2 } from '@shared/types';

export const baseCloudName = 'cloud';
export const cloudsDelayRange: TVector2 = [1000, 3000];
export const cloudsSpeedRange: TVector2 = [20, 100];

//TODO: настроить высоты
export const CLOUD_CONFIGS: Record<TCloudType, TCloudConfig> = {
	small: { name: `${baseCloudName}s`, scale: [8, 8, 1], size: 60, fps: 14 },
	medium: { name: `${baseCloudName}m`, scale: [11, 11, 1], size: 128, fps: 7 },
	large: { name: `${baseCloudName}l`, scale: [13, 13, 1], size: 160, fps: 7 },
};
