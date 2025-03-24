'use client';
import { useRef } from 'react';
import { Mesh, ShaderMaterial } from 'three';
import { useFrame } from '@react-three/fiber';
import { bubbleTypes, DEFAULT_BUBBLE_CONFIG } from '../constants';
import { BubbleProps, TBubbleUniforms } from '../types';
import BubbleUI from '../ui/BubbleUI';
import { createUniforms } from '@shared/utils/shaderUtils';
import { getRandomInRange } from '@shared/utils/mathUtils';

export const Bubble = ({ type, color }: BubbleProps) => {
	const ref = useRef<Mesh>(null);
	const { size, speed } = bubbleTypes[type]
	const uniforms = createUniforms<TBubbleUniforms>({
		...DEFAULT_BUBBLE_CONFIG,
		uSpeed: getRandomInRange(speed),
		uColor: color ?? DEFAULT_BUBBLE_CONFIG.uColor,
		uTime: 0,
	});
	useFrame(({ clock }) => {
		if (!ref.current) return;
		const material = ref.current.material as ShaderMaterial;
		material.uniforms.uTime.value = clock.getElapsedTime();
	});
	return (
		<BubbleUI uniforms={uniforms} position={[0, 0, 0]} size={size} ref={ref} />
	);
};
