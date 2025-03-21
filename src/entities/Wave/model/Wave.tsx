'use client';
import { useFrame } from '@react-three/fiber';
import { WaveProps } from '../types';
import WaveUI from '../ui/WaveUI';

export const Wave = ({
	amplitude,
	frequency,
	phaseOffset,
	colorFrom,
	colorTo,
	colorBlendPower,
	...rest
}: WaveProps) => {
	const variation = Math.random() * 0.01 + 0.05;
	const uniforms = {
		uTime: { value: 0 },
		uAmplitude: { value: amplitude + variation },
		uFrequency: { value: frequency + variation },
		uColorFrom: { value: colorFrom },
		uColorTo: { value: colorTo },
		uColorBlendPower: { value: colorBlendPower },
		uPhaseOffset: { value: phaseOffset },
		uSpeedVariation: { value: (Math.random() - 0.5) * 5.0 },
	};
	useFrame(({ clock }) => {
		uniforms.uTime.value = clock.getElapsedTime();
	});
	return <WaveUI uniforms={uniforms} {...rest} />;
};
