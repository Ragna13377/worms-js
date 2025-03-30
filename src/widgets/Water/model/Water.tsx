import { memo, useMemo } from 'react';
import { shuffleArray } from '@shared/utils/arrayUtils';
import { bubbleCount, defaultWaterColor } from '../constants';
import { BubbleProps } from '@entities/Bubble/types';
import { DEFAULT_BUBBLE_CONFIG } from '@entities/Bubble/constants';
import { DEFAULT_WAVE_CONFIG, DEFAULT_WAVE_SHADER_CONFIG } from '@entities/Wave/constants';
import { WaterProps } from '../types';
import WaterUI from '../ui/WaterUI';

export const Water = memo(
	({ position, height, width, color, waveCount = 1, bubbleConfig, waveConfig }: WaterProps) => {
		const [yBottom, yTop] = [position[1] - height / 2, position[1] + height / 2];

		// waves
		const { waves, waveHeight } = useMemo(() => {
			const step = (3 * Math.PI) / (3 * waveCount);
			const waveOffsets = shuffleArray([...Array(waveCount)].map((_, i) => i * step));

			const mergeWaveConfig = {
				...DEFAULT_WAVE_CONFIG,
				...waveConfig,
				shaderConfig: {
					...DEFAULT_WAVE_SHADER_CONFIG,
					...waveConfig?.shaderConfig,
				},
			};

			const {
				thickness,
				overlapFactor,
				shaderConfig: { uAmplitude },
			} = mergeWaveConfig;
			const waveHeight = yTop - (uAmplitude * 2 + thickness * overlapFactor) * waveCount;
			const waves = Array.from({ length: waveCount }, (_, index) => ({
				baseYPos: yTop,
				width,
				thickness,
				overlapFactor,
				phaseOffset: waveOffsets[index],
				shaderConfig: mergeWaveConfig.shaderConfig,
			}));
			return { waves, waveHeight };
		}, [waveCount, waveConfig, yTop, width]);

		// bubbles
		const bubbles: BubbleProps[] = useMemo(() => {
			const mergedBubbleConfig = {
				...DEFAULT_BUBBLE_CONFIG,
				...bubbleConfig,
			};
			return Array.from({ length: bubbleCount }, (_, index) => ({
				type: index < 3 ? 'small' : 'medium',
				xRange: { range: [-width / 2, width / 2], step: 100 },
				yRange: { range: [yBottom, yTop] },
				fadeRange: { range: [waveHeight, waveHeight + (yTop - waveHeight) / 2] },
				config: mergedBubbleConfig,
			}));
		}, [bubbleConfig, waveHeight, width, yBottom, yTop]);

		return (
			<WaterUI
				width={width}
				height={height}
				position={position}
				color={color ?? defaultWaterColor}
				waves={waves}
				bubbles={bubbles}
			/>
		);
	}
);

Water.displayName = 'Water';
