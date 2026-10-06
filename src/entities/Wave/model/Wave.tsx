'use client';
import { useFrame } from '@react-three/fiber';
import { createUniforms } from '@shared/utils/shaderUtils';
import { useMemo, useRef } from 'react';
import type { ShaderMaterial } from 'three';
import type { TWaveUniforms, WaveProps } from '../types';
import WaveUI from '../ui/WaveUI';
import { advanceWaveTime } from './animation';

export const Wave = ({
	index,
	row = index,
	depth = 10 + index * 0.01,
	baseYPos,
	width,
	thickness,
	overlapFactor,
	phaseOffset,
	shaderConfig,
}: WaveProps) => {
	const { uAmplitude } = shaderConfig;
	const yOffset = baseYPos - (uAmplitude * 2 + thickness * overlapFactor) * row;
	const materialRef = useRef<ShaderMaterial>(null);
	const uniforms = useMemo(
		() =>
			createUniforms<TWaveUniforms>({
				...shaderConfig,
				uTime: 0,
				uPhaseOffset: phaseOffset,
				uSpeedVariation: 0,
			}),
		[shaderConfig, phaseOffset]
	);
	useFrame((_, delta) => advanceWaveTime(materialRef.current, delta));
	return (
		<WaveUI
			materialRef={materialRef}
			uniforms={uniforms}
			size={[width, thickness]}
			position={[0, yOffset, depth]}
		/>
	);
};

Wave.displayName = 'Wave';
