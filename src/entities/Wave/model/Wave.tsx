'use client';
import { useFrame } from '@react-three/fiber';
import { createUniforms } from '@shared/utils/shaderUtils';
import { TWaveUniforms, WaveProps } from '../types';
import WaveUI from '../ui/WaveUI';
import { DEFAULT_WAVE_CONFIG, DEFAULT_WAVE_SHADER_CONFIG } from '@entities/Wave/constants';

export const Wave = ({
	index,
	baseYPos,
	width,
	thickness = DEFAULT_WAVE_CONFIG.thickness,
	overlapFactor = DEFAULT_WAVE_CONFIG.overlapFactor,
	phaseOffset,
	shaderConfig,
}: WaveProps) => {
	const { uAmplitude, uFrequency, ...restShader } = {
		...DEFAULT_WAVE_SHADER_CONFIG,
		...shaderConfig,
	};
	const yOffset = baseYPos - (uAmplitude * 2 + thickness * overlapFactor) * index;
	const variation = Math.random() * 0.01 + 0.05;
	const uniforms = createUniforms<TWaveUniforms>({
		...restShader,
		uTime: 0,
		uAmplitude: uAmplitude + variation,
		uFrequency: uFrequency + variation,
		uPhaseOffset: phaseOffset,
		uSpeedVariation: (Math.random() - 0.5) * 5.0,
	});
	useFrame(({ clock }) => {
		uniforms.uTime.value = clock.getElapsedTime();
	});
	return <WaveUI uniforms={uniforms} size={[width, thickness]} position={[0, yOffset, index]} />;
};
