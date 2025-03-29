import { TCloudConfig, TCloudType } from '@entities/Cloud/types';
import { TRange } from '@shared/types';

export const baseCloudName = 'cloud';
export const cloudsDelayRange: TRange = { range: [1000, 3000] };
export const cloudsSpeedRange: TRange = { range: [20, 100], step: 10 };

export const CLOUD_CONFIGS: Record<TCloudType, TCloudConfig> = {
	small: { name: `${baseCloudName}s`, scale: [8, 8, 1], size: 60, fps: 14 },
	medium: { name: `${baseCloudName}m`, scale: [11, 11, 1], size: 128, fps: 7 },
	large: { name: `${baseCloudName}l`, scale: [13, 13, 1], size: 160, fps: 7 },
};
