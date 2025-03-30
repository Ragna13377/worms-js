'use client';
import { useFrame } from '@react-three/fiber';
import { createUniforms } from '@shared/utils/shaderUtils';
import { TWaveUniforms, WaveProps } from '../types';
import WaveUI from '../ui/WaveUI';

//TODO: размер волн задать процентный
export const Wave = ({
	index,
	baseYPos,
	width,
	thickness,
	overlapFactor,
	phaseOffset,
	shaderConfig,
}: WaveProps) => {
	const { uAmplitude, uFrequency, ...restShader } = shaderConfig;
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
	return <WaveUI uniforms={uniforms} size={[width, thickness]} position={[0, yOffset, 10]} />;
};

Wave.displayName = 'Wave';
