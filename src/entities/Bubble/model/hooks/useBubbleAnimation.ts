import { useRef } from 'react';
import { Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { bubbleTypes } from '@entities/Bubble/constants';
import { getRandomInRange } from '@shared/utils/mathUtils';
import { useFrame } from '@react-three/fiber';
import { BubbleProps } from '@entities/Bubble/types';

export const useBubbleAnimation = ({ type, xRange, yRange, fadeRange, config }: BubbleProps) => {
	const bubbleRef = useRef<Mesh>(null);
	const { size, speed } = bubbleTypes[type];
	const { amplitude, frequency, wobbleSpeed, wobbleIntensity, delay, color } = config;
	const [yMin, yMax] = yRange.range;
	const [fadeMin, fadeMax] = fadeRange.range;
	const curSpeed = getRandomInRange(speed);
	useFrame(({ clock }, delta) => {
		const bubble = bubbleRef.current;
		if (!bubble) return;

		const time = clock.getElapsedTime();
		const { x, y } = bubble.position;
		let newY = y + curSpeed * delta;
		let newX = x;
		let opacity = 1;
		if (newY > fadeMin) {
			const overflow = Math.min(1, (newY - fadeMin) / (fadeMax - fadeMin));
			opacity = 1 - overflow ** 2;
		}
		if (newY > yMax) {
			newY = yMin - getRandomInRange(delay);
			newX = getRandomInRange(xRange);
			opacity = 1;
		}

		const wobble = time * wobbleSpeed;
		const offsetX = Math.sin(time * frequency) * amplitude;
		const wobbleX = Math.sin(wobble) * wobbleIntensity;
		const wobbleY = Math.cos(wobble) * wobbleIntensity;

		bubble.position.set(newX + offsetX + wobbleX, newY + wobbleY, 0);
		(bubble.material as MeshBasicMaterial).opacity = opacity;
	});
	return {
		bubbleRef,
		size,
		position: new Vector3(getRandomInRange(xRange), yMin, 0),
		color,
	};
};
