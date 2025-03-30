import { TCloudType } from '@entities/Cloud/types';

const IS_PROD = process.env.NODE_ENV === 'production';
export const scaleFix = (type: TCloudType) => {
	if (!IS_PROD) return 1;
	switch (type) {
		case 'small':
			return 8;
		case 'medium':
			return 10;
		case 'large':
			return 12;
		default:
			return 1;
	}
};
