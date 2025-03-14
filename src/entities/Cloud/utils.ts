import { TCloudSize } from '@entities/Cloud/types';

export const getCloudSource = (size: TCloudSize) => {
	const baseName = 'cloud';
	const sizeMap: Record<TCloudSize, string> = {
		small: 's',
		medium: 'm',
		large: 'l',
	};
	return `${baseName}${sizeMap[size] || ''}`;
};
