import { memo, useState } from 'react';
import { shuffleArray } from '@shared/utils/arrayUtils';
import { BubbleProps } from '@entities/Bubble/types';
import { bubbleCount, defaultWaterColor } from '../constants';
import { WaterProps } from '../types';
import WaterUI from '../ui/WaterUI';

export const Water = memo(
	({ position, height, width, color, waveCount, bubbleConfig, waveConfig }: WaterProps) => {
		const count = waveCount ?? 1;
		const step = (3 * Math.PI) / (3 * count);
		const waveOffsets = shuffleArray(Array.from({ length: count }, (_, index) => index * step));
		const [bubbles] = useState<BubbleProps[]>(() =>
			Array.from({ length: bubbleCount }, (_, index) => ({
				type: index < 3 ? 'small' : 'medium',
				xRange: { range: [-width / 2, width / 2], step: 100 },
				yRange: { range: [position[1] - height / 2, position[1] + height / 2] },
				config: bubbleConfig,
			}))
		);
		return (
			<WaterUI
				width={width}
				height={height}
				position={position}
				color={color ?? defaultWaterColor}
				bubbles={bubbles}
				waveCount={count}
				baseWaveYPos={position[1] + height / 2}
				waveOffsets={waveOffsets}
				waveConfig={waveConfig}
			/>
		);
	}
);

Water.displayName = 'Water';
