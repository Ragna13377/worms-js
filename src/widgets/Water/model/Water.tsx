import { DEFAULT_BUBBLE_CONFIG } from '@entities/Bubble/constants';
import type { BubbleProps } from '@entities/Bubble/types';
import { DEFAULT_WAVE_CONFIG, DEFAULT_WAVE_SHADER_CONFIG } from '@entities/Wave/constants';
import { memo, useMemo } from 'react';
import { bubbleCount, defaultWaterColor } from '../constants';
import type { WaterProps } from '../types';
import WaterUI from '../ui/WaterUI';
import { waterWaveLayer } from './coverage';

export const Water = memo(
	({
		position,
		height,
		width,
		color,
		waveCount = 1,
		backgroundWaveCount = 0,
		wind = 0,
		bubbleConfig,
		waveConfig,
	}: WaterProps) => {
		const [yBottom, yTop] = [position[1] - height / 2, position[1] + height / 2];

		// waves
		const { waves, waveHeight } = useMemo(() => {
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
			const waveHeight =
				yTop - (uAmplitude * 2 + thickness * overlapFactor) * (waveCount - backgroundWaveCount);
			const waves = Array.from({ length: waveCount }, (_, index) => ({
				baseYPos: yTop,
				row: waterWaveLayer(index, backgroundWaveCount).row,
				depth: waterWaveLayer(index, backgroundWaveCount).depth,
				width,
				thickness,
				overlapFactor,
				phaseOffset: (index * Math.PI * 2) / waveCount,
				shaderConfig: mergeWaveConfig.shaderConfig,
			}));
			return { waves, waveHeight };
		}, [waveCount, backgroundWaveCount, waveConfig, yTop, width]);

		// bubbles
		const bubbles: BubbleProps[] = useMemo(() => {
			const mergedBubbleConfig = {
				...DEFAULT_BUBBLE_CONFIG,
				...bubbleConfig,
			};
			return Array.from({ length: bubbleCount }, (_, index) => ({
				type: index < 3 ? 'small' : 'medium',
				wind,
				xRange: { range: [-width / 2, width / 2], step: 100 },
				yRange: { range: [yBottom, yTop] },
				fadeRange: { range: [waveHeight, waveHeight + (yTop - waveHeight) / 2] },
				config: mergedBubbleConfig,
			}));
		}, [bubbleConfig, waveHeight, width, yBottom, yTop, wind]);

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
