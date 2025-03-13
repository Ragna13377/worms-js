'use client';
import { WaveProps } from '../types';
import WaveUI from '../ui/WaveUI';
import { useFrame } from '@react-three/fiber';

export const Wave = ({
	amplitude,
	frequency,
	colorFrom,
	colorTo,
	colorBlendPower,
	phaseOffset,
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
	};
	useFrame(({ clock }) => {
		uniforms.uTime.value = clock.getElapsedTime();
	});
	return <WaveUI uniforms={uniforms} {...rest} />;
};
