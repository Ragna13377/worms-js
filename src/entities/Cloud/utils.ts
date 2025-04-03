import { TCloudType } from '@entities/Cloud/types';

const IS_PROD = process.env.NODE_ENV === 'production';
export const scaleFix = (type: TCloudType) => {
	const scales: Record<TCloudType, number> = {
		small: 8,
		medium: 11, //10
		large: 13, //12
	};
	return IS_PROD ? scales[type] ** 2 : scales[type] || 1;
};
