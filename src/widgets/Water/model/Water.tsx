import { memo, useMemo } from 'react';
import { shuffleArray } from '@shared/utils/arrayUtils';
import { bubbleCount, defaultWaterColor } from '../constants';
import { BubbleProps, TBubbleConfig } from '@entities/Bubble/types';
import { DEFAULT_BUBBLE_CONFIG } from '@entities/Bubble/constants';
import { DEFAULT_WAVE_CONFIG, DEFAULT_WAVE_SHADER_CONFIG } from '@entities/Wave/constants';
import { WaterProps } from '../types';
import WaterUI from '../ui/WaterUI';

export const Water = memo(
	({ position, height, width, color, waveCount = 1, bubbleConfig, waveConfig }: WaterProps) => {
		const step = (3 * Math.PI) / (3 * waveCount);

		const waveOffsets = shuffleArray(Array.from({ length: waveCount }, (_, index) => index * step));

		// waves
		const mergeWaveConfig = useMemo(
			() => ({
				...DEFAULT_WAVE_CONFIG,
				...waveConfig,
				shaderConfig: {
					...DEFAULT_WAVE_SHADER_CONFIG,
					...waveConfig?.shaderConfig,
				},
			}),
			[waveConfig]
		);

		const {
			thickness,
			overlapFactor,
			shaderConfig: { uAmplitude },
		} = mergeWaveConfig;
		const baseWaveYPos = position[1] + height / 2;
		const waveHeight = baseWaveYPos - (uAmplitude * 2 + thickness * overlapFactor) * waveCount;
		const waves = Array.from({ length: waveCount }, (_, index) => ({
			baseYPos: baseWaveYPos,
			width,
			thickness,
			overlapFactor,
			phaseOffset: waveOffsets[index],
			shaderConfig: mergeWaveConfig.shaderConfig,
		}));

		// bubbles
		const mergedBubbleConfig: TBubbleConfig = useMemo(
			() => ({
				...DEFAULT_BUBBLE_CONFIG,
				...bubbleConfig,
			}),
			[bubbleConfig]
		);
		const bubbles: BubbleProps[] = Array.from({ length: bubbleCount }, (_, index) => ({
			type: index < 3 ? 'small' : 'medium',
			xRange: { range: [-width / 2, width / 2], step: 100 },
			yRange: { range: [position[1] - height / 2, waveHeight] },
			config: mergedBubbleConfig,
		}));

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
