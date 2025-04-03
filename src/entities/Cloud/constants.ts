import { TCloudConfig, TCloudType } from '@entities/Cloud/types';
import { TRange } from '@shared/types';
import { scaleFix } from '@entities/Cloud/utils';

export const baseCloudName = 'cloud';
export const cloudsDelayRange: TRange = { range: [1000, 3000] };
export const cloudsSpeedRange: TRange = { range: [20, 100], step: 10 };

export const CLOUD_CONFIGS: Record<TCloudType, TCloudConfig> = {
	small: {
		name: `${baseCloudName}s`,
		scale: [scaleFix('small'), scaleFix('small'), 1],
		size: 60,
		fps: 14,
	},
	medium: {
		name: `${baseCloudName}m`,
		scale: [scaleFix('medium'), scaleFix('medium'), 1],
		size: 128,
		fps: 7,
	},
	large: {
		name: `${baseCloudName}l`,
		scale: [scaleFix('large'), scaleFix('large'), 1],
		size: 160,
		fps: 7,
	},
};
