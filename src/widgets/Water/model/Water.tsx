import { memo } from 'react';
import { shuffleArray } from '@shared/utils/arrayUtils';
import { defaultWaterColor } from '../constants';
import { WaterProps } from '../types';
import WaterUI from '../ui/WaterUI';

export const Water = memo(({ position, height, color, waveCount, ...rest }: WaterProps) => {
	const count = waveCount ?? 1;
	const step = (3 * Math.PI) / (3 * count);
	const waveOffsets = shuffleArray(Array.from({ length: count }, (_, index) => index * step));
	return (
		<WaterUI
			height={height}
			position={position}
			color={color ?? defaultWaterColor}
			waveCount={count}
			baseWaveYPos={position[1] + height / 2}
			waveOffsets={waveOffsets}
			{...rest}
		/>
	);
});

Water.displayName = 'Water';
