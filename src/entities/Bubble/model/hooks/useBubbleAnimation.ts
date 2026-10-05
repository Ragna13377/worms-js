import { useMemo, useRef } from 'react';
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
	const motion = useMemo(
		() => ({
			x: getRandomInRange(xRange),
			y: yMin,
			speed: getRandomInRange(speed),
		}),
		[xRange, yMin, speed]
	);
	const position = useMemo(() => new Vector3(motion.x, motion.y, 7), [motion]);
	useFrame(({ clock }, delta) => {
		const bubble = bubbleRef.current;
		if (!bubble) return;
		const time = clock.getElapsedTime();
		motion.y += motion.speed * Math.min(delta, 0.05);
		let opacity = 1;
		if (motion.y > fadeMin) {
			const overflow = Math.min(1, (motion.y - fadeMin) / Math.max(1, fadeMax - fadeMin));
			opacity = 1 - overflow ** 2;
		}
		if (motion.y > yMax) {
			motion.y = yMin - getRandomInRange(delay);
			motion.x = getRandomInRange(xRange);
			opacity = 1;
		}
		const wobble = time * wobbleSpeed;
		bubble.position.set(
			motion.x + Math.sin(time * frequency) * amplitude + Math.sin(wobble) * wobbleIntensity,
			motion.y + Math.cos(wobble) * wobbleIntensity,
			7
		);
		(bubble.material as MeshBasicMaterial).opacity = opacity;
	});
	return { bubbleRef, size, position, color };
};
