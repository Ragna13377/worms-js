import { TRange } from '@shared/types';

export const getRandomInRange = ({ range: [min, max], step }: TRange) =>
	step
		? min + Math.floor(Math.random() * ((max - min) / step + 1)) * step
		: Math.random() * (max - min) + min;

export const getRandomDirection = (): number => (Math.random() < 0.5 ? -1 : 1);
