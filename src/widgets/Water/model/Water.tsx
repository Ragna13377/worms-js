import { memo } from 'react';
import { shuffleArray } from '@shared/utils/arrayUtils';
import { defaultWaveColor, defaultWaveConfig } from '../constants';
import { WaterProps } from '../types';
import WaterUI from '../ui/WaterUI';

export const Water = memo(({ color, waveCount, waveConfig, ...props }: WaterProps) => {
	const count = waveCount ?? 1;
	const config = {
		...defaultWaveConfig,
		...waveConfig,
	};
	const step = (3 * Math.PI) / (3 * count);
	const offsets = shuffleArray(Array.from({ length: count }, (_, index) => index * step));
	return (
		<WaterUI
			{...props}
			color={color ?? defaultWaveColor}
			waveCount={count}
			offsets={offsets}
			waveConfig={config}
		/>
	);
});

Water.displayName = 'Water';
