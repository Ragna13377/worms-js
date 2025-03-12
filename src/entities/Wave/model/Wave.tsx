'use client';
import { WaveProps } from '../types';
import WaveUI from '../ui/WaveUI';
import { useFrame } from '@react-three/fiber';

export const Wave = ({ amplitude, frequency, colorFrom, colorTo, ...rest }: WaveProps) => {
	const uniforms = {
		uTime: { value: 0 },
		uAmplitude: { value: amplitude },
		uFrequency: { value: frequency },
		uColorFrom: { value: colorFrom },
		uColorTo: { value: colorTo },
		uPhaseOffset: { value: Math.random() * Math.PI * 2 },
	};
	useFrame(({ clock }) => {
		uniforms.uTime.value = clock.getElapsedTime();
	});
	return <WaveUI uniforms={uniforms} {...rest} />;
};
