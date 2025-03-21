import { TVector3 } from '@shared/types';

export const hexToRgb = (hex: string): TVector3 => {
	const bigint = parseInt(hex.replace('#', ''), 16);
	return [((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255];
};
