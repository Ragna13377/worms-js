import { useMemo, useRef } from 'react';
import { Mesh, Vector3 } from 'three';
import { bubbleTypes, DEFAULT_BUBBLE_CONFIG } from '@entities/Bubble/constants';
import { getRandomInRange } from '@shared/utils/mathUtils';
import { useFrame } from '@react-three/fiber';
import { BubbleProps } from '@entities/Bubble/types';

export const useBubbleAnimation = ({ type, xRange, yRange, config }: BubbleProps) => {
	const bubbleRef = useRef<Mesh>(null);
	const { size, speed } = bubbleTypes[type];
	const { amplitude, frequency, wobbleSpeed, wobbleIntensity, delay, color } = useMemo(
		() => ({
			...DEFAULT_BUBBLE_CONFIG,
			...config,
		}),
		[config]
	);
	const [yMin, yMax] = yRange.range;
	const curSpeed = getRandomInRange(speed);
	useFrame(({ clock }, delta) => {
		if (!bubbleRef.current) return;

		const time = clock.getElapsedTime();
		const { x, y } = bubbleRef.current.position;
		let newY = y + curSpeed * delta;
		let newX = x;
		if (newY > yMax) {
			newY = yMin - getRandomInRange(delay);
			newX = getRandomInRange(xRange);
		}

		const offsetX = Math.sin(time * frequency) * amplitude;
		const wobbleX = Math.sin(time * wobbleSpeed) * wobbleIntensity;
		const wobbleY = Math.cos(time * wobbleSpeed) * wobbleIntensity;

		bubbleRef.current.position.set(newX + offsetX + wobbleX, newY + wobbleY, 0);
	});
	return {
		bubbleRef,
		size,
		position: new Vector3(getRandomInRange(xRange), yRange.range[0], 0),
		color,
	};
};
