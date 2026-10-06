import type { TCloudType } from '@entities/Cloud/types';
export const scaleFix = (type: TCloudType) => ({ small: 60, medium: 128, large: 160 })[type];
