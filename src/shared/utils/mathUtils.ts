import { TVector2 } from '@shared/types';

export const getRandomInRange = ([min, max]: TVector2, step?: number) =>
	step
		? min + Math.floor(Math.random() * ((max - min) / step + 1)) * step
		: Math.random() * (max - min) + min;

export const getRandomDirection = (): number => (Math.random() < 0.5 ? -1 : 1);
